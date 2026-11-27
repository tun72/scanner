import { createCloudDatabase } from '../cloud/database.ts';
import { createBroadcastSender } from '../cloud/web-push.ts';
import { loadEnv } from '../env.ts';
import { createBroadcastDelivery } from './delivery.ts';
import { startBroadcastProcessor } from './processor.ts';

loadEnv();
const url = process.env.DATABASE_URL?.trim();
const sender = createBroadcastSender(process.env);
if (!url || !sender) throw new Error('The notification worker requires DATABASE_URL and the existing WEB_PUSH settings.');

const pool = createCloudDatabase(url);
const processor = startBroadcastProcessor(createBroadcastDelivery(pool,sender), () => {
  console.error('Scanner notification processing failed. Queued work will retry.');
});
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,() => { void processor.stop(); });

try {
  await processor.stopped;
} finally {
  await pool.end();
}
