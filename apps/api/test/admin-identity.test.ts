import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdminIdentity } from '../src/admin/identity.ts';
import { createAdminPasswordIdentity } from '../src/admin/password-identity.ts';

afterEach(() => vi.unstubAllGlobals());

it('requires an explicit password mode, HTTPS, and a sufficiently long password', async () => {
  await expect(createAdminPasswordIdentity({})).resolves.toBeUndefined();
  const env = { ADMIN_AUTH_MODE: 'password',ADMIN_EMAIL: 'admin@example.test',ADMIN_ORIGIN: 'https://scanner.example.test' };
  await expect(createAdminPasswordIdentity({ ...env,ADMIN_PASSWORD: 'short password' })).rejects.toThrow('ADMIN_PASSWORD');
  await expect(createAdminPasswordIdentity({ ...env,ADMIN_ORIGIN: 'https://scanner.example.test/login',ADMIN_PASSWORD: 'long fixture password' }))
    .rejects.toThrow('ADMIN_ORIGIN');
});

it('TC1 verifies the OpenID exchange, signed identity, nonce and required MFA assurance', async () => {
  const issuer = 'https://identity.example.test';
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  const now = Math.floor(Date.now() / 1000);
  const makeToken = async (overrides: Record<string,unknown> = {}) => new SignJWT({
    acr: 'verified-mfa', nonce: 'test-nonce', auth_time: now, ...overrides,
  }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(issuer)
    .setAudience('scanner').setSubject('admin').setIssuedAt(now).setExpirationTime(now + 240).sign(privateKey);
  let token = await makeToken();
  const transport = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.pathname.startsWith('/.well-known/')) return Response.json({
      issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token',jwks_uri: issuer + '/jwks',
    });
    if (url.pathname === '/jwks') return Response.json({ keys: [{ ...jwk,kid: 'test-key',alg: 'RS256' }] });
    expect(url.pathname).toBe('/token');
    expect(new URLSearchParams(String(init?.body)).get('code_verifier')).toBe('test-verifier');
    return Response.json({ id_token: token });
  });
  vi.stubGlobal('fetch',transport);
  const identity = createAdminIdentity({
    ADMIN_ORIGIN: 'https://scanner.example.test', ADMIN_OIDC_ISSUER: issuer, ADMIN_OIDC_CLIENT_ID: 'scanner',
    ADMIN_OIDC_CLIENT_SECRET: 'fixture-only', ADMIN_OIDC_MFA_ACR: 'verified-mfa', ADMIN_OIDC_SUBJECTS: 'admin',
  })!;
  const authorization = new URL(await identity.loginUrl('test-state','test-nonce','test-verifier'));
  expect(authorization.searchParams.get('state')).toBe('test-state');
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
  await expect(identity.verify('code','test-nonce','test-verifier')).resolves.toBe('admin');
  for (const claims of [{ acr: 'password' },{ nonce: 'wrong' },{ auth_time: now - 600 },{ auth_time: now + 60 }]) {
    token = await makeToken(claims);
    await expect(identity.verify('code','test-nonce','test-verifier')).rejects.toThrow('identity verification failed');
  }
});
