import { AssessmentErrorSchema, VerdictResponseSchema, type ScanRequest } from '@food-scanner/contracts';
import type { ScanResult } from './scan-outcome.ts';

/** Sends a scan to the Food Scanner API. Declared here so the scan code and its tests need no network. */
export interface AssessmentClient {
  assess(request: ScanRequest): Promise<ScanResult>;
}

/** Covers the API's 15 second Claude call with one retry, plus its 5 second product lookup. */
export const API_TIMEOUT_MS = 40_000;

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface FetchClientOptions {
  /** The API address, from EXPO_PUBLIC_API_URL. Missing means no scan can be sent. */
  baseUrl: string | undefined;
  fetch: Fetch;
  timeoutMs?: number;
}

const UNREACHABLE: ScanResult = { kind: 'failed', failure: { reason: 'unreachable' } };
const BAD_REPLY: ScanResult = { kind: 'failed', failure: { reason: 'bad-reply' } };
const NOT_JSON = Symbol('not JSON');

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return NOT_JSON;
  }
}

/** Reads the API's answer: a verdict on 200, one of its errors otherwise, and anything else as a bad reply. */
function readReply(status: number, body: unknown): ScanResult {
  if (status === 200) {
    const verdict = VerdictResponseSchema.safeParse(body);
    return verdict.success ? { kind: 'verdict', verdict: verdict.data } : BAD_REPLY;
  }
  const error = AssessmentErrorSchema.safeParse(body);
  return error.success ? { kind: 'failed', failure: { reason: 'refused', error: error.data } } : BAD_REPLY;
}

/** The AssessmentClient over HTTP: POST {baseUrl}/v1/assessments. Nothing retries on its own; the user retries. */
export function createFetchAssessmentClient({ baseUrl, fetch, timeoutMs = API_TIMEOUT_MS }: FetchClientOptions): AssessmentClient {
  const root = (baseUrl ?? '').trim().replace(/\/+$/, '');
  return {
    async assess(request) {
      if (root === '') return UNREACHABLE;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const response = await fetch(`${root}/v1/assessments`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(request),
          signal: abort.signal,
        });
        const body = parseJson(await response.text());
        return body === NOT_JSON ? BAD_REPLY : readReply(response.status, body);
      } catch {
        // No connection, a dropped connection or the timeout: there is no answer to show.
        return UNREACHABLE;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
