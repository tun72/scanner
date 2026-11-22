import { z } from 'zod';
import { CONCERN_SEVERITIES, CONDITION_LABELS, type ConcernSeverity, type ConditionId, type ScanProfile, type VerdictLevel, type VerdictReason } from '@food-scanner/contracts';

/** A concern is about one of the user's conditions, or about what they wrote in their notes. */
export const NOTES_TARGET = 'notes';
export type ConcernTarget = ConditionId | typeof NOTES_TARGET;

export interface Concern {
  about: ConcernTarget;
  /** The ingredient or property that may cause trouble, such as "chilli" or "high fat". */
  trigger: string;
  severity: ConcernSeverity;
  explanation: string;
  foodEvidence?: NonNullable<VerdictReason['foodEvidence']>;
}

/** What the AI reports about one food for one profile, before the verdict rules run. */
export interface VerdictDraft {
  isFood: boolean;
  foodName: string;
  confidence: 'high' | 'medium' | 'low';
  concerns: Concern[];
  tip: string | null;
  retakeHint: string | null;
  photoDetails?: PhotoDraft | null | undefined;
}

const draftRange = z.object({ min: z.number(), max: z.number() });
export const photoDraft = z.object({
  portionGrams: z.number().nullable(),
  calories: draftRange.nullable(),
  protein: draftRange.nullable(),
  fat: draftRange.nullable(),
  carbs: draftRange.nullable(),
  ingredients: z.array(z.object({ name: z.string(), evidence: z.enum(['seen', 'possible']) })),
});
type PhotoDraft = z.infer<typeof photoDraft>;

/** The judgement after the rules. The level is always derived here, never taken from the AI. */
export interface Verdict {
  level: VerdictLevel;
  foodName: string;
  concerns: Concern[];
  tip?: string;
  retakeHint?: string;
}

const UNKNOWN_FOOD_NAME = 'Unknown food';
export const DEFAULT_RETAKE_HINT = "We couldn't tell what this food is. Try a closer, sharper photo in good light.";

/** What a concern may be about for this profile: its conditions, plus the notes when it has any. */
export function concernTargetsFor(profile: ScanProfile): ConcernTarget[] {
  const hasNotes = (profile.notes ?? '').length > 0;
  return hasNotes ? [...profile.conditions, NOTES_TARGET] : [...profile.conditions];
}

export function labelForTarget(target: ConcernTarget): string {
  return target === NOTES_TARGET ? 'Your notes' : CONDITION_LABELS[target];
}

/**
 * The shape the AI must fill for this profile.
 *
 * It is built per request so `about` can only name something this user actually has:
 * a reason for a condition the user never picked cannot be produced or accepted.
 * The schema stays free of length limits because structured output supports only plain shapes.
 */
export function verdictDraftSchemaFor(profile: ScanProfile, includePhotoDetails = false): z.ZodType<VerdictDraft> {
  const [first, ...rest] = concernTargetsFor(profile);
  if (first === undefined) throw new Error('A profile with no condition and no note cannot be judged.');
  const core = z.object({
    isFood: z.boolean(),
    foodName: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    concerns: z.array(
      z.object({
        about: z.enum([first, ...rest]),
        trigger: z.string(),
        severity: z.enum(CONCERN_SEVERITIES),
        explanation: z.string(),
      }),
    ),
    tip: z.string().nullable(),
    retakeHint: z.string().nullable(),
  });
  return includePhotoDetails ? core.extend({ photoDetails: photoDraft.nullable().optional() }) : core;
}

function worstLevel(concerns: readonly Concern[]): VerdictLevel {
  if (concerns.some((concern) => concern.severity === 'avoid')) return 'avoid';
  if (concerns.length > 0) return 'caution';
  return 'safe';
}

const textOrUndefined = (text: string | null): string | undefined => text?.trim() || undefined;

/**
 * Turns the AI's draft into the verdict.
 *
 * - A photo that is not food, or a food identified with low confidence, is Not sure: the user
 *   may eat on our word, so an unclear photo never gets Safe.
 * - Otherwise the worst concern decides the level.
 */
export function applyVerdictRules(draft: VerdictDraft): Verdict {
  const foodName = draft.foodName.trim() || UNKNOWN_FOOD_NAME;
  if (!draft.isFood || draft.confidence === 'low') {
    return { level: 'unsure', foodName, concerns: [], retakeHint: textOrUndefined(draft.retakeHint) ?? DEFAULT_RETAKE_HINT };
  }
  const tip = textOrUndefined(draft.tip);
  return { level: worstLevel(draft.concerns), foodName, concerns: draft.concerns, ...(tip === undefined ? {} : { tip }) };
}
