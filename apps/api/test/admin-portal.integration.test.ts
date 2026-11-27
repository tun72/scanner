import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminIdentity } from '../src/admin/identity.ts';
import { createAdminPasswordIdentity, type AdminPasswordIdentity } from '../src/admin/password-identity.ts';
import { registerAdminRoutes } from '../src/admin/routes.ts';
import { createAdminUsers } from '../src/admin/users.ts';
import { createBroadcasts } from '../src/announcements/broadcasts.ts';
import { createBroadcastDelivery } from '../src/announcements/delivery.ts';
import { startBroadcastProcessor } from '../src/announcements/processor.ts';
import { createAccounts, seedMobileAccount } from '../src/cloud/accounts.ts';
import { migrateCloudDatabase } from '../src/cloud/database.ts';
import type { CloudHistory } from '../src/cloud/history.ts';
import { createPushSubscriptions } from '../src/cloud/push-subscriptions.ts';
import type { BroadcastPayload, DeliveryOutcome, PushSubscription } from '../src/cloud/web-push.ts';
import { buildServer } from '../src/http/server.ts';

const dbUrl = process.env.TEST_DATABASE_URL;
const origin = 'https://scanner.example.test';
const admin = 'fixture-admin';
const password = 'unique long fixture password';
const passwordAdminEmail = 'scanner-admin@example.test';
const content = { title: 'သတင်းစကား',body: 'Scanner မှ စမ်းသပ်ကြေညာချက်' };
const date = new Intl.DateTimeFormat('sv-SE',{
  dateStyle: 'short',timeStyle: 'short',timeZone: 'Asia/Yangon',
});
const futureTime = (ms: number) => date.format(new Date(Date.now() + ms)).replace(' ','T');

const pushSubscription = (name: string): PushSubscription => ({
  endpoint: 'https://web.push.apple.com/' + name,keys: { p256dh: 'A'.repeat(87),auth: 'A'.repeat(22) },
});

describe.skipIf(!dbUrl)('Scanner admin portal on PostgreSQL', () => {
  const schema = 'scanner_admin_test_' + randomUUID().replaceAll('-','');
  let database: Pool;
  let pool: Pool;
  let app: FastifyInstance;
  let accounts: ReturnType<typeof createAccounts>;
  let users: ReturnType<typeof createAdminUsers>;
  let broadcasts: ReturnType<typeof createBroadcasts>;
  let subscriptions: ReturnType<typeof createPushSubscriptions>;
  let headers: { cookie: string; origin: string; 'x-csrf-token': string };

  const identity: AdminIdentity = {
    issuer: 'https://id.example.test',origin,allows: subject => subject === admin,
    loginUrl: async state => 'https://id.example.test/login?state=' + state,
    verify: async code => {
      if (code === 'fixture-valid') return admin;
      if (code === 'fixture-forbidden') return 'unlisted';
      throw new Error('Denied');
    },
  };
  const login = async (code = 'fixture-valid') => {
    const start = await app.inject('/admin/auth/start');
    expect(start.statusCode).toBe(302);
    const state = new URL(start.headers.location!).searchParams.get('state');
    const flow = String(start.headers['set-cookie']).split(';')[0]!;
    return app.inject({
      url: '/admin/auth/callback?state=' + state + '&code=' + code,headers: { cookie: flow },
    });
  };

  beforeAll(async () => {
    database = new Pool({ connectionString: dbUrl });
    await database.query('CREATE SCHEMA ' + schema);
    const isolatedUrl = new URL(dbUrl!);
    isolatedUrl.searchParams.set('options','-c search_path=' + schema);
    pool = new Pool({ connectionString: isolatedUrl.href });
    await migrateCloudDatabase(pool);
    accounts = createAccounts(pool);
    users = createAdminUsers(pool);
    broadcasts = createBroadcasts(pool);
    subscriptions = createPushSubscriptions(pool,{ publicKey: 'fixture',sendTest: async () => 'sent',sendDaily: async () => 'sent' });
  });

  beforeEach(async () => {
    await app?.close();
    await pool.query('TRUNCATE mobile_accounts, admin_sessions, admin_login_attempts, admin_audit, broadcasts, broadcast_worker_heartbeat CASCADE');
    app = buildServer({
      logLevel: 'silent',assessFood: async () => { throw new Error('No food assessment in this test.'); },
      cloud: { accounts,history: {} as CloudHistory,announcements: broadcasts },
    });
    registerAdminRoutes(app,pool,identity);
    const signed = await login();
    const cookie = (signed.headers['set-cookie'] as string[]).find(value => value.startsWith('__Secure-scanner-admin='))!.split(';')[0]!;
    const session = await app.inject({ url: '/admin/api/session',headers: { cookie } });
    expect(session.statusCode).toBe(200);
    headers = { cookie,origin,'x-csrf-token': session.json().csrf };
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (database) {
      await database.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
      await database.end();
    }
  });

  const add = async (rollNumber: string) => {
    const created = await app.inject({ method: 'POST',url: '/admin/api/users',headers,payload: { name: 'Fixture ' + rollNumber,rollNumber } });
    expect(created.statusCode).toBe(200);
    return created.json<{ user: { id: string; rollNumber: string; version: number }; setupLink: { url: string } }>();
  };
  const setPassword = (url: string) => app.inject({
    method: 'POST',url: '/v1/credentials/password',payload: { token: new URL(url).hash.slice(1),password },
  });
  const active = async (rollNumber: string) => {
    await seedMobileAccount(pool,{ name: 'Fixture ' + rollNumber,rollNumber,password });
    const session = await accounts.login(rollNumber,password);
    expect(session).not.toBeNull();
    return session!;
  };
  const enqueued = async () => {
    const draft = (await broadcasts.create(admin,randomUUID(),content))!;
    return await broadcasts.schedule(admin,draft.id,{ mode: 'now',version: draft.version });
  };
  const sender = () => vi.fn(async (_sub: PushSubscription,_payload: BroadcastPayload,_ttl: number): Promise<DeliveryOutcome> => ({ status: 'accepted' }));
  const delivery = (send = sender(),when = Date.now() + 5_000) => createBroadcastDelivery(pool,send,() => new Date(when));
  const announcementFetch = (token: string) => app.inject({
    url: '/v1/announcements',headers: { authorization: 'Bearer ' + token },
  });

  const usePasswordAuth = async (identity: AdminPasswordIdentity) => {
    await app.close();
    app = buildServer({
      logLevel: 'silent',assessFood: async () => { throw new Error('No food assessment in this test.'); },
    });
    registerAdminRoutes(app,pool,identity);
  };
  const configuredPasswordAdmin = () => createAdminPasswordIdentity({
    ADMIN_AUTH_MODE: 'password',ADMIN_ORIGIN: origin,ADMIN_EMAIL: passwordAdminEmail,ADMIN_PASSWORD: password,
  });

  it('issues protected admin sessions for the configured email and password, with revocation on rotation', async () => {
    await usePasswordAuth((await configuredPasswordAdmin())!);
    const signIn = (email: string, secret: string, requestOrigin = origin) => app.inject({
      method: 'POST',url: '/admin/auth/password',headers: { origin: requestOrigin },payload: { email,password: secret },
    });
    expect((await app.inject('/admin/auth/mode')).json()).toEqual({ mode: 'password' });
    expect((await app.inject('/admin/auth/start')).statusCode).toBe(404);
    expect((await signIn(passwordAdminEmail,password,'https://other.example')).statusCode).toBe(403);
    const wrongPassword = await signIn(passwordAdminEmail,'incorrect');
    const wrongEmail = await signIn('other@example.test',password);
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(wrongEmail.json());
    expect(wrongEmail.headers['set-cookie']).toBeUndefined();
    const result = await signIn(passwordAdminEmail.toUpperCase(),password);
    expect(result.statusCode).toBe(204);
    const cookieHeader = String(result.headers['set-cookie']);
    expect(cookieHeader).toContain('Path=/admin; Secure; HttpOnly; SameSite=Lax');
    const cookie = cookieHeader.split(';')[0]!;
    const session = await app.inject({ url: '/admin/api/session',headers: { cookie } });
    expect(session.json()).toMatchObject({ actor: passwordAdminEmail,csrf: expect.any(String) });
    expect((await app.inject({ method: 'POST',url: '/admin/api/logout',headers: { cookie,origin } })).statusCode).toBe(403);
    const rotated = await createAdminPasswordIdentity({
      ADMIN_AUTH_MODE: 'password',ADMIN_ORIGIN: origin,ADMIN_EMAIL: passwordAdminEmail,ADMIN_PASSWORD: 'replacement fixture password',
    });
    await usePasswordAuth(rotated!);
    expect((await app.inject({ url: '/admin/api/session',headers: { cookie } })).statusCode).toBe(401);
    expect((await signIn(passwordAdminEmail,password)).statusCode).toBe(401);
  });

  it('limits repeated admin password verification across source addresses', async () => {
    const verifyPassword = vi.fn().mockResolvedValue(null);
    await usePasswordAuth({ issuer: 'fixture-password',origin,allows: () => false,verifyPassword });
    for (let i = 1; i <= 16; i++) {
      const response = await app.inject({
        method: 'POST',url: '/admin/auth/password',headers: { origin },
        payload: { email: passwordAdminEmail,password: 'incorrect' },remoteAddress: '192.0.2.' + i,
      });
      expect(response.statusCode).toBe(i === 16 ? 429 : 401);
    }
    expect(verifyPassword).toHaveBeenCalledTimes(15);
  });

  it('TC1 creates a protected cookie session and revokes it on sign-out', async () => {
    const signed = await login();
    const cookies = signed.headers['set-cookie'] as string[];
    expect(cookies.join(';')).toMatch(/Path=\/admin; Secure; HttpOnly; SameSite=Lax/);
    expect((await app.inject({ method: 'POST',url: '/admin/api/logout',headers })).statusCode).toBe(204);
    expect((await app.inject({ url: '/admin/api/users',headers })).statusCode).toBe(401);
  });

  it('TC2 rejects foreign accounts, missing CSRF, authorization bypass and expired sessions', async () => {
    const mobile = await active('MOBILE-ADMIN-TEST');
    expect((await app.inject({ url: '/admin/api/users',headers: { authorization: 'Bearer ' + mobile.token } })).statusCode).toBe(401);
    expect((await login('fixture-forbidden')).headers.location).toContain('failed');
    expect((await app.inject({ method: 'POST',url: '/admin/api/broadcasts',headers: { ...headers,origin: 'https://other.example' },payload: content })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST',url: '/admin/api/users',headers: { ...headers,'x-csrf-token': 'wrong' },payload: {} })).statusCode).toBe(403);
    await pool.query("UPDATE admin_sessions SET expires_at=now()-interval '1 second'");
    expect((await app.inject({ url: '/admin/api/audit',headers })).statusCode).toBe(401);
  });

  it('TC3 creates, searches and edits a stable Scanner account', async () => {
    const { user } = await add(' pt-007 ');
    const report = await app.inject({ url: '/admin/api/users?search=pt-007',headers });
    expect(report.json().items).toMatchObject([{ id: user.id,status: 'pending',rollNumber: 'PT-007' }]);
    const updated = await app.inject({ method: 'PATCH',url: '/admin/api/users/' + user.id,headers,
      payload: { name: 'Updated',rollNumber: 'PT-008',version: user.version } });
    expect(updated.json()).toMatchObject({ id: user.id,name: 'Updated',rollNumber: 'PT-008',version: 2 });
  });

  it('TC4 preserves state when a normalized roll number is taken or an update is stale', async () => {
    const first = await add('ONE');
    await add('TWO');
    expect(await users.edit(admin,first.user.id,1,{ name: 'Conflict',rollNumber: 'TWO' })).toBeNull();
    expect(await users.edit(admin,first.user.id,2,{ name: 'Stale',rollNumber: 'THREE' })).toBeNull();
    expect((await users.list('ONE')).items[0]?.rollNumber).toBe('ONE');
  });

  it('TC5 blocks old sessions and pending push when suspending and allows a fresh sign-in after reactivation', async () => {
    const account = await active('ACTIVE-1');
    await subscriptions.enable(account.user.id,pushSubscription('suspend-test'));
    await enqueued();
    const send = sender();
    const worker = delivery(send);
    await worker.publishDue();
    expect(await users.status(admin,account.user.id,1,'suspended')).toMatchObject({ status: 'suspended' });
    expect(await accounts.login('ACTIVE-1',password)).toBeNull();
    expect((await announcementFetch(account.token)).statusCode).toBe(401);
    expect(await users.status(admin,account.user.id,2,'active')).toMatchObject({ status: 'active' });
    expect(await accounts.authenticate(account.token)).toBeNull();
    expect(await accounts.login('ACTIVE-1',password)).not.toBeNull();
    await worker.deliverBatch();
    expect(send).not.toHaveBeenCalled();
    expect((await broadcasts.list()).items[0]?.counts).toEqual({ skipped: 1 });
  });

  it('TC6 prevents a login racing suspension from leaving a usable session', async () => {
    const session = await active('ACTIVE-2');
    const [candidate] = await Promise.all([accounts.login('ACTIVE-2',password),users.status(admin,session.user.id,1,'suspended')]);
    if (candidate) expect(await accounts.authenticate(candidate.token)).toBeNull();
    expect(await accounts.authenticate(session.token)).toBeNull();
  });

  it('TC7 redeems a setup link, changes the password and revokes the old session on reset', async () => {
    const account = await add('OWNER');
    expect((await setPassword(account.setupLink.url)).statusCode).toBe(204);
    const session = (await accounts.login('OWNER',password))!;
    expect(session.user.id).toBe(account.user.id);
    const grant = (await users.reset(admin,account.user.id))!;
    const changed = await app.inject({ method: 'POST',url: '/v1/credentials/password',payload: {
      token: grant.token,password: 'changed fixture password',
    } });
    expect(changed.statusCode).toBe(204);
    expect(await accounts.authenticate(session.token)).toBeNull();
    expect(await accounts.login('OWNER',password)).toBeNull();
    expect(await accounts.login('OWNER','changed fixture password')).not.toBeNull();
  });

  it('TC8 rejects replaced, expired and concurrently reused grants', async () => {
    const account = await add('GRANT');
    const expired = (await users.reset(admin,account.user.id))!;
    expect((await setPassword(account.setupLink.url)).statusCode).toBe(400);
    await pool.query("UPDATE mobile_credential_grants SET expires_at=now()-interval '1 second'");
    expect(await users.setPassword(expired.token,password)).toBe(false);
    const current = (await users.reset(admin,account.user.id))!;
    const results = await Promise.all([users.setPassword(current.token,password),users.setPassword(current.token,password)]);
    expect(results.sort()).toEqual([false,true]);
  });

  it('TC11 edits and reschedules a queued message, then cancels it without publishing', async () => {
    const draft = (await broadcasts.create(admin,randomUUID(),content))!;
    await broadcasts.schedule(admin,draft.id,{ mode: 'scheduled',version: draft.version,localTime: futureTime(600_000) });
    const revised = (await broadcasts.edit(admin,draft.id,2,{ ...content,body: 'စာအသစ်' }))!;
    const rescheduled = await broadcasts.schedule(admin,draft.id,{ mode: 'scheduled',version: revised.version,localTime: futureTime(1_200_000) });
    expect(rescheduled.outcome).toBe('queued');
    const stopped = await broadcasts.cancel(admin,draft.id,4);
    expect(stopped?.state).toBe('cancelled');
    expect(await delivery(sender(),Date.now() + 1_800_000).publishDue()).toBe(0);
    expect((await broadcasts.inbox()).items).toEqual([]);
  });

  it('TC12 deduplicates repeated draft and send requests, and rejects cancellation after publication', async () => {
    const id = randomUUID();
    const copies = await Promise.all([broadcasts.create(admin,id,content),broadcasts.create(admin,id,content)]);
    expect(copies[0]).toEqual(copies[1]);
    const requests = await Promise.all([
      broadcasts.schedule(admin,id,{ mode: 'now',version: 1 }),
      broadcasts.schedule(admin,id,{ mode: 'now',version: 1 }),
    ]);
    expect(requests[0]).toMatchObject({ outcome: 'queued',item: { id,state: 'queued',version: 2 } });
    expect(requests[0]).toEqual(requests[1]);
    const workers = await Promise.all([delivery().publishDue(),delivery().publishDue()]);
    expect(workers[0]! + workers[1]!).toBe(1);
    expect(await broadcasts.cancel(admin,id,2)).toBeNull();
    expect((await broadcasts.inbox()).items).toHaveLength(1);
  });

  it('TC13 recovers a pending delivery lease after restart', async () => {
    const account = await active('RESTART');
    await subscriptions.enable(account.user.id,pushSubscription('restart'));
    await enqueued();
    expect(await delivery().publishDue()).toBe(1);
    await pool.query("UPDATE broadcast_deliveries SET status='sending',lease_id=gen_random_uuid(),lease_until=now()-interval '1 minute'");
    const send = sender();
    const restarted = delivery(send);
    expect(await restarted.publishDue()).toBe(0);
    expect(await restarted.deliverBatch()).toBe(1);
    expect(send).toHaveBeenCalledOnce();
    expect((await broadcasts.list()).items[0]?.counts).toEqual({ accepted: 1 });
  });

  it('TC14 leaves not-yet-due messages invisible across parallel workers', async () => {
    const draft = (await broadcasts.create(admin,randomUUID(),content))!;
    await broadcasts.schedule(admin,draft.id,{ mode: 'scheduled',version: draft.version,localTime: futureTime(300_000) });
    expect(await Promise.all([delivery().publishDue(),delivery().publishDue()])).toEqual([0,0]);
    expect((await broadcasts.inbox()).items).toEqual([]);
  });

  it('TC15 makes messages visible to opted-in and unsubscribed accounts, and uses existing opted-in devices', async () => {
    const optedIn = await active('OPTED-IN');
    const noPush = await active('NO-PUSH');
    await subscriptions.enable(optedIn.user.id,pushSubscription('inbox-test'));
    await enqueued();
    const send = sender();
    const worker = delivery(send);
    await worker.publishDue();
    await worker.deliverBatch();
    for (const token of [optedIn.token,noPush.token]) {
      const inbox = await announcementFetch(token);
      expect(inbox.statusCode).toBe(200);
      expect(inbox.json().items).toMatchObject([content]);
    }
    expect(send).toHaveBeenCalledExactlyOnceWith(pushSubscription('inbox-test'),expect.objectContaining(content),expect.any(Number));
  });

  it('checks in and delivers due broadcasts when the web server starts its processor', async () => {
    const account = await active('SERVER-PUSH');
    await subscriptions.enable(account.user.id,pushSubscription('server-push'));
    await enqueued();
    const future = (await broadcasts.create(admin,randomUUID(),content))!;
    await broadcasts.schedule(admin,future.id,{ mode: 'scheduled',version: future.version,localTime: futureTime(300_000) });
    const send = sender();
    const onError = vi.fn();
    const processor = startBroadcastProcessor(delivery(send),onError);
    try {
      await Promise.all([processor.run(),processor.run()]);
      const status = await broadcasts.list();
      expect(status.workerSeenAt).toBeInstanceOf(Date);
      expect(status.items).toMatchObject([{ publishedAt: null },{ counts: { accepted: 1 } }]);
      expect(send).toHaveBeenCalledOnce();
      expect(onError).not.toHaveBeenCalled();
    } finally {
      await processor.stop();
    }
  });

  it('TC16 retires expired subscriptions, skips replaced devices and bounds transient delivery retries', async () => {
    const account = await active('OUTCOMES');
    for (const name of ['expired','replaced','retry']) await subscriptions.enable(account.user.id,pushSubscription(name));
    await enqueued();
    const send = sender();
    send.mockImplementation(async ({ endpoint }) => endpoint.endsWith('expired') ? { status: 'expired' } : { status: 'retry',afterMs: 180_000_000 });
    const worker = delivery(send);
    await worker.publishDue();
    const replaced = pushSubscription('replaced');
    await subscriptions.enable(account.user.id,{ ...replaced,keys: { ...replaced.keys,auth: 'B'.repeat(22) } });
    await worker.deliverBatch();
    expect(send).toHaveBeenCalledTimes(2);
    expect((await broadcasts.list()).items[0]?.counts).toEqual({ expired: 1,skipped: 1,failed: 1 });
    expect(await subscriptions.enabled(account.user.id,pushSubscription('expired').endpoint)).toBe(false);
    expect(await subscriptions.enabled(account.user.id,replaced.endpoint)).toBe(true);
  });

  it('TC18 exposes actual and requested times, safe delivery counts, and attributed audit entries', async () => {
    const id = randomUUID();
    const saved = await app.inject({ method: 'POST',url: '/admin/api/broadcasts',headers,payload: { id,content } });
    expect(saved.statusCode).toBe(200);
    const sent = await app.inject({ method: 'POST',url: '/admin/api/broadcasts/' + id + '/schedule',headers,
      payload: { mode: 'now',version: saved.json().version } });
    expect(sent.statusCode).toBe(200);
    expect(sent.json()).toMatchObject({ id,state: 'queued' });
    await delivery().publishDue();
    const status = await app.inject({ url: '/admin/api/broadcasts',headers });
    const [item] = status.json().items;
    expect(new Date(item.publishedAt).getTime()).toBeGreaterThanOrEqual(new Date(item.scheduledFor).getTime());
    const audit = await app.inject({ url: '/admin/api/audit?target=' + item.id,headers });
    expect(audit.json()).toMatchObject([
      { actor: admin,action: 'broadcast.queued' },{ actor: admin,action: 'broadcast.created' },
    ]);
    expect(audit.body).not.toContain('p256dh');
  });

  it('TC19 rolls back an account update when recording its audit entry fails', async () => {
    const { user } = await add('ATOMIC');
    await pool.query("ALTER TABLE admin_audit ADD CONSTRAINT fixture_actor_nonempty CHECK (actor <> '')");
    try {
      await expect(users.edit('',user.id,1,{ name: 'Should roll back',rollNumber: 'ATOMIC-2' })).rejects.toThrow();
      expect((await users.list('ATOMIC')).items[0]).toMatchObject({ name: 'Fixture ATOMIC',version: 1 });
    } finally {
      await pool.query('ALTER TABLE admin_audit DROP CONSTRAINT fixture_actor_nonempty');
    }
  });
});
