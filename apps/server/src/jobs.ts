import type { Client } from '@libsql/client';

/**
 * Job queue in sw-core (no extra queue service). Workers claim jobs with a lease; a
 * worker that dies stops renewing its lease and the job is claimed again, up to
 * MAX_ATTEMPTS times.
 */

export type JobType = 'build' | 'answer' | 'change';

export interface Job {
  id: number;
  type: JobType;
  projectId: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export const MAX_ATTEMPTS = 3;

export class JobQueue {
  constructor(private readonly db: Client) {}

  async enqueue(type: JobType, projectId: string, payload: Record<string, unknown> = {}): Promise<number> {
    const r = await this.db.execute({
      sql: "INSERT INTO jobs (type, project_id, payload, status, attempts, created_at) VALUES (?, ?, ?, 'queued', 0, ?) RETURNING id",
      args: [type, projectId, JSON.stringify(payload), Date.now()],
    });
    return Number(r.rows[0]!.id);
  }

  /** Atomically claims the oldest runnable job. */
  async claim(workerId: string, leaseMs: number): Promise<Job | null> {
    const now = Date.now();
    const r = await this.db.execute({
      sql: `UPDATE jobs SET status = 'running', worker = ?, lease_until = ?, attempts = attempts + 1, started_at = COALESCE(started_at, ?)
            WHERE id = (
              SELECT id FROM jobs
              WHERE (status = 'queued' OR (status = 'running' AND lease_until < ?)) AND attempts < ?
              ORDER BY id LIMIT 1
            )
            RETURNING id, type, project_id, payload, attempts`,
      args: [workerId, now + leaseMs, now, now, MAX_ATTEMPTS],
    });
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      type: String(row.type) as JobType,
      projectId: String(row.project_id),
      payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
      attempts: Number(row.attempts),
    };
  }

  async renew(jobId: number, workerId: string, leaseMs: number): Promise<void> {
    await this.db.execute({
      sql: "UPDATE jobs SET lease_until = ? WHERE id = ? AND worker = ? AND status = 'running'",
      args: [Date.now() + leaseMs, jobId, workerId],
    });
  }

  async finish(jobId: number, status: 'done' | 'failed', error?: string): Promise<void> {
    await this.db.execute({
      sql: 'UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?',
      args: [status, error?.slice(0, 500) ?? null, Date.now(), jobId],
    });
  }

  /** Jobs that ran out of attempts while their lease expired: mark them failed. Returns their project ids. */
  async reapDead(): Promise<string[]> {
    const r = await this.db.execute({
      sql: `UPDATE jobs SET status = 'failed', error = 'Worker stopped too often', finished_at = ?
            WHERE status = 'running' AND lease_until < ? AND attempts >= ?
            RETURNING project_id`,
      args: [Date.now(), Date.now(), MAX_ATTEMPTS],
    });
    return r.rows.map((row) => String(row.project_id));
  }

  async hasActive(projectId: string): Promise<boolean> {
    const r = await this.db.execute({
      sql: "SELECT 1 FROM jobs WHERE project_id = ? AND status IN ('queued', 'running') LIMIT 1",
      args: [projectId],
    });
    return r.rows.length > 0;
  }
}
