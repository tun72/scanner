import type { VerdictLevel, VerdictResponse } from '@food-scanner/contracts';

/** A verdict kept on the phone. */
export interface SavedScan {
  id: string;
  /** When the user scanned, by the phone's clock. */
  scannedAt: string;
  verdict: VerdictResponse;
  /** Base64 JPEG, at most 256 px; null for barcode scans. */
  thumbnail: string | null;
}

/** One row of the history list. */
export interface ScanSummary {
  id: string;
  scannedAt: string;
  level: VerdictLevel;
  foodName: string;
  thumbnail: string | null;
}

/** Where past scans are kept. Declared here so the rules do not depend on the database library. */
export interface ScanHistory {
  save(scan: SavedScan): Promise<void>;
  listNewestFirst(): Promise<ScanSummary[]>;
  get(id: string): Promise<SavedScan | null>;
  deleteById(id: string): Promise<void>;
  deleteAll(): Promise<void>;
}

export interface KeepVerdictDeps {
  history: Pick<ScanHistory, 'save'>;
  newId: () => string;
  now: () => Date;
}

/**
 * Step 5 of "Show and keep the verdict": saves a shown verdict to history.
 * Only verdicts reach here, never errors. A failed save returns false instead of throwing,
 * so the user still sees the verdict they waited for.
 */
export function createKeepVerdict({ history, newId, now }: KeepVerdictDeps) {
  return async (verdict: VerdictResponse, thumbnail: string | null): Promise<boolean> => {
    try {
      await history.save({ id: newId(), scannedAt: now().toISOString(), verdict, thumbnail });
      return true;
    } catch {
      return false;
    }
  };
}

export type KeepVerdict = ReturnType<typeof createKeepVerdict>;
