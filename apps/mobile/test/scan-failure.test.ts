import type { AssessmentError } from '@food-scanner/contracts';
import { describe, expect, it } from 'vitest';
import { BAD_REPLY_MESSAGE, NOT_SENDABLE_MESSAGE, UNREACHABLE_MESSAGE, describeFailure } from '../src/scan/scan-failure.ts';

const refused = (error: AssessmentError) => ({ reason: 'refused' as const, error });

describe('what a failed scan shows', () => {
  it('asks for a photo when the product is unknown', () => {
    const message = "We couldn't find that product. Please take a photo of it instead.";
    expect(describeFailure(refused({ code: 'product-not-found', message }), 'barcode')).toEqual({ message, actions: ['take-photo'] });
  });

  it('offers to try again when the AI is unavailable, and a photo instead for a barcode', () => {
    const message = "We can't check foods right now. Please try again in a moment.";
    expect(describeFailure(refused({ code: 'ai-unavailable', message }), 'photo')).toEqual({ message, actions: ['retry'] });
    expect(describeFailure(refused({ code: 'ai-unavailable', message }), 'barcode')).toEqual({ message, actions: ['retry', 'take-photo'] });
  });

  it.each([
    [1200, ' You can scan again in about 20 minutes.'],
    [61, ' You can scan again in about 2 minutes.'],
    [30, ' You can scan again in about 1 minute.'],
    [undefined, ''],
  ])('says how long to wait over the scan limit (%s seconds) and offers no retry', (retryAfterSeconds, wait) => {
    const message = "You've scanned a lot in the last hour. Please try again later.";
    const error: AssessmentError = { code: 'rate-limited', message, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) };
    expect(describeFailure(refused(error), 'photo')).toEqual({ message: message + wait, actions: ['home'] });
  });

  it('asks to scan again when the API could not read the scan', () => {
    const message = "We couldn't read that scan. Please try again.";
    expect(describeFailure(refused({ code: 'invalid-request', message }), 'photo')).toEqual({ message, actions: ['scan-again'] });
  });

  it.each([
    ['unreachable', UNREACHABLE_MESSAGE, ['retry']],
    ['bad-reply', BAD_REPLY_MESSAGE, ['retry']],
    ['not-sendable', NOT_SENDABLE_MESSAGE, ['scan-again']],
  ] as const)('explains a scan that got no answer (%s)', (reason, message, actions) => {
    expect(describeFailure({ reason }, 'photo')).toEqual({ message, actions });
  });
});
