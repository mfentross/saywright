import type { Client, InStatement } from '@libsql/client';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  BaseCheckpointSaver,
  compareWritesSortKeys,
  copyCheckpoint,
  WRITES_IDX_MAP,
  writesSortKey,
  type ChannelVersions,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
  type SerializerProtocol,
} from '@langchain/langgraph-checkpoint';

/**
 * LangGraph checkpointer on libSQL: works with a local file (development, tests) and
 * with Bunny Database (production) through the same client. Everything is async, so
 * it also works over libSQL's HTTP protocol.
 *
 * Based on @langchain/langgraph-checkpoint-sqlite, without its SQLite-only parts
 * (synchronous driver, WAL pragma, json_group_array subqueries, pre-v4 migration).
 */
export class LibsqlSaver extends BaseCheckpointSaver {
  private ready: Promise<void> | null = null;

  constructor(
    private readonly db: Client,
    serde?: SerializerProtocol,
  ) {
    super(serde);
  }

  setup(): Promise<void> {
    this.ready ??= this.db
      .batch(
        [
          `CREATE TABLE IF NOT EXISTS lg_checkpoints (
            thread_id TEXT NOT NULL,
            checkpoint_ns TEXT NOT NULL DEFAULT '',
            checkpoint_id TEXT NOT NULL,
            parent_checkpoint_id TEXT,
            type TEXT,
            checkpoint TEXT,
            metadata TEXT,
            PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
          )`,
          `CREATE TABLE IF NOT EXISTS lg_writes (
            thread_id TEXT NOT NULL,
            checkpoint_ns TEXT NOT NULL DEFAULT '',
            checkpoint_id TEXT NOT NULL,
            task_id TEXT NOT NULL,
            task_path TEXT NOT NULL DEFAULT '',
            idx INTEGER NOT NULL,
            channel TEXT NOT NULL,
            type TEXT,
            value TEXT,
            PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
          )`,
        ],
        'write',
      )
      .then(() => undefined);
    return this.ready;
  }

  private async pendingWrites(threadId: string, ns: string, checkpointId: string): Promise<CheckpointTuple['pendingWrites']> {
    const r = await this.db.execute({
      sql: 'SELECT task_id, task_path, idx, channel, type, value FROM lg_writes WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?',
      args: [threadId, ns, checkpointId],
    });
    const rows = r.rows.map((row) => ({
      task_id: String(row.task_id),
      task_path: String(row.task_path ?? ''),
      idx: Number(row.idx ?? 0),
      channel: String(row.channel),
      type: String(row.type ?? 'json'),
      value: String(row.value ?? ''),
    }));
    rows.sort((a, b) => compareWritesSortKeys(writesSortKey(a.task_path, a.task_id, a.idx), writesSortKey(b.task_path, b.task_id, b.idx)));
    return Promise.all(rows.map(async (w) => [w.task_id, w.channel, await this.serde.loadsTyped(w.type, w.value)] as [string, string, unknown]));
  }

  private async toTuple(row: Record<string, unknown>): Promise<CheckpointTuple> {
    const threadId = String(row.thread_id);
    const ns = String(row.checkpoint_ns ?? '');
    const id = String(row.checkpoint_id);
    const type = String(row.type ?? 'json');
    const parent = row.parent_checkpoint_id ? String(row.parent_checkpoint_id) : undefined;
    return {
      config: { configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: id } },
      checkpoint: (await this.serde.loadsTyped(type, String(row.checkpoint))) as Checkpoint,
      metadata: (await this.serde.loadsTyped(type, String(row.metadata))) as CheckpointMetadata,
      parentConfig: parent ? { configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: parent } } : undefined,
      pendingWrites: await this.pendingWrites(threadId, ns, id),
    };
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    await this.setup();
    const { thread_id, checkpoint_ns = '', checkpoint_id } = (config.configurable ?? {}) as Record<string, string | undefined>;
    if (!thread_id) return undefined;
    const r = await this.db.execute(
      checkpoint_id
        ? { sql: 'SELECT * FROM lg_checkpoints WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?', args: [thread_id, checkpoint_ns, checkpoint_id] }
        : { sql: 'SELECT * FROM lg_checkpoints WHERE thread_id = ? AND checkpoint_ns = ? ORDER BY checkpoint_id DESC LIMIT 1', args: [thread_id, checkpoint_ns] },
    );
    const row = r.rows[0];
    return row ? this.toTuple(row as unknown as Record<string, unknown>) : undefined;
  }

  async *list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    await this.setup();
    const { limit, before, filter } = options ?? {};
    const where: string[] = [];
    const args: Array<string | number> = [];
    const threadId = config.configurable?.thread_id as string | undefined;
    const ns = config.configurable?.checkpoint_ns as string | undefined;
    if (threadId) (where.push('thread_id = ?'), args.push(threadId));
    if (ns !== undefined && ns !== null) (where.push('checkpoint_ns = ?'), args.push(ns));
    const beforeId = before?.configurable?.checkpoint_id as string | undefined;
    if (beforeId !== undefined) (where.push('checkpoint_id < ?'), args.push(beforeId));
    let sql = `SELECT * FROM lg_checkpoints${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY checkpoint_id DESC`;
    // Metadata filters are applied after loading (metadata is serialized), so a limit only applies without filters.
    const filters = Object.entries(filter ?? {}).filter(([, v]) => v !== undefined);
    if (limit && filters.length === 0) sql += ` LIMIT ${Math.max(1, Math.floor(Number(limit)))}`;
    const r = await this.db.execute({ sql, args });
    let yielded = 0;
    for (const row of r.rows) {
      const tuple = await this.toTuple(row as unknown as Record<string, unknown>);
      const meta = tuple.metadata as Record<string, unknown> | undefined;
      if (filters.some(([k, v]) => JSON.stringify(meta?.[k]) !== JSON.stringify(v))) continue;
      yield tuple;
      if (limit && ++yielded >= limit) return;
    }
  }

  async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, _newVersions?: ChannelVersions): Promise<RunnableConfig> {
    await this.setup();
    const threadId = config.configurable?.thread_id as string | undefined;
    if (!threadId) throw new Error('Missing "thread_id" field in passed "config.configurable".');
    const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? '';
    const parentId = (config.configurable?.checkpoint_id as string | undefined) ?? null;
    const [[type1, cp], [type2, meta]] = await Promise.all([this.serde.dumpsTyped(copyCheckpoint(checkpoint)), this.serde.dumpsTyped(metadata)]);
    if (type1 !== type2) throw new Error('Failed to serialize checkpoint and metadata to the same type.');
    await this.db.execute({
      sql: 'INSERT OR REPLACE INTO lg_checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [threadId, ns, checkpoint.id, parentId, type1, text(cp), text(meta)],
    });
    return { configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: checkpoint.id } };
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string, taskPath?: string): Promise<void> {
    await this.setup();
    const c = config.configurable ?? {};
    if (!c.thread_id) throw new Error('Missing thread_id field in config.configurable.');
    if (!c.checkpoint_id) throw new Error('Missing checkpoint_id field in config.configurable.');
    const allSpecial = writes.every(([channel]) => channel in WRITES_IDX_MAP);
    const statements: InStatement[] = await Promise.all(
      writes.map(async ([channel, value], idx) => {
        const [type, data] = await this.serde.dumpsTyped(value);
        return {
          sql: `INSERT ${allSpecial ? 'OR REPLACE' : 'OR IGNORE'} INTO lg_writes (thread_id, checkpoint_ns, checkpoint_id, task_id, task_path, idx, channel, type, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [c.thread_id, c.checkpoint_ns ?? '', c.checkpoint_id, taskId, taskPath ?? '', WRITES_IDX_MAP[channel] ?? idx, channel, type, text(data)],
        };
      }),
    );
    if (statements.length) await this.db.batch(statements, 'write');
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.setup();
    await this.db.batch(
      [
        { sql: 'DELETE FROM lg_checkpoints WHERE thread_id = ?', args: [threadId] },
        { sql: 'DELETE FROM lg_writes WHERE thread_id = ?', args: [threadId] },
      ],
      'write',
    );
  }
}

const decoder = new TextDecoder();
function text(data: Uint8Array | string): string {
  return typeof data === 'string' ? data : decoder.decode(data);
}
