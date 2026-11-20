import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { createKeepVerdict } from './history/scan-history.ts';
import { createSqliteScanHistory } from './history/sqlite-scan-history.ts';
import { getOrCreateInstallId } from './install/install-id.ts';
import { createSaveProfile } from './profile/save-profile.ts';
import { createSecureProfileStore } from './profile/secure-profile-store.ts';
import { createFetchAssessmentClient } from './scan/assessment-client.ts';
import { expoImageEditor } from './scan/expo-image-editor.ts';
import { createScanFood } from './scan/scan-food.ts';

// The one place the real phone storage, camera-side image tools, network and random source are wired in.
// Screens import from here.

const now = () => new Date();

export const profileStore = createSecureProfileStore(SecureStore);
export const saveProfile = createSaveProfile({ store: profileStore, now });
export const loadInstallId = (): Promise<string> => getOrCreateInstallId({ storage: SecureStore, randomUUID: Crypto.randomUUID });

/** The API address is public configuration, not a secret: it ships inside the app. */
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
if (__DEV__ && (apiUrl ?? '') === '') {
  console.warn('EXPO_PUBLIC_API_URL is not set, so scans cannot reach the Food Scanner API. See apps/mobile/.env.example.');
}

export const scanFood = createScanFood({
  editor: expoImageEditor,
  client: createFetchAssessmentClient({ baseUrl: apiUrl, fetch: (url, init) => fetch(url, init) }),
});

export const scanHistory = createSqliteScanHistory(() => SQLite.openDatabaseAsync('food-scanner.db'));
export const keepVerdict = createKeepVerdict({ history: scanHistory, newId: Crypto.randomUUID, now });
