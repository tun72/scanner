import { randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { MAX_PHOTO_BYTES, ScanProfileSchema, VerdictLevelSchema } from '@food-scanner/contracts';
import { z } from 'zod';
import { createAssessFood } from '../../apps/api/src/assessment/assess-food.ts';
import { checkScanRequest } from '../../apps/api/src/assessment/check-request.ts';
import { createClaudeFoodJudge } from '../../apps/api/src/infrastructure/claude-food-judge.ts';

// Public Claude API rates in USD per million tokens. The adapter uses a five-minute cache.
// https://platform.claude.com/docs/en/about-claude/pricing
const models = {
  'claude-opus-5-5': { input: 4, output: 20, write: 5, read: 0.2 },
  'claude-haiku-5-5': { input: 0.10, output: 0.50, write: 0.125, read: 0.01 },
};
const haikuLongContext = { input: 0.50, output: 2.50, write: 0.625, read: 0.05 };
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const manifestSchema = z.strictObject({
  profiles: z.record(id, ScanProfileSchema),
  cases: z.array(z.strictObject({
    id,
    profile: id,
    photo: z.string().regex(/\.jpe?g$/i),
    expectedLevel: VerdictLevelSchema,
    expectedFlags: z.array(z.string().trim().min(1)).default([]),
  })).min(1),
});

async function loadCases(path) {
  const directory = dirname(await realpath(path));
  const manifest = manifestSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  const ids = new Set();
  const cases = [];
  for (const entry of manifest.cases) {
    if (ids.has(entry.id)) throw new Error(`Duplicate case ID: ${entry.id}`);
    ids.add(entry.id);
    if (!Object.hasOwn(manifest.profiles, entry.profile)) throw new Error(`${entry.id}: unknown profile ${entry.profile}`);
    const photoPath = await realpath(resolve(directory, entry.photo));
    const localPath = relative(directory, photoPath);
    if (isAbsolute(entry.photo) || isAbsolute(localPath) || localPath === '..' || localPath.startsWith(`..${sep}`)) {
      throw new Error(`${entry.id}: photo must be inside the manifest directory`);
    }
    const file = await stat(photoPath);
    if (!file.isFile() || file.size > MAX_PHOTO_BYTES) throw new Error(`${entry.id}: photo must be a JPEG of at most ${MAX_PHOTO_BYTES} bytes`);
    const request = {
      installId: randomUUID(), kind: 'photo', photo: (await readFile(photoPath)).toString('base64'),
      profile: manifest.profiles[entry.profile], locale: 'en',
    };
    if (!checkScanRequest(request).ok) throw new Error(`${entry.id}: invalid photo scan request`);
    cases.push({ ...entry, request });
  }
  return cases;
}

function estimatedCost(model, usage) {
  const { inputTokens, outputTokens, cacheWriteInputTokens = 0, cacheReadInputTokens = 0 } = usage;
  const inputLength = inputTokens + cacheWriteInputTokens + cacheReadInputTokens;
  const rates = model === 'claude-haiku-5-5' && inputLength > 100_000 ? haikuLongContext : models[model];
  return (inputTokens * rates.input + outputTokens * rates.output + cacheWriteInputTokens * rates.write + cacheReadInputTokens * rates.read) / 1_000_000;
}

const normalize = (text) => text.trim().toLowerCase();

async function evaluate(model, cases, client) {
  const assess = createAssessFood({
    judge: createClaudeFoodJudge({ messages: client.beta.messages, model, serverFallback: false }),
    products: { findProduct: async () => ({ status: 'not-found' }) },
    now: () => new Date(),
  });
  const results = [];
  for (const { id, profile, expectedLevel, expectedFlags, request } of cases) {
    const start = performance.now();
    const outcome = await assess(request);
    const usage = outcome.usage ?? null;
    const verdict = outcome.kind === 'verdict' ? outcome.response : null;
    const flags = new Set(verdict?.flaggedIngredients.map(normalize));
    results.push({
      id, profile, expectedLevel, actualLevel: verdict?.level ?? null,
      missingFlags: expectedFlags.filter((ingredient) => !flags.has(normalize(ingredient))),
      failure: outcome.kind === 'unavailable' ? outcome.failure : outcome.kind === 'refused' ? outcome.error.code : null,
      latencyMs: Math.round(performance.now() - start), usage,
      estimatedUsd: usage === null ? null : estimatedCost(model, usage),
    });
  }
  const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b);
  const exactMatches = results.filter((result) => result.expectedLevel === result.actualLevel).length;
  return {
    model,
    count: results.length,
    exactMatches,
    accuracy: exactMatches / results.length,
    matchesWithRequiredFlags: results.filter((result) => result.expectedLevel === result.actualLevel && result.missingFlags.length === 0).length,
    unsafeSafeVerdicts: results.filter((result) => result.expectedLevel !== 'safe' && result.actualLevel === 'safe').length,
    failures: results.filter((result) => result.actualLevel === null).length,
    p50LatencyMs: latencies[Math.ceil(latencies.length * 0.5) - 1],
    p95LatencyMs: latencies[Math.ceil(latencies.length * 0.95) - 1],
    estimatedUsd: results.reduce((total, result) => total + (result.estimatedUsd ?? 0), 0),
    casesWithoutUsage: results.filter((result) => result.estimatedUsd === null).length,
    results,
  };
}

async function main() {
  const { values } = parseArgs({ options: { manifest: { type: 'string' }, live: { type: 'boolean' }, 'max-calls': { type: 'string' } } });
  if (!values.manifest) throw new Error('Usage: npm run eval:verdicts -- --manifest PATH [--live --max-calls N]');
  const cases = await loadCases(values.manifest);
  const names = Object.keys(models);
  const calls = cases.length * names.length;
  const profileIds = [...new Set(cases.map(({ profile }) => profile))];
  if (!values.live) {
    console.log(JSON.stringify({ mode: 'validation-only', cases: cases.length, profileIds, models: names, liveCallsPlanned: calls }, null, 2));
    return;
  }

  const maxCalls = Number(values['max-calls']);
  if (!Number.isSafeInteger(maxCalls) || maxCalls < calls) throw new Error(`Live evaluation needs --max-calls of at least ${calls}. No requests sent.`);
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY locally to run the live comparison.');
  const client = new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com', maxRetries: 0, timeout: 15_000 });
  const reports = [];
  for (const name of names) reports.push(await evaluate(name, cases, client));
  console.log(JSON.stringify({ mode: 'live', cache: 'as configured in the app', retries: 0, fallback: false, profileIds, reports }, null, 2));
  if (reports.some((report) => report.failures > 0)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
