import { randomInt } from 'node:crypto';
import * as webPush from 'web-push';
import { z } from 'zod';

const pushHosts = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com']);
export const pushEndpointSchema = z.url().max(2048).refine(value => {
  const url = URL.parse(value);
  return !!url && url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash
    && (pushHosts.has(url.hostname) || url.hostname.endsWith('.push.apple.com'));
});
export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
});

const messages = [
  'Sobo လာနှုတ်ဆက်ပါတယ် 🌿',
  'ဒီနေ့လည်း အဆင်ပြေတဲ့နေ့လေး ဖြစ်ပါစေ။',
  'ခဏလေး နားပြီး ကိုယ့်ကိုယ်ကို ဂရုစိုက်လိုက်ပါ။',
];

export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;
type PushResult = 'sent' | 'expired' | 'unavailable';
export interface WebPush {
  publicKey: string;
  sendTest(subscription: PushSubscription): Promise<PushResult>;
  sendDaily(subscription: PushSubscription): Promise<PushResult>;
}

export function createWebPush(env: NodeJS.ProcessEnv): WebPush | undefined {
  const publicKey = env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_PRIVATE_KEY?.trim();
  const subject = env.WEB_PUSH_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return undefined;

  webPush.setVapidDetails(subject, publicKey, privateKey);
  async function send(subscription: PushSubscription, ttl: number): Promise<PushResult> {
    const body = messages[randomInt(messages.length)];
    try {
      await webPush.sendNotification(subscription, JSON.stringify({ body }), { TTL: ttl, timeout: 8000 });
      return 'sent';
    } catch (error) {
      if (error instanceof webPush.WebPushError && (error.statusCode === 404 || error.statusCode === 410)) return 'expired';
      return 'unavailable';
    }
  }
  return {
    publicKey,
    sendTest: subscription => send(subscription, 120),
    sendDaily: subscription => send(subscription, 3600),
  };
}
