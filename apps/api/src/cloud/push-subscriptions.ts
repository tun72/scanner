import type { Pool } from 'pg';
import type { PushSubscription, WebPush } from './web-push.ts';

type SubscriptionRow = { endpoint: string; p256dh: string; auth: string };
const batchSize = 15;

export function createPushSubscriptions(pool: Pool, push: WebPush) {
  return {
    async enabled(owner: string, endpoint: string) {
      const result = await pool.query('SELECT 1 FROM web_push_subscriptions WHERE endpoint=$1 AND owner_id=$2', [endpoint, owner]);
      return Boolean(result.rowCount);
    },
    async enable(owner: string, { endpoint, keys }: PushSubscription) {
      await pool.query(`
        INSERT INTO web_push_subscriptions(endpoint,owner_id,p256dh,auth) VALUES($1,$2,$3,$4)
        ON CONFLICT(endpoint) DO UPDATE SET owner_id=EXCLUDED.owner_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth
      `, [endpoint, owner, keys.p256dh, keys.auth]);
    },
    async disable(owner: string, endpoint: string) {
      await pool.query('DELETE FROM web_push_subscriptions WHERE endpoint=$1 AND owner_id=$2', [endpoint, owner]);
    },
    async sendDaily() {
      // Claim before sending. A retried or overlapping job cannot notify a device twice on the same Myanmar date.
      const { rows } = await pool.query<SubscriptionRow>(`
        WITH due AS (
          SELECT endpoint FROM web_push_subscriptions
          WHERE last_attempt_on IS NULL OR last_attempt_on < (now() AT TIME ZONE 'Asia/Yangon')::date
          ORDER BY endpoint LIMIT $1 FOR UPDATE SKIP LOCKED
        )
        UPDATE web_push_subscriptions AS s SET last_attempt_on=(now() AT TIME ZONE 'Asia/Yangon')::date
        FROM due WHERE s.endpoint=due.endpoint RETURNING s.endpoint,s.p256dh,s.auth
      `, [batchSize]);

      const totals = { sent: 0, expired: 0, unavailable: 0, more: rows.length === batchSize };
      for (let i = 0; i < rows.length; i += 5) {
        await Promise.all(rows.slice(i, i + 5).map(async ({ endpoint, p256dh, auth }) => {
          const current = await pool.query('SELECT 1 FROM web_push_subscriptions WHERE endpoint=$1 AND p256dh=$2 AND auth=$3', [endpoint, p256dh, auth]);
          if (!current.rowCount) return;
          const result = await push.sendDaily({ endpoint, keys: { p256dh, auth } });
          totals[result] += 1;
          if (result === 'expired') {
            await pool.query('DELETE FROM web_push_subscriptions WHERE endpoint=$1 AND p256dh=$2 AND auth=$3', [endpoint, p256dh, auth]);
          }
        }));
      }
      return totals;
    },
  };
}
