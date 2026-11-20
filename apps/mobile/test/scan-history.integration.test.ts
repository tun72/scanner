/// <reference types="node" />
// Runs in Node (Vitest), not on the phone, so it may use Node's built-in SQLite.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createKeepVerdict } from '../src/history/scan-history.ts';
import { createSqliteScanHistory, type SqlDatabase } from '../src/history/sqlite-scan-history.ts';
import { NOW, THUMBNAIL_BASE64, verdict } from './helpers.ts';

// The app runs this store on expo-sqlite. Here the same SQL runs on Node's built-in SQLite,
// through the same three calls, so the table, the migration and the ordering are checked for real.

function nodeSqlite(db = new DatabaseSync(':memory:')): SqlDatabase & { db: DatabaseSync } {
  return {
    db,
    async execAsync(source) {
      db.exec(source);
    },
    async runAsync(source, params) {
      return db.prepare(source).run(...params);
    },
    async getAllAsync<T>(source: string, params: (string | number | null)[]) {
      return db.prepare(source).all(...params) as T[];
    },
  };
}

const older = (id: string, scannedAt: string, foodName: string) => ({
  id,
  scannedAt,
  verdict: verdict({ level: 'safe', foodName, reasons: [], flaggedIngredients: [] }),
  thumbnail: null,
});

describe('scan history in SQLite', () => {
  it('TC24 a shown verdict is saved and appears first in history', async () => {
    const sqlite = nodeSqlite();
    const history = createSqliteScanHistory(async () => sqlite);
    await history.save(older('scan-1', '2026-11-15T08:00:00.000Z', 'Plain rice'));
    await history.save(older('scan-2', '2026-11-16T07:30:00.000Z', 'Banana'));
    const keepVerdict = createKeepVerdict({ history, newId: () => 'scan-3', now: () => NOW });

    expect(await keepVerdict(verdict(), THUMBNAIL_BASE64)).toBe(true);

    const listed = await history.listNewestFirst();
    expect(listed.map((scan) => scan.id)).toEqual(['scan-3', 'scan-2', 'scan-1']);
    expect(listed[0]).toEqual({ id: 'scan-3', scannedAt: NOW.toISOString(), level: 'avoid', foodName: 'Spicy noodle soup', thumbnail: THUMBNAIL_BASE64 });
    const reopened = createSqliteScanHistory(async () => nodeSqlite(sqlite.db));
    expect(await reopened.get('scan-3')).toEqual({ id: 'scan-3', scannedAt: NOW.toISOString(), verdict: verdict(), thumbnail: THUMBNAIL_BASE64 });
  });

  it('keeps the whole verdict for the detail screen, and no thumbnail for a barcode scan', async () => {
    const sqlite = nodeSqlite();
    const history = createSqliteScanHistory(async () => sqlite);
    const product = verdict({ source: 'product', foodName: 'Nutella' });

    await history.save({ id: 'scan-1', scannedAt: NOW.toISOString(), verdict: product, thumbnail: null });

    expect(await history.get('scan-1')).toEqual({ id: 'scan-1', scannedAt: NOW.toISOString(), verdict: product, thumbnail: null });
  });

  it('TC25 removes a single saved scan, even when deletion is retried', async () => {
    const sqlite = nodeSqlite();
    const history = createSqliteScanHistory(async () => sqlite);
    await history.save(older('scan-1', NOW.toISOString(), 'Toast'));
    await history.save(older('scan-2', NOW.toISOString(), 'Banana'));

    await history.deleteById('scan-1');
    await history.deleteById('scan-1');

    expect(await history.get('scan-1')).toBeNull();
    expect((await history.listNewestFirst()).map((scan) => scan.id)).toEqual(['scan-2']);
  });

  it('TC26 clears every scan and allows new scans to be saved', async () => {
    const sqlite = nodeSqlite();
    const history = createSqliteScanHistory(async () => sqlite);
    await history.save(older('scan-1', NOW.toISOString(), 'Toast'));
    await history.save(older('scan-2', NOW.toISOString(), 'Banana'));

    await history.deleteAll();

    const reopened = createSqliteScanHistory(async () => nodeSqlite(sqlite.db));
    expect(await reopened.listNewestFirst()).toEqual([]);
    await reopened.save(older('scan-3', NOW.toISOString(), 'Rice'));
    expect((await reopened.listNewestFirst()).map((scan) => scan.id)).toEqual(['scan-3']);
  });

  it('lists the later of two scans made at the same moment first', async () => {
    const history = createSqliteScanHistory(async () => nodeSqlite());
    await history.save(older('first', NOW.toISOString(), 'Toast'));
    await history.save(older('second', NOW.toISOString(), 'Tea'));

    expect((await history.listNewestFirst()).map((scan) => scan.id)).toEqual(['second', 'first']);
  });

  it('creates the table once and keeps saved scans when the app opens the database again', async () => {
    const db = new DatabaseSync(':memory:');
    await createSqliteScanHistory(async () => nodeSqlite(db)).save(older('scan-1', NOW.toISOString(), 'Toast'));

    const reopened = createSqliteScanHistory(async () => nodeSqlite(db));

    expect((await reopened.listNewestFirst()).map((scan) => scan.id)).toEqual(['scan-1']);
    expect(db.prepare('PRAGMA user_version').all()).toEqual([{ user_version: 1 }]);
  });

  it('leaves out a row this version of the app cannot read', async () => {
    const sqlite = nodeSqlite();
    const history = createSqliteScanHistory(async () => sqlite);
    await history.save(older('good', NOW.toISOString(), 'Toast'));
    sqlite.db.prepare("INSERT INTO scans VALUES ('odd', ?, 'great', 'Mystery', '{}', NULL)").run(NOW.toISOString());

    expect((await history.listNewestFirst()).map((scan) => scan.id)).toEqual(['good']);
    expect(await history.get('odd')).toBeNull();
    sqlite.db.prepare("UPDATE scans SET verdict_json = 'broken json' WHERE id = 'good'").run();
    expect(await history.get('good')).toBeNull();
  });

  it('tries to open the database again after a failed open', async () => {
    let opens = 0;
    const history = createSqliteScanHistory(async () => {
      opens += 1;
      if (opens === 1) throw new Error('disk busy');
      return nodeSqlite();
    });

    await expect(history.listNewestFirst()).rejects.toThrow('disk busy');
    expect(await history.listNewestFirst()).toEqual([]);
  });
});
