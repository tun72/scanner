import type { AssessmentError } from '@food-scanner/contracts';

// Every message is fixed text for the user. None repeats request data or internal details.

export const invalidRequest = (): AssessmentError => ({
  code: 'invalid-request',
  message: "We couldn't read that scan. Please try again.",
});

export const productNotFound = (): AssessmentError => ({
  code: 'product-not-found',
  message: "We couldn't find that product. Please take a photo of it instead.",
});

/** The product database could not be reached. It shares the code the app already treats as "try again". */
export const productLookupUnavailable = (): AssessmentError => ({
  code: 'ai-unavailable',
  message: "We can't check this product right now. Try again, or take a photo instead.",
});

export const rateLimited = (retryAfterSeconds: number): AssessmentError => ({
  code: 'rate-limited',
  message: "You've scanned a lot in the last hour. Please try again later.",
  retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)),
});

export const aiUnavailable = (): AssessmentError => ({
  code: 'ai-unavailable',
  message: "We can't check foods right now. Please try again in a moment.",
});
