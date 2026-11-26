import * as webPush from 'web-push';
import { describe, expect, it, vi } from 'vitest';
import { createWebPush, pushSubscriptionSchema } from '../src/cloud/web-push.ts';
import type { CloudServices } from '../src/cloud/routes.ts';
import { buildServer } from '../src/http/server.ts';

vi.mock('web-push', async importOriginal => ({
  ...await importOriginal<typeof webPush>(), sendNotification: vi.fn(),
}));

const subscription = {
  endpoint: 'https://web.push.apple.com/example',
  keys: { p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) },
};

describe('PWA test notifications', () => {
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
      push: { publicKey: 'public-test-key', sendTest },
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
