import { CONDITION_IDS, ConditionIdSchema, MAX_NOTES_LENGTH, type ConditionId } from '@food-scanner/contracts';
import { z } from 'zod';

/** The user's stomach profile as kept on the phone. */
export interface StomachProfile {
  conditions: ConditionId[];
  notes?: string;
  /** When the user accepted the not-medical-advice notice. Set once and kept on later edits. */
  noticeAcceptedAt: string;
  updatedAt: string;
}

/** What the user has entered so far, before it is checked. */
export interface ProfileDraft {
  conditions: readonly ConditionId[];
  notes: string;
  noticeAcceptedAt: string | null;
}

export type ProfileProblem = 'notice-not-accepted' | 'nothing-chosen' | 'notes-too-long';
export type ProfileResult = { ok: true; profile: StomachProfile } | { ok: false; problem: ProfileProblem };

/** Picked conditions in the order the list shows them, each once. */
const inListOrder = (picked: readonly ConditionId[]): ConditionId[] => CONDITION_IDS.filter((id) => picked.includes(id));

/**
 * Checks a draft against the profile rules and builds the profile to save.
 *
 * - The notice must be accepted: the app is a guide, and the user has to know that before relying on it.
 * - A profile needs at least one condition or a note, or there is nothing to judge a food against.
 */
export function buildProfile(draft: ProfileDraft, now: Date): ProfileResult {
  if (draft.noticeAcceptedAt === null) return { ok: false, problem: 'notice-not-accepted' };
  const notes = draft.notes.trim();
  if (notes.length > MAX_NOTES_LENGTH) return { ok: false, problem: 'notes-too-long' };
  const conditions = inListOrder(draft.conditions);
  if (conditions.length === 0 && notes.length === 0) return { ok: false, problem: 'nothing-chosen' };
  return {
    ok: true,
    profile: { conditions, ...(notes.length > 0 ? { notes } : {}), noticeAcceptedAt: draft.noticeAcceptedAt, updatedAt: now.toISOString() },
  };
}

/** The same rules, for reading a profile back from storage: anything that breaks them is not a profile. */
export const StomachProfileSchema: z.ZodType<StomachProfile> = z
  .object({
    conditions: z.array(ConditionIdSchema),
    notes: z.string().min(1).max(MAX_NOTES_LENGTH).optional(),
    noticeAcceptedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .refine((profile) => profile.conditions.length > 0 || profile.notes !== undefined)
  .transform(({ notes, ...rest }) => ({ ...rest, ...(notes === undefined ? {} : { notes }) }));
