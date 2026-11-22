import { CloudScanSchema } from '@food-scanner/contracts';
import * as Crypto from 'expo-crypto';
import { deleteCloudScans, getCloudHistory, getCloudScan, rememberCloudScan } from './account/history.ts';
import { accountRequest, activeSession, apiBase, invalidateSession } from './account/session.ts';
import { createKeepVerdict, type ScanHistory } from './history/scan-history.ts';
import { localHistory } from './history/local-history';
import { getOrCreateInstallId } from './install/install-id.ts';
import * as deviceStorage from './profile/device-storage';
import { createSaveProfile } from './profile/save-profile.ts';
import { createSecureProfileStore } from './profile/secure-profile-store.ts';
import { createFetchAssessmentClient } from './scan/assessment-client.ts';
import { expoImageEditor } from './scan/expo-image-editor';
import { createScanFood } from './scan/scan-food.ts';

const now = () => new Date();
export const legacyProfileStore = createSecureProfileStore(deviceStorage);
function profileForCurrentAccount() {
  const owner = activeSession()?.user.id;
  if (!owner) return null;
  return createSecureProfileStore({
    getItemAsync: key => deviceStorage.getItemAsync(`${key}-${owner}`),
    setItemAsync: (key, value) => deviceStorage.setItemAsync(`${key}-${owner}`, value),
  });
}
export const profileStore = {
  load: () => profileForCurrentAccount()?.load() ?? Promise.resolve(null),
  async save(profile: Parameters<typeof legacyProfileStore.save>[0]) {
    const store = profileForCurrentAccount();
    if (!store) throw new Error('Sign in to save your profile.');
    await store.save(profile);
  },
};
export const saveProfile = createSaveProfile({ store: profileStore, now });
export const loadInstallId = (): Promise<string> => getOrCreateInstallId({ storage: deviceStorage, randomUUID: Crypto.randomUUID });

export const scanFood = createScanFood({
  editor: expoImageEditor,
  client: createFetchAssessmentClient({
    baseUrl: apiBase, fetch: (url, init) => fetch(url, init), newId: Crypto.randomUUID, timeoutMs: 55_000,
    authorize: () => {
      const session = activeSession();
      return session ? { token: session.token, expired: () => { void invalidateSession(session).catch(() => undefined); } } : undefined;
    },
  }),
});

export const scanHistory: ScanHistory = {
  save: (scan) => localHistory.save(scan),
  async listNewestFirst() {
    if (!activeSession()) return [];
    return (await getCloudHistory()).map(scan => ({
      id: scan.id, scannedAt: scan.scannedAt, level: scan.verdict.level, foodName: scan.verdict.foodName,
      thumbnail: null, photoState: scan.photoState,
    }));
  },
  async get(id) {
    if (!activeSession()) return null;
    const scan = await getCloudScan(id);
    return scan ? { ...scan, thumbnail: null } : null;
  },
  deleteById: deleteCloudScans,
  deleteAll: () => deleteCloudScans(),
};
export const keepVerdict = createKeepVerdict({ history: localHistory, newId: Crypto.randomUUID, now });

const IMPORT_KEY = 'legacy-history-imported';
export async function hasLocalScans() {
  if (await deviceStorage.getItemAsync(IMPORT_KEY)) return false;
  return (await localHistory.listNewestFirst()).length > 0;
}

export async function importLocalScans() {
  const session = activeSession();
  if (!session || await deviceStorage.getItemAsync(IMPORT_KEY)) return;
  const installId = await loadInstallId();
  for (const summary of await localHistory.listNewestFirst()) {
    if (activeSession()?.token !== session.token) throw new Error('Sign in to import saved scans.');
    const existing = await localHistory.get(summary.id);
    if (!existing) continue;
    const result = await accountRequest('/v1/history/import', {
      method: 'POST', body: JSON.stringify({ ...existing, id: summary.id, installId }),
    }, session);
    if (result.status !== 204) await rememberCloudScan(session, CloudScanSchema.parse(await result.json()), existing.thumbnail);
  }
  await deviceStorage.setItemAsync(IMPORT_KEY, session.user.id);
}
