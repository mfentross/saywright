import { EventEmitter } from 'node:events';
import type { Client } from '@libsql/client';
import { buildGenerationGraph, LibsqlSaver, runGeneration, type GenerationGraph, type GenerationState, type ModelFactory } from '@saywright/ai';

/**
 * Runs the AI generation pipeline for projects and records its progress.
 *
 * Phase 2 runs it inside sw-api. In production it moves to sw-worker (a jobs table
 * in sw-core), so long AI calls don't tie up the API; the events table stays the
 * contract between the two.
 */

export type ProjectStatus = 'building' | 'question' | 'ready' | 'declined' | 'failed';

export type BuildEvent =
  | { type: 'step'; label: string }
  | { type: 'plan'; name: string; tagline: string; screens: string[]; remembers: string; notifies: string }
  | { type: 'question'; text: string; options: string[] }
  | { type: 'ready'; version: number; name: string }
  | { type: 'declined'; reason: string }
  | { type: 'failed'; message: string };

export const TERMINAL = new Set<BuildEvent['type']>(['question', 'ready', 'declined', 'failed']);

export interface ProjectRow {
  id: string;
  idea: string;
  name: string | null;
  status: ProjectStatus;
  question: { text: string; options: string[] } | null;
  createdAt: number;
}

export class GenerationService {
  private readonly graph: GenerationGraph;
  private readonly bus = new EventEmitter();
  private readonly running = new Set<string>();

  constructor(
    private readonly db: Client,
    models?: ModelFactory,
  ) {
    this.graph = buildGenerationGraph({ models, checkpointer: new LibsqlSaver(db) });
    this.bus.setMaxListeners(1000);
  }

  async create(idea: string): Promise<string> {
    const id = `p_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = Date.now();
    await this.db.execute({
      sql: 'INSERT INTO projects (id, idea, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      args: [id, idea, 'building', now, now],
    });
    this.start(id, { idea });
    return id;
  }

  async answer(id: string, answer: string): Promise<'ok' | 'not-found' | 'not-waiting'> {
    const p = await this.get(id);
    if (!p) return 'not-found';
    if (p.status !== 'question' || this.running.has(id)) return 'not-waiting';
    await this.setStatus(id, 'building', { question: null });
    this.start(id, { answer });
    return 'ok';
  }

  async get(id: string): Promise<ProjectRow | null> {
    const r = await this.db.execute({ sql: 'SELECT * FROM projects WHERE id = ?', args: [id] });
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      idea: String(row.idea),
      name: row.name ? String(row.name) : null,
      status: String(row.status) as ProjectStatus,
      question: row.question ? JSON.parse(String(row.question)) : null,
      createdAt: Number(row.created_at),
    };
  }

  async latestBlueprint(id: string): Promise<{ version: number; blueprint: unknown } | null> {
    const r = await this.db.execute({
      sql: 'SELECT version, blueprint FROM versions WHERE project_id = ? ORDER BY version DESC LIMIT 1',
      args: [id],
    });
    const row = r.rows[0];
    return row ? { version: Number(row.version), blueprint: JSON.parse(String(row.blueprint)) } : null;
  }

  async events(id: string, afterSeq = 0): Promise<Array<{ seq: number; event: BuildEvent }>> {
    const r = await this.db.execute({
      sql: 'SELECT seq, event FROM project_events WHERE project_id = ? AND seq > ? ORDER BY seq',
      args: [id, afterSeq],
    });
    return r.rows.map((row) => ({ seq: Number(row.seq), event: JSON.parse(String(row.event)) as BuildEvent }));
  }

  /** Live events for one project. Returns an unsubscribe function. */
  subscribe(id: string, fn: (e: { seq: number; event: BuildEvent }) => void): () => void {
    this.bus.on(id, fn);
    return () => this.bus.off(id, fn);
  }

  isRunning(id: string) {
    return this.running.has(id);
  }

  /** Resolves when no run is in progress for the project (tests, graceful shutdown). */
  async idle(id: string): Promise<void> {
    while (this.running.has(id)) await new Promise((r) => setTimeout(r, 10));
  }

  // ------------------------------------------------------------ internals

  private start(id: string, input: { idea: string } | { answer: string }) {
    this.running.add(id);
    void this.run(id, input).finally(() => this.running.delete(id));
  }

  private async run(id: string, input: { idea: string } | { answer: string }) {
    try {
      let final: GenerationState | null = null;
      for await (const e of runGeneration(this.graph, id, input)) {
        if (e.type === 'step') {
          await this.emit(id, { type: 'step', label: e.label });
          const p = e.update.plan;
          if (e.node === 'planner' && p) {
            await this.emit(id, {
              type: 'plan',
              name: String(p.name).slice(0, 30),
              tagline: String(p.tagline ?? '').slice(0, 80),
              screens: (Array.isArray(p.screens) ? p.screens : []).slice(0, 5).map((x) => String(x).slice(0, 30)),
              remembers: String(p.remembers ?? '').slice(0, 200),
              notifies: String(p.notifies ?? '').slice(0, 200),
            });
          }
        }
        if (e.type === 'question') {
          await this.setStatus(id, 'question', { question: { text: e.text, options: e.options } });
          await this.emit(id, { type: 'question', text: e.text, options: e.options });
        }
        if (e.type === 'done') final = e.state;
      }
      if (final) await this.finish(id, final);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.setStatus(id, 'failed', { error: message.slice(0, 500) });
      await this.emit(id, { type: 'failed', message: 'Saywright couldn’t finish this app. Please try again.' });
    }
  }

  private async finish(id: string, s: GenerationState) {
    // Usage accumulates across pauses; store the complete list once.
    await this.db.batch(
      [
        { sql: 'DELETE FROM ai_usage WHERE project_id = ?', args: [id] },
        ...s.usage.map((u) => ({
          sql: 'INSERT INTO ai_usage (project_id, role, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          args: [id, u.role, u.model, u.input, u.output, u.cacheRead, u.cacheWrite, Date.now()],
        })),
      ],
      'write',
    );
    if (s.status === 'ready') {
      const name = String((s.blueprint as { name?: unknown }).name ?? 'App').slice(0, 30);
      const prev = await this.latestBlueprint(id);
      const version = (prev?.version ?? 0) + 1;
      await this.db.execute({
        sql: 'INSERT INTO versions (project_id, version, blueprint, created_at) VALUES (?, ?, ?, ?)',
        args: [id, version, JSON.stringify(s.blueprint), Date.now()],
      });
      await this.setStatus(id, 'ready', { name });
      await this.emit(id, { type: 'ready', version, name });
    } else if (s.status === 'declined') {
      await this.setStatus(id, 'declined', { verdict: s.verdict });
      await this.emit(id, { type: 'declined', reason: s.verdict?.reason || 'Saywright can’t build this app.' });
    } else {
      await this.setStatus(id, 'failed', { error: s.error });
      await this.emit(id, { type: 'failed', message: 'Saywright couldn’t finish this app. Try describing it a bit differently.' });
    }
  }

  private async setStatus(
    id: string,
    status: ProjectStatus,
    extra: { question?: unknown; verdict?: unknown; error?: string | null; name?: string } = {},
  ) {
    const sets = ['status = ?', 'updated_at = ?'];
    const args: Array<string | number | null> = [status, Date.now()];
    if ('question' in extra) (sets.push('question = ?'), args.push(extra.question ? JSON.stringify(extra.question) : null));
    if ('verdict' in extra) (sets.push('verdict = ?'), args.push(extra.verdict ? JSON.stringify(extra.verdict) : null));
    if ('error' in extra) (sets.push('error = ?'), args.push(extra.error ?? null));
    if ('name' in extra) (sets.push('name = ?'), args.push(extra.name ?? null));
    args.push(id);
    await this.db.execute({ sql: `UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, args });
  }

  private async emit(id: string, event: BuildEvent) {
    const r = await this.db.execute({ sql: 'SELECT COALESCE(MAX(seq), 0) AS s FROM project_events WHERE project_id = ?', args: [id] });
    const seq = Number(r.rows[0]?.s ?? 0) + 1;
    await this.db.execute({
      sql: 'INSERT INTO project_events (project_id, seq, event, created_at) VALUES (?, ?, ?, ?)',
      args: [id, seq, JSON.stringify(event), Date.now()],
    });
    this.bus.emit(id, { seq, event });
  }
}
