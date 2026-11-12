import { createClient, type Client } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Database: libSQL. Locally a file (default ./data/saywright.db); in production
 * Bunny Database, by setting LIBSQL_URL (libsql://…) and LIBSQL_AUTH_TOKEN.
 */
export function openDb(env: Record<string, string | undefined> = process.env): Client {
  const url = env.LIBSQL_URL ?? 'file:./data/saywright.db';
  if (url.startsWith('file:')) mkdirSync(dirname(url.slice('file:'.length)), { recursive: true });
  return createClient({ url, authToken: env.LIBSQL_AUTH_TOKEN });
}

/** Ordered, append-only migrations. Never edit an applied one; add a new entry. */
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      idea TEXT NOT NULL,
      name TEXT,
      status TEXT NOT NULL,
      question TEXT,
      verdict TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE project_events (
      project_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      event TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, seq)
    )`,
    `CREATE TABLE versions (
      project_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      blueprint TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, version)
    )`,
    `CREATE TABLE ai_usage (
      project_id TEXT NOT NULL,
      role TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL,
      cache_write_tokens INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX ai_usage_project ON ai_usage (project_id)`,
  ],
  [
    // Job queue (API enqueues, sw-worker runs).
    `CREATE TABLE jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      project_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      worker TEXT,
      lease_until INTEGER,
      error TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    )`,
    `CREATE INDEX jobs_runnable ON jobs (status, id)`,
    `CREATE INDEX jobs_project ON jobs (project_id, status)`,
    // Accounts: email sign-in links and sessions. Only hashes of tokens are stored.
    `CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE login_links (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX login_links_email ON login_links (email, created_at)`,
    `CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    // Which pipeline run (graph thread) the usage belongs to.
    `ALTER TABLE ai_usage ADD COLUMN thread TEXT`,
    `ALTER TABLE projects ADD COLUMN owner_id TEXT`,
    `CREATE INDEX projects_owner ON projects (owner_id, created_at)`,
  ],
];

export async function migrate(db: Client): Promise<void> {
  await db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const r = await db.execute('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations');
  const current = Number(r.rows[0]?.v ?? 0);
  for (let i = current; i < MIGRATIONS.length; i++) {
    await db.batch(
      [...MIGRATIONS[i]!, { sql: 'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', args: [i + 1, Date.now()] }],
      'write',
    );
  }
}
