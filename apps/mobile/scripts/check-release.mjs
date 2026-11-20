import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const cwd = fileURLToPath(new URL('..', import.meta.url));

function httpsUrl(name) {
  const url = URL.parse(process.env[name]?.trim() ?? '');
  if (url?.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
    throw new Error(`${name} must be an HTTPS URL without credentials, query parameters, or a fragment.`);
  }
  return url;
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${args.join(' ')} exited with ${result.status ?? result.signal}.`);
}

async function probeDeployment(api, policy) {
  const request = (url, options) => fetch(url, { redirect: 'error', signal: AbortSignal.timeout(90_000), ...options });
  const health = await request(new URL('/health', api));
  if (!health.ok || (await health.json()).status !== 'ok') throw new Error(`API health check failed (${health.status}).`);
  const invalid = await request(new URL('/v1/assessments', api), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  if (invalid.status !== 400 || (await invalid.json()).code !== 'invalid-request') throw new Error('The deployed assessment route did not reject an invalid request.');
  const privacy = await request(policy);
  if (!privacy.ok || !privacy.headers.get('content-type')?.includes('text/html')) throw new Error('The published policy must return an HTTPS HTML page.');
  await privacy.body?.cancel();
  console.log('HTTPS health, assessment routing, and public policy checks passed.');
}

async function main() {
  const { values } = parseArgs({ options: { smoke: { type: 'boolean' } } });
  const api = httpsUrl('EXPO_PUBLIC_API_URL');
  const policy = httpsUrl('EXPO_PUBLIC_PRIVACY_POLICY_URL');
  if (api.pathname !== '/') throw new Error('EXPO_PUBLIC_API_URL must be the deployed API origin.');
  if (values.smoke) await probeDeployment(api, policy);

  const env = { ...process.env, EXPO_PUBLIC_API_URL: api.origin, EXPO_PUBLIC_PRIVACY_POLICY_URL: policy.href };
  const output = mkdtempSync(join(tmpdir(), 'food-scanner-release-'));
  try {
    for (const platform of ['ios', 'android']) {
      const destination = join(output, platform);
      run('expo', ['export', '--platform', platform, '--output-dir', destination], env);
      run(process.execPath, ['scripts/check-no-keys.mjs', destination, 'app.json'], env);
    }
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
