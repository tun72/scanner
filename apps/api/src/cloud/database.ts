import { Pool, type PoolClient } from 'pg';

export function createCloudDatabase(url: string) {
  return new Pool({ connectionString: url, enableChannelBinding: true, max: 8, connectionTimeoutMillis: 5000, query_timeout: 50_000 });
}

export async function inTransaction<T>(pool: Pool, run: (db: PoolClient) => Promise<T>) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const value = await run(db);
    await db.query('COMMIT');
    return value;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}

export async function migrateCloudDatabase(pool: Pool) {
  await inTransaction(pool, async db => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('food-scanner:cloud:migration'))");
    await db.query(`
      CREATE TABLE IF NOT EXISTS mobile_accounts (
        id uuid PRIMARY KEY, name text NOT NULL, roll_number text UNIQUE NOT NULL, password_hash text NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mobile_sessions (
        digest text PRIMARY KEY, account_id uuid NOT NULL REFERENCES mobile_accounts(id),
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS mobile_sessions_expiry ON mobile_sessions(expires_at);
      CREATE TABLE IF NOT EXISTS cloud_scans (
        owner_id uuid NOT NULL REFERENCES mobile_accounts(id), id uuid NOT NULL,
        scanned_at timestamptz NOT NULL, verdict jsonb, photo_state text NOT NULL DEFAULT 'none'
          CHECK (photo_state IN ('none', 'pending', 'ready')),
        photo_digest text, deleted_at timestamptz,
        PRIMARY KEY (owner_id, id)
      );
      CREATE INDEX IF NOT EXISTS cloud_scans_history ON cloud_scans(owner_id, scanned_at DESC, id DESC)
        WHERE deleted_at IS NULL AND verdict IS NOT NULL;
      CREATE TABLE IF NOT EXISTS legacy_history_claims (
        install_id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES mobile_accounts(id)
      );
      CREATE TABLE IF NOT EXISTS photo_deletion_queue (
        asset_id text PRIMARY KEY, attempt_after timestamptz NOT NULL DEFAULT now()
      );
    `);
  });
}
