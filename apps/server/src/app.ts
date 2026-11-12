import Fastify, { type FastifyServerOptions } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Client } from '@libsql/client';
import { validateBlueprint } from '@saywright/blueprint';
import type { ModelFactory } from '@saywright/ai';
import { migrate, openDb } from './db';
import { GenerationService, TERMINAL, type BuildEvent } from './generation';

/**
 * sw-api: Saywright's own API (accounts, projects, versions, build progress).
 * Projects are stored in libSQL; builds run the LangGraph generation pipeline.
 */
export interface AppOptions {
  fastify?: FastifyServerOptions;
  /** Database client; defaults to LIBSQL_URL or a local file. */
  db?: Client;
  /** AI models per pipeline step; defaults to the configured providers. */
  models?: ModelFactory;
}

export async function buildApp(opts: AppOptions = {}) {
  const app = Fastify({ bodyLimit: 256 * 1024, ...opts.fastify }).withTypeProvider<ZodTypeProvider>();
  const db = opts.db ?? openDb();
  await migrate(db);
  const gen = new GenerationService(db, opts.models);
  app.addHook('onClose', async () => db.close());
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);
  await app.register(cors, {
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:8099').split(','),
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.get('/health', { schema: { response: { 200: z.object({ ok: z.literal(true) }) } } }, async () => ({ ok: true as const }));

  // ------------------------------------------------------------ blueprints

  const Issue = z.object({ path: z.string(), message: z.string() });

  app.post(
    '/blueprints/validate',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        body: z.object({ blueprint: z.unknown() }),
        response: { 200: z.object({ ok: z.boolean(), issues: z.array(Issue) }) },
      },
    },
    async (req) => {
      const r = validateBlueprint(req.body.blueprint);
      return { ok: r.ok, issues: r.issues };
    },
  );

  // ------------------------------------------------------------ projects

  const Id = z.object({ id: z.string().regex(/^p_[a-z0-9]{16}$/) });
  const Project = z.object({
    id: z.string(),
    name: z.string().nullable(),
    status: z.enum(['building', 'question', 'ready', 'declined', 'failed']),
    question: z.object({ text: z.string(), options: z.array(z.string()) }).nullable(),
  });

  app.post(
    '/projects',
    {
      // Each build spends AI credits: keep this tight until accounts and quotas exist.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: z.object({ idea: z.string().trim().min(3).max(2000) }),
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (req, reply) => reply.code(201).send({ id: await gen.create(req.body.idea) }),
  );

  app.get('/projects/:id', { schema: { params: Id, response: { 200: Project, 404: z.object({ error: z.string() }) } } }, async (req, reply) => {
    const p = await gen.get(req.params.id);
    if (!p) return reply.code(404).send({ error: 'Not found' });
    return { id: p.id, name: p.name, status: p.status, question: p.question };
  });

  app.post(
    '/projects/:id/answer',
    { schema: { params: Id, body: z.object({ answer: z.string().trim().min(1).max(200) }) } },
    async (req, reply) => {
      const r = await gen.answer(req.params.id, req.body.answer);
      if (r === 'not-found') return reply.code(404).send({ error: 'Not found' });
      if (r === 'not-waiting') return reply.code(409).send({ error: 'This app is not waiting for an answer' });
      return reply.code(202).send({ ok: true });
    },
  );

  app.get('/projects/:id/blueprint', { schema: { params: Id } }, async (req, reply) => {
    const b = await gen.latestBlueprint(req.params.id);
    if (!b) return reply.code(404).send({ error: 'Not found' });
    return b;
  });

  /**
   * Build progress as Server-Sent Events (drives the Building screen). Replays stored
   * events after `after`, then streams live ones until the build pauses or ends.
   */
  app.get(
    '/projects/:id/events',
    { schema: { params: Id, querystring: z.object({ after: z.coerce.number().int().min(0).default(0) }) } },
    async (req, reply) => {
      const id = req.params.id;
      if (!(await gen.get(id))) return reply.code(404).send({ error: 'Not found' });
      // Writing to the raw socket skips Fastify's reply, so carry over the headers
      // plugins have set (CORS, security headers) and take over the response.
      reply.hijack();
      reply.raw.writeHead(200, {
        ...(reply.getHeaders() as Record<string, string>),
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      let last = req.query.after;
      let closed = false;
      const send = (e: { seq: number; event: BuildEvent }) => {
        if (closed || e.seq <= last) return;
        last = e.seq;
        reply.raw.write(`id: ${e.seq}\nevent: ${e.event.type}\ndata: ${JSON.stringify(e.event)}\n\n`);
        if (TERMINAL.has(e.event.type)) close();
      };
      const heartbeat = setInterval(() => !closed && reply.raw.write(': ping\n\n'), 15_000);
      const unsubscribe = gen.subscribe(id, send);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        reply.raw.end();
      };
      req.raw.on('close', close);
      // Subscribe first, then replay, so nothing falls in between.
      for (const e of await gen.events(id, last)) send(e);
      if (!closed && !gen.isRunning(id)) close();
    },
  );

  return app;
}
