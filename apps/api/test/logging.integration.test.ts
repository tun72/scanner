import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { CONDITION_LABELS } from '@food-scanner/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAssessFood } from '../src/assessment/assess-food.ts';
import type { FoodJudge, JudgeResult } from '../src/assessment/food-judge.ts';
import { buildServer } from '../src/http/server.ts';
import { FIXED_NOW, INSTALL_ID, USAGE, barcodeScan, draft, fakeProducts, jpegBase64, photoScan } from './helpers.ts';

const originalDirectory = process.cwd();
let workDirectory: string;

beforeEach(() => {
  workDirectory = mkdtempSync(join(tmpdir(), 'food-scanner-logs-'));
  process.chdir(workDirectory);
});
afterEach(() => {
  process.chdir(originalDirectory);
  rmSync(workDirectory, { recursive: true, force: true });
});

describe('what the API keeps about a scan', () => {
  it('TC18 leaves no photo, barcode, condition or note in the logs and writes no files', async () => {
    const logLines: string[] = [];
    const logStream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        logLines.push(chunk.toString('utf8'));
        done();
      },
    });
    const photo = jpegBase64(600);
    const notes = 'UNIQUE-NOTE fried garlic makes me ill';
    const profile = { conditions: ['lactose-intolerance', 'peptic-ulcer'], notes };
    const explanation = 'UNIQUE-EXPLANATION cream is high in lactose.';
    const verdictDraft = draft({ foodName: 'UNIQUE-FOOD cream soup', concerns: [{ about: 'lactose-intolerance', trigger: 'cream', severity: 'avoid', explanation }] });
    // First scan gets a verdict, second scan finds the AI unavailable, third is a barcode scan that gets a verdict.
    const results: JudgeResult[] = [
      { ok: true, usage: USAGE, draft: verdictDraft },
      { ok: false, failure: 'timeout' },
      { ok: true, usage: USAGE, draft: verdictDraft },
    ];
    const answer = async () => results.shift()!;
    const judge: FoodJudge = { judgePhoto: answer, judgeProduct: answer };
    const barcode = '5449000000996';
    const products = fakeProducts({ status: 'found', product: { barcode, name: 'UNIQUE-PRODUCT cream soup', ingredientsText: 'UNIQUE-INGREDIENTS cream', allergens: ['milk'] } });
    const server = buildServer({ assessFood: createAssessFood({ judge, products, now: () => FIXED_NOW }), logLevel: 'info', logStream });

    const verdict = await server.inject({ method: 'POST', url: '/v1/assessments?note=UNIQUE-QUERY', payload: photoScan({ photo, profile }) });
    const failed = await server.inject({ method: 'POST', url: '/v1/assessments', payload: photoScan({ photo, profile }) });
    const product = await server.inject({ method: 'POST', url: '/v1/assessments', payload: { ...barcodeScan(barcode), profile } });
    await server.close();

    expect([verdict.statusCode, failed.statusCode, product.statusCode]).toEqual([200, 503, 200]);

    const logs = logLines.join('');
    // The real logger ran and recorded every scan, so the checks below are not passing on silence.
    expect(logs.match(/scan assessed/g)).toHaveLength(3);
    expect(logs).toContain('"outcome":"avoid"');
    expect(logs).toContain('"failure":"timeout"');
    expect(logs).toContain('"kind":"barcode"');

    expect(logs).not.toContain(photo);
    expect(logs).not.toContain(photo.slice(0, 48));
    for (const condition of profile.conditions) {
      expect(logs).not.toContain(condition);
      expect(logs).not.toContain(CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS]);
    }
    for (const secretText of ['UNIQUE-NOTE', 'fried garlic', 'UNIQUE-EXPLANATION', 'UNIQUE-FOOD', 'UNIQUE-QUERY', 'UNIQUE-PRODUCT', 'UNIQUE-INGREDIENTS', barcode, INSTALL_ID]) {
      expect(logs).not.toContain(secretText);
    }

    expect(readdirSync(workDirectory)).toEqual([]);
  });
});
