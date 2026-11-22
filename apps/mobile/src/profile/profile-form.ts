import { MAX_NOTES_LENGTH, STOMACH_CHECK_CONDITIONS } from '@food-scanner/contracts';
import type { ProfileDraft, ProfileProblem, StomachProfile } from './stomach-profile.ts';

/** What the profile screen shows: the draft so far, and the problem from the last save, if any. */
export interface ProfileFormState extends ProfileDraft {
  problem: ProfileProblem | null;
}

export const PROBLEM_MESSAGES: Readonly<Record<ProfileProblem, string>> = {
  'notice-not-accepted': 'အသိပေးချက်ကို ဖတ်ပြီး အတည်ပြုပါ။',
  'nothing-chosen': 'အချက်အလက် သိမ်း၍ မရပါ။ ပြန်ကြိုးစားပါ။',
  'notes-too-long': `မှတ်စုတွင် စာလုံးရေ ${MAX_NOTES_LENGTH.toLocaleString('my-MM')} အထိ ရေးနိုင်သည်။`,
};

/** Keeps the saved note and notice acceptance while using the default stomach check. */
export function startForm(saved: StomachProfile | null, noticeAcceptedAt: string | null): ProfileFormState {
  return {
    conditions: STOMACH_CHECK_CONDITIONS,
    notes: saved?.notes ?? '',
    noticeAcceptedAt: saved?.noticeAcceptedAt ?? noticeAcceptedAt,
    problem: null,
  };
}

export const changeNotes = (form: ProfileFormState, notes: string): ProfileFormState => ({ ...form, notes, problem: null });

export const showProblem = (form: ProfileFormState, problem: ProfileProblem): ProfileFormState => ({ ...form, problem });
