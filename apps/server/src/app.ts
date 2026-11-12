import Fastify, { type FastifyReply, type FastifyRequest, type FastifyServerOptions } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Client } from '@libsql/client';
import { validateBlueprint } from '@saywright/blueprint';
import type { ModelFactory } from '@saywright/ai';
import { migrate, openDb } from './db';
import { BuildWorker, ProjectService, TERMINAL, type BuildEvent, type ProjectRow } from './generation';
import { AuthService, DevMailer, type Mailer, type User } from './auth';
import { limitsFromEnv, QuotaService, type Limits } from './quota';

/**
 * sw-api: Saywright's own API (accounts, projects, versions, build progress).
 * Builds and changes are queued as jobs and run by sw-worker (or an inline worker in dev).
 */
export interface AppOptions {
  fastify?: FastifyServerOptions;
  /** Database client; defaults to LIBSQL_URL or a local file. */
  db?: Client;
  /** AI models per pipeline step (inline worker only); defaults to the configured providers. */
  models?: ModelFactory;
  /** "inline" runs a worker inside this process (dev, tests); "none" expects sw-worker. */
  worker?: 'inline' | 'none';
  workerPollMs?: number;
  mailer?: Mailer;
  limits?: Limits;
  /** DEV ONLY: return the sign-in token in the response instead of only emailing it. */
  devLogin?: boolean;
  /** How often the event stream checks for new events. */
  streamPollMs?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

export async function buildApp(opts: AppOptions = {}) {
  const env = process.env;
  const app = Fastify({ bodyLimit: 256 * 1024, ...opts.fastify }).withTypeProvider<ZodTypeProvider>();
  const db = opts.db ?? openDb();
  await migrate(db);

  const projects = new ProjectService(db);
  const mailer = opts.mailer ?? new DevMailer((m) => app.log.info(m));
  const auth = new AuthService(db, mailer, { appUrl: env.SAYWRIGHT_APP_URL ?? 'http://localhost:8081' });
  const quota = new QuotaService(db, opts.limits ?? limitsFromEnv());
  const devLogin = opts.devLogin ?? env.SAYWRIGHT_DEV_LOGIN === '1';
  if (devLogin && env.NODE_ENV === 'production') throw new Error('SAYWRIGHT_DEV_LOGIN must not be used in production');
  const streamPollMs = opts.streamPollMs ?? 300;

  const workerMode = opts.worker ?? (env.SAYWRIGHT_WORKER === 'none' ? 'none' : 'inline');
  const worker = workerMode === 'inline' ? new BuildWorker(db, { models: opts.models, pollMs: opts.workerPollMs, log: (m, e) => app.log.warn(e, m) }) : null;
  app.addHook('onReady', async () => worker?.start());
  app.addHook('onClose', async () => {
    await worker?.stop();
    db.close();
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(helmet);
  await app.register(cors, { origin: (env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:8099').split(',') });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  // ------------------------------------------------------------ auth

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    const h = req.headers.authorization;
    req.user = h?.startsWith('Bearer ') ? await auth.authenticate(h.slice(7).trim()) : null;
  });
  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'Please sign in' });
  };
  /** Loads a project the signed-in person owns; anything else is a 404 (no existence leaks). */
  const ownProject = async (req: FastifyRequest, reply: FastifyReply, id: string): Promise<ProjectRow | null> => {
    const p = await projects.store.get(id);
    if (!p || p.ownerId !== req.user?.id) {
      await reply.code(404).send({ error: 'Not found' });
      return null;
    }
    return p;
  };

  app.get('/health', { schema: { response: { 200: z.object({ ok: z.literal(true) }) } } }, async () => ({ ok: true as const }));

  app.post(
    '/auth/link',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: { body: z.object({ email: z.string().max(254) }) },
    },
    async (req, reply) => {
      const r = await auth.requestLink(req.body.email);
      // Same answer either way, so the endpoint can't be used to probe for accounts.
      return reply.code(202).send(devLogin && r.token ? { ok: true, devToken: r.token } : { ok: true });
    },
  );

  app.post(
    '/auth/verify',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { body: z.object({ token: z.string().min(20).max(100) }) },
    },
    async (req, reply) => {
      const r = await auth.verify(req.body.token);
      if (!r) return reply.code(400).send({ error: 'This sign-in link is invalid or has expired. Ask for a new one.' });
      return { token: r.session, user: r.user };
    },
  );

  app.post('/auth/sign-out', { preHandler: requireUser }, async (req, reply) => {
    await auth.signOut(req.headers.authorization!.slice(7).trim());
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: requireUser }, async (req) => ({ user: req.user!, usage: await quota.usage(req.user!.id) }));

  // ------------------------------------------------------------ blueprints

  const Issue = z.object({ path: z.string(), message: z.string() });
  app.post(
    '/blueprints/validate',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { body: z.object({ blueprint: z.unknown() }), response: { 200: z.object({ ok: z.boolean(), issues: z.array(Issue) }) } },
    },
    async (req) => {
      const r = validateBlueprint(req.body.blueprint);
      return { ok: r.ok, issues: r.issues };
    },
  );

  // ------------------------------------------------------------ projects

  const Id = z.object({ id: z.string().regex(/^p_[a-z0-9]{16}$/) });
  const view = (p: ProjectRow) => ({ id: p.id, name: p.name, status: p.status, question: p.question, createdAt: p.createdAt });

  app.get('/projects', { preHandler: requireUser }, async (req) => ({ projects: (await projects.store.listByOwner(req.user!.id)).map(view) }));

  app.post(
    '/projects',
    {
      preHandler: requireUser,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { body: z.object({ idea: z.string().trim().min(3).max(2000) }) },
    },
    async (req, reply) => {
      const blocked = await quota.check(req.user!.id, 'app');
      if (blocked) return reply.code(429).send({ error: blocked });
      return reply.code(201).send({ id: await projects.create(req.body.idea, req.user!.id) });
    },
  );

  app.get('/projects/:id', { preHandler: requireUser, schema: { params: Id } }, async (req, reply) => {
    const p = await ownProject(req, reply, req.params.id);
    return p ? view(p) : reply;
  });

  app.post(
    '/projects/:id/answer',
    { preHandler: requireUser, schema: { params: Id, body: z.object({ answer: z.string().trim().min(1).max(200) }) } },
    async (req, reply) => {
      if (!(await ownProject(req, reply, req.params.id))) return reply;
      if ((await projects.answer(req.params.id, req.body.answer)) !== 'ok') {
        return reply.code(409).send({ error: 'This app is not waiting for an answer' });
      }
      return reply.code(202).send({ ok: true });
    },
  );

  app.post(
    '/projects/:id/changes',
    {
      preHandler: requireUser,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { params: Id, body: z.object({ request: z.string().trim().min(2).max(1000) }) },
    },
    async (req, reply) => {
      if (!(await ownProject(req, reply, req.params.id))) return reply;
      const blocked = await quota.check(req.user!.id, 'change');
      if (blocked) return reply.code(429).send({ error: blocked });
      if ((await projects.requestChange(req.params.id, req.body.request)) !== 'ok') {
        return reply.code(409).send({ error: 'This app can’t take a change right now' });
      }
      return reply.code(202).send({ ok: true });
    },
  );

  app.get('/projects/:id/blueprint', { preHandler: requireUser, schema: { params: Id } }, async (req, reply) => {
    if (!(await ownProject(req, reply, req.params.id))) return reply;
    const b = await projects.store.latestBlueprint(req.params.id);
    if (!b) return reply.code(404).send({ error: 'Not found' });
    return b;
  });

  /**
   * Build progress as Server-Sent Events. Replays stored events after `after`, then
   * follows new ones (written by the worker) until the build pauses or ends.
   */
  app.get(
    '/projects/:id/events',
    { preHandler: requireUser, schema: { params: Id, querystring: z.object({ after: z.coerce.number().int().min(0).default(0) }) } },
    async (req, reply) => {
      const id = req.params.id;
      if (!(await ownProject(req, reply, id))) return reply;
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
      let lastWrite = Date.now();
      req.raw.on('close', () => (closed = true));
      const send = (e: { seq: number; event: BuildEvent }) => {
        last = e.seq;
        lastWrite = Date.now();
        reply.raw.write(`id: ${e.seq}\nevent: ${e.event.type}\ndata: ${JSON.stringify(e.event)}\n\n`);
        return TERMINAL.has(e.event.type);
      };
      const deadline = Date.now() + 15 * 60_000;
      while (!closed && Date.now() < deadline) {
        const fresh = await projects.store.events(id, last);
        let done = false;
        for (const e of fresh) if (send(e)) done = true;
        if (done) break;
        // Nothing queued or running and nothing new: the build is paused or over.
        if (!fresh.length && !(await projects.isActive(id))) {
          const after = await projects.store.events(id, last);
          if (!after.length) break;
          continue;
        }
        if (Date.now() - lastWrite > 15_000) {
          reply.raw.write(': ping\n\n');
          lastWrite = Date.now();
        }
        await new Promise((r) => setTimeout(r, streamPollMs));
      }
      reply.raw.end();
    },
  );

  return app;
}
