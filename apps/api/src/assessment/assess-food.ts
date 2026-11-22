import { burmeseVerdict, PhotoDetailsSchema, VerdictResponseSchema, type AssessmentError, type ProductDetails, type ScanRequest, type VerdictResponse } from '@food-scanner/contracts';
import { checkScanRequest } from './check-request.ts';
import { aiUnavailable, productLookupUnavailable, productNotFound } from './errors.ts';
import type { FoodJudge, JudgeFailure, JudgeResult, TokenUsage } from './food-judge.ts';
import type { LookupFailure, ProductLookup } from './product-lookup.ts';
import { applyVerdictRules, labelForTarget, type Verdict } from './verdict.ts';

/** Source notice, localized when formatting the verdict. */
export const NOT_MEDICAL_ADVICE_NOTICE = "Food Scanner is a guide, not medical advice. If you're unsure, ask your doctor or dietitian.";

type ScanKind = ScanRequest['kind'];

export type AssessmentOutcome =
  | { kind: 'verdict'; scanKind: ScanKind; response: VerdictResponse; usage: TokenUsage }
  | { kind: 'refused'; scanKind?: ScanKind; error: AssessmentError }
  | { kind: 'not-found'; scanKind: 'barcode'; error: AssessmentError }
  | { kind: 'unavailable'; scanKind: ScanKind; error: AssessmentError; failure: JudgeFailure | LookupFailure; usage?: TokenUsage };

export interface AssessFoodDeps {
  judge: FoodJudge;
  products: ProductLookup;
  /** The clock is passed in so the time on a verdict can be tested. */
  now: () => Date;
  requireFoodOnlyPhoto?: boolean;
}

/** Judges one scan request. Takes the raw body: deciding what is acceptable is part of this use case. */
export type AssessFood = (body: unknown) => Promise<AssessmentOutcome>;

/** A food ready to be judged, or the reason it will not be. */
type Judged = { judged: JudgeResult; productName?: string; productDetails?: ProductDetails } | Extract<AssessmentOutcome, { kind: 'not-found' | 'unavailable' }>;

const unique = (items: readonly string[]): string[] => [...new Set(items)];

function toResponse(verdict: Verdict, source: VerdictResponse['source'], foodName: string, assessedAt: Date): VerdictResponse {
  return {
    level: verdict.level,
    foodName,
    source,
    reasons: verdict.concerns.map((concern) => ({
      condition: labelForTarget(concern.about),
      severity: concern.severity,
      explanation: concern.explanation.trim(),
      ...(concern.foodEvidence && { foodEvidence: concern.foodEvidence }),
    })),
    flaggedIngredients: unique(verdict.concerns.map((concern) => concern.trigger.trim())),
    ...(verdict.tip === undefined ? {} : { tip: verdict.tip }),
    ...(verdict.retakeHint === undefined ? {} : { retakeHint: verdict.retakeHint }),
    notice: NOT_MEDICAL_ADVICE_NOTICE,
    assessedAt: assessedAt.toISOString(),
  };
}

/**
 * Builds the "judge the food for this stomach" use case.
 *
 * Nothing here stores or logs the photo, the barcode or the profile: they live only for the length of the call.
 */
export function createAssessFood({ judge, products, now, requireFoodOnlyPhoto = false }: AssessFoodDeps): AssessFood {
  /** A photo goes straight to the judge; a barcode is first turned into the product's listed facts. */
  async function judgeScan(request: ScanRequest): Promise<Judged> {
    const { profile, locale } = request;
    if (request.kind === 'photo') return { judged: await judge.judgePhoto({ photoBase64: request.photo, profile, locale }) };

    const lookup = await products.findProduct(request.barcode, locale);
    if (lookup.status === 'not-found') return { kind: 'not-found', scanKind: 'barcode', error: productNotFound() };
    if (lookup.status === 'unavailable') return { kind: 'unavailable', scanKind: 'barcode', error: productLookupUnavailable(), failure: lookup.failure };
    const judged = await judge.judgeProduct({ product: lookup.product, profile, locale });
    return {
      judged,
      ...(lookup.product.name === undefined ? {} : { productName: lookup.product.name }),
      ...(lookup.product.details === undefined ? {} : { productDetails: lookup.product.details }),
    };
  }

  return async (body) => {
    const check = checkScanRequest(body);
    if (!check.ok) return { kind: 'refused', error: check.error, ...(check.scanKind === undefined ? {} : { scanKind: check.scanKind }) };
    const scanKind = check.request.kind;
    if (requireFoodOnlyPhoto && check.request.kind === 'photo' && !check.request.foodOnly) {
      return {
        kind: 'refused', scanKind,
        error: { code: 'invalid-request', message: 'Confirm that your photo shows only food before scanning.' },
      };
    }

    const result = await judgeScan(check.request);
    if ('kind' in result) return result;
    const { judged, productName, productDetails } = result;
    if (!judged.ok) {
      return { kind: 'unavailable', scanKind, error: aiUnavailable(), failure: judged.failure, ...(judged.usage === undefined ? {} : { usage: judged.usage }) };
    }

    const verdict = applyVerdictRules(judged.draft);
    // A product is named as its label names it, not as the AI rephrases it.
    const candidate = toResponse(verdict, scanKind === 'photo' ? 'photo' : 'product', productName ?? verdict.foodName, now());
    if (scanKind === 'photo' && judged.draft.isFood) {
      const photo = verdict.level === 'unsure' ? undefined : PhotoDetailsSchema.safeParse(judged.draft.photoDetails).data;
      candidate.details = { kind: 'photo', confidence: judged.draft.confidence, ...(photo ? { photo } : {}) };
    } else if (scanKind === 'barcode' && productDetails) {
      candidate.details = { kind: 'product', product: productDetails };
    }

    // The draft's shape is already checked, but its texts are not: an empty explanation or
    // trigger would give the user a reason they cannot read, so it counts as a bad reply.
    const response = VerdictResponseSchema.safeParse(candidate);
    if (!response.success) return { kind: 'unavailable', scanKind, error: aiUnavailable(), failure: 'invalid-reply', usage: judged.usage };
    return { kind: 'verdict', scanKind, response: check.request.locale.split('-')[0] === 'my' ? burmeseVerdict(response.data) : response.data, usage: judged.usage };
  };
}
