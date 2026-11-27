import type { Pool } from 'pg';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { digestToken, randomToken, tokenPattern } from '../cloud/credentials.ts';
import type { AdminIdentity } from './identity.ts';

const cookieName = '__Secure-scanner-admin';
const stateCookie = '__Secure-scanner-admin-flow';
const maxAge = 30 * 60;

const cookieValue = (req: FastifyRequest, name: string) => {
  const matches = (req.headers.cookie ?? '').split(';')
    .map(value => value.trim()).filter(value => value.startsWith(name + '='));
  const value = matches.length === 1 ? matches[0]?.slice(name.length + 1) : undefined;
  return value && tokenPattern.test(value) ? value : undefined;
};
const cookie = (name: string, value: string, age: number, path: string) =>
  `${name}=${value}; Max-Age=${age}; Path=${path}; Secure; HttpOnly; SameSite=Lax`;
const csrfFor = (token: string) => digestToken('scanner-admin-csrf:' + token);

export function createAdminSessions(pool: Pool, identity: AdminIdentity) {
  const revoke = async (request: FastifyRequest) => {
    const token = cookieValue(request, cookieName);
    if (token) await pool.query('DELETE FROM admin_sessions WHERE digest=$1', [digestToken(token)]);
  };
  return {
    async start(reply: FastifyReply) {
      const state = randomToken();
      const nonce = randomToken();
      const verifier = randomToken();
      const url = await identity.loginUrl(state, nonce, verifier);
      await pool.query('DELETE FROM admin_login_attempts WHERE expires_at<=now()');
      await pool.query(`INSERT INTO admin_login_attempts(digest,nonce,verifier,expires_at)
        VALUES($1,$2,$3,now()+interval '5 minutes')`, [digestToken(state), nonce, verifier]);
      return reply.header('set-cookie', cookie(stateCookie,state,300,'/admin/auth')).redirect(url);
    },
    async callback(request: FastifyRequest, reply: FastifyReply, state: string, code: string) {
      const clearFlow = cookie(stateCookie,'',0,'/admin/auth');
      if (state !== cookieValue(request,stateCookie)) return reply.header('set-cookie',clearFlow).redirect('/admin/?signin=failed');
      const { rows: [attempt] } = await pool.query<{ nonce: string; verifier: string }>(`
        DELETE FROM admin_login_attempts WHERE digest=$1 AND expires_at>now() RETURNING nonce,verifier
      `, [digestToken(state)]);
      if (!attempt) return reply.header('set-cookie',clearFlow).redirect('/admin/?signin=failed');
      let subject: string;
      try {
        subject = await identity.verify(code,attempt.nonce,attempt.verifier);
      } catch {
        return reply.header('set-cookie',clearFlow).redirect('/admin/?signin=failed');
      }
      if (!identity.allows(subject)) return reply.header('set-cookie',clearFlow).redirect('/admin/?signin=failed');
      await revoke(request);
      await pool.query('DELETE FROM admin_sessions WHERE expires_at<=now()');
      const token = randomToken();
      await pool.query(`INSERT INTO admin_sessions(digest,issuer,subject,expires_at)
        VALUES($1,$2,$3,now()+$4*interval '1 second')`, [digestToken(token), identity.issuer, subject, maxAge]);
      return reply.header('set-cookie', [clearFlow,cookie(cookieName,token,maxAge,'/admin')]).redirect('/admin/');
    },
    async authorize(request: FastifyRequest, reply: FastifyReply, mutation = false) {
      const token = cookieValue(request,cookieName);
      const { rows: [session] } = token ? await pool.query<{ subject: string }>(`
        SELECT subject FROM admin_sessions WHERE digest=$1 AND issuer=$2 AND expires_at>now()
      `, [digestToken(token), identity.issuer]) : { rows: [] };
      if (!token || !session || !identity.allows(session.subject)) {
        void reply.code(401).send({ message: 'Administrator sign-in required.' });
        return null;
      }
      const csrf = csrfFor(token);
      if (mutation && (request.headers.origin !== identity.origin || request.headers['x-csrf-token'] !== csrf)) {
        void reply.code(403).send({ message: 'This request did not come from the admin portal.' });
        return null;
      }
      return { actor: session.subject, csrf };
    },
    async signOut(request: FastifyRequest, reply: FastifyReply) {
      await revoke(request);
      return reply.header('set-cookie',cookie(cookieName,'',0,'/admin')).code(204).send();
    },
  };
}
