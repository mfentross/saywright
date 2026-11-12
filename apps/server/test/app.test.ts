import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { thirsty } from '@saywright/blueprint';
import type { ModelFactory, Role } from '@saywright/ai';
import { buildApp, type AppOptions } from '../src/app';
import { DevMailer } from '../src/auth';
import { BuildWorker } from '../src/generation';
import { migrate } from '../src/db';

const ok = JSON.stringify({ allowed: true, category: 'ok', reason: '' });
const no = (category: string, reason: string) => JSON.stringify({ allowed: false, category, reason });
const plan = (question: unknown = null) =>
  JSON.stringify({ name: 'Thirsty', tagline: 't', peopleLabel: 'Flatmates', screens: ['Plants'], remembers: 'x', notifies: 'y', question });
const darker = JSON.stringify({ summary: 'Darker look', patch: [{ op: 'replace', path: '/theme/background', value: '#1B2A21' }] });

function fakeModels(replies: Partial<Record<Role, string[]>>): ModelFactory {
  const models = new Map<Role, BaseChatModel>();
  return async (role) => {
    if (!models.has(role)) models.set(role, new FakeListChatModel({ responses: replies[role] ?? ['{}'] }) as unknown as BaseChatModel);
    return models.get(role)!;
  };
}
const defaultModels = () => fakeModels({ screen: [ok], plan: [plan()], write: [JSON.stringify(thirsty), darker] });

async function setup(o: Partial<AppOptions> = {}) {
  const mailer = new DevMailer();
  const app = await buildApp({
    db: createClient({ url: ':memory:' }),
    models: defaultModels(),
    workerPollMs: 10,
    streamPollMs: 10,
    devLogin: true,
    mailer,
    ...o,
  });
  await app.ready();
  const signIn = async (email = 'malte@example.com') => {
    const link = await app.inject({ method: 'POST', url: '/auth/link', payload: { email } });
    const { token } = (await app.inject({ method: 'POST', url: '/auth/verify', payload: { token: link.json().devToken } })).json();
    return { authorization: `Bearer ${token}` };
  };
  return { app, mailer, signIn };
}

function sse(body: string) {
  return body
    .split('\n\n')
    .filter((c) => c.includes('data: '))
    .map((c) => JSON.parse(c.split('\n').find((l) => l.startsWith('data: '))!.slice(6)));
}

describe('sw-api', () => {
  it('reports health with security headers', async () => {
    const { app } = await setup();
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.json()).toEqual({ ok: true });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('validates blueprints', async () => {
    const { app } = await setup();
    expect((await app.inject({ method: 'POST', url: '/blueprints/validate', payload: { blueprint: thirsty } })).json()).toEqual({ ok: true, issues: [] });
  });
});

describe('sign-in', () => {
  it('signs in with a one-time email link', async () => {
    const { app, mailer } = await setup();
    const link = await app.inject({ method: 'POST', url: '/auth/link', payload: { email: ' Malte@Example.com ' } });
    expect(link.statusCode).toBe(202);
    expect(mailer.sent[0]?.to).toBe('malte@example.com');
    expect(mailer.sent[0]?.text).toContain('/sign-in?token=');

    const token = link.json().devToken;
    const verified = await app.inject({ method: 'POST', url: '/auth/verify', payload: { token } });
    expect(verified.statusCode).toBe(200);
    const headers = { authorization: `Bearer ${verified.json().token}` };
    const me = await app.inject({ method: 'GET', url: '/me', headers });
    expect(me.json().user.email).toBe('malte@example.com');
    expect(me.json().usage).toMatchObject({ appsThisMonth: 0, changesThisMonth: 0 });

    // A link works only once.
    expect((await app.inject({ method: 'POST', url: '/auth/verify', payload: { token } })).statusCode).toBe(400);
    // Signing out ends the session.
    expect((await app.inject({ method: 'POST', url: '/auth/sign-out', headers })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/me', headers })).statusCode).toBe(401);
  });

  it('answers the same way for any email and limits link requests', async () => {
    const { app, mailer } = await setup({ devLogin: false });
    const bad = await app.inject({ method: 'POST', url: '/auth/link', payload: { email: 'not-an-email' } });
    const good = await app.inject({ method: 'POST', url: '/auth/link', payload: { email: 'a@example.com' } });
    expect(bad.json()).toEqual({ ok: true });
    expect(good.json()).toEqual({ ok: true }); // no token without dev login
    for (let i = 0; i < 6; i++) await app.inject({ method: 'POST', url: '/auth/link', payload: { email: 'b@example.com' }, remoteAddress: `10.0.0.${i}` });
    expect(mailer.sent.filter((m) => m.to === 'b@example.com')).toHaveLength(5);
  });

  it('requires sign-in for projects and hides other people’s projects', async () => {
    const { app, signIn } = await setup();
    expect((await app.inject({ method: 'POST', url: '/projects', payload: { idea: 'Plants' } })).statusCode).toBe(401);
    const alice = await signIn('alice@example.com');
    const bob = await signIn('bob@example.com');
    const { id } = (await app.inject({ method: 'POST', url: '/projects', payload: { idea: 'Plant watering' }, headers: alice })).json();
    expect((await app.inject({ method: 'GET', url: `/projects/${id}`, headers: bob })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/projects/${id}/blueprint`, headers: bob })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/projects/${id}/events`, headers: bob })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/projects/${id}/changes`, payload: { request: 'x y' }, headers: bob })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/projects', headers: bob })).json().projects).toEqual([]);
    expect((await app.inject({ method: 'GET', url: '/projects', headers: alice })).json().projects).toHaveLength(1);
  });
});

describe('builds', () => {
  it('builds an app from an idea and streams progress', async () => {
    const { app, signIn } = await setup();
    const h = await signIn();
    const created = await app.inject({ method: 'POST', url: '/projects', payload: { idea: 'Plant watering for my flat' }, headers: h });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();

    const res = await app.inject({ method: 'GET', url: `/projects/${id}/events`, headers: { ...h, origin: 'http://localhost:8099' } });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8099');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    const events = sse(res.body);
    expect(events.filter((e) => e.type === 'step').map((e) => e.label)).toEqual([
      'Checked the idea',
      'Planned the screens',
      'Settled the details',
      'Wrote the app',
      'Checked the app',
      'Final safety check',
    ]);
    expect(events.find((e) => e.type === 'plan')).toMatchObject({ name: 'Thirsty' });
    expect(events.at(-1)).toEqual({ type: 'ready', version: 1, name: 'Thirsty' });
    expect((await app.inject({ method: 'GET', url: `/projects/${id}/blueprint`, headers: h })).json().blueprint.name).toBe('Thirsty');

    const replay = sse((await app.inject({ method: 'GET', url: `/projects/${id}/events?after=7`, headers: h })).body);
    expect(replay).toEqual([{ type: 'ready', version: 1, name: 'Thirsty' }]);
    // AI usage is recorded per project.
    expect((await app.inject({ method: 'GET', url: '/me', headers: h })).json().usage.appsThisMonth).toBe(1);
  });

  it('pauses on the clarifying question and resumes with the answer', async () => {
    const { app, signIn } = await setup({
      models: fakeModels({ screen: [ok], plan: [plan({ text: 'How often?', options: ['Daily', 'Weekly'] })], write: [JSON.stringify(thirsty)] }),
    });
    const h = await signIn();
    const { id } = (await app.inject({ method: 'POST', url: '/projects', payload: { idea: 'Plant watering' }, headers: h })).json();
    const first = sse((await app.inject({ method: 'GET', url: `/projects/${id}/events`, headers: h })).body);
    expect(first.at(-1)).toEqual({ type: 'question', text: 'How often?', options: ['Daily', 'Weekly'] });
    expect((await app.inject({ method: 'POST', url: `/projects/${id}/answer`, payload: { answer: 'Daily' }, headers: h })).statusCode).toBe(202);
    const rest = sse((await app.inject({ method: 'GET', url: `/projects/${id}/events?after=${first.length}`, headers: h })).body);
    expect(rest.at(-1)).toMatchObject({ type: 'ready', version: 1 });
    expect((await app.inject({ method: 'POST', url: `/projects/${id}/answer`, payload: { answer: 'Weekly' }, headers: h })).statusCode).toBe(409);
  });

  it('declines harmful ideas', async () => {
    const { app, signIn } = await setup({ models: fakeModels({ screen: [no('phishing', 'No bank logins.')] }) });
    const h = await signIn();
    const { id } = (await app.inject({ method: 'POST', url: '/projects', payload: { idea: 'Copy my bank login' }, headers: h })).json();
    expect(sse((await app.inject({ method: 'GET', url: `/projects/${id}/events`, headers: h })).body).at(-1)).toEqual({ type: 'declined', reason: 'No bank logins.' });
  });

  it('enforces the free-tier app limit', async () => {
    const { app, signIn } = await setup({ limits: { appsPerMonth: 1, changesPerMonth: 30, dailyAiCapUsd: 3 } });
    const h = await signIn();
    expect((await app.inject({ method: 'POST', url: '/projects', payload: { idea: 'First app' }, headers: h })).statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/projects', payload: { idea: 'Second app' }, headers: h });
    expect(second.statusCode).toBe(429);
    expect(second.json().error).toContain('1 new apps a month');
  });

  it('rejects invalid input', async () => {
    const { app, signIn } = await setup();
    const h = await signIn();
    expect((await app.inject({ method: 'POST', url: '/projects', payload: { idea: '' }, headers: h })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/projects/p_0000000000000000', headers: h })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/projects/nope/events', headers: h })).statusCode).toBe(400);
  });
});

describe('change requests', () => {
  async function readyProject(o: Partial<AppOptions> = {}) {
    const s = await setup(o);
    const h = await s.signIn();
    const { id } = (await s.app.inject({ method: 'POST', url: '/projects', payload: { idea: 'Plant watering' }, headers: h })).json();
    const events = sse((await s.app.inject({ method: 'GET', url: `/projects/${id}/events`, headers: h })).body);
    return { ...s, h, id, seen: events.length };
  }

  it('changes the app and stores a new version', async () => {
    const { app, h, id, seen } = await readyProject();
    expect((await app.inject({ method: 'POST', url: `/projects/${id}/changes`, payload: { request: 'Darker look' }, headers: h })).statusCode).toBe(202);
    const events = sse((await app.inject({ method: 'GET', url: `/projects/${id}/events?after=${seen}`, headers: h })).body);
    expect(events.filter((e) => e.type === 'step').map((e) => e.label)).toEqual(['Checked your request', 'Made the change', 'Checked the app', 'Final safety check']);
    expect(events.at(-1)).toEqual({ type: 'changed', version: 2, summary: 'Darker look' });
    const bp = (await app.inject({ method: 'GET', url: `/projects/${id}/blueprint`, headers: h })).json();
    expect(bp.version).toBe(2);
    expect(bp.blueprint.theme.background).toBe('#1B2A21');
    expect((await app.inject({ method: 'GET', url: '/me', headers: h })).json().usage.changesThisMonth).toBe(1);
  });

  it('keeps the current version when a change is declined', async () => {
    const { app, h, id, seen } = await readyProject({
      models: fakeModels({ screen: [ok, ok, no('phishing', 'No login copies.')], plan: [plan()], write: [JSON.stringify(thirsty)] }),
    });
    await app.inject({ method: 'POST', url: `/projects/${id}/changes`, payload: { request: 'Make it look like PayPal login' }, headers: h });
    const events = sse((await app.inject({ method: 'GET', url: `/projects/${id}/events?after=${seen}`, headers: h })).body);
    expect(events.at(-1)).toEqual({ type: 'change_declined', reason: 'No login copies.' });
    expect((await app.inject({ method: 'GET', url: `/projects/${id}/blueprint`, headers: h })).json().version).toBe(1);
    expect((await app.inject({ method: 'GET', url: `/projects/${id}`, headers: h })).json().status).toBe('ready');
  });
});

describe('separate worker', () => {
  it('runs builds queued by an API that has no worker of its own', async () => {
    const url = `file:${join(mkdtempSync(join(tmpdir(), 'sw-')), 'db.sqlite')}`;
    const apiDb: Client = createClient({ url });
    const { app, signIn } = await setup({ db: apiDb, worker: 'none' });
    const workerDb = createClient({ url });
    await migrate(workerDb);
    const worker = new BuildWorker(workerDb, { models: defaultModels(), pollMs: 10 });
    worker.start();
    try {
      const h = await signIn();
      const { id } = (await app.inject({ method: 'POST', url: '/projects', payload: { idea: 'Plant watering' }, headers: h })).json();
      const events = sse((await app.inject({ method: 'GET', url: `/projects/${id}/events`, headers: h })).body);
      expect(events.at(-1)).toEqual({ type: 'ready', version: 1, name: 'Thirsty' });
    } finally {
      await worker.stop();
      workerDb.close();
    }
  });
});
