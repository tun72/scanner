import type { ScanRequest } from '@food-scanner/contracts';
import type { ScanFailure } from './scan-outcome.ts';

/** What the user can do after a failed scan. */
export type FailureAction = 'retry' | 'take-photo' | 'scan-again' | 'home';

export const ACTION_LABELS: Readonly<Record<FailureAction, string>> = {
  retry: 'Try again',
  'take-photo': 'Take a photo',
  'scan-again': 'Scan again',
  home: 'Back home',
};

export interface FailureDisplay {
  message: string;
  actions: FailureAction[];
}

export const UNREACHABLE_MESSAGE = "We couldn't reach Food Scanner. Check your internet connection and try again.";
export const BAD_REPLY_MESSAGE = "We can't check foods right now. Please try again in a moment.";
export const NOT_SENDABLE_MESSAGE = "We couldn't read that scan. Please try again.";

function waitText(retryAfterSeconds: number | undefined): string {
  if (retryAfterSeconds === undefined) return '';
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return ` You can scan again in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

/**
 * The message and buttons for a failed scan. The API's own messages are shown as they are:
 * they are written for the user and never repeat what was sent.
 */
export function describeFailure(failure: ScanFailure, scanKind: ScanRequest['kind']): FailureDisplay {
  switch (failure.reason) {
    case 'unreachable':
      return { message: UNREACHABLE_MESSAGE, actions: ['retry'] };
    case 'bad-reply':
      return { message: BAD_REPLY_MESSAGE, actions: ['retry'] };
    case 'not-sendable':
      return { message: NOT_SENDABLE_MESSAGE, actions: ['scan-again'] };
    case 'refused': {
      const { code, message, retryAfterSeconds } = failure.error;
      switch (code) {
        case 'product-not-found':
          return { message, actions: ['take-photo'] };
        case 'ai-unavailable':
          // A barcode can also be judged from a photo, which skips the product database.
          return { message, actions: scanKind === 'barcode' ? ['retry', 'take-photo'] : ['retry'] };
        case 'rate-limited':
          return { message: message + waitText(retryAfterSeconds), actions: ['home'] };
        case 'invalid-request':
          return { message, actions: ['scan-again'] };
      }
    }
  }
}
