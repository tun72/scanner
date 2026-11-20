import { randomUUID } from 'node:crypto';
import { AssessmentErrorSchema } from '@food-scanner/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAssessFood } from '../src/assessment/assess-food.ts';
import { DEFAULT_SCAN_LIMITS, buildServer } from '../src/http/server.ts';
import { FIXED_NOW, USAGE, draft, fakeJudge, fakeProducts, photoScan } from './helpers.ts';

// The real @fastify/rate-limit plugin with the real limits; only the AI is a stand-in.
let judge: ReturnType<typeof fakeJudge>;
let api: FastifyInstance;

beforeEach(() => {
  judge = fakeJudge({ ok: true, draft: draft(), usage: USAGE });
  api = buildServer({ assessFood: createAssessFood({ judge, products: fakeProducts(), now: () => FIXED_NOW }), logLevel: 'silent' });
});
afterEach(() => api.close());

const scanFrom = (installId: string) => api.inject({ method: 'POST', url: '/v1/assessments', payload: photoScan({ installId }) });

async function scanTimes(count: number, installId: () => string): Promise<number[]> {
  const statuses: number[] = [];
  for (let scan = 0; scan < count; scan += 1) statuses.push((await scanFrom(installId())).statusCode);
  return statuses;
}

describe('scan limits', () => {
  it('TC20 accepts every scan from one install up to the hourly limit', async () => {
    const install = randomUUID();

    const statuses = await scanTimes(DEFAULT_SCAN_LIMITS.perInstallPerHour, () => install);

    expect(DEFAULT_SCAN_LIMITS.perInstallPerHour).toBe(30);
    expect(statuses).toEqual(Array(30).fill(200));
    expect(judge.calls).toHaveLength(30);
  });

  it('TC21 refuses the next scan from that install with a retry time and does not call the AI', async () => {
    const install = randomUUID();
    await scanTimes(30, () => install);

    const refused = await scanFrom(install);

    expect(refused.statusCode).toBe(429);
    const error = AssessmentErrorSchema.parse(refused.json());
    expect(error.code).toBe('rate-limited');
    expect(error.retryAfterSeconds).toBeGreaterThan(0);
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(3600);
    expect(refused.headers['retry-after']).toBe(String(error.retryAfterSeconds));
    expect(judge.calls).toHaveLength(30);
  });

  it('TC21 does not let one install over its limit hold back another install', async () => {
    const busyInstall = randomUUID();
    await scanTimes(31, () => busyInstall);

    const other = await scanFrom(randomUUID());

    expect(other.statusCode).toBe(200);
  });

  it('TC21 refuses scans from one IP after its hourly limit, however many installs they come from', async () => {
    expect(DEFAULT_SCAN_LIMITS.perIpPerHour).toBe(120);

    const statuses = await scanTimes(121, () => randomUUID());

    expect(statuses.slice(0, 120)).toEqual(Array(120).fill(200));
    expect(statuses[120]).toBe(429);
    expect(judge.calls).toHaveLength(120);
  });

  it('counts requests without a valid install ID toward the IP limit only', async () => {
    api = buildServer({
      assessFood: createAssessFood({ judge, products: fakeProducts(), now: () => FIXED_NOW }),
      scanLimits: { perInstallPerHour: 1, perIpPerHour: 3 },
      logLevel: 'silent',
    });

    const statuses = await scanTimes(4, () => 'not-a-uuid');

    expect(statuses).toEqual([400, 400, 400, 429]);
  });
});
