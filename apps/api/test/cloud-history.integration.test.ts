import { randomUUID } from 'node:crypto';
import { CloudScanSchema, SessionSchema, type AccountSession } from '@food-scanner/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createAssessFood } from '../src/assessment/assess-food.ts';
import { createAccounts, seedMobileAccount } from '../src/cloud/accounts.ts';
import { createCloudDatabase, migrateCloudDatabase } from '../src/cloud/database.ts';
import { createCloudHistory } from '../src/cloud/history.ts';
import { buildServer } from '../src/http/server.ts';
import { barcodeScan, draft, fakeJudge, fakeProducts, FIXED_NOW, jpegBase64, photoScan, USAGE } from './helpers.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('account history with PostgreSQL', () => {
  it('TC8 restores the saved nutrient evidence across sessions while preserving account isolation and photo handling', async () => {
    const pool = createCloudDatabase(databaseUrl!);
    const photos = new Map<string, Buffer>();
    const upload = vi.fn(async (id: string, jpeg: string) => { photos.set(id, Buffer.from(jpeg, 'base64')); })
      .mockRejectedValueOnce(new Error('Temporary upload failure'));
    const remove = vi.fn(async (id: string) => { photos.delete(id); }).mockRejectedValueOnce(new Error('Temporary deletion failure'));
    const history = createCloudHistory(pool, { upload, remove, read: async id => photos.get(id) ?? null });
    const judge = fakeJudge({
      ok: true, usage: USAGE,
      draft: draft({
        photoDetails: {
          portionGrams: 250, calories: { min: 300, max: 400 }, protein: { min: 5, max: 7 }, fat: null, carbs: null,
          ingredients: [{ name: 'Chickpeas', evidence: 'seen' }, { name: 'Butter', evidence: 'possible' }],
        },
      }),
    });
    const assessFood = createAssessFood({ judge, products: fakeProducts(), now: () => FIXED_NOW });
    const server = buildServer({ assessFood, cloud: { history, accounts: createAccounts(pool) }, logLevel: 'silent' });
    const password = 'synthetic-phone-test-password';
    const aliceRoll = `TEST-${randomUUID()}`.toUpperCase();
    const bobRoll = `TEST-${randomUUID()}`.toUpperCase();
    const headers = (session: AccountSession) => ({ authorization: `Bearer ${session.token}` });
    const login = (rollNumber: string, secret: string) => server.inject({
      method: 'POST', url: '/v1/session', payload: { rollNumber, password: secret },
    });
    const signedIn = async (rollNumber: string) => SessionSchema.parse((await login(rollNumber, password)).json());
    const photoId = randomUUID();
    const photoPath = `/v1/history/${photoId}/photo`;
    const assess = (session: AccountSession, id: string, body: Record<string, unknown>) => server.inject({
      method: 'POST', url: '/v1/assessments', headers: { ...headers(session), 'idempotency-key': id }, payload: body,
    });
    const list = async (session: AccountSession) => {
      const result = await server.inject({ url: '/v1/history', headers: headers(session) });
      expect(result.statusCode).toBe(200);
      return result.json();
    };
    try {
      await migrateCloudDatabase(pool);
      await migrateCloudDatabase(pool);
      await seedMobileAccount(pool, { name: 'Fixture Alice', rollNumber: aliceRoll, password });
      await seedMobileAccount(pool, { name: 'Fixture Alice Duplicate', rollNumber: aliceRoll, password: 'different' });
      await seedMobileAccount(pool, { name: 'Fixture Bob', rollNumber: bobRoll, password });

      const wrong = await login(aliceRoll, 'wrong');
      const unknown = await login('UNKNOWN', 'wrong');
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json()).toEqual(unknown.json());
      const first = await signedIn(aliceRoll.toLowerCase());
      const second = await signedIn(aliceRoll);
      const other = await signedIn(bobRoll);
      expect(first.user).toEqual({ id: second.user.id, name: 'Fixture Alice', rollNumber: aliceRoll });
      expect(first.token).not.toBe(second.token);

      expect((await server.inject({ method: 'POST', url: '/v1/assessments', payload: photoScan() })).statusCode).toBe(401);
      expect(judge.calls).toHaveLength(0);
      const pendingResponse = await assess(first, photoId, photoScan());
      expect(pendingResponse.statusCode).toBe(200);
      expect(pendingResponse.headers['cache-control']).toBe('private, no-store');
      const pending = CloudScanSchema.parse(pendingResponse.json());
      expect(pending.photoState).toBe('pending');
      expect(pending.verdict.details).toMatchObject({ kind: 'photo', photo: { calories: { min: 300, max: 400 } } });
      expect(pending.verdict.nutrientHighlights).toEqual([
        { nutrient: 'iron', source: 'photo', ingredient: 'Chickpeas' },
        { nutrient: 'protein', source: 'photo', ingredient: 'Chickpeas' },
        { nutrient: 'fiber', source: 'photo', ingredient: 'Chickpeas' },
      ]);
      const reopened = await server.inject({ url: `/v1/history/${photoId}`, headers: headers(second) });
      expect(reopened.statusCode).toBe(200);
      expect(CloudScanSchema.parse(reopened.json())).toEqual(pending);
      expect(judge.calls).toHaveLength(1);
      expect(await list(second)).toEqual([pending]);
      expect(await list(other)).toEqual([]);
      expect((await server.inject({ url: `/v1/history/${photoId}`, headers: headers(other) })).statusCode).toBe(404);

      const retry = (session: AccountSession, photo: string) => server.inject({
        method: 'PUT', url: photoPath, headers: headers(session), payload: { photo },
      });
      expect((await retry(other, jpegBase64())).statusCode).toBe(404);
      expect((await retry(first, jpegBase64(7))).statusCode).toBe(404);
      const ready = CloudScanSchema.parse((await retry(first, jpegBase64())).json());
      expect(ready.photoState).toBe('ready');
      expect(judge.calls).toHaveLength(1);
      expect(await list(second)).toEqual([ready]);
      expect((await server.inject({ url: photoPath, headers: headers(second) })).rawPayload).toEqual(Buffer.from(jpegBase64(), 'base64'));
      expect((await server.inject({ url: photoPath, headers: headers(other) })).statusCode).toBe(404);
      await server.inject({ method: 'DELETE', url: `/v1/history/${photoId}`, headers: headers(other) });
      expect(await list(first)).toEqual([ready]);

      const barcodeId = randomUUID();
      const duplicates = await Promise.all([assess(first, barcodeId, barcodeScan()), assess(second, barcodeId, barcodeScan())]);
      expect(duplicates.map(result => result.statusCode)).toEqual([200, 200]);
      expect(duplicates[0]!.json()).toEqual(duplicates[1]!.json());
      expect(duplicates[0]!.json().photoState).toBe('none');
      expect(judge.calls).toHaveLength(2);
      expect(upload).toHaveBeenCalledTimes(2);
      expect(await list(second)).toHaveLength(2);

      const importedId = randomUUID();
      const importBody = { installId: randomUUID(), id: importedId, scannedAt: ready.scannedAt, verdict: ready.verdict, thumbnail: null };
      const importScan = (session: AccountSession) => server.inject({
        method: 'POST', url: '/v1/history/import', headers: headers(session), payload: importBody,
      });
      expect((await importScan(first)).statusCode).toBe(200);
      expect((await importScan(second)).statusCode).toBe(200);
      expect((await importScan(other)).statusCode).toBe(409);
      expect(await list(second)).toHaveLength(3);

      expect((await server.inject({ method: 'DELETE', url: `/v1/history/${photoId}`, headers: headers(first) })).statusCode).toBe(204);
      expect((await server.inject({ url: photoPath, headers: headers(second) })).statusCode).toBe(404);
      expect((await assess(first, photoId, photoScan())).statusCode).toBe(400);
      expect(judge.calls).toHaveLength(2);
      await history.cleanOnePhoto();
      expect(photos.size).toBe(1);
      await pool.query("UPDATE photo_deletion_queue SET attempt_after=now() WHERE asset_id LIKE $1", [`%/${photoId}`]);
      await createCloudHistory(pool, { upload, remove, read: async () => null }).cleanOnePhoto();
      expect(photos.size).toBe(0);

      const retainedPhotoId = randomUUID();
      const retainedAsset = `food-scanner/${first.user.id}/${retainedPhotoId}`;
      const retained = CloudScanSchema.parse((await assess(first, retainedPhotoId, photoScan())).json());
      expect(retained.photoState).toBe('ready');
      const pendingPhotoId = randomUUID();
      upload.mockRejectedValueOnce(new Error('Temporary upload failure'));
      const pendingAtClear = CloudScanSchema.parse((await assess(first, pendingPhotoId, photoScan())).json());
      expect(pendingAtClear.photoState).toBe('pending');
      expect((await assess(other, randomUUID(), barcodeScan())).statusCode).toBe(200);

      const clear = (session: AccountSession) => server.inject({ method: 'DELETE', url: '/v1/history', headers: headers(session) });
      const clears = await Promise.all([clear(first), clear(second)]);
      expect(clears.map(result => result.statusCode)).toEqual([204, 204]);
      expect(await list(first)).toEqual([]);
      expect(await list(other)).toHaveLength(1);
      const retainedPhotoPath = `/v1/history/${retainedPhotoId}/photo`;
      expect((await server.inject({ url: retainedPhotoPath, headers: headers(second) })).statusCode).toBe(404);
      expect(await history.completePhoto(second.user.id, pendingPhotoId, jpegBase64())).toBeNull();
      const { rows: audit } = await pool.query(
        'SELECT owner_id, cleared_at, scan_count, ready_photo_count FROM history_clear_log WHERE owner_id=$1', [first.user.id],
      );
      expect(audit).toEqual([{ owner_id: first.user.id, cleared_at: expect.any(Date), scan_count: 4, ready_photo_count: 1 }]);
      const { rows: queued } = await pool.query(
        'SELECT asset_id FROM photo_deletion_queue WHERE asset_id=ANY($1)',
        [[retainedAsset, `food-scanner/${first.user.id}/${pendingPhotoId}`]],
      );
      expect(queued).toEqual([]);
      await history.cleanOnePhoto();
      expect(photos.get(retainedAsset)).toEqual(Buffer.from(jpegBase64(), 'base64'));
      expect((await importScan(first)).statusCode).toBe(204);
      expect((await server.inject({ method: 'DELETE', url: '/v1/session', headers: headers(first) })).statusCode).toBe(204);
      expect((await server.inject({ url: '/v1/history', headers: headers(first) })).statusCode).toBe(401);
      expect(await list(second)).toEqual([]);
    } finally {
      await server.close();
      await pool.end();
    }
  }, 20_000);
});
