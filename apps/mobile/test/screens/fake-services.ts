import type { ScanRequest } from '@food-scanner/contracts';
import { createKeepVerdict } from '../../src/history/scan-history.ts';
import { createSaveProfile } from '../../src/profile/save-profile.ts';
import type { StomachProfile } from '../../src/profile/stomach-profile.ts';
import { createScanFood } from '../../src/scan/scan-food.ts';
import type { ScanResult } from '../../src/scan/scan-outcome.ts';
import type * as RealServices from '../../src/services.ts';
import { INSTALL_ID, NOW, memoryHistory, queuedClient, recordingEditor } from '../helpers.ts';

/**
 * What the screens get instead of the phone's storage, image tools and network.
 * The real use cases run; only their edges are fakes. Tests set and read `fake`.
 */
export const fake = {
  profile: null as StomachProfile | null,
  client: queuedClient(),
  history: memoryHistory(),
};

export function resetFake(profile: StomachProfile | null, replies: ScanResult[] = []): void {
  fake.profile = profile;
  fake.client.sent.length = 0;
  fake.client.replies.splice(0, fake.client.replies.length, ...replies);
  fake.history.saved.length = 0;
}

export const sent = (): ScanRequest[] => fake.client.sent;

const profileStore = {
  load: async () => fake.profile,
  save: async (profile: StomachProfile) => {
    fake.profile = profile;
  },
};

let ids = 0;

export const services: typeof RealServices = {
  profileStore,
  saveProfile: createSaveProfile({ store: profileStore, now: () => NOW }),
  loadInstallId: async () => INSTALL_ID,
  scanFood: createScanFood({ editor: recordingEditor(), client: fake.client }),
  scanHistory: fake.history,
  keepVerdict: createKeepVerdict({ history: fake.history, newId: () => `scan-${(ids += 1)}`, now: () => NOW }),
};
