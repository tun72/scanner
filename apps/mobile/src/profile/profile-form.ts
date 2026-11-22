import { MAX_NOTES_LENGTH, type ConditionId } from '@food-scanner/contracts';
import type { ProfileDraft, ProfileProblem, StomachProfile } from './stomach-profile.ts';

/** What the profile screen shows: the draft so far, and the problem from the last save, if any. */
export interface ProfileFormState extends ProfileDraft {
  conditions: ConditionId[];
  problem: ProfileProblem | null;
}

export const PROBLEM_MESSAGES: Readonly<Record<ProfileProblem, string>> = {
  'notice-not-accepted': 'အသိပေးချက်ကို ဖတ်ပြီး အတည်ပြုပါ။',
  'nothing-chosen': 'အခြေအနေတစ်ခု ရွေးပါ သို့မဟုတ် မှတ်စုရေးပါ။',
  'notes-too-long': `မှတ်စုတွင် စာလုံးရေ ${MAX_NOTES_LENGTH.toLocaleString('my-MM')} အထိ ရေးနိုင်သည်။`,
};

/** Starts the form from the saved profile when editing, or empty with the just-accepted notice when new. */
export function startForm(saved: StomachProfile | null, noticeAcceptedAt: string | null): ProfileFormState {
  return {
    conditions: saved?.conditions ?? [],
    notes: saved?.notes ?? '',
    noticeAcceptedAt: saved?.noticeAcceptedAt ?? noticeAcceptedAt,
    problem: null,
  };
}

export function toggleCondition(form: ProfileFormState, condition: ConditionId): ProfileFormState {
  const conditions = form.conditions.includes(condition) ? form.conditions.filter((id) => id !== condition) : [...form.conditions, condition];
  return { ...form, conditions, problem: null };
}

export const changeNotes = (form: ProfileFormState, notes: string): ProfileFormState => ({ ...form, notes, problem: null });

export const showProblem = (form: ProfileFormState, problem: ProfileProblem): ProfileFormState => ({ ...form, problem });
