import { AccountChangeSchema, BroadcastContentSchema, BroadcastScheduleSchema } from '@food-scanner/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createBroadcasts } from '../announcements/broadcasts.ts';
import { tokenPattern } from '../cloud/credentials.ts';
import { listAdminActivity } from './audit.ts';
import type { AdminIdentity } from './identity.ts';
import { createAdminSessions } from './session.ts';
import { createAdminUsers } from './users.ts';

const idSchema = z.uuid();
const version = z.int().positive();
const afterQuery = z.object({ after: idSchema.optional() });
const userQuery = afterQuery.extend({ search: z.string().trim().max(100).default('') });
const targetQuery = z.object({ target: idSchema.optional() });
const signInQuery = z.object({ state: z.string().regex(tokenPattern),code: z.string().min(1).max(4096) });
const passwordInput = z.strictObject({ token: z.string().regex(tokenPattern), password: z.string().min(12).max(128) });
const invalid = (reply: FastifyReply) => reply.code(400).send({ message: 'Check the entered details and try again.' });
const conflict = (reply: FastifyReply) => reply.code(409).send({ message: 'This item changed or could not be updated. Refresh and try again.' });
const result = (reply: FastifyReply,value: unknown) => value ?? conflict(reply);
const idOf = (request: FastifyRequest) => idSchema.safeParse((request.params as { id?: unknown }).id).data;

export function registerAdminRoutes(app: FastifyInstance,pool: Pool,identity?: AdminIdentity) {
  const users = createAdminUsers(pool);
  const broadcasts = createBroadcasts(pool);
  app.register(async routes => {
    routes.addHook('onRequest',async (_req,reply) => {
      reply.header('cache-control','private, no-store').header('referrer-policy','no-referrer');
    });
    const limited = routes.createRateLimit({ max: 8,timeWindow: 60_000,keyGenerator: req => 'scanner-credential:' + req.ip });
    routes.post('/v1/credentials/password',{ bodyLimit: 2048 },async (req,reply) => {
      const attempt = await limited(req);
      if (!attempt.isAllowed && attempt.isExceeded) return reply.code(429).header('retry-after',attempt.ttlInSeconds).send();
      const value = passwordInput.safeParse(req.body).data;
      if (!value) return invalid(reply);
      return await users.setPassword(value.token,value.password) ? reply.code(204).send()
        : reply.code(400).send({ message: 'This link is invalid or expired.' });
    });
  });
  if (!identity) return;

  app.register(async routes => {
    const sessions = createAdminSessions(pool,identity);
    routes.addHook('onRequest',async (_req,reply) => {
      reply.header('cache-control','private, no-store').header('referrer-policy','no-referrer');
    });
    const limited = routes.createRateLimit({ max: 15,timeWindow: 60_000,keyGenerator: req => 'scanner-admin-login:' + req.ip });
    routes.get('/admin/auth/start',async (req,reply) => {
      const attempt = await limited(req);
      if (!attempt.isAllowed && attempt.isExceeded) return reply.code(429).header('retry-after',attempt.ttlInSeconds).send();
      return sessions.start(reply);
    });
    routes.get('/admin/auth/callback',async (req,reply) => {
      const query = signInQuery.safeParse(req.query).data;
      return query ? sessions.callback(req,reply,query.state,query.code) : reply.redirect('/admin/?signin=failed');
    });
    routes.register(async api => {
      api.addHook('onRoute', route => { route.bodyLimit = 10_000; });
      api.addHook('preHandler',async (req,reply) => {
        const authorized = await sessions.authorize(req,reply,req.method !== 'GET' && req.method !== 'HEAD');
        if (authorized) req.admin = authorized;
      });
      api.get('/session',async req => req.admin);
      api.post('/logout',async (req,reply) => sessions.signOut(req,reply));
      api.get('/users',async (req,reply) => {
        const query = userQuery.safeParse(req.query).data;
        return query ? users.list(query.search,query.after) : invalid(reply);
      });
      api.post('/users',async (req,reply) => {
        const input = AccountChangeSchema.safeParse(req.body).data;
        const created = input ? await users.create(req.admin.actor,input) : null;
        return !input ? invalid(reply) : created ? { user: created.user,setupLink: grantLink(identity,created.grant) } : reply.code(409).send({ message: 'This roll number is already in use.' });
      });
      api.patch('/users/:id',async (req,reply) => {
        const id = idOf(req);
        const input = AccountChangeSchema.extend({ version }).safeParse(req.body).data;
        return id && input ? result(reply,await users.edit(req.admin.actor,id,input.version,input)) : invalid(reply);
      });
      api.post('/users/:id/status',async (req,reply) => {
        const id = idOf(req);
        const input = z.strictObject({ version,status: z.enum(['suspended','active']) }).safeParse(req.body).data;
        return id && input ? result(reply,await users.status(req.admin.actor,id,input.version,input.status)) : invalid(reply);
      });
      api.post('/users/:id/reset',async (req,reply) => {
        const id = idOf(req);
        if (!id) return invalid(reply);
        const grant = await users.reset(req.admin.actor,id);
        return grant ? grantLink(identity,grant) : conflict(reply);
      });
      api.get('/broadcasts',async (req,reply) => {
        const query = afterQuery.safeParse(req.query).data;
        return query ? broadcasts.list(query.after) : invalid(reply);
      });
      api.post('/broadcasts',async (req,reply) => {
        const input = z.strictObject({ id: idSchema,content: BroadcastContentSchema }).safeParse(req.body).data;
        return input ? result(reply,await broadcasts.create(req.admin.actor,input.id,input.content)) : invalid(reply);
      });
      api.patch('/broadcasts/:id',async (req,reply) => {
        const id = idOf(req);
        const input = z.strictObject({ version,content: BroadcastContentSchema }).safeParse(req.body).data;
        return id && input ? result(reply,await broadcasts.edit(req.admin.actor,id,input.version,input.content)) : invalid(reply);
      });
      api.post('/broadcasts/:id/schedule',async (req,reply) => {
        const id = idOf(req);
        const input = BroadcastScheduleSchema.safeParse(req.body).data;
        if (!id || !input) return invalid(reply);
        const scheduled = await broadcasts.schedule(req.admin.actor,id,input);
        if (scheduled.outcome === 'invalid-time') return reply.code(400).send({ message: 'Choose a future time in Myanmar.' });
        return scheduled.outcome === 'queued' ? scheduled.item : conflict(reply);
      });
      api.post('/broadcasts/:id/cancel',async (req,reply) => {
        const id = idOf(req);
        const input = z.strictObject({ version }).safeParse(req.body).data;
        return id && input ? result(reply,await broadcasts.cancel(req.admin.actor,id,input.version)) : invalid(reply);
      });
      api.get('/audit',async (req,reply) => {
        const query = targetQuery.safeParse(req.query).data;
        return query ? listAdminActivity(pool,query.target) : invalid(reply);
      });
    }, { prefix: '/admin/api' });
  });
}

function grantLink(identity: AdminIdentity, { token,expiresAt }: { token: string; expiresAt: string }) {
  return { url: identity.origin + '/set-password#' + token,expiresAt };
}

declare module 'fastify' {
  interface FastifyRequest { admin: { actor: string; csrf: string } }
}
