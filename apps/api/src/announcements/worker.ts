import { setTimeout as delay } from 'node:timers/promises';
import { createCloudDatabase } from '../cloud/database.ts';
import { createBroadcastSender } from '../cloud/web-push.ts';
import { loadEnv } from '../env.ts';
import { createBroadcastDelivery } from './delivery.ts';

loadEnv();
const url = process.env.DATABASE_URL?.trim();
const sender = createBroadcastSender(process.env);
if (!url || !sender) throw new Error('The notification worker requires DATABASE_URL and the existing WEB_PUSH settings.');

const pool = createCloudDatabase(url);
const work = createBroadcastDelivery(pool,sender);
const shutdown = new AbortController();
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,() => shutdown.abort());

try {
  while (!shutdown.signal.aborted) {
    let busy = false;
    try {
      await work.heartbeat();
      const published = await work.publishDue();
      const delivered = shutdown.signal.aborted ? 0 : await work.deliverBatch();
      busy = published > 0 || delivered === 5;
    } catch {
      console.error('Scanner notification processing failed. Queued work will retry.');
    }
    await delay(busy ? 100 : 10_000,undefined,{ signal: shutdown.signal }).catch(() => undefined);
  }
} finally {
  await pool.end();
}
