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
