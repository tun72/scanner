import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AccountSession } from '@food-scanner/contracts';
import { digestToken, hashPassword, matchesPassword, randomToken, tokenPattern } from './credentials.ts';
import { inTransaction } from './database.ts';

const SESSION_MS = 30 * 24 * 60 * 60_000;
export type AccountStatus = 'pending' | 'active' | 'suspended';

export async function seedMobileAccount(pool: Pool, { name, rollNumber, password }: { name: string; rollNumber: string; password: string }) {
  await pool.query(
    'INSERT INTO mobile_accounts(id,name,roll_number,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(roll_number) DO NOTHING',
    [randomUUID(), name, rollNumber, await hashPassword(password)],
  );
}

export async function revokeAccountSessions(db: PoolClient, accountId: string) {
  await db.query('DELETE FROM mobile_sessions WHERE account_id=$1', [accountId]);
}

export function createAccounts(pool: Pool) {
  return {
    async login(rollNumber: string, password: string): Promise<AccountSession | null> {
      const { rows: [account] } = await pool.query<{ id: string; password_hash: string; status: AccountStatus; version: number }>(
        'SELECT id,password_hash,status,version FROM mobile_accounts WHERE roll_number=$1', [rollNumber],
      );
      const valid = await matchesPassword(password, account?.password_hash);
      if (!valid || account?.status !== 'active') return null;

      return inTransaction(pool, async db => {
        // A password reset or suspend can commit while the expensive password check is running.
        const { rows: [current] } = await db.query<{ id: string; name: string; roll_number: string }>(`
          SELECT id,name,roll_number FROM mobile_accounts
          WHERE id=$1 AND status='active' AND password_hash=$2 AND roll_number=$3 AND version=$4 FOR UPDATE
        `, [account.id, account.password_hash, rollNumber, account.version]);
        if (!current) return null;
        const token = randomToken();
        const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
        await db.query('INSERT INTO mobile_sessions(digest,account_id,expires_at) VALUES($1,$2,$3)', [digestToken(token), current.id, expiresAt]);
        return { user: { id: current.id, name: current.name, rollNumber: current.roll_number }, token, expiresAt };
      });
    },
    async authenticate(token: string | undefined): Promise<string | null> {
      if (!token || !tokenPattern.test(token)) return null;
      const { rows: [row] } = await pool.query<{ account_id: string }>(`
        SELECT s.account_id FROM mobile_sessions s JOIN mobile_accounts a ON a.id=s.account_id
        WHERE s.digest=$1 AND s.expires_at>now() AND a.status='active'
      `, [digestToken(token)]);
      return row?.account_id ?? null;
    },
    async revoke(token: string) {
      await pool.query('DELETE FROM mobile_sessions WHERE digest=$1', [digestToken(token)]);
    },
  };
}
