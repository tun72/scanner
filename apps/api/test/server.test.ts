import { AssessmentErrorSchema } from '@food-scanner/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAssessFood } from '../src/assessment/assess-food.ts';
import { buildServer } from '../src/http/server.ts';
import { FIXED_NOW, USAGE, barcodeScan, draft, fakeJudge, fakeProducts, photoScan } from './helpers.ts';

let server: FastifyInstance | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

function serverWith(judge: ReturnType<typeof fakeJudge>, products = fakeProducts()): FastifyInstance {
  server = buildServer({ assessFood: createAssessFood({ judge, products, now: () => FIXED_NOW }), logLevel: 'silent' });
  return server;
}
const post = (app: FastifyInstance, payload: unknown, headers = { 'content-type': 'application/json' }) =>
  app.inject({ method: 'POST', url: '/v1/assessments', headers, payload: typeof payload === 'string' ? payload : JSON.stringify(payload) });

it('serves the deployment health probe without calling a provider', async () => {
  const judge = fakeJudge({ ok: true, draft: draft(), usage: USAGE });
  const response = await serverWith(judge).inject({ method: 'GET', url: '/health' });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: 'ok' });
  expect(judge.calls).toEqual([]);
});

describe('POST /v1/assessments', () => {
  it('TC22 answers 503 ai-unavailable with a fixed message when the AI is unavailable', async () => {
    const notes = 'UNIQUE-NOTE spicy food hurts';
    const app = serverWith(fakeJudge({ ok: false, failure: 'refusal' }));

    const response = await post(app, photoScan({ profile: { conditions: ['gastritis'], notes } }));

    expect(response.statusCode).toBe(503);
    const error = AssessmentErrorSchema.parse(response.json());
    expect(error.code).toBe('ai-unavailable');
    expect(response.body).not.toContain('UNIQUE-NOTE');
    expect(response.body).not.toContain('refusal');
  });

  it('answers 200 with the verdict for a valid photo scan', async () => {
    const app = serverWith(fakeJudge({ ok: true, draft: draft(), usage: USAGE }));

    const response = await post(app, photoScan());

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ level: 'safe', foodName: 'Plain rice', source: 'photo' });
  });

  it('answers 404 product-not-found for a barcode the product database does not know', async () => {
    const app = serverWith(fakeJudge({ ok: true, draft: draft(), usage: USAGE }), fakeProducts({ status: 'not-found' }));

    const response = await post(app, barcodeScan());

    expect(response.statusCode).toBe(404);
    expect(AssessmentErrorSchema.parse(response.json()).code).toBe('product-not-found');
  });

  it('answers 503 when the product database cannot be reached', async () => {
    const app = serverWith(fakeJudge({ ok: true, draft: draft(), usage: USAGE }), fakeProducts({ status: 'unavailable', failure: 'lookup-error' }));

    const response = await post(app, barcodeScan());

    expect(response.statusCode).toBe(503);
    expect(AssessmentErrorSchema.parse(response.json()).code).toBe('ai-unavailable');
  });

  it.each([
    ['a request that fails the checks', JSON.stringify(photoScan({ locale: 'not a locale' })), 'application/json'],
    ['broken JSON', '{"kind": "photo", ', 'application/json'],
    ['a body over the size limit', JSON.stringify({ padding: 'x'.repeat(3_000_000) }), 'application/json'],
    ['a body that is not JSON', 'kind=photo', 'text/plain'],
  ])('answers 400 invalid-request for %s', async (_name, payload, contentType) => {
    const judge = fakeJudge({ ok: true, draft: draft(), usage: USAGE });

    const response = await post(serverWith(judge), payload, { 'content-type': contentType });

    expect(response.statusCode).toBe(400);
    expect(AssessmentErrorSchema.parse(response.json()).code).toBe('invalid-request');
    expect(judge.calls).toHaveLength(0);
  });

  it('answers 503 with no internal detail when something unexpected breaks', async () => {
    server = buildServer({
      assessFood: async () => {
        throw new Error('secret internal detail');
      },
      logLevel: 'silent',
    });

    const response = await post(server, photoScan());

    expect(response.statusCode).toBe(503);
    expect(AssessmentErrorSchema.parse(response.json()).code).toBe('ai-unavailable');
    expect(response.body).not.toContain('secret internal detail');
  });
});
