import type { ScanRequest, VerdictResponse } from '@food-scanner/contracts';
import type { SavedScan, ScanHistory } from '../src/history/scan-history.ts';
import type { ProfileStore } from '../src/profile/profile-store.ts';
import type { KeyValueStorage } from '../src/profile/secure-profile-store.ts';
import type { ProfileDraft, StomachProfile } from '../src/profile/stomach-profile.ts';
import type { AssessmentClient } from '../src/scan/assessment-client.ts';
import type { ImageEditor } from '../src/scan/image-editor.ts';
import type { ResizeTarget } from '../src/scan/photo-size.ts';
import type { ScanResult } from '../src/scan/scan-outcome.ts';

// Shared by the Vitest tests and the jest-expo screen tests, so it imports types only.

export const ACCEPTED_AT = '2026-11-16T09:00:00.000Z';
export const NOW = new Date('2026-11-16T10:00:00.000Z');
export const INSTALL_ID = '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f';

/** Start with the JPEG marker FF D8 FF, like the real resized photo and thumbnail. */
export const SCAN_PHOTO_BASE64 = '/9j/4HNjYW4gcGhvdG8=';
export const THUMBNAIL_BASE64 = '/9j/4HRodW1ibmFpbA==';

export const NOTICE = "Food Scanner is a guide, not medical advice. If you're unsure, ask your doctor or dietitian.";

export function draft(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  return { conditions: ['gerd'], notes: '', noticeAcceptedAt: ACCEPTED_AT, ...overrides };
}

export function savedProfile(overrides: Partial<StomachProfile> = {}): StomachProfile {
  return { conditions: ['gastritis'], noticeAcceptedAt: ACCEPTED_AT, updatedAt: ACCEPTED_AT, ...overrides };
}

/** An Avoid verdict for Spicy noodle soup with an Acid reflux reason (the TC16 example). */
export function verdict(overrides: Partial<VerdictResponse> = {}): VerdictResponse {
  return {
    level: 'avoid',
    foodName: 'Spicy noodle soup',
    source: 'photo',
    reasons: [{ condition: 'Acid reflux (GERD)', severity: 'avoid', explanation: 'Chilli and a hot, acidic broth often bring on reflux.' }],
    flaggedIngredients: ['chilli'],
    tip: 'Ask for a mild broth without chilli.',
    notice: NOTICE,
    assessedAt: '2026-11-16T10:00:05.000Z',
    ...overrides,
  };
}

/** A profile store that keeps the profile in memory and counts saves. */
export function memoryProfileStore(initial: StomachProfile | null = null): ProfileStore & { saved: StomachProfile | null; saves: number } {
  const store = {
    saved: initial,
    saves: 0,
    async load() {
      return store.saved;
    },
    async save(profile: StomachProfile) {
      store.saved = profile;
      store.saves += 1;
    },
  };
  return store;
}

/** Stands in for the phone's encrypted storage. */
export function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { items: Map<string, string> } {
  const items = new Map(Object.entries(initial));
  return {
    items,
    async getItemAsync(key) {
      return items.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      items.set(key, value);
    },
  };
}

/** Records every resize it is asked for and answers with the photo or thumbnail by quality. */
export function recordingEditor(): ImageEditor & { calls: { uri: string; resize: ResizeTarget; quality: number }[] } {
  const calls: { uri: string; resize: ResizeTarget; quality: number }[] = [];
  return {
    calls,
    async toJpeg(uri, resize, quality) {
      calls.push({ uri, resize, quality });
      return { base64: quality === 0.7 ? SCAN_PHOTO_BASE64 : THUMBNAIL_BASE64, width: 1, height: 1 };
    },
  };
}

/** Records every request and answers from a queue; an empty queue means the API cannot be reached. */
export function queuedClient(replies: ScanResult[] = []): AssessmentClient & { sent: ScanRequest[]; replies: ScanResult[] } {
  const client = {
    sent: [] as ScanRequest[],
    replies,
    async assess(request: ScanRequest): Promise<ScanResult> {
      client.sent.push(request);
      return client.replies.shift() ?? { kind: 'failed', failure: { reason: 'unreachable' } };
    },
  };
  return client;
}

/** Scan history in memory. */
export function memoryHistory(): ScanHistory & { saved: SavedScan[] } {
  const saved: SavedScan[] = [];
  return {
    saved,
    async save(scan) {
      saved.push(scan);
    },
    async listNewestFirst() {
      return [...saved]
        .reverse()
        .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
        .map(({ id, scannedAt, verdict: { level, foodName }, thumbnail }) => ({ id, scannedAt, level, foodName, thumbnail }));
    },
    async get(id) {
      return saved.find((scan) => scan.id === id) ?? null;
    },
    async deleteById(id) {
      const index = saved.findIndex((scan) => scan.id === id);
      if (index >= 0) saved.splice(index, 1);
    },
    async deleteAll() {
      saved.length = 0;
    },
  };
}
