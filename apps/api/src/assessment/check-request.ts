import { ScanRequestSchema, type AssessmentError, type ScanRequest } from '@food-scanner/contracts';
import { invalidRequest } from './errors.ts';

export type RequestCheck = { ok: true; request: ScanRequest } | { ok: false; error: AssessmentError; scanKind?: 'photo' | 'barcode' };

/** Every JPEG file starts with these three bytes. */
const JPEG_START = Buffer.from([0xff, 0xd8, 0xff]);

/** Reads only the first bytes, so a large photo is not decoded just to look at its start. */
function startsLikeJpeg(base64: string): boolean {
  return Buffer.from(base64.slice(0, 4), 'base64').subarray(0, JPEG_START.length).equals(JPEG_START);
}

/**
 * Decides whether a request body can be judged.
 * The shared schema covers shape, sizes and the profile; this adds the checks only the server makes.
 */
export function checkScanRequest(body: unknown): RequestCheck {
  const parsed = ScanRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: invalidRequest() };
  const request = parsed.data;
  if (request.kind === 'photo' && !startsLikeJpeg(request.photo)) return { ok: false, error: invalidRequest(), scanKind: 'photo' };
  return { ok: true, request };
}
