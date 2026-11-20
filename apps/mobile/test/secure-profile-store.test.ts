import { describe, expect, it } from 'vitest';
import { createSecureProfileStore } from '../src/profile/secure-profile-store.ts';
import type { StomachProfile } from '../src/profile/stomach-profile.ts';
import { ACCEPTED_AT, memoryStorage } from './helpers.ts';

const profile: StomachProfile = { conditions: ['gerd', 'ibs'], notes: 'spicy food hurts', noticeAcceptedAt: ACCEPTED_AT, updatedAt: '2026-11-16T10:00:00.000Z' };
const storedAs = (value: string) => createSecureProfileStore(memoryStorage({ 'stomach-profile': value }));

describe('profile storage on the phone', () => {
  it('has no profile before one is saved', async () => {
    expect(await createSecureProfileStore(memoryStorage()).load()).toBeNull();
  });

  it('reads back the profile it saved, as a new store would after a restart', async () => {
    const storage = memoryStorage();

    await createSecureProfileStore(storage).save(profile);

    expect(await createSecureProfileStore(storage).load()).toEqual(profile);
  });

  it.each([
    ['text that is not JSON', 'not json {'],
    ['JSON that is not a profile', '{"hello":"world"}'],
    ['a condition that is not on the list', JSON.stringify({ ...profile, conditions: ['headache'] })],
    ['a profile with no condition and no note', JSON.stringify({ ...profile, conditions: [], notes: undefined })],
    ['a profile with no notice acceptance', JSON.stringify({ ...profile, noticeAcceptedAt: undefined })],
  ])('treats %s as no profile', async (_name, stored) => {
    expect(await storedAs(stored).load()).toBeNull();
  });
});
