import type { ProfileStore } from './profile-store.ts';
import { buildProfile, type ProfileDraft, type ProfileResult } from './stomach-profile.ts';

export interface SaveProfileDeps {
  store: ProfileStore;
  /** The clock is passed in so the saved time can be tested. */
  now: () => Date;
}

export type SaveProfile = (draft: ProfileDraft) => Promise<ProfileResult>;

/** Builds the "save my stomach profile" use case: check the draft, and store it only when it passes. */
export function createSaveProfile({ store, now }: SaveProfileDeps): SaveProfile {
  return async (draft) => {
    const result = buildProfile(draft, now());
    if (result.ok) await store.save(result.profile);
    return result;
  };
}
