import { VerdictLevelSchema, VerdictResponseSchema } from '@food-scanner/contracts';
import type { ScanHistory, ScanSummary } from './scan-history.ts';

export type SqlValue = string | number | null;

/** The part of expo-sqlite's database the history uses. Tests run the same SQL on Node's built-in SQLite. */
export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
}

/** Each entry moves the database up one version, kept in PRAGMA user_version. Never edit a shipped entry; add one. */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE scans (
     id TEXT PRIMARY KEY,
     scanned_at TEXT NOT NULL,
     level TEXT NOT NULL,
     food_name TEXT NOT NULL,
     verdict_json TEXT NOT NULL,
     thumbnail_base64 TEXT
   );
   CREATE INDEX scans_newest_first ON scans (scanned_at DESC);`,
];

async function migrate(db: SqlDatabase): Promise<SqlDatabase> {
  const [row] = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version', []);
  for (let version = row?.user_version ?? 0; version < MIGRATIONS.length; version += 1) {
    try {
      await db.execAsync(`BEGIN; ${MIGRATIONS[version]} PRAGMA user_version = ${version + 1}; COMMIT;`);
    } catch (error) {
      await db.execAsync('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
  return db;
}

interface SummaryRow {
  id: string;
  scanned_at: string;
  level: string;
  food_name: string;
  thumbnail_base64: string | null;
}

/** Scan history in SQLite on the phone. The database is opened and brought up to date on first use. */
export function createSqliteScanHistory(open: () => Promise<SqlDatabase>): ScanHistory {
  let ready: Promise<SqlDatabase> | undefined;
  const database = (): Promise<SqlDatabase> => {
    ready ??= open()
      .then(migrate)
      .catch((error: unknown) => {
        ready = undefined; // let the next call try again
        throw error;
      });
    return ready;
  };

  return {
    async save({ id, scannedAt, verdict, thumbnail }) {
      const db = await database();
      await db.runAsync(
        'INSERT INTO scans (id, scanned_at, level, food_name, verdict_json, thumbnail_base64) VALUES (?, ?, ?, ?, ?, ?)',
        [id, scannedAt, verdict.level, verdict.foodName, JSON.stringify(verdict), thumbnail],
      );
    },

    async listNewestFirst() {
      const db = await database();
      const rows = await db.getAllAsync<SummaryRow>(
        'SELECT id, scanned_at, level, food_name, thumbnail_base64 FROM scans ORDER BY scanned_at DESC, rowid DESC',
        [],
      );
      return rows.flatMap((row): ScanSummary[] => {
        const level = VerdictLevelSchema.safeParse(row.level);
        // A row this version of the app cannot read is left out rather than shown wrongly.
        if (!level.success) return [];
        return [{ id: row.id, scannedAt: row.scanned_at, level: level.data, foodName: row.food_name, thumbnail: row.thumbnail_base64 }];
      });
    },

    async get(id) {
      const db = await database();
      const [row] = await db.getAllAsync<Pick<SummaryRow, 'scanned_at' | 'thumbnail_base64'> & { verdict_json: string }>(
        'SELECT scanned_at, verdict_json, thumbnail_base64 FROM scans WHERE id = ?',
        [id],
      );
      if (!row) return null;

      let storedVerdict: unknown;
      try {
        storedVerdict = JSON.parse(row.verdict_json);
      } catch {
        return null;
      }
      const verdict = VerdictResponseSchema.safeParse(storedVerdict);
      if (!verdict.success) return null;
      return { id, scannedAt: row.scanned_at, verdict: verdict.data, thumbnail: row.thumbnail_base64 };
    },

    async deleteById(id) {
      const db = await database();
      await db.runAsync('DELETE FROM scans WHERE id = ?', [id]);
    },

    async deleteAll() {
      const db = await database();
      await db.runAsync('DELETE FROM scans', []);
    },
  };
}
