import { z } from 'zod';
import { digestToken, hashPassword, matchesPassword } from '../cloud/credentials.ts';
import type { AdminSessionIdentity } from './identity.ts';

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const AdminPasswordInput = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export interface AdminPasswordIdentity extends AdminSessionIdentity {
  verifyPassword(email: string, password: string): Promise<string | null>;
}

export async function createAdminPasswordIdentity(env: NodeJS.ProcessEnv): Promise<AdminPasswordIdentity | undefined> {
  if (env.ADMIN_AUTH_MODE !== 'password') return undefined;
  const email = emailSchema.safeParse(env.ADMIN_EMAIL).data;
  const password = env.ADMIN_PASSWORD;
  const origin = URL.parse(env.ADMIN_ORIGIN?.trim() ?? '');
  if (!origin || origin.protocol !== 'https:' || origin.href !== origin.origin + '/') {
    throw new Error('Configure an HTTPS ADMIN_ORIGIN for Scanner admin sign-in.');
  }
  if (!email || !password || [...password].length < 15 || password.length > 128 || !password.trim()) {
    throw new Error('Configure a valid ADMIN_EMAIL and an ADMIN_PASSWORD of at least 15 characters.');
  }

  const verifier = await hashPassword(password);
  return {
    // The verifier has a new random salt per process, so restarting also revokes old password sessions.
    issuer: 'urn:scanner:admin:password:' + digestToken(verifier),
    origin: origin.origin,
    allows: subject => subject === email,
    async verifyPassword(candidateEmail, candidatePassword) {
      const matches = await matchesPassword(candidatePassword, verifier);
      return matches && candidateEmail === email ? email : null;
    },
  };
}
