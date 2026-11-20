import { z } from 'zod';

export const ASSESSMENT_ERROR_CODES = ['invalid-request', 'rate-limited', 'product-not-found', 'ai-unavailable'] as const;
export const AssessmentErrorCodeSchema = z.enum(ASSESSMENT_ERROR_CODES);
export type AssessmentErrorCode = z.infer<typeof AssessmentErrorCodeSchema>;

/** Why a scan got no verdict. The message is written for the user and never repeats what they sent. */
export const AssessmentErrorSchema = z.object({
  code: AssessmentErrorCodeSchema,
  message: z.string().min(1),
  retryAfterSeconds: z.number().int().positive().optional(),
});
export type AssessmentError = z.infer<typeof AssessmentErrorSchema>;
