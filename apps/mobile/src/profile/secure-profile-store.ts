import type { ProfileStore } from './profile-store.ts';
import { StomachProfileSchema } from './stomach-profile.ts';

/** The two calls of expo-secure-store this adapter uses. Passed in so tests need no phone. */
export interface KeyValueStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

const PROFILE_KEY = 'stomach-profile';

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Keeps the profile in the phone's encrypted key-value storage (Keychain on iOS, Keystore on Android).
 *
 * Stored data that cannot be read as a profile is treated as "no profile": the user sets it up
 * again instead of the app failing on every launch.
 */
export function createSecureProfileStore(storage: KeyValueStorage): ProfileStore {
  return {
    async load() {
      const stored = await storage.getItemAsync(PROFILE_KEY);
      if (stored === null) return null;
      const profile = StomachProfileSchema.safeParse(parseJson(stored));
      return profile.success ? profile.data : null;
    },
    async save(profile) {
      await storage.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
    },
  };
}
