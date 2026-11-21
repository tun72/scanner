import { CloudHistorySchema, CloudScanSchema, type AccountSession, type CloudScan } from '@food-scanner/contracts';
import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { accountRequest, AccountRequestError, activeSession, apiBase } from './session.ts';

let database: Promise<SQLite.SQLiteDatabase> | undefined;
function cache() {
  database ??= SQLite.openDatabaseAsync('food-scanner-cloud-cache.db').then(async db => {
    await db.execAsync('CREATE TABLE IF NOT EXISTS account_history (owner TEXT PRIMARY KEY, scans TEXT NOT NULL)');
    return db;
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}
async function cached(owner: string) {
  const row = await (await cache()).getFirstAsync<{ scans: string }>('SELECT scans FROM account_history WHERE owner=?', [owner]);
  return row ? CloudHistorySchema.parse(JSON.parse(row.scans)) : [];
}
async function saveCache(owner: string, scans: CloudScan[]) {
  const db = await cache();
  await db.runAsync('INSERT INTO account_history(owner,scans) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET scans=excluded.scans', [owner, JSON.stringify(scans)]);
}

let lastOperation = Promise.resolve();
function inOrder<T>(work: () => Promise<T>): Promise<T> {
  const pending = lastOperation.then(work);
  lastOperation = pending.then(() => undefined, () => undefined);
  return pending;
}

const filename = (owner: string, scan: string) => `pending-scan-${owner}-${scan}.jpg`;
const pendingPhoto = (owner: string, id: string) => new File(Paths.cache, filename(owner, id));
let offlineOwner: string | undefined;
export const historyIsOffline = () => offlineOwner !== undefined && activeSession()?.user.id === offlineOwner;
function ownerSession() {
  const session = activeSession();
  if (!session) throw new AccountRequestError(401);
  return session;
}

export function scanPhotoSource(id: string) {
  const session = activeSession();
  return session && apiBase ? {
    uri: `${apiBase}/v1/history/${id}/photo?owner=${session.user.id}`,
    headers: { Authorization: `Bearer ${session.token}` },
    cache: 'reload' as const,
  } : undefined;
}

export async function rememberCloudScan(session: AccountSession, scan: CloudScan, photo: string | null) {
  await inOrder(async () => {
    if (activeSession()?.token !== session.token) return;
    const file = pendingPhoto(session.user.id, scan.id);
    if (scan.photoState === 'pending' && photo) {
      await file.write(photo, { encoding: 'base64' });
      if (activeSession()?.token !== session.token) {
        if (file.exists) file.delete();
        return;
      }
    } else if (scan.photoState === 'ready' && file.exists) file.delete();
    const rows = await cached(session.user.id);
    await saveCache(session.user.id, [scan, ...rows.filter(row => row.id !== scan.id)]
      .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)));
  });
}

export function getCloudHistory() {
  const session = ownerSession();
  return inOrder(async () => {
    try {
      const result = await accountRequest('/v1/history', {}, session);
      const rows = CloudHistorySchema.parse(await result.json());
      if (activeSession()?.token !== session.token) throw new AccountRequestError(401);
      offlineOwner = undefined;
      await saveCache(session.user.id, rows).catch(() => undefined);
      return rows;
    } catch (error) {
      if (error instanceof AccountRequestError && (error.status === 0 || error.status >= 500) && activeSession()?.token === session.token) {
        offlineOwner = session.user.id;
        return cached(session.user.id);
      }
      throw error;
    }
  });
}

export function getCloudScan(id: string) {
  const session = ownerSession();
  return inOrder(async () => {
    try {
      const result = await accountRequest(`/v1/history/${id}`, {}, session);
      if (activeSession()?.token !== session.token) throw new AccountRequestError(401);
      return CloudScanSchema.parse(await result.json());
    } catch (error) {
      if (error instanceof AccountRequestError) {
        if (error.status === 404) return null;
        if ((error.status === 0 || error.status >= 500) && activeSession()?.token === session.token) {
          return (await cached(session.user.id)).find(row => row.id === id) ?? null;
        }
      }
      throw error;
    }
  });
}

export function canRetryPhoto(id: string) {
  const session = activeSession();
  return session ? pendingPhoto(session.user.id, id).exists : false;
}

export async function retryCloudPhoto(id: string, originalPhoto?: string | null) {
  const session = ownerSession();
  const photo = originalPhoto ?? await pendingPhoto(session.user.id, id).base64();
  const result = await accountRequest(`/v1/history/${id}/photo`, { method: 'PUT', body: JSON.stringify({ photo }) }, session);
  const scan = CloudScanSchema.parse(await result.json());
  await rememberCloudScan(session, scan, null);
  return scan;
}

function removePendingPhotos(owner: string, id?: string) {
  if (id) {
    const file = pendingPhoto(owner, id);
    if (file.exists) file.delete();
    return;
  }
  for (const file of Paths.cache.list()) {
    if (file instanceof File && file.name.startsWith(`pending-scan-${owner}-`)) file.delete();
  }
}

export function clearPendingPhotos(owner: string) {
  return inOrder(async () => removePendingPhotos(owner));
}

export function deleteCloudScans(id?: string) {
  const session = ownerSession();
  return inOrder(async () => {
    await accountRequest(`/v1/history${id ? '/' + id : ''}`, { method: 'DELETE' }, session);
    const rows = id ? (await cached(session.user.id).catch(() => [])).filter(row => row.id !== id) : [];
    await saveCache(session.user.id, rows).catch(() => undefined);
    await Promise.resolve().then(() => removePendingPhotos(session.user.id, id)).catch(() => undefined);
  });
}
