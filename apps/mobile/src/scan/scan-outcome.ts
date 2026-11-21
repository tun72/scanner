import type { AssessmentError, CloudScan, VerdictResponse } from '@food-scanner/contracts';

/** Why a scan ended without a verdict. */
export type ScanFailure =
  /** The API answered with one of its errors. */
  | { reason: 'refused'; error: AssessmentError }
  /** No answer: no network, a timeout, or no API address configured. */
  | { reason: 'unreachable' }
  /** An answer the app cannot read. */
  | { reason: 'bad-reply' }
  /** The scan could not be turned into a request the API accepts, so it was not sent. */
  | { reason: 'not-sendable' };

export type ScanResult = { kind: 'verdict'; verdict: VerdictResponse; cloudScan?: CloudScan } | { kind: 'failed'; failure: ScanFailure };
