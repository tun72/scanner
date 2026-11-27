import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { inTransaction } from '../cloud/database.ts';
import type { BroadcastPayload, DeliveryOutcome, PushSubscription } from '../cloud/web-push.ts';

type Send = (subscription: PushSubscription, message: BroadcastPayload, ttl: number) => Promise<DeliveryOutcome>;
type Job = { broadcast_id: string; subscription_id: string; owner_id: string; attempts: number };
const windowMs = 24 * 60 * 60_000;

export function createBroadcastDelivery(pool: Pool, send: Send, now = () => new Date()) {
  return {
    async heartbeat() {
      await pool.query(`INSERT INTO broadcast_worker_heartbeat(singleton,seen_at) VALUES(true,now())
        ON CONFLICT(singleton) DO UPDATE SET seen_at=EXCLUDED.seen_at`);
    },
    async publishDue() {
      const at = now();
      return inTransaction(pool,async db => {
        const { rows } = await db.query<{ id: string; title: string; body: string; scheduled_for: Date }>(`
          SELECT b.id,b.title,b.body,b.scheduled_for FROM broadcasts b
          WHERE b.state='queued' AND b.scheduled_for<=$1
            AND NOT EXISTS (SELECT 1 FROM broadcast_publications p WHERE p.broadcast_id=b.id)
          ORDER BY b.scheduled_for,b.id LIMIT 10 FOR UPDATE OF b SKIP LOCKED
        `,[at]);
        let published = 0;
        for (const item of rows) {
          const result = await db.query(`
            INSERT INTO broadcast_publications(broadcast_id,title,body,published_at)
            VALUES($1,$2,$3,$4) ON CONFLICT(broadcast_id) DO NOTHING
          `,[item.id,item.title,item.body,at]);
          if (!result.rowCount) continue;
          const timedOut = at.getTime() >= item.scheduled_for.getTime() + windowMs;
          await db.query(`
            INSERT INTO broadcast_deliveries(broadcast_id,subscription_id,owner_id,attempt_after,status)
            SELECT $1,s.subscription_id,s.owner_id,$2,$3 FROM web_push_subscriptions s
            JOIN mobile_accounts a ON a.id=s.owner_id AND a.status='active'
          `,[item.id,at,timedOut ? 'failed' : 'pending']);
          published++;
        }
        return published;
      });
    },
    async deliverBatch() {
      const at = now();
      const lease = randomUUID();
      const { rows } = await pool.query<Job>(`
        WITH due AS (
          SELECT broadcast_id,subscription_id FROM broadcast_deliveries
          WHERE attempt_after<=$1 AND (status='pending' OR status='sending' AND lease_until<=$1)
          ORDER BY attempt_after,broadcast_id,subscription_id LIMIT 5 FOR UPDATE SKIP LOCKED
        )
        UPDATE broadcast_deliveries AS d SET status='sending',attempts=d.attempts+1,
          lease_id=$2,lease_until=$1::timestamptz+interval '2 minutes'
        FROM due WHERE (d.broadcast_id,d.subscription_id)=(due.broadcast_id,due.subscription_id)
        RETURNING d.broadcast_id,d.subscription_id,d.owner_id,d.attempts
      `,[at,lease]);
      const attempts = await Promise.allSettled(rows.map(async job => {
        const { rows: [current] } = await pool.query<{
          title: string; body: string; scheduled_for: Date; endpoint: string | null; p256dh: string; auth: string;
        }>(`
          SELECT p.title,p.body,b.scheduled_for,s.endpoint,s.p256dh,s.auth FROM broadcast_publications p
          JOIN broadcasts b ON b.id=p.broadcast_id
          LEFT JOIN mobile_accounts a ON a.id=$3 AND a.status='active'
          LEFT JOIN web_push_subscriptions s ON s.subscription_id=$2 AND s.owner_id=a.id
          WHERE p.broadcast_id=$1
        `,[job.broadcast_id,job.subscription_id,job.owner_id]);
        const finish = (status: string, next = at, db: Pick<Pool,'query'> = pool) => db.query(`
          UPDATE broadcast_deliveries SET status=$4,attempt_after=$5,lease_id=NULL,lease_until=NULL
          WHERE broadcast_id=$1 AND subscription_id=$2 AND lease_id=$3
        `,[job.broadcast_id,job.subscription_id,lease,status,next]);
        if (!current?.endpoint) return finish('skipped');
        const deadline = current.scheduled_for.getTime() + windowMs;
        const ttl = Math.floor((deadline - now().getTime()) / 1000);
        if (ttl <= 0) return finish('failed');
        const outcome = await send({ endpoint: current.endpoint, keys: { p256dh: current.p256dh,auth: current.auth } },
          { id: job.broadcast_id,title: current.title,body: current.body },ttl);
        if (outcome.status === 'expired') {
          return inTransaction(pool,async db => {
            const result = await finish('expired',at,db);
            if (result.rowCount) await db.query('DELETE FROM web_push_subscriptions WHERE subscription_id=$1',[job.subscription_id]);
          });
        }
        if (outcome.status !== 'retry') return finish(outcome.status);
        const retryIn = Math.max(outcome.afterMs ?? 0, Math.min(30_000*2**Math.min(job.attempts-1,7),3_600_000));
        const retryAt = now().getTime() + retryIn;
        return retryAt >= deadline ? finish('failed') : finish('pending',new Date(retryAt));
      }));
      if (attempts.some(attempt => attempt.status === 'rejected')) throw new Error('A push delivery attempt could not be recorded.');
      return rows.length;
    },
  };
}
