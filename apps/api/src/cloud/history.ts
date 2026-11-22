import { createHash } from 'node:crypto';
import { CloudScanSchema, type CloudScan, type ImportScanSchema, type PhotoState } from '@food-scanner/contracts';
import type { Pool, PoolClient } from 'pg';
import type { z } from 'zod';
import { inTransaction } from './database.ts';
import type { PrivateMedia } from './media.ts';

interface ScanRow {
  id: string;
  scanned_at: Date;
  verdict: unknown;
  photo_state: PhotoState;
  photo_digest: string | null;
  deleted_at: Date | null;
}

const assetId = (owner: string, id: string) => `food-scanner/${owner}/${id}`;
const digest = (jpeg: string) => createHash('sha256').update(jpeg, 'base64').digest('hex');
const scanOf = (row: ScanRow) => CloudScanSchema.parse({
  id: row.id, scannedAt: row.scanned_at.toISOString(), verdict: row.verdict, photoState: row.photo_state,
});

async function find(db: Pool | PoolClient, owner: string, id: string) {
  const { rows: [row] } = await db.query<ScanRow>('SELECT * FROM cloud_scans WHERE owner_id=$1 AND id=$2', [owner, id]);
  return row;
}

export function createCloudHistory(pool: Pool, media: PrivateMedia) {
  // Serializes writes for one account, including clear-all racing a pending photo upload.
  const forOwner = <T>(owner: string, run: (db: PoolClient) => Promise<T>) => inTransaction(pool, async db => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [owner]);
    return run(db);
  });

  async function add(db: PoolClient, owner: string, scan: CloudScan, jpeg: string | null) {
    await db.query(
      'INSERT INTO cloud_scans(owner_id,id,scanned_at,verdict,photo_state,photo_digest) VALUES($1,$2,$3,$4,$5,$6)',
      [owner, scan.id, scan.scannedAt, JSON.stringify(scan.verdict), scan.photoState, jpeg === null ? null : digest(jpeg)],
    );
  }

  async function completePhoto(owner: string, id: string, jpeg: string) {
    return forOwner(owner, async db => {
      const row = await find(db, owner, id);
      if (!row || row.deleted_at || row.photo_digest !== digest(jpeg)) return null;
      if (row.photo_state === 'ready') return scanOf(row);
      try {
        await media.upload(assetId(owner, id), jpeg);
      } catch {
        return scanOf(row);
      }
      await db.query("UPDATE cloud_scans SET photo_state='ready' WHERE owner_id=$1 AND id=$2", [owner, id]);
      return scanOf({ ...row, photo_state: 'ready' });
    });
  }

  async function get(owner: string, id: string) {
    const row = await find(pool, owner, id);
    return row && !row.deleted_at ? scanOf(row) : null;
  }

  return {
    async assess<T>(owner: string, id: string, jpeg: string | null, run: () => Promise<T>, toScan: (result: T) => CloudScan | null) {
      const saved = await forOwner(owner, async db => {
        const existing = await find(db, owner, id);
        if (existing) return existing.deleted_at ? { kind: 'missing' as const } : { kind: 'saved' as const, scan: scanOf(existing) };
        const outcome = await run();
        const scan = toScan(outcome);
        if (scan === null) return { kind: 'failed' as const, outcome };
        await add(db, owner, scan, jpeg);
        return { kind: 'saved' as const, scan };
      });
      if (saved.kind !== 'saved' || saved.scan.photoState !== 'pending' || jpeg === null) return saved;
      const scan = await completePhoto(owner, id, jpeg) ?? await get(owner, id);
      return scan ? { kind: 'saved' as const, scan } : { kind: 'missing' as const };
    },
    completePhoto,
    async importScan(owner: string, { installId, id, scannedAt, verdict, thumbnail }: z.infer<typeof ImportScanSchema>) {
      const scan = await forOwner(owner, async db => {
        await db.query('INSERT INTO legacy_history_claims(install_id,owner_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [installId, owner]);
        const claim = await db.query('SELECT 1 FROM legacy_history_claims WHERE install_id=$1 AND owner_id=$2', [installId, owner]);
        if (!claim.rowCount) return null;
        const existing = await find(db, owner, id);
        if (existing) return existing.deleted_at ? 'deleted' as const : scanOf(existing);
        const imported: CloudScan = { id, scannedAt, verdict, photoState: thumbnail ? 'pending' : 'none' };
        await add(db, owner, imported, thumbnail);
        return imported;
      });
      if (scan === 'deleted' || scan?.photoState !== 'pending' || !thumbnail) return scan;
      return await completePhoto(owner, id, thumbnail) ?? await get(owner, id) ?? 'deleted';
    },
    async list(owner: string) {
      const { rows } = await pool.query<ScanRow>(
        'SELECT * FROM cloud_scans WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY scanned_at DESC, id DESC', [owner],
      );
      return rows.map(scanOf);
    },
    get,
    async photo(owner: string, id: string) {
      const row = await find(pool, owner, id);
      if (!row || row.deleted_at || row.photo_state !== 'ready') return null;
      const photo = await media.read(assetId(owner, id));
      const current = await find(pool, owner, id);
      return current && !current.deleted_at ? photo : null;
    },
    async delete(owner: string, id: string | null) {
      await forOwner(owner, async db => {
        const { rows } = await db.query<{ id: string; photo_state: PhotoState }>(
          `WITH removed AS (
            SELECT id, photo_state FROM cloud_scans WHERE owner_id=$1 AND ($2::uuid IS NULL OR id=$2) AND deleted_at IS NULL
          )
          UPDATE cloud_scans s SET deleted_at=now(), verdict=NULL, photo_state='none', photo_digest=NULL FROM removed r
          WHERE s.owner_id=$1 AND s.id=r.id RETURNING r.id,r.photo_state`, [owner, id],
        );
        if (id === null) {
          if (rows.length > 0) await db.query(
            'INSERT INTO history_clear_log(owner_id,scan_count,ready_photo_count) VALUES($1,$2,$3)',
            [owner, rows.length, rows.filter(row => row.photo_state === 'ready').length],
          );
          return;
        }
        const photos = rows.filter(row => row.photo_state !== 'none').map(row => assetId(owner, row.id));
        if (photos.length > 0) await db.query(
          'INSERT INTO photo_deletion_queue(asset_id) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING', [photos],
        );
      });
    },
    async cleanOnePhoto() {
      await inTransaction(pool, async db => {
        const { rows: [row] } = await db.query<{ asset_id: string }>(
          'SELECT asset_id FROM photo_deletion_queue WHERE attempt_after<=now() ORDER BY attempt_after LIMIT 1 FOR UPDATE SKIP LOCKED',
        );
        if (!row) return;
        try {
          await media.remove(row.asset_id);
        } catch {
          await db.query("UPDATE photo_deletion_queue SET attempt_after=now()+interval '1 minute' WHERE asset_id=$1", [row.asset_id]);
          return;
        }
        await db.query('DELETE FROM photo_deletion_queue WHERE asset_id=$1', [row.asset_id]);
      });
    },
  };
}

export type CloudHistory = ReturnType<typeof createCloudHistory>;
