import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { invalidatePendingPushTargets } from '../cloud/push-subscriptions.ts';
import { inTransaction } from '../cloud/database.ts';
import { revokeAccountSessions, type AccountStatus } from '../cloud/accounts.ts';
import { digestToken, hashPassword, randomToken } from '../cloud/credentials.ts';
import { recordAdminAction } from './audit.ts';

type User = { id: string; name: string; rollNumber: string; status: AccountStatus; version: number };
type UserInput = Pick<User, 'name' | 'rollNumber'>;
const fields = 'id,name,roll_number AS "rollNumber",status,version';
const pageSize = 30;

async function issueGrant(db: PoolClient, id: string) {
  const token = randomToken();
  const { rows: [grant] } = await db.query<{ expires_at: Date }>(`
    INSERT INTO mobile_credential_grants(account_id,digest,expires_at) VALUES($1,$2,now()+interval '30 minutes')
    ON CONFLICT(account_id) DO UPDATE SET digest=EXCLUDED.digest,expires_at=EXCLUDED.expires_at
    RETURNING expires_at
  `, [id, digestToken(token)]);
  return { token, expiresAt: grant!.expires_at.toISOString() };
}

export function createAdminUsers(pool: Pool) {
  return {
    async list(search: string, after?: string) {
      const escaped = search.replace(/[\\%_]/g, '\\$&');
      const { rows } = await pool.query<User>(`
        SELECT ${fields} FROM mobile_accounts
        WHERE ($1='' OR name ILIKE '%' || $1 || '%' OR roll_number ILIKE '%' || $1 || '%')
          AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3
      `, [escaped, after ?? null, pageSize + 1]);
      const items = rows.slice(0, pageSize);
      return { items, next: rows.length > pageSize ? items.at(-1)!.id : null };
    },
    async create(actor: string, { name, rollNumber }: UserInput) {
      return inTransaction(pool, async db => {
        const { rows: [user] } = await db.query<User>(`
          INSERT INTO mobile_accounts(id,name,roll_number,password_hash,status)
          VALUES($1,$2,$3,'','pending') ON CONFLICT(roll_number) DO NOTHING RETURNING ${fields}
        `, [randomUUID(), name, rollNumber]);
        if (!user) return null;
        const grant = await issueGrant(db, user.id);
        await recordAdminAction(db, actor, 'account.created', user.id);
        return { user, grant };
      });
    },
    async edit(actor: string, id: string, version: number, { name, rollNumber }: UserInput) {
      try {
        return await inTransaction(pool, async db => {
          const { rows: [user] } = await db.query<User>(`
            UPDATE mobile_accounts SET name=$3,roll_number=$4,version=version+1
            WHERE id=$1 AND version=$2 RETURNING ${fields}
          `, [id, version, name, rollNumber]);
          if (user) await recordAdminAction(db, actor, 'account.edited', id);
          return user ?? null;
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') return null;
        throw error;
      }
    },
    async status(actor: string, id: string, version: number, status: 'active' | 'suspended') {
      return inTransaction(pool, async db => {
        const { rows: [user] } = await db.query<User>(`
          UPDATE mobile_accounts SET status=CASE WHEN $3='active' AND password_hash='' THEN 'pending' ELSE $3 END,version=version+1
          WHERE id=$1 AND version=$2 AND (status='suspended' AND $3='active' OR status<>'suspended' AND $3='suspended')
          RETURNING ${fields}
        `, [id, version, status]);
        if (!user) return null;
        await revokeAccountSessions(db, id);
        if (status === 'suspended') await invalidatePendingPushTargets(db,id);
        await db.query('DELETE FROM mobile_credential_grants WHERE account_id=$1', [id]);
        await recordAdminAction(db, actor, status === 'suspended' ? 'account.suspended' : 'account.reactivated', id);
        return user;
      });
    },
    async reset(actor: string, id: string) {
      return inTransaction(pool, async db => {
        const account = await db.query("SELECT id FROM mobile_accounts WHERE id=$1 AND status<>'suspended' FOR UPDATE", [id]);
        if (!account.rowCount) return null;
        const grant = await issueGrant(db, id);
        await recordAdminAction(db, actor, 'account.reset_link_issued', id);
        return grant;
      });
    },
    async setPassword(token: string, password: string) {
      const digest = digestToken(token);
      const { rows: [grant] } = await pool.query<{ account_id: string }>(
        'SELECT account_id FROM mobile_credential_grants WHERE digest=$1 AND expires_at>now()', [digest],
      );
      if (!grant) return false;
      const hash = await hashPassword(password);
      return inTransaction(pool, async db => {
        const id = grant.account_id;
        const account = await db.query("SELECT id FROM mobile_accounts WHERE id=$1 AND status<>'suspended' FOR UPDATE", [id]);
        if (!account.rowCount) return false;
        const consumed = await db.query(
          'DELETE FROM mobile_credential_grants WHERE account_id=$1 AND digest=$2 AND expires_at>now()', [id,digest],
        );
        if (!consumed.rowCount) return false;
        await db.query("UPDATE mobile_accounts SET password_hash=$2,status='active',version=version+1 WHERE id=$1", [id,hash]);
        await revokeAccountSessions(db, id);
        return true;
      });
    },
  };
}
