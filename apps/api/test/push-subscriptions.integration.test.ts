import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createCloudDatabase, migrateCloudDatabase } from '../src/cloud/database.ts';
import { createPushSubscriptions } from '../src/cloud/push-subscriptions.ts';

const url = process.env.TEST_DATABASE_URL;

it.skipIf(!url)('notifies opted-in devices once, removes expired devices, and respects opt-out', async () => {
  const pool = createCloudDatabase(url!);
  const owner = randomUUID();
  const other = randomUUID();
  const subscription = (name: string) => ({
    endpoint: `https://web.push.apple.com/${owner}/${name}`,
    keys: { p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) },
  });
  const active = subscription('active');
  const expired = subscription('expired');
  const disabled = subscription('disabled');
  const sendDaily = vi.fn(async ({ endpoint }: typeof active) => endpoint === expired.endpoint ? 'expired' as const : 'sent' as const);
  const sendTest = vi.fn().mockResolvedValue('sent');
  const subscriptions = createPushSubscriptions(pool, { publicKey: '', sendDaily, sendTest });
  try {
    await migrateCloudDatabase(pool);
    await pool.query(
      'INSERT INTO mobile_accounts(id,name,roll_number,password_hash) VALUES($1::uuid,$1::uuid::text,$1::uuid::text,$1::uuid::text),($2::uuid,$2::uuid::text,$2::uuid::text,$2::uuid::text)', [owner, other],
    );
    for (const entry of [active, expired, disabled]) await subscriptions.enable(owner, entry);
    await subscriptions.disable(other, active.endpoint);
    await subscriptions.disable(owner, disabled.endpoint);
    expect(await subscriptions.enabled(owner, active.endpoint)).toBe(true);
    expect(await subscriptions.enabled(other, active.endpoint)).toBe(false);
    const deliveries = await Promise.all([subscriptions.sendDaily(), subscriptions.sendDaily()]);
    expect(deliveries.reduce((sum, batch) => sum + batch.sent, 0)).toBe(1);
    expect(deliveries.reduce((sum, batch) => sum + batch.expired, 0)).toBe(1);
    expect(await subscriptions.enabled(owner, expired.endpoint)).toBe(false);
    expect(await subscriptions.enabled(owner, disabled.endpoint)).toBe(false);
    expect((await subscriptions.sendDaily()).sent).toBe(0);
    expect(sendDaily).toHaveBeenCalledTimes(2);
    const requestId = randomUUID();
    await pool.query("INSERT INTO web_push_test_requests(id,endpoint,expires_at) VALUES($1,$2,now()+interval '1 minute')", [requestId, active.endpoint]);
    await Promise.all([subscriptions.sendOneRequestedTest(), subscriptions.sendOneRequestedTest()]);
    expect(sendTest).toHaveBeenCalledExactlyOnceWith(active);
    expect((await pool.query('SELECT status FROM web_push_test_requests WHERE id=$1', [requestId])).rows).toEqual([{ status: 'sent' }]);
  } finally {
    await pool.query('DELETE FROM mobile_accounts WHERE id=ANY($1::uuid[])', [[owner, other]]);
    await pool.end();
  }
});
