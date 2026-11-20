import { MAX_NOTES_LENGTH } from '@food-scanner/contracts';
import { describe, expect, it } from 'vitest';
import { createSaveProfile } from '../src/profile/save-profile.ts';
import { ACCEPTED_AT, NOW, draft, memoryProfileStore } from './helpers.ts';

const saveWith = (store: ReturnType<typeof memoryProfileStore>) => createSaveProfile({ store, now: () => NOW });

describe('saving the stomach profile', () => {
  it('TC1 a profile with a condition and the accepted notice is saved', async () => {
    const store = memoryProfileStore();

    const result = await saveWith(store)(draft({ conditions: ['gerd'] }));

    expect(result.ok).toBe(true);
    expect(store.saved).toEqual({ conditions: ['gerd'], noticeAcceptedAt: ACCEPTED_AT, updatedAt: '2026-11-16T10:00:00.000Z' });
  });

  it.each([
    ['an empty note', ''],
    ['a note of only spaces', '   \n '],
  ])('TC2 a profile with no condition and %s is refused and nothing is stored', async (_name, notes) => {
    const store = memoryProfileStore();

    const result = await saveWith(store)(draft({ conditions: [], notes }));

    expect(result).toEqual({ ok: false, problem: 'nothing-chosen' });
    expect(store.saves).toBe(0);
  });

  it('TC3 saving without accepting the notice is refused and nothing is stored', async () => {
    const store = memoryProfileStore();

    const result = await saveWith(store)(draft({ conditions: ['gerd'], noticeAcceptedAt: null }));

    expect(result).toEqual({ ok: false, problem: 'notice-not-accepted' });
    expect(store.saves).toBe(0);
  });

  it('saves a profile that has only a note, trimmed', async () => {
    const store = memoryProfileStore();

    await saveWith(store)(draft({ conditions: [], notes: '  spicy food hurts  ' }));

    expect(store.saved).toMatchObject({ conditions: [], notes: 'spicy food hurts' });
  });

  it('accepts notes at the limit and refuses notes over it', async () => {
    const store = memoryProfileStore();

    expect((await saveWith(store)(draft({ notes: 'x'.repeat(MAX_NOTES_LENGTH) }))).ok).toBe(true);
    expect(await saveWith(store)(draft({ notes: 'x'.repeat(MAX_NOTES_LENGTH + 1) }))).toEqual({ ok: false, problem: 'notes-too-long' });
    expect(store.saves).toBe(1);
  });

  it('stores each picked condition once, in the order of the list', async () => {
    const store = memoryProfileStore();

    await saveWith(store)(draft({ conditions: ['ibs', 'gerd', 'ibs'] }));

    expect(store.saved?.conditions).toEqual(['gerd', 'ibs']);
  });

  it('keeps the time the notice was accepted when a saved profile is edited', async () => {
    const store = memoryProfileStore({ conditions: ['gerd'], noticeAcceptedAt: ACCEPTED_AT, updatedAt: '2026-11-16T09:05:00.000Z' });

    await saveWith(store)(draft({ conditions: ['gerd', 'gastritis'] }));

    expect(store.saved).toEqual({ conditions: ['gerd', 'gastritis'], noticeAcceptedAt: ACCEPTED_AT, updatedAt: '2026-11-16T10:00:00.000Z' });
  });
});
