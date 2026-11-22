import type { AssessmentError } from '@food-scanner/contracts';
import { describe, expect, it } from 'vitest';
import { BAD_REPLY_MESSAGE, NOT_SENDABLE_MESSAGE, UNREACHABLE_MESSAGE, describeFailure } from '../src/scan/scan-failure.ts';

const refused = (error: AssessmentError) => ({ reason: 'refused' as const, error });

describe('what a failed scan shows', () => {
  it('asks for a photo when the product is unknown', () => {
    const message = "ဤပစ္စည်းကို ရှာမတွေ့ပါ။ ဓာတ်ပုံရိုက်ပြီး စစ်ပါ။";
    expect(describeFailure(refused({ code: 'product-not-found', message }), 'barcode')).toEqual({ message, actions: ['take-photo'] });
  });

  it('offers to try again when the AI is unavailable, and a photo instead for a barcode', () => {
    const message = "လောလောဆယ် စစ်ဆေး၍ မရပါ။ ခဏနေ ပြန်ကြိုးစားပါ။";
    expect(describeFailure(refused({ code: 'ai-unavailable', message }), 'photo')).toEqual({ message, actions: ['retry'] });
    expect(describeFailure(refused({ code: 'ai-unavailable', message }), 'barcode')).toEqual({ message, actions: ['retry', 'take-photo'] });
  });

  it.each([
    [1200, ' ၂၀ မိနစ်ခန့်အကြာ ပြန်စစ်ပါ။'],
    [61, ' ၂ မိနစ်ခန့်အကြာ ပြန်စစ်ပါ။'],
    [30, ' ၁ မိနစ်ခန့်အကြာ ပြန်စစ်ပါ။'],
    [undefined, ''],
  ])('says how long to wait over the scan limit (%s seconds) and offers no retry', (retryAfterSeconds, wait) => {
    const message = "ယခုနာရီအတွက် စစ်ဆေးနိုင်သည့် အကြိမ်ရေ ပြည့်သွားပါပြီ။";
    const error: AssessmentError = { code: 'rate-limited', message, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) };
    expect(describeFailure(refused(error), 'photo')).toEqual({ message: message + wait, actions: ['home'] });
  });

  it('asks to scan again when the API could not read the scan', () => {
    const message = "ဖတ်၍ မရပါ။ ပြန်စစ်ပါ။";
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
