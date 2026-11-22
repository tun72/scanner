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

const amount = z.number().nonnegative().max(100_000);
export const NutritionRangeSchema = z.object({ min: amount, max: amount })
  .refine(({ min, max }) => min <= max);
export const PhotoDetailsSchema = z.object({
  portionGrams: amount.positive().optional().catch(undefined),
  calories: NutritionRangeSchema.optional().catch(undefined),
  protein: NutritionRangeSchema.optional().catch(undefined),
  fat: NutritionRangeSchema.optional().catch(undefined),
  carbs: NutritionRangeSchema.optional().catch(undefined),
  ingredients: z.array(z.object({
    name: z.string().trim().min(1).max(90),
    evidence: z.enum(['seen', 'possible']),
  })).max(12).optional().catch(undefined),
});
export const ProductDetailsSchema = z.object({
  ingredientStatement: z.string().min(1).max(4000).optional(),
  nutrition: z.object({
    quantity: z.string().min(1).max(80),
    calories: amount.optional(),
    protein: amount.optional(),
    fat: amount.optional(),
    carbs: amount.optional(),
  }).optional(),
  ingredients: z.array(z.string().min(1).max(90)).max(20).optional(),
  allergens: z.array(z.string().min(1).max(90)).max(30).optional(),
});
export type ProductDetails = z.infer<typeof ProductDetailsSchema>;

const ScanDetailsSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('photo'), confidence: z.enum(['low', 'medium', 'high']), photo: PhotoDetailsSchema.optional(),
  }),
  z.object({ kind: z.literal('product'), product: ProductDetailsSchema }),
]);

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
  details: ScanDetailsSchema.optional().catch(undefined),
});
export type VerdictResponse = z.infer<typeof VerdictResponseSchema>;
