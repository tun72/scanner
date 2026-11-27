import type { PoolClient } from 'pg';

export async function migrateAdminDatabase(db: PoolClient) {
  await db.query(`
    ALTER TABLE mobile_accounts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
      CHECK (status IN ('pending', 'active', 'suspended'));
    ALTER TABLE mobile_accounts ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

    CREATE TABLE IF NOT EXISTS mobile_credential_grants (
      account_id uuid PRIMARY KEY REFERENCES mobile_accounts(id),
      digest text UNIQUE NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      digest text PRIMARY KEY,
      nonce text NOT NULL,
      verifier text NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      digest text PRIMARY KEY,
      issuer text NOT NULL,
      subject text NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS admin_audit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor text NOT NULL,
      action text NOT NULL,
      target_id uuid NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS admin_audit_target ON admin_audit(target_id,id DESC);

    ALTER TABLE web_push_subscriptions ADD COLUMN IF NOT EXISTS subscription_id uuid NOT NULL DEFAULT gen_random_uuid();
    CREATE UNIQUE INDEX IF NOT EXISTS web_push_subscription_id ON web_push_subscriptions(subscription_id);

    CREATE TABLE IF NOT EXISTS broadcasts (
      id uuid PRIMARY KEY,
      title text NOT NULL,
      body text NOT NULL,
      state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'queued', 'cancelled')),
      scheduled_for timestamptz,
      version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (state <> 'queued' OR scheduled_for IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS broadcasts_due ON broadcasts(scheduled_for,id) WHERE state='queued';
    CREATE TABLE IF NOT EXISTS broadcast_schedule_receipts (
      broadcast_id uuid NOT NULL REFERENCES broadcasts(id),
      requested_version integer NOT NULL,
      request jsonb NOT NULL,
      result jsonb NOT NULL,
      PRIMARY KEY (broadcast_id,requested_version)
    );
    CREATE TABLE IF NOT EXISTS broadcast_publications (
      broadcast_id uuid PRIMARY KEY REFERENCES broadcasts(id),
      title text NOT NULL,
      body text NOT NULL,
      published_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS broadcast_publications_newest ON broadcast_publications(published_at DESC,broadcast_id DESC);
    CREATE TABLE IF NOT EXISTS broadcast_deliveries (
      broadcast_id uuid NOT NULL REFERENCES broadcast_publications(broadcast_id),
      subscription_id uuid NOT NULL,
      owner_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sending','accepted','skipped','expired','failed')),
      attempts integer NOT NULL DEFAULT 0,
      attempt_after timestamptz NOT NULL,
      lease_id uuid,
      lease_until timestamptz,
      PRIMARY KEY (broadcast_id,subscription_id)
    );
    CREATE INDEX IF NOT EXISTS broadcast_deliveries_due ON broadcast_deliveries(attempt_after,lease_until)
      WHERE status IN ('pending','sending');
    CREATE TABLE IF NOT EXISTS broadcast_worker_heartbeat (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      seen_at timestamptz NOT NULL
    );
  `);
}
