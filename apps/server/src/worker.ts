/**
 * sw-worker: runs queued builds and changes. Same image as sw-api, different entrypoint:
 *   pnpm --filter @saywright/server worker
 */
import { openDb, migrate } from './db';
import { BuildWorker } from './generation';
import { fakeModels } from './fakeModels';

const fake = process.env.SAYWRIGHT_FAKE_AI === '1';
if (fake && process.env.NODE_ENV === 'production') throw new Error('SAYWRIGHT_FAKE_AI must not be used in production');

const db = openDb();
await migrate(db);
const worker = new BuildWorker(db, {
  models: fake ? fakeModels() : undefined,
  concurrency: Number(process.env.SAYWRIGHT_WORKER_CONCURRENCY ?? 4),
  log: (msg, extra) => console.log(JSON.stringify({ level: 'warn', msg, ...extra })),
});
worker.start();
console.log(JSON.stringify({ level: 'info', msg: 'sw-worker started', fake }));

const shutdown = async () => {
  await worker.stop();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
