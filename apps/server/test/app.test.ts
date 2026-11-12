import { describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { thirsty } from '@saywright/blueprint';
import type { ModelFactory, Role } from '@saywright/ai';
import { buildApp } from '../src/app';

const ok = JSON.stringify({ allowed: true, category: 'ok', reason: '' });
const plan = (question: unknown) =>
  JSON.stringify({ name: 'Thirsty', tagline: 't', peopleLabel: 'Flatmates', screens: ['Plants'], remembers: 'x', notifies: 'y', question });

function fakeModels(replies: Partial<Record<Role, string[]>>): ModelFactory {
  const models = new Map<Role, BaseChatModel>();
  return async (role) => {
    if (!models.has(role)) models.set(role, new FakeListChatModel({ responses: replies[role] ?? ['{}'] }) as unknown as BaseChatModel);
    return models.get(role)!;
  };
}

const app = (models: ModelFactory = fakeModels({ screen: [ok, ok], plan: [plan(null)], write: [JSON.stringify(thirsty)] })) =>
  buildApp({ db: createClient({ url: ':memory:' }), models });

/** Parses an SSE body into its events. */
function sse(body: string) {
  return body
    .split('\n\n')
    .filter((chunk) => chunk.includes('data: '))
    .map((chunk) => JSON.parse(chunk.split('\n').find((l) => l.startsWith('data: '))!.slice(6)));
}

describe('sw-api', () => {
  it('reports health with security headers', async () => {
    const a = await app();
    const r = await a.inject({ method: 'GET', url: '/health' });
    expect(r.json()).toEqual({ ok: true });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('validates blueprints', async () => {
    const a = await app();
    const ok1 = await a.inject({ method: 'POST', url: '/blueprints/validate', payload: { blueprint: thirsty } });
    expect(ok1.json()).toEqual({ ok: true, issues: [] });
    const bad = structuredClone(thirsty) as any;
    bad.collections.plants.fields.password = { type: 'text' };
    const r = await a.inject({ method: 'POST', url: '/blueprints/validate', payload: { blueprint: bad } });
    expect(r.json().ok).toBe(false);
  });

  it('builds an app from an idea and streams progress', async () => {
    const a = await app();
    const created = await a.inject({ method: 'POST', url: '/projects', payload: { idea: 'Plant watering for my flat' } });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();

    const events = sse((await a.inject({ method: 'GET', url: `/projects/${id}/events` })).body);
    expect(events.filter((e) => e.type === 'step').map((e) => e.label)).toEqual([
      'Checked the idea',
      'Planned the screens',
      'Settled the details',
      'Wrote the app',
      'Checked the app',
      'Final safety check',
    ]);
    expect(events.find((e) => e.type === 'plan')).toMatchObject({ type: 'plan', name: 'Thirsty', screens: ['Plants'] });
    expect(events.at(-1)).toEqual({ type: 'ready', version: 1, name: 'Thirsty' });

    const project = await a.inject({ method: 'GET', url: `/projects/${id}` });
    expect(project.json()).toMatchObject({ status: 'ready', name: 'Thirsty' });
    const bp = await a.inject({ method: 'GET', url: `/projects/${id}/blueprint` });
    expect(bp.json().version).toBe(1);
    expect(bp.json().blueprint.name).toBe('Thirsty');

    // Browsers on another origin (the web app) may read the stream.
    const cors = await a.inject({ method: 'GET', url: `/projects/${id}/events`, headers: { origin: 'http://localhost:8099' } });
    expect(cors.headers['access-control-allow-origin']).toBe('http://localhost:8099');
    expect(cors.headers['x-content-type-options']).toBe('nosniff');

    // Reconnecting with ?after replays only what's new.
    const replay = sse((await a.inject({ method: 'GET', url: `/projects/${id}/events?after=7` })).body);
    expect(replay).toEqual([{ type: 'ready', version: 1, name: 'Thirsty' }]);
  });

  it('pauses on the clarifying question and resumes with the answer', async () => {
    const a = await app(
      fakeModels({ screen: [ok, ok], plan: [plan({ text: 'How often?', options: ['Daily', 'Weekly'] })], write: [JSON.stringify(thirsty)] }),
    );
    const { id } = (await a.inject({ method: 'POST', url: '/projects', payload: { idea: 'Plant watering for my flat' } })).json();
    const first = sse((await a.inject({ method: 'GET', url: `/projects/${id}/events` })).body);
    expect(first.at(-1)).toEqual({ type: 'question', text: 'How often?', options: ['Daily', 'Weekly'] });
    expect((await a.inject({ method: 'GET', url: `/projects/${id}` })).json().status).toBe('question');

    const answered = await a.inject({ method: 'POST', url: `/projects/${id}/answer`, payload: { answer: 'Daily' } });
    expect(answered.statusCode).toBe(202);
    const after = first.length;
    const rest = sse((await a.inject({ method: 'GET', url: `/projects/${id}/events?after=${after}` })).body);
    expect(rest.at(-1)).toMatchObject({ type: 'ready', version: 1 });

    // Answering again is refused.
    const again = await a.inject({ method: 'POST', url: `/projects/${id}/answer`, payload: { answer: 'Weekly' } });
    expect(again.statusCode).toBe(409);
  });

  it('declines harmful ideas and stores no blueprint', async () => {
    const a = await app(fakeModels({ screen: [JSON.stringify({ allowed: false, category: 'phishing', reason: 'Saywright can’t build login pages for banks.' })] }));
    const { id } = (await a.inject({ method: 'POST', url: '/projects', payload: { idea: 'Copy my bank login page' } })).json();
    const events = sse((await a.inject({ method: 'GET', url: `/projects/${id}/events` })).body);
    expect(events.at(-1)).toEqual({ type: 'declined', reason: 'Saywright can’t build login pages for banks.' });
    expect((await a.inject({ method: 'GET', url: `/projects/${id}/blueprint` })).statusCode).toBe(404);
  });

  it('rejects invalid input and unknown projects', async () => {
    const a = await app();
    expect((await a.inject({ method: 'POST', url: '/projects', payload: { idea: '' } })).statusCode).toBe(400);
    expect((await a.inject({ method: 'GET', url: '/projects/p_0000000000000000' })).statusCode).toBe(404);
    expect((await a.inject({ method: 'GET', url: '/projects/../../etc' })).statusCode).toBe(404);
    expect((await a.inject({ method: 'GET', url: '/projects/nope/events' })).statusCode).toBe(400);
  });
});
