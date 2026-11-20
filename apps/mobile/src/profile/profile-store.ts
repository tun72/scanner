import type { StomachProfile } from './stomach-profile.ts';

/** Where the profile is kept. Declared here so the rules do not depend on any storage library. */
export interface ProfileStore {
  /** The saved profile, or null when none is saved yet. */
  load(): Promise<StomachProfile | null>;
  save(profile: StomachProfile): Promise<void>;
}
