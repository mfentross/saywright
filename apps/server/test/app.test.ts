import { describe, expect, it } from 'vitest';
import { thirsty } from '@saywright/blueprint';
import { buildApp } from '../src/app';

describe('sw-api', () => {
  it('reports health', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('validates blueprints', async () => {
    const app = await buildApp();
    const ok = await app.inject({ method: 'POST', url: '/blueprints/validate', payload: { blueprint: thirsty } });
    expect(ok.json()).toEqual({ ok: true, issues: [] });
    const bad = structuredClone(thirsty) as any;
    bad.collections.plants.fields.password = { type: 'text' };
    const r = await app.inject({ method: 'POST', url: '/blueprints/validate', payload: { blueprint: bad } });
    expect(r.json().ok).toBe(false);
  });

  it('creates a project and streams build progress', async () => {
    const app = await buildApp();
    const created = await app.inject({ method: 'POST', url: '/projects', payload: { idea: 'Plant watering for my flat' } });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    const events = await app.inject({ method: 'GET', url: `/projects/${id}/events` });
    expect(events.headers['content-type']).toContain('text/event-stream');
    expect(events.body).toContain('"type":"ready"');
  });

  it('rejects invalid input', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/projects', payload: { idea: '' } });
    expect(r.statusCode).toBe(400);
    const missing = await app.inject({ method: 'GET', url: '/projects/nope/events' });
    expect(missing.statusCode).toBe(404);
  });
});
