import Fastify, { type FastifyServerOptions } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { thirsty, validateBlueprint } from '@saywright/blueprint';

/**
 * sw-api: Saywright's own API (accounts, projects, versions, build progress).
 * Phase 0 skeleton: in-memory projects, stubbed build stream, real blueprint validation.
 */
export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify({ bodyLimit: 256 * 1024, ...opts }).withTypeProvider<ZodTypeProvider>();
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

  // ------------------------------------------------------------ projects (in-memory stub)

  type Project = { id: string; idea: string; createdAt: number };
  const projects = new Map<string, Project>();

  app.post(
    '/projects',
    {
      schema: {
        body: z.object({ idea: z.string().trim().min(3).max(2000) }),
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (req, reply) => {
      // STUB: phase 3 runs the safety check + LangGraph pipeline in sw-worker.
      const id = `p_${crypto.randomUUID().slice(0, 8)}`;
      projects.set(id, { id, idea: req.body.idea, createdAt: Date.now() });
      return reply.code(201).send({ id });
    },
  );

  app.get(
    '/projects/:id/blueprint',
    { schema: { params: z.object({ id: z.string().max(40) }) } },
    async (req, reply) => {
      if (!projects.has(req.params.id)) return reply.code(404).send({ error: 'Not found' });
      return { version: 1, blueprint: thirsty }; // STUB: generated blueprint
    },
  );

  /** Build progress as Server-Sent Events (drives the Building screen). */
  app.get(
    '/projects/:id/events',
    { schema: { params: z.object({ id: z.string().max(40) }) } },
    async (req, reply) => {
      if (!projects.has(req.params.id)) return reply.code(404).send({ error: 'Not found' });
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const send = (event: unknown) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      const steps = ['Planned 3 screens', 'Designed the look', 'Wired up turns and reminders', 'Filling in sample data to test with'];
      steps.forEach((label, index) => send({ type: 'step', index, label, done: true }));
      send({ type: 'ready', projectId: req.params.id, version: 1 });
      reply.raw.end();
      return reply;
    },
  );

  return app;
}
