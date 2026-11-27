import type { BroadcastContentSchema, BroadcastSchedule } from '@food-scanner/contracts';
import type { Pool, PoolClient } from 'pg';
import type { z } from 'zod';
import { recordAdminAction } from '../admin/audit.ts';
import { inTransaction } from '../cloud/database.ts';
import { plannedSendTime } from './schedule.ts';

type Content = z.infer<typeof BroadcastContentSchema>;
type Broadcast = Content & { id: string; version: number; state: 'draft' | 'queued' | 'cancelled'; scheduledFor: Date | null };
type BroadcastReceipt = Omit<Broadcast,'scheduledFor'> & { scheduledFor: string };
const fields = 'id,title,body,version,state,scheduled_for AS "scheduledFor"';

async function lockBroadcast(db: PoolClient,id: string) {
  await db.query('SELECT id FROM broadcasts WHERE id=$1 FOR UPDATE', [id]);
  const { rows: [current] } = await db.query<Broadcast>(`
    SELECT ${fields} FROM broadcasts b WHERE id=$1
      AND NOT EXISTS (SELECT 1 FROM broadcast_publications p WHERE p.broadcast_id=b.id)
  `, [id]);
  return current;
}

export function createBroadcasts(pool: Pool) {
  return {
    async list(after?: string) {
      const { rows } = await pool.query<Broadcast & { publishedAt: Date | null; counts: Record<string,number> }>(`
        SELECT b.id,b.title,b.body,b.version,b.state,b.scheduled_for AS "scheduledFor",p.published_at AS "publishedAt",
          COALESCE((SELECT jsonb_object_agg(d.status,d.total) FROM (
            SELECT status,count(*)::int AS total FROM broadcast_deliveries WHERE broadcast_id=b.id GROUP BY status
          ) d),'{}') AS counts
        FROM broadcasts b LEFT JOIN broadcast_publications p ON p.broadcast_id=b.id
        WHERE $1::uuid IS NULL OR (b.created_at,b.id) < (SELECT created_at,id FROM broadcasts WHERE id=$1)
        ORDER BY b.created_at DESC,b.id DESC LIMIT 31
      `, [after ?? null]);
      const { rows: [worker] } = await pool.query<{ seen_at: Date }>('SELECT seen_at FROM broadcast_worker_heartbeat');
      const items = rows.slice(0,30);
      return { items, next: rows.length > 30 ? items.at(-1)!.id : null, workerSeenAt: worker?.seen_at ?? null };
    },
    async create(actor: string,id: string,content: Content) {
      return inTransaction(pool, async db => {
        const { rows: [item] } = await db.query<Broadcast>(`
          INSERT INTO broadcasts(id,title,body) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING RETURNING ${fields}
        `, [id,content.title,content.body]);
        if (item) {
          await recordAdminAction(db,actor,'broadcast.created',id);
          return item;
        }
        const current = await lockBroadcast(db,id);
        return current?.state === 'draft' && current.title === content.title && current.body === content.body ? current : null;
      });
    },
    async edit(actor: string,id: string,version: number,content: Content) {
      return inTransaction(pool, async db => {
        const current = await lockBroadcast(db,id);
        if (!current || current.version !== version || current.state === 'cancelled') return null;
        const { rows: [item] } = await db.query<Broadcast>(`
          UPDATE broadcasts SET title=$2,body=$3,version=version+1 WHERE id=$1 RETURNING ${fields}
        `, [id,content.title,content.body]);
        await recordAdminAction(db,actor,'broadcast.edited',id);
        return item!;
      });
    },
    async schedule(actor: string,id: string,input: BroadcastSchedule) {
      return inTransaction(pool, async db => {
        const current = await lockBroadcast(db,id);
        const { rows: [receipt] } = await db.query<{ same: boolean; result: BroadcastReceipt }>(`
          SELECT request=$3::jsonb AS same,result FROM broadcast_schedule_receipts
          WHERE broadcast_id=$1 AND requested_version=$2
        `, [id,input.version,JSON.stringify(input)]);
        if (receipt) return receipt.same ? { outcome: 'queued' as const, item: receipt.result } : { outcome: 'conflict' as const };
        if (!current || current.version !== input.version || current.state === 'cancelled') return { outcome: 'conflict' as const };
        const { rows: [clock] } = await db.query<{ now: Date }>('SELECT clock_timestamp() AS now');
        const when = plannedSendTime(input,clock!.now);
        if (!when) return { outcome: 'invalid-time' as const };
        const { rows: [item] } = await db.query<Broadcast>(`
          UPDATE broadcasts SET state='queued',scheduled_for=$2,version=version+1 WHERE id=$1 RETURNING ${fields}
        `, [id,when]);
        const scheduled = { ...item!,scheduledFor: when.toISOString() };
        await db.query('INSERT INTO broadcast_schedule_receipts VALUES($1,$2,$3,$4)',
          [id,input.version,JSON.stringify(input),JSON.stringify(scheduled)]);
        await recordAdminAction(db,actor,'broadcast.queued',id);
        return { outcome: 'queued' as const,item: scheduled };
      });
    },
    async cancel(actor: string,id: string,version: number) {
      return inTransaction(pool, async db => {
        const current = await lockBroadcast(db,id);
        if (!current || current.version !== version || current.state !== 'queued') return null;
        const { rows: [item] } = await db.query<Broadcast>(`
          UPDATE broadcasts SET state='cancelled',version=version+1 WHERE id=$1 RETURNING ${fields}
        `, [id]);
        await recordAdminAction(db,actor,'broadcast.cancelled',id);
        return item!;
      });
    },
    async inbox(after?: string) {
      const { rows } = await pool.query<{ id: string; title: string; body: string; publishedAt: Date }>(`
        SELECT broadcast_id AS id,title,body,published_at AS "publishedAt" FROM broadcast_publications
        WHERE $1::uuid IS NULL OR (published_at,broadcast_id) <
          (SELECT published_at,broadcast_id FROM broadcast_publications WHERE broadcast_id=$1)
        ORDER BY published_at DESC,broadcast_id DESC LIMIT 21
      `, [after ?? null]);
      const items = rows.slice(0,20);
      return { items, next: rows.length > 20 ? items.at(-1)!.id : null };
    },
  };
}
