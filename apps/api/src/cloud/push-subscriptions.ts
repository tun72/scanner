import type { Pool, PoolClient } from 'pg';
import type { PushSubscription, WebPush } from './web-push.ts';

type SubscriptionRow = { endpoint: string; p256dh: string; auth: string; subscription_id: string };
const batchSize = 15;

async function activeSubscription(pool: Pool, id: string) {
  const result = await pool.query(`
    SELECT 1 FROM web_push_subscriptions s JOIN mobile_accounts a ON a.id=s.owner_id
    WHERE s.subscription_id=$1 AND a.status='active'
  `, [id]);
  return Boolean(result.rowCount);
}

export async function invalidatePendingPushTargets(db: PoolClient, owner: string) {
  await db.query('UPDATE web_push_subscriptions SET subscription_id=gen_random_uuid() WHERE owner_id=$1', [owner]);
}

export function createPushSubscriptions(pool: Pool, push: WebPush) {
  return {
    async enabled(owner: string, endpoint: string) {
      const result = await pool.query('SELECT 1 FROM web_push_subscriptions WHERE endpoint=$1 AND owner_id=$2', [endpoint, owner]);
      return Boolean(result.rowCount);
    },
    async enable(owner: string, { endpoint, keys }: PushSubscription) {
      await pool.query(`
        INSERT INTO web_push_subscriptions(endpoint,owner_id,p256dh,auth)
        SELECT $1,id,$3,$4 FROM mobile_accounts WHERE id=$2 AND status='active' FOR SHARE
        ON CONFLICT(endpoint) DO UPDATE SET owner_id=EXCLUDED.owner_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,
          subscription_id=CASE
            WHEN (web_push_subscriptions.owner_id,web_push_subscriptions.p256dh,web_push_subscriptions.auth)
                IS DISTINCT FROM (EXCLUDED.owner_id,EXCLUDED.p256dh,EXCLUDED.auth)
            THEN gen_random_uuid() ELSE web_push_subscriptions.subscription_id END
      `, [endpoint, owner, keys.p256dh, keys.auth]);
    },
    async disable(owner: string, endpoint: string) {
      await pool.query('DELETE FROM web_push_subscriptions WHERE endpoint=$1 AND owner_id=$2', [endpoint, owner]);
    },
    async sendOneRequestedTest() {
      const { rows: [request] } = await pool.query<SubscriptionRow & { id: string }>(`
        WITH ready AS (
          SELECT r.id FROM web_push_test_requests r
          JOIN web_push_subscriptions s ON s.endpoint=r.endpoint
          JOIN mobile_accounts a ON a.id=s.owner_id AND a.status='active'
          WHERE r.status='pending' AND r.expires_at>now()
          ORDER BY r.expires_at LIMIT 1 FOR UPDATE OF r SKIP LOCKED
        )
        UPDATE web_push_test_requests AS r SET status='sending'
        FROM ready,web_push_subscriptions AS s
        WHERE r.id=ready.id AND s.endpoint=r.endpoint RETURNING r.id,s.endpoint,s.p256dh,s.auth,s.subscription_id
      `);
      if (!request) return;
      const { id, endpoint, p256dh, auth, subscription_id } = request;
      if (!await activeSubscription(pool, subscription_id)) {
        await pool.query("UPDATE web_push_test_requests SET status='unavailable' WHERE id=$1", [id]);
        return;
      }
      const result = await push.sendTest({ endpoint, keys: { p256dh, auth } });
      await pool.query('UPDATE web_push_test_requests SET status=$2 WHERE id=$1', [id, result]);
    },
    async sendDaily() {
      // Claim before sending. A retried or overlapping job cannot notify a device twice on the same Myanmar date.
      const { rows } = await pool.query<SubscriptionRow>(`
        WITH due AS (
          SELECT s.endpoint FROM web_push_subscriptions s JOIN mobile_accounts a ON a.id=s.owner_id AND a.status='active'
          WHERE s.last_attempt_on IS NULL OR s.last_attempt_on < (now() AT TIME ZONE 'Asia/Yangon')::date
          ORDER BY s.endpoint LIMIT $1 FOR UPDATE OF s SKIP LOCKED
        )
        UPDATE web_push_subscriptions AS s SET last_attempt_on=(now() AT TIME ZONE 'Asia/Yangon')::date
        FROM due WHERE s.endpoint=due.endpoint RETURNING s.endpoint,s.p256dh,s.auth,s.subscription_id
      `, [batchSize]);

      const totals = { sent: 0, expired: 0, unavailable: 0, more: rows.length === batchSize };
      for (let i = 0; i < rows.length; i += 5) {
        await Promise.all(rows.slice(i, i + 5).map(async ({ endpoint, p256dh, auth, subscription_id }) => {
          if (!await activeSubscription(pool, subscription_id)) return;
          const result = await push.sendDaily({ endpoint, keys: { p256dh, auth } });
          totals[result] += 1;
          if (result === 'expired') {
            await pool.query('DELETE FROM web_push_subscriptions WHERE subscription_id=$1', [subscription_id]);
          }
        }));
      }
      return totals;
    },
  };
}
