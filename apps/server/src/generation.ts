import type { Client } from '@libsql/client';
import {
  buildChangeGraph,
  buildGenerationGraph,
  LibsqlSaver,
  runChange,
  runGeneration,
  type ChangeGraph,
  type GenerationGraph,
  type ModelFactory,
  type UsageEntry,
} from '@saywright/ai';
import { JobQueue, type Job } from './jobs';

/**
 * Projects: the API side (ProjectService) only reads and enqueues; the worker side
 * (BuildWorker) runs the AI pipelines. They share nothing but the database, so they
 * can run as separate containers (sw-api, sw-worker).
 */

export type ProjectStatus = 'building' | 'question' | 'ready' | 'changing' | 'declined' | 'failed';

export type BuildEvent =
  | { type: 'step'; label: string }
  | { type: 'plan'; name: string; tagline: string; screens: string[]; remembers: string; notifies: string }
  | { type: 'question'; text: string; options: string[] }
  | { type: 'ready'; version: number; name: string }
  | { type: 'declined'; reason: string }
  | { type: 'failed'; message: string }
  | { type: 'changed'; version: number; summary: string }
  | { type: 'change_declined'; reason: string }
  | { type: 'change_failed'; message: string };

/** Events after which a stream closes (the build paused or ended). */
export const TERMINAL = new Set<BuildEvent['type']>(['question', 'ready', 'declined', 'failed', 'changed', 'change_declined', 'change_failed']);

export interface ProjectRow {
  id: string;
  idea: string;
  name: string | null;
  status: ProjectStatus;
  question: { text: string; options: string[] } | null;
  ownerId: string | null;
  createdAt: number;
}

// ---------------------------------------------------------------- shared data access

export class ProjectStore {
  constructor(readonly db: Client) {}

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
      ownerId: row.owner_id ? String(row.owner_id) : null,
      createdAt: Number(row.created_at),
    };
  }

  async listByOwner(ownerId: string): Promise<ProjectRow[]> {
    const r = await this.db.execute({ sql: 'SELECT id FROM projects WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100', args: [ownerId] });
    const out: ProjectRow[] = [];
    for (const row of r.rows) {
      const p = await this.get(String(row.id));
      if (p) out.push(p);
    }
    return out;
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

  async setStatus(
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

  async emit(id: string, event: BuildEvent) {
    // seq is computed in the same statement, so concurrent writers can't collide silently.
    await this.db.execute({
      sql: `INSERT INTO project_events (project_id, seq, event, created_at)
            SELECT ?, COALESCE(MAX(seq), 0) + 1, ?, ? FROM project_events WHERE project_id = ?`,
      args: [id, JSON.stringify(event), Date.now(), id],
    });
  }

  async addVersion(id: string, blueprint: unknown): Promise<number> {
    const r = await this.db.execute({
      sql: `INSERT INTO versions (project_id, version, blueprint, created_at)
            SELECT ?, COALESCE(MAX(version), 0) + 1, ?, ? FROM versions WHERE project_id = ?
            RETURNING version`,
      args: [id, JSON.stringify(blueprint), Date.now(), id],
    });
    return Number(r.rows[0]!.version);
  }

  /**
   * Records AI usage for one pipeline run (graph thread). A thread's state holds all its
   * usage so far, including runs before a pause; only entries not yet stored are added.
   */
  async recordUsage(id: string, thread: string, usage: UsageEntry[]) {
    const r = await this.db.execute({ sql: 'SELECT COUNT(*) AS n FROM ai_usage WHERE project_id = ? AND thread = ?', args: [id, thread] });
    const fresh = usage.slice(Number(r.rows[0]?.n ?? 0));
    if (!fresh.length) return;
    await this.db.batch(
      fresh.map((u) => ({
        sql: 'INSERT INTO ai_usage (project_id, thread, role, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, thread, u.role, u.model, u.input, u.output, u.cacheRead, u.cacheWrite, Date.now()],
      })),
      'write',
    );
  }
}

// ---------------------------------------------------------------- API side

export class ProjectService {
  readonly store: ProjectStore;
  readonly queue: JobQueue;

  constructor(db: Client) {
    this.store = new ProjectStore(db);
    this.queue = new JobQueue(db);
  }

  async create(idea: string, ownerId: string | null): Promise<string> {
    const id = `p_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = Date.now();
    await this.store.db.execute({
      sql: 'INSERT INTO projects (id, idea, status, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [id, idea, 'building', ownerId, now, now],
    });
    await this.queue.enqueue('build', id, { idea });
    return id;
  }

  async answer(id: string, answer: string): Promise<'ok' | 'not-waiting'> {
    const p = await this.store.get(id);
    if (!p || p.status !== 'question' || (await this.queue.hasActive(id))) return 'not-waiting';
    await this.store.setStatus(id, 'building', { question: null });
    await this.queue.enqueue('answer', id, { answer });
    return 'ok';
  }

  async requestChange(id: string, request: string): Promise<'ok' | 'not-ready'> {
    const p = await this.store.get(id);
    if (!p || p.status !== 'ready' || (await this.queue.hasActive(id))) return 'not-ready';
    await this.store.setStatus(id, 'changing');
    await this.queue.enqueue('change', id, { request });
    return 'ok';
  }

  isActive(id: string) {
    return this.queue.hasActive(id);
  }
}

// ---------------------------------------------------------------- worker side

export interface WorkerOptions {
  models?: ModelFactory;
  workerId?: string;
  pollMs?: number;
  leaseMs?: number;
  /** Max jobs run at the same time by this worker. */
  concurrency?: number;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export class BuildWorker {
  private readonly store: ProjectStore;
  private readonly queue: JobQueue;
  private readonly build: GenerationGraph;
  private readonly change: ChangeGraph;
  private readonly checkpointer: LibsqlSaver;
  private readonly id: string;
  private readonly pollMs: number;
  private readonly leaseMs: number;
  private readonly concurrency: number;
  private readonly log: NonNullable<WorkerOptions['log']>;
  private running = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(db: Client, opts: WorkerOptions = {}) {
    this.store = new ProjectStore(db);
    this.queue = new JobQueue(db);
    this.checkpointer = new LibsqlSaver(db);
    this.build = buildGenerationGraph({ models: opts.models, checkpointer: this.checkpointer });
    this.change = buildChangeGraph({ models: opts.models, checkpointer: this.checkpointer });
    this.id = opts.workerId ?? `w_${crypto.randomUUID().slice(0, 8)}`;
    this.pollMs = opts.pollMs ?? 500;
    this.leaseMs = opts.leaseMs ?? 120_000;
    this.concurrency = opts.concurrency ?? 4;
    this.log = opts.log ?? (() => {});
  }

  start() {
    this.stopped = false;
    void this.tick();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    while (this.running > 0) await new Promise((r) => setTimeout(r, 20));
  }

  private async tick() {
    if (this.stopped) return;
    try {
      for (const projectId of await this.queue.reapDead()) {
        await this.store.setStatus(projectId, 'failed', { error: 'Worker stopped too often' });
        await this.store.emit(projectId, { type: 'failed', message: 'Saywright couldn’t finish this app. Please try again.' });
      }
      while (this.running < this.concurrency) {
        const job = await this.queue.claim(this.id, this.leaseMs);
        if (!job) break;
        this.running++;
        void this.runJob(job).finally(() => this.running--);
      }
    } catch (e) {
      this.log('worker tick failed', { error: String(e) });
    }
    if (!this.stopped) this.timer = setTimeout(() => void this.tick(), this.pollMs);
  }

  private async runJob(job: Job) {
    const renew = setInterval(() => void this.queue.renew(job.id, this.id, this.leaseMs), this.leaseMs / 3);
    try {
      if (job.type === 'build') await this.runBuild(job.projectId, { idea: String(job.payload.idea) });
      else if (job.type === 'answer') await this.runBuild(job.projectId, { answer: String(job.payload.answer) });
      else await this.runChange(job.projectId, String(job.payload.request));
      await this.queue.finish(job.id, 'done');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log('job failed', { job: job.id, error: message });
      await this.queue.finish(job.id, 'failed', message);
      if (job.type === 'change') {
        await this.store.setStatus(job.projectId, 'ready');
        await this.store.emit(job.projectId, { type: 'change_failed', message: 'Saywright couldn’t make that change. Please try again.' });
      } else {
        await this.store.setStatus(job.projectId, 'failed', { error: message.slice(0, 500) });
        await this.store.emit(job.projectId, { type: 'failed', message: 'Saywright couldn’t finish this app. Please try again.' });
      }
    } finally {
      clearInterval(renew);
    }
  }

  private async runBuild(id: string, input: { idea: string } | { answer: string }) {
    const s = this.store;
    for await (const e of runGeneration(this.build, id, input)) {
      if (e.type === 'step') {
        await s.emit(id, { type: 'step', label: e.label });
        const p = e.update.plan;
        if (e.node === 'planner' && p) {
          await s.emit(id, {
            type: 'plan',
            name: String(p.name).slice(0, 30),
            tagline: String(p.tagline ?? '').slice(0, 80),
            screens: (Array.isArray(p.screens) ? p.screens : []).slice(0, 5).map((x) => String(x).slice(0, 30)),
            remembers: String(p.remembers ?? '').slice(0, 200),
            notifies: String(p.notifies ?? '').slice(0, 200),
          });
        }
      } else if (e.type === 'question') {
        await s.setStatus(id, 'question', { question: { text: e.text, options: e.options } });
        await s.emit(id, { type: 'question', text: e.text, options: e.options });
      } else {
        const st = e.state;
        await s.recordUsage(id, id, st.usage);
        if (st.status === 'ready') {
          const name = String((st.blueprint as { name?: unknown }).name ?? 'App').slice(0, 30);
          const version = await s.addVersion(id, st.blueprint);
          await s.setStatus(id, 'ready', { name });
          await s.emit(id, { type: 'ready', version, name });
        } else if (st.status === 'declined') {
          await s.setStatus(id, 'declined', { verdict: st.verdict });
          await s.emit(id, { type: 'declined', reason: st.verdict?.reason || 'Saywright can’t build this app.' });
        } else {
          await s.setStatus(id, 'failed', { error: st.error });
          await s.emit(id, { type: 'failed', message: 'Saywright couldn’t finish this app. Try describing it a bit differently.' });
        }
      }
    }
  }

  private async runChange(id: string, request: string) {
    const s = this.store;
    const current = await s.latestBlueprint(id);
    if (!current) throw new Error('Project has no version to change');
    const thread = `${id}:change:${current.version}:${Date.now()}`;
    for await (const e of runChange(this.change, thread, { base: current.blueprint, request })) {
      if (e.type === 'step') {
        await s.emit(id, { type: 'step', label: e.label });
        continue;
      }
      const st = e.state;
      await s.recordUsage(id, thread, st.usage);
      if (st.status === 'ready') {
        const version = await s.addVersion(id, st.blueprint);
        await s.setStatus(id, 'ready');
        await s.emit(id, { type: 'changed', version, summary: st.summary || 'Changed the app' });
      } else if (st.status === 'declined') {
        await s.setStatus(id, 'ready');
        await s.emit(id, { type: 'change_declined', reason: st.verdict?.reason || 'Saywright can’t make that change.' });
      } else {
        await s.setStatus(id, 'ready');
        await s.emit(id, { type: 'change_failed', message: 'Saywright couldn’t make that change. Try saying it differently.' });
      }
      // The change thread is single-use; keep the database small.
      await this.checkpointer.deleteThread(thread);
    }
  }
}
