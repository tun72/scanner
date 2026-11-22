import { z } from 'zod';

/**
 * The stomach conditions a user can pick.
 *
 * This is the list proposed in the plan; the final list is still an open question,
 * so treat it as data: adding or removing an entry here is the whole change.
 */
export const CONDITION_IDS = [
  'gerd',
  'gastritis',
  'peptic-ulcer',
  'ibs',
  'lactose-intolerance',
  'celiac-gluten',
  'gallbladder',
  'ibd',
] as const;

export const ConditionIdSchema = z.enum(CONDITION_IDS);
export type ConditionId = z.infer<typeof ConditionIdSchema>;

/** Default topics for a stomach-focused food check, independent of any diagnosis. */
export const STOMACH_CHECK_CONDITIONS = ['gerd', 'gastritis', 'peptic-ulcer'] as const satisfies readonly ConditionId[];

/** English display labels. Other languages are not part of this slice. */
export const CONDITION_LABELS: Readonly<Record<ConditionId, string>> = {
  gerd: 'Acid reflux (GERD)',
  gastritis: 'Gastritis',
  'peptic-ulcer': 'Stomach or duodenal ulcer',
  ibs: 'Irritable bowel syndrome (IBS)',
  'lactose-intolerance': 'Lactose intolerance',
  'celiac-gluten': 'Celiac disease or gluten sensitivity',
  gallbladder: 'Gallbladder problems',
  ibd: "Crohn's disease or ulcerative colitis",
};
