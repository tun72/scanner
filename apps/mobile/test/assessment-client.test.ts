import type { ScanRequest } from '@food-scanner/contracts';
import { describe, expect, it } from 'vitest';
import { createFetchAssessmentClient, type Fetch } from '../src/scan/assessment-client.ts';
import { INSTALL_ID, verdict } from './helpers.ts';

const REQUEST: ScanRequest = { kind: 'barcode', barcode: '3017620422003', installId: INSTALL_ID, profile: { conditions: ['gerd'] }, locale: 'en' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that records its calls and answers with a response, throws an error, or never answers until aborted. */
function fakeFetch(answer: Response | Error | 'never') {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: Fetch = (url, init) => {
    calls.push({ url, init });
    if (answer === 'never') {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
      });
    }
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  return { fetch, calls };
}

const assess = (answer: Response | Error | 'never', timeoutMs?: number) => {
  const { fetch } = fakeFetch(answer);
  return createFetchAssessmentClient({ baseUrl: 'https://api.example.test', fetch, ...(timeoutMs === undefined ? {} : { timeoutMs }) }).assess(REQUEST);
};

describe('the Food Scanner API client', () => {
  it('posts the scan as JSON to /v1/assessments', async () => {
    const { fetch, calls } = fakeFetch(json(verdict()));

    await createFetchAssessmentClient({ baseUrl: 'https://api.example.test/', fetch }).assess(REQUEST);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.example.test/v1/assessments');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual(REQUEST);
  });

  it('returns the verdict from a 200 answer', async () => {
    expect(await assess(json(verdict()))).toEqual({ kind: 'verdict', verdict: verdict() });
  });

  it.each([
    [404, { code: 'product-not-found', message: "We couldn't find that product. Please take a photo of it instead." }],
    [429, { code: 'rate-limited', message: "You've scanned a lot in the last hour. Please try again later.", retryAfterSeconds: 1200 }],
    [503, { code: 'ai-unavailable', message: "We can't check foods right now. Please try again in a moment." }],
    [400, { code: 'invalid-request', message: "We couldn't read that scan. Please try again." }],
  ])('returns the API error from a %i answer', async (status, error) => {
    expect(await assess(json(error, status))).toEqual({ kind: 'failed', failure: { reason: 'refused', error } });
  });

  it('reports a network failure as unreachable', async () => {
    expect(await assess(new TypeError('Network request failed'))).toEqual({ kind: 'failed', failure: { reason: 'unreachable' } });
  });

  it('gives up after the timeout and reports unreachable', async () => {
    expect(await assess('never', 20)).toEqual({ kind: 'failed', failure: { reason: 'unreachable' } });
  });

  it.each([
    ['a page that is not JSON', new Response('<html>Bad gateway</html>', { status: 502 })],
    ['a 200 answer that is not a verdict', json({ level: 'great' })],
    ['an error with a code the app does not know', json({ code: 'teapot', message: 'Short and stout' }, 418)],
  ])('reports %s as a bad reply', async (_name, response) => {
    expect(await assess(response)).toEqual({ kind: 'failed', failure: { reason: 'bad-reply' } });
  });

  it.each([undefined, '', '   '])('sends nothing when the API address is %j', async (baseUrl) => {
    const { fetch, calls } = fakeFetch(json(verdict()));

    expect(await createFetchAssessmentClient({ baseUrl, fetch }).assess(REQUEST)).toEqual({ kind: 'failed', failure: { reason: 'unreachable' } });
    expect(calls).toEqual([]);
  });
});
