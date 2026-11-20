import type { ScanProfile } from '@food-scanner/contracts';
import type { ProductFacts } from './product-lookup.ts';
import type { VerdictDraft } from './verdict.ts';

export interface PhotoToJudge {
  /** A JPEG as base64, already checked. */
  photoBase64: string;
  profile: ScanProfile;
  /** Language for the text the user reads. */
  locale: string;
}

export interface ProductToJudge {
  product: ProductFacts;
  profile: ScanProfile;
  locale: string;
}

/** Why no draft came back. Used for logs only; the user sees one message for all of them. */
export type JudgeFailure = 'timeout' | 'api-error' | 'refusal' | 'truncated' | 'invalid-reply';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteInputTokens?: number;
  cacheReadInputTokens?: number;
}

export type JudgeResult = { ok: true; draft: VerdictDraft; usage: TokenUsage } | { ok: false; failure: JudgeFailure; usage?: TokenUsage };

/** The AI that looks at a food. Declared here so the use case does not depend on any provider. */
export interface FoodJudge {
  /** Never throws for provider trouble: an unavailable AI is a normal result. */
  judgePhoto(input: PhotoToJudge): Promise<JudgeResult>;
  /** Judges a packaged product from its listed facts instead of a photo. */
  judgeProduct(input: ProductToJudge): Promise<JudgeResult>;
}
