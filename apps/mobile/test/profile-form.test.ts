import { describe, expect, it } from 'vitest';
import { PROBLEM_MESSAGES, changeNotes, showProblem, startForm } from '../src/profile/profile-form.ts';
import { ACCEPTED_AT } from './helpers.ts';

describe('profile form', () => {
  it('starts with an empty optional note, carrying the notice they just accepted', () => {
    expect(startForm(null, ACCEPTED_AT)).toEqual({ conditions: ['gerd', 'gastritis', 'peptic-ulcer'], notes: '', noticeAcceptedAt: ACCEPTED_AT, problem: null });
  });

  it('starts without an acceptance when the notice was skipped', () => {
    expect(startForm(null, null).noticeAcceptedAt).toBeNull();
  });

  it('starts from the saved profile when editing, keeping its acceptance time', () => {
    const saved = { conditions: ['ibs' as const], notes: 'milk upsets me', noticeAcceptedAt: ACCEPTED_AT, updatedAt: '2026-11-16T10:00:00.000Z' };

    expect(startForm(saved, null)).toEqual({ conditions: ['gerd', 'gastritis', 'peptic-ulcer'], notes: 'milk upsets me', noticeAcceptedAt: ACCEPTED_AT, problem: null });
  });

  it('clears the last problem as soon as the user changes something', () => {
    const withProblem = showProblem(startForm(null, ACCEPTED_AT), 'nothing-chosen');

    expect(withProblem.problem).toBe('nothing-chosen');
    expect(changeNotes(withProblem, 'spicy').problem).toBeNull();
  });

  it('has a message the user can act on for every problem', () => {
    expect(PROBLEM_MESSAGES['nothing-chosen']).toMatch(/ပြန်ကြိုးစားပါ/);
    expect(PROBLEM_MESSAGES['notice-not-accepted']).toMatch(/အသိပေးချက်/);
    expect(PROBLEM_MESSAGES['notes-too-long']).toMatch(/၃၀၀/);
  });
});
