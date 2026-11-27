import type { Pool, PoolClient } from 'pg';

export async function recordAdminAction(db: PoolClient, actor: string, action: string, targetId: string) {
  await db.query('INSERT INTO admin_audit(actor,action,target_id) VALUES($1,$2,$3)', [actor, action, targetId]);
}

export async function listAdminActivity(pool: Pool, targetId?: string) {
  const { rows } = await pool.query<{ id: string; actor: string; action: string; targetId: string; occurredAt: Date }>(`
    SELECT id::text,actor,action,target_id AS "targetId",occurred_at AS "occurredAt"
    FROM admin_audit WHERE $1::uuid IS NULL OR target_id=$1
    ORDER BY id DESC LIMIT 50
  `, [targetId ?? null]);
  return rows;
}
