import * as webPush from 'web-push';
import { generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { createWebPush, pushSubscriptionSchema } from '../src/cloud/web-push.ts';
import type { CloudServices } from '../src/cloud/routes.ts';
import { buildServer } from '../src/http/server.ts';
import * as scheduler from '../src/cloud/push-scheduler.ts';

vi.mock('web-push', async importOriginal => ({
  ...await importOriginal<typeof webPush>(), sendNotification: vi.fn(),
}));

const subscription = {
  endpoint: 'https://web.push.apple.com/example',
  keys: { p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) },
};

describe('PWA test notifications', () => {
  it('authorizes only the release workflow, with manual runs limited to a readiness check', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const authorize = async (event: string, repositoryId = '1465648520') => {
      const token = await new SignJWT({
        event_name: event, repository_id: repositoryId, ref: 'refs/heads/main',
        workflow_ref: 'tun72/scanner/.github/workflows/daily-push.yml@refs/heads/main',
      }).setProtectedHeader({ alg: 'RS256' }).setIssuer('https://token.actions.githubusercontent.com')
        .setAudience('scanner-daily-push').setIssuedAt().setExpirationTime('1m').sign(privateKey);
      return scheduler.authorizePushJob(`Bearer ${token}`, () => publicKey);
    };
    expect(await authorize('schedule')).toBe('send');
    expect(await authorize('workflow_dispatch')).toBe('check');
    expect(await authorize('push')).toBeNull();
    expect(await authorize('schedule', '1')).toBeNull();
  });

  it('accepts a separate audience and workflow identity for scheduled broadcasts', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const authorize = async (event: string, workflow = 'broadcast', audience = 'scanner-broadcast-push') => {
      const token = await new SignJWT({
        event_name: event, repository_id: '1465648520', ref: 'refs/heads/main',
        workflow_ref: `tun72/scanner/.github/workflows/${workflow}-push.yml@refs/heads/main`,
      }).setProtectedHeader({ alg: 'RS256' }).setIssuer('https://token.actions.githubusercontent.com')
        .setAudience(audience).setIssuedAt().setExpirationTime('1m').sign(privateKey);
      return scheduler.authorizeBroadcastJob(`Bearer ${token}`, () => publicKey);
    };
    expect(await authorize('schedule')).toBe('send');
    expect(await authorize('workflow_dispatch')).toBe('check');
    expect(await authorize('push')).toBeNull();
    expect(await authorize('schedule', 'daily')).toBeNull();
    expect(await authorize('schedule', 'broadcast', 'scanner-daily-push')).toBeNull();
  });

  it('runs broadcast delivery only for the scheduled workflow', async () => {
    const processBroadcasts = vi.fn().mockResolvedValue(undefined);
    const server = buildServer({
      cloud: {
        accounts: {} as CloudServices['accounts'], history: {} as CloudServices['history'], processBroadcasts,
      },
      logLevel: 'silent', assessFood: async () => { throw new Error('Unexpected scan'); },
    });
    const request = { method: 'POST' as const, url: '/v1/push/broadcasts' };
    const authorize = vi.spyOn(scheduler, 'authorizeBroadcastJob');
    try {
      expect((await server.inject(request)).statusCode).toBe(401);
      authorize.mockResolvedValueOnce('check');
      expect((await server.inject(request)).json()).toEqual({ ready: true });
      expect(processBroadcasts).not.toHaveBeenCalled();
      authorize.mockResolvedValueOnce('send');
      expect((await server.inject(request)).json()).toEqual({ processed: true });
      expect(processBroadcasts).toHaveBeenCalledOnce();
    } finally {
      authorize.mockRestore();
      await server.close();
    }
  });

  it('accepts only secure browser push endpoints', () => {
    expect(pushSubscriptionSchema.safeParse(subscription).success).toBe(true);
    for (const endpoint of [
      'http://web.push.apple.com/example', 'https://web.push.apple.com:8000/example',
      'https://web.push.apple.com.example.org/example', 'https://127.0.0.1/example', 'invalid',
    ]) expect(pushSubscriptionSchema.safeParse({ ...subscription, endpoint }).success).toBe(false);
  });

  it('requires an account and sends only a valid subscription to the push service', async () => {
    const token = 't'.repeat(43);
    const headers = { authorization: `Bearer ${token}` };
    const sendTest = vi.fn().mockResolvedValue('sent');
    const cloud: CloudServices = {
      accounts: { authenticate: async value => value === token ? 'owner' : null, login: async () => null, revoke: async () => {} },
      history: {} as CloudServices['history'],
      push: { publicKey: 'public-test-key', sendTest, sendDaily: sendTest },
    };
    const server = buildServer({ cloud, logLevel: 'silent', assessFood: async () => { throw new Error('Unexpected scan'); } });
    try {
      expect((await server.inject('/v1/push/key')).statusCode).toBe(401);
      expect((await server.inject({ url: '/v1/push/key', headers })).json()).toEqual({ publicKey: 'public-test-key' });
      const request = { method: 'POST' as const, url: '/v1/push/test', payload: subscription };
      expect((await server.inject(request)).statusCode).toBe(401);
      expect((await server.inject({ ...request, headers, payload: { ...subscription, endpoint: 'https://localhost/test' } })).statusCode).toBe(400);
      expect((await server.inject({ ...request, headers })).statusCode).toBe(204);
      expect(sendTest).toHaveBeenCalledExactlyOnceWith(subscription);
      sendTest.mockResolvedValueOnce('expired');
      expect((await server.inject({ ...request, headers })).statusCode).toBe(410);
    } finally {
      await server.close();
    }
  });

  it('sends a generic Burmese message through Web Push', async () => {
    const sender = vi.mocked(webPush.sendNotification).mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    try {
      const keys = webPush.generateVAPIDKeys();
      const push = createWebPush({
        WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey, WEB_PUSH_SUBJECT: 'https://example.org/contact',
      });
      expect(await push?.sendTest(subscription)).toBe('sent');
      expect(sender).toHaveBeenCalledExactlyOnceWith(subscription, expect.stringMatching(/[က-အ]/u), { TTL: 120, timeout: 8000 });
    } finally {
      sender.mockReset();
    }
  });
});
