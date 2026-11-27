import { CloudPhotoSchema, ImportScanSchema, LoginSchema } from '@food-scanner/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { createAccounts } from './accounts.ts';
import type { CloudHistory } from './history.ts';
import { pushEndpointSchema, pushSubscriptionSchema, type WebPush } from './web-push.ts';
import { authorizePushJob } from './push-scheduler.ts';
import type { createBroadcasts } from '../announcements/broadcasts.ts';
import type { createPushSubscriptions } from './push-subscriptions.ts';

export interface CloudServices {
  accounts: ReturnType<typeof createAccounts>;
  history: CloudHistory;
  announcements?: ReturnType<typeof createBroadcasts>;
  push?: WebPush;
  pushSubscriptions?: ReturnType<typeof createPushSubscriptions>;
}

const idSchema = z.uuid();
const pushEndpointBody = z.object({ endpoint: pushEndpointSchema });
const tokenOf = (request: FastifyRequest) => /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? '')?.[1];
const invalid = (reply: FastifyReply) => reply.code(400).send({ message: 'Check your request and try again.' });
const missing = (reply: FastifyReply) => reply.code(404).send({ message: 'This scan is unavailable.' });

export async function requireOwner(cloud: CloudServices, request: FastifyRequest, reply: FastifyReply) {
  const owner = await cloud.accounts.authenticate(tokenOf(request));
  if (!owner) void reply.code(401).send({ message: 'Sign in to continue.' });
  return owner;
}

export function registerCloudRoutes(app: FastifyInstance, cloud: CloudServices) {
  app.register(async routes => {
    routes.addHook('onSend', async (_request, reply, payload) => {
      reply.header('cache-control', 'private, no-store');
      return payload;
    });

    const loginLimit = routes.createRateLimit({ max: 15, timeWindow: 60_000, keyGenerator: req => `auth:ip:${req.ip}` });
    const rollLimit = routes.createRateLimit({
      max: 8, timeWindow: 60_000,
      keyGenerator: req => `auth:roll:${LoginSchema.safeParse(req.body).data?.rollNumber ?? req.ip}`,
    });

    routes.post('/v1/session', async (req, reply) => {
      const ip = await loginLimit(req);
      if (!ip.isAllowed && ip.isExceeded) return reply.code(429).header('retry-after', ip.ttlInSeconds).send({ message: 'Wait a minute and try again.' });
      const input = LoginSchema.safeParse(req.body);
      if (!input.success) return invalid(reply);
      const limit = await rollLimit(req);
      if (!limit.isAllowed && limit.isExceeded) return reply.code(429).header('retry-after', limit.ttlInSeconds).send({ message: 'Wait a minute and try again.' });
      const session = await cloud.accounts.login(input.data.rollNumber, input.data.password);
      return session ?? reply.code(401).send({ message: 'Check your roll number and password.' });
    });

    routes.get('/v1/session', async (req, reply) => {
      if (await requireOwner(cloud, req, reply)) return reply.code(204).send();
    });
    routes.delete('/v1/session', async (req, reply) => {
      const token = tokenOf(req);
      if (token) await cloud.accounts.revoke(token);
      return reply.code(204).send();
    });

    const push = cloud.push;
    if (push) {
      const testLimit = routes.createRateLimit({ max: 8, timeWindow: 60_000, keyGenerator: req => `push-test:${req.ip}` });
      routes.get('/v1/push/key', async (req, reply) => {
        if (await requireOwner(cloud, req, reply)) return { publicKey: push.publicKey };
      });
      routes.post('/v1/push/test', { bodyLimit: 4096 }, async (req, reply) => {
        if (!await requireOwner(cloud, req, reply)) return;
        const limit = await testLimit(req);
        if (!limit.isAllowed && limit.isExceeded) return reply.code(429).header('retry-after', limit.ttlInSeconds).send();
        const input = pushSubscriptionSchema.safeParse(req.body);
        if (!input.success) return invalid(reply);
        const result = await push.sendTest(input.data);
        return reply.code(result === 'sent' ? 204 : result === 'expired' ? 410 : 503).send();
      });
    }

    const subscriptions = cloud.pushSubscriptions;
    if (subscriptions) {
      routes.put('/v1/push/subscription', { bodyLimit: 4096 }, async (req, reply) => {
        const owner = await requireOwner(cloud, req, reply);
        if (!owner) return;
        const input = pushSubscriptionSchema.safeParse(req.body);
        if (!input.success) return invalid(reply);
        await subscriptions.enable(owner, input.data);
        return reply.code(204).send();
      });
      routes.post('/v1/push/subscription/status', { bodyLimit: 4096 }, async (req, reply) => {
        const owner = await requireOwner(cloud, req, reply);
        if (!owner) return;
        const input = pushEndpointBody.safeParse(req.body);
        if (!input.success) return invalid(reply);
        return { enabled: await subscriptions.enabled(owner, input.data.endpoint) };
      });
      routes.delete('/v1/push/subscription', { bodyLimit: 4096 }, async (req, reply) => {
        const owner = await requireOwner(cloud, req, reply);
        if (!owner) return;
        const input = pushEndpointBody.safeParse(req.body);
        if (!input.success) return invalid(reply);
        await subscriptions.disable(owner, input.data.endpoint);
        return reply.code(204).send();
      });
      routes.post('/v1/push/daily', async (req, reply) => {
        const action = await authorizePushJob(req.headers.authorization);
        if (!action) return reply.code(401).send();
        return action === 'check' ? { ready: true } : subscriptions.sendDaily();
      });
    }

    const announcements = cloud.announcements;
    if (announcements) routes.get('/v1/announcements',async (req,reply) => {
      if (!await requireOwner(cloud,req,reply)) return;
      const query = z.object({ after: idSchema.optional() }).safeParse(req.query).data;
      return query ? announcements.inbox(query.after) : invalid(reply);
    });

    routes.get('/v1/history', async (req, reply) => {
      const owner = await requireOwner(cloud, req, reply);
      if (owner) return cloud.history.list(owner);
    });
    routes.post('/v1/history/import', async (req, reply) => {
      const owner = await requireOwner(cloud, req, reply);
      if (!owner) return;
      const input = ImportScanSchema.safeParse(req.body);
      if (!input.success) return invalid(reply);
      const result = await cloud.history.importScan(owner, input.data);
      if (result === 'deleted') return reply.code(204).send();
      return result ?? reply.code(409).send({ message: 'This local history can’t be imported.' });
    });
    routes.delete('/v1/history', async (req, reply) => {
      const owner = await requireOwner(cloud, req, reply);
      if (!owner) return;
      await cloud.history.delete(owner, null);
      return reply.code(204).send();
    });
    routes.get<{ Params: { id: string } }>('/v1/history/:id', async (req, reply) => {
      const owner = await requireOwner(cloud, req, reply);
      if (!owner) return;
      if (!idSchema.safeParse(req.params.id).success) return invalid(reply);
      return await cloud.history.get(owner, req.params.id) ?? missing(reply);
    });
    routes.delete<{ Params: { id: string } }>('/v1/history/:id', async (req, reply) => {
      const owner = await requireOwner(cloud, req, reply);
      if (!owner) return;
      if (!idSchema.safeParse(req.params.id).success) return invalid(reply);
      await cloud.history.delete(owner, req.params.id);
      return reply.code(204).send();
    });
    routes.get<{ Params: { id: string } }>('/v1/history/:id/photo', async (req, reply) => {
      const owner = await requireOwner(cloud, req, reply);
      if (!owner) return;
      if (!idSchema.safeParse(req.params.id).success) return invalid(reply);
      const photo = await cloud.history.photo(owner, req.params.id);
      return photo ? reply.type('image/jpeg').send(photo) : missing(reply);
    });
    routes.put<{ Params: { id: string } }>('/v1/history/:id/photo', async (req, reply) => {
      const owner = await requireOwner(cloud, req, reply);
      if (!owner) return;
      const input = z.strictObject({ photo: CloudPhotoSchema }).safeParse(req.body);
      if (!input.success || !idSchema.safeParse(req.params.id).success) return invalid(reply);
      return await cloud.history.completePhoto(owner, req.params.id, input.data.photo) ?? missing(reply);
    });
  });
}
