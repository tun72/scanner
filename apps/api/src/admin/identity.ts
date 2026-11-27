import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

export interface AdminSessionIdentity {
  issuer: string;
  origin: string;
  allows(subject: string): boolean;
}

export interface AdminIdentity extends AdminSessionIdentity {
  loginUrl(state: string, nonce: string, verifier: string): Promise<string>;
  verify(code: string, nonce: string, verifier: string): Promise<string>;
}

const discoverySchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
});
const httpsUrl = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Admin sign-in requires HTTPS URLs.');
  }
  return url;
};

export function createAdminIdentity(env: NodeJS.ProcessEnv): AdminIdentity | undefined {
  if (!env.ADMIN_OIDC_ISSUER) return undefined;
  const required = (key: string) => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`Missing ${key} for Scanner admin sign-in.`);
    return value;
  };
  const issuer = required('ADMIN_OIDC_ISSUER');
  const issuerUrl = httpsUrl(issuer);
  if (issuerUrl.search || issuerUrl.href !== issuer && issuerUrl.href !== issuer + '/') {
    throw new Error('Use the exact OpenID issuer URL from the provider.');
  }
  const site = httpsUrl(required('ADMIN_ORIGIN'));
  if (site.href !== site.origin + '/') throw new Error('ADMIN_ORIGIN must contain only the site origin.');
  const clientId = required('ADMIN_OIDC_CLIENT_ID');
  const clientSecret = required('ADMIN_OIDC_CLIENT_SECRET');
  const mfaAcr = required('ADMIN_OIDC_MFA_ACR');
  const subjects = new Set(required('ADMIN_OIDC_SUBJECTS').split(',').map(value => value.trim()).filter(Boolean));
  if (!subjects.size) throw new Error('Configure at least one allowed admin identity.');
  const redirectUri = site.origin + '/admin/auth/callback';
  const allows = (subject: string) => subjects.has(subject);

  let metadata: ReturnType<typeof discover> | undefined;
  async function discover() {
    const response = await fetch(issuer.replace(/\/$/, '') + '/.well-known/openid-configuration',
      { signal: AbortSignal.timeout(5_000), redirect: 'error' });
    if (!response.ok) throw new Error('Admin identity discovery failed.');
    const data = discoverySchema.parse(await response.json());
    if (data.issuer !== issuer) throw new Error('Admin identity issuer mismatch.');
    return {
      authorization: httpsUrl(data.authorization_endpoint),
      token: httpsUrl(data.token_endpoint),
      keys: createRemoteJWKSet(httpsUrl(data.jwks_uri), { timeoutDuration: 5_000 }),
    };
  }
  const settings = () => metadata ??= discover().catch(error => { metadata = undefined; throw error; });

  return {
    issuer, origin: site.origin, allows,
    async loginUrl(state, nonce, verifier) {
      const { authorization } = await settings();
      const url = new URL(authorization);
      for (const [key, value] of Object.entries({
        response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: 'openid',
        state, nonce, max_age: '300', acr_values: mfaAcr, code_challenge_method: 'S256',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        claims: JSON.stringify({ id_token: { acr: { essential: true, values: [mfaAcr] } } }),
      })) url.searchParams.set(key, value);
      return url.href;
    },
    async verify(code, nonce, verifier) {
      const { token, keys } = await settings();
      const res = await fetch(token, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8_000),
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri,
          client_id: clientId, client_secret: clientSecret, code_verifier: verifier }),
      });
      if (!res.ok) throw new Error('Admin identity exchange failed.');
      const { id_token } = z.object({ id_token: z.string() }).parse(await res.json());
      const { payload } = await jwtVerify(id_token, keys, {
        issuer, audience: clientId, algorithms: ['RS256', 'ES256', 'PS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'auth_time', 'nonce', 'acr'], maxTokenAge: '5 minutes', clockTolerance: 10,
      });
      const now = Math.floor(Date.now() / 1000);
      if (!payload.sub || !allows(payload.sub) || payload.nonce !== nonce || payload.acr !== mfaAcr
          || typeof payload.auth_time !== 'number' || payload.auth_time > now + 10 || payload.auth_time < now - 310
          || ((Array.isArray(payload.aud) && payload.aud.length > 1 || payload.azp !== undefined) && payload.azp !== clientId)) {
        throw new Error('Admin identity verification failed.');
      }
      return payload.sub;
    },
  };
}
