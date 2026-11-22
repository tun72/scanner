import type { ScanRequest } from '@food-scanner/contracts';
import type { ScanFailure } from './scan-outcome.ts';

/** What the user can do after a failed scan. */
export type FailureAction = 'retry' | 'take-photo' | 'scan-again' | 'home';

export const ACTION_LABELS: Readonly<Record<FailureAction, string>> = {
  retry: 'ပြန်ကြိုးစားရန်',
  'take-photo': 'ဓာတ်ပုံဖြင့် စစ်ရန်',
  'scan-again': 'ပြန်စစ်ရန်',
  home: 'ပင်မစာမျက်နှာသို့',
};

export interface FailureDisplay {
  message: string;
  actions: FailureAction[];
}

export const UNREACHABLE_MESSAGE = "ချိတ်ဆက်၍ မရပါ။ အင်တာနက်လိုင်း စစ်ပြီး ပြန်ကြိုးစားပါ။";
export const BAD_REPLY_MESSAGE = "လောလောဆယ် စစ်ဆေး၍ မရပါ။ ခဏနေ ပြန်ကြိုးစားပါ။";
export const NOT_SENDABLE_MESSAGE = "ဖတ်၍ မရပါ။ ပြန်စစ်ပါ။";

function waitText(retryAfterSeconds: number | undefined): string {
  if (retryAfterSeconds === undefined) return '';
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return ` ${minutes.toLocaleString('my-MM')} မိနစ်ခန့်အကြာ ပြန်စစ်ပါ။`;
}

/** Localized recovery actions for each API error code. */
export function describeFailure(failure: ScanFailure, scanKind: ScanRequest['kind']): FailureDisplay {
  switch (failure.reason) {
    case 'unreachable':
      return { message: UNREACHABLE_MESSAGE, actions: ['retry'] };
    case 'bad-reply':
      return { message: BAD_REPLY_MESSAGE, actions: ['retry'] };
    case 'not-sendable':
      return { message: NOT_SENDABLE_MESSAGE, actions: ['scan-again'] };
    case 'refused': {
      const { code, retryAfterSeconds } = failure.error;
      switch (code) {
        case 'product-not-found':
          return { message: 'ဤပစ္စည်းကို ရှာမတွေ့ပါ။ ဓာတ်ပုံရိုက်ပြီး စစ်ပါ။', actions: ['take-photo'] };
        case 'ai-unavailable':
          // A barcode can also be judged from a photo, which skips the product database.
          return { message: BAD_REPLY_MESSAGE, actions: scanKind === 'barcode' ? ['retry', 'take-photo'] : ['retry'] };
        case 'rate-limited':
          return { message: 'ယခုနာရီအတွက် စစ်ဆေးနိုင်သည့် အကြိမ်ရေ ပြည့်သွားပါပြီ။' + waitText(retryAfterSeconds), actions: ['home'] };
        case 'invalid-request':
          return { message: NOT_SENDABLE_MESSAGE, actions: ['scan-again'] };
      }
    }
  }
}
