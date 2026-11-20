import { z } from 'zod';

export const VERDICT_LEVELS = ['safe', 'caution', 'avoid', 'unsure'] as const;
export const VerdictLevelSchema = z.enum(VERDICT_LEVELS);
export type VerdictLevel = z.infer<typeof VerdictLevelSchema>;

export const CONCERN_SEVERITIES = ['caution', 'avoid'] as const;
export const ConcernSeveritySchema = z.enum(CONCERN_SEVERITIES);
export type ConcernSeverity = z.infer<typeof ConcernSeveritySchema>;

export const VerdictReasonSchema = z.object({
  /** Display label of the user's condition (or "Your notes") this reason concerns. */
  condition: z.string().min(1),
  severity: ConcernSeveritySchema,
  explanation: z.string().min(1),
});
export type VerdictReason = z.infer<typeof VerdictReasonSchema>;

/**
 * What the API returns for a judged scan.
 * Unlike requests, responses tolerate unknown fields so an older app keeps working when the API adds one.
 */
export const VerdictResponseSchema = z.object({
  level: VerdictLevelSchema,
  foodName: z.string().min(1),
  source: z.enum(['photo', 'product']),
  reasons: z.array(VerdictReasonSchema),
  flaggedIngredients: z.array(z.string().min(1)),
  tip: z.string().min(1).optional(),
  retakeHint: z.string().min(1).optional(),
  /** The not-medical-advice text shown with every verdict. */
  notice: z.string().min(1),
  assessedAt: z.iso.datetime(),
});
export type VerdictResponse = z.infer<typeof VerdictResponseSchema>;
