import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const issuer = 'https://token.actions.githubusercontent.com';
const gitHubKeys = createRemoteJWKSet(new URL(issuer + '/.well-known/jwks'), { timeoutDuration: 5000 });

async function authorizeScheduledJob(header: string | undefined, job: 'daily' | 'broadcast', keys: JWTVerifyGetKey) {
  const token = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header ?? '')?.[1];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer, audience: `scanner-${job}-push`, algorithms: ['RS256'], requiredClaims: ['exp', 'iat'],
    });
    if (payload.repository_id !== '1465648520' || payload.ref !== 'refs/heads/main'
      || payload.workflow_ref !== `tun72/scanner/.github/workflows/${job}-push.yml@refs/heads/main`) return null;
    if (payload.event_name === 'schedule') return 'send';
    if (payload.event_name === 'workflow_dispatch') return 'check';
    return null;
  } catch {
    return null;
  }
}

export function authorizePushJob(header: string | undefined, keys: JWTVerifyGetKey = gitHubKeys) {
  return authorizeScheduledJob(header, 'daily', keys);
}

export function authorizeBroadcastJob(header: string | undefined, keys: JWTVerifyGetKey = gitHubKeys) {
  return authorizeScheduledJob(header, 'broadcast', keys);
}
