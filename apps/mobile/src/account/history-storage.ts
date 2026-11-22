import { CloudHistorySchema, type CloudScan } from '@food-scanner/contracts';
import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

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
export async function cached(owner: string) {
  const row = await (await cache()).getFirstAsync<{ scans: string }>('SELECT scans FROM account_history WHERE owner=?', [owner]);
  return row ? CloudHistorySchema.parse(JSON.parse(row.scans)) : [];
}
export async function saveCache(owner: string, scans: CloudScan[]) {
  const db = await cache();
  await db.runAsync('INSERT INTO account_history(owner,scans) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET scans=excluded.scans', [owner, JSON.stringify(scans)]);
}

const filename = (owner: string, scan: string) => `pending-scan-${owner}-${scan}.jpg`;
const pendingPhoto = (owner: string, id: string) => new File(Paths.cache, filename(owner, id));

export const hasPendingPhoto = (owner: string, id: string) => pendingPhoto(owner, id).exists;
export const readPendingPhoto = (owner: string, id: string) => pendingPhoto(owner, id).base64();
export const savePendingPhoto = (owner: string, id: string, photo: string) =>
  pendingPhoto(owner, id).write(photo, { encoding: 'base64' });

export function removePendingPhotos(owner: string, id?: string) {
  if (id) {
    const file = pendingPhoto(owner, id);
    if (file.exists) file.delete();
    return;
  }
  for (const file of Paths.cache.list()) {
    if (file instanceof File && file.name.startsWith(`pending-scan-${owner}-`)) file.delete();
  }
}
