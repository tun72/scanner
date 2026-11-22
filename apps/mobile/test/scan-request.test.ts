/// <reference types="node" />
import { ScanRequestSchema } from '@food-scanner/contracts';
import { describe, expect, it } from 'vitest';
import { createScanFood } from '../src/scan/scan-food.ts';
import { isProductBarcode } from '../src/scan/scan-request.ts';
import { INSTALL_ID, SCAN_PHOTO_BASE64, THUMBNAIL_BASE64, queuedClient, recordingEditor, savedProfile, verdict } from './helpers.ts';

const scanner = (profile = savedProfile()) => ({ profile, installId: INSTALL_ID });

describe('preparing a photo scan', () => {
  it('TC6 a photo scan request carries the shrunk photo and the profile', async () => {
    const editor = recordingEditor();
    const client = queuedClient();
    const scanFood = createScanFood({ editor, client });

    const prepared = await scanFood.preparePhoto({ uri: 'file:///meal.jpg', width: 4000, height: 3000 }, scanner(savedProfile({ conditions: ['gastritis'] })));

    // The photo sent is resized so its longest side, the width, is 1024 px, as a JPEG at quality 0.7.
    expect(editor.calls[0]).toEqual({ uri: 'file:///meal.jpg', resize: { width: 1024 }, quality: 0.7 });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const { request } = prepared.scan;
    expect(request).toEqual({ kind: 'photo', photo: SCAN_PHOTO_BASE64, installId: INSTALL_ID, profile: { conditions: ['gerd', 'gastritis', 'peptic-ulcer'] }, locale: 'my-MM' });
    expect(Buffer.from(SCAN_PHOTO_BASE64, 'base64').subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(ScanRequestSchema.safeParse(request).success).toBe(true);
    expect(client.sent).toEqual([]);
  });

  it('makes a 256 px thumbnail for history at quality 0.6', async () => {
    const editor = recordingEditor();
    const prepared = await createScanFood({ editor, client: queuedClient() }).preparePhoto({ uri: 'file:///meal.jpg', width: 4000, height: 3000 }, scanner());

    expect(editor.calls[1]).toEqual({ uri: 'file:///meal.jpg', resize: { width: 256 }, quality: 0.6 });
    expect(prepared.ok && prepared.scan.thumbnail).toBe(THUMBNAIL_BASE64);
  });

  it('resizes a portrait photo by its height', async () => {
    const editor = recordingEditor();
    await createScanFood({ editor, client: queuedClient() }).preparePhoto({ uri: 'file:///meal.jpg', width: 3024, height: 4032 }, scanner());

    expect(editor.calls.map((call) => call.resize)).toEqual([{ height: 1024 }, { height: 256 }]);
  });

  it('leaves a photo that already fits at its size', async () => {
    const editor = recordingEditor();
    await createScanFood({ editor, client: queuedClient() }).preparePhoto({ uri: 'file:///meal.jpg', width: 1024, height: 768 }, scanner());

    expect(editor.calls.map((call) => call.resize)).toEqual([null, { width: 256 }]);
  });

  it('sends the notes with the conditions', async () => {
    const prepared = await createScanFood({ editor: recordingEditor(), client: queuedClient() }).preparePhoto(
      { uri: 'file:///meal.jpg', width: 4000, height: 3000 },
      scanner(savedProfile({ conditions: [], notes: 'Onions upset me' })),
    );

    expect(prepared.ok && prepared.scan.request.profile).toEqual({ conditions: ['gerd', 'gastritis', 'peptic-ulcer'], notes: 'Onions upset me' });
  });

  it('does not send a photo the phone could not convert', async () => {
    const client = queuedClient();
    const editor = recordingEditor();
    editor.toJpeg = async () => {
      throw new Error('unsupported image');
    };

    const prepared = await createScanFood({ editor, client }).preparePhoto({ uri: 'file:///meal.heic', width: 4000, height: 3000 }, scanner());

    expect(prepared).toEqual({ ok: false, failure: { reason: 'not-sendable' } });
    expect(client.sent).toEqual([]);
  });

  it('does not send a request the API would refuse', async () => {
    const prepared = await createScanFood({ editor: recordingEditor(), client: queuedClient() }).preparePhoto(
      { uri: 'file:///meal.jpg', width: 4000, height: 3000 },
      { profile: savedProfile(), installId: 'not-a-uuid' },
    );

    expect(prepared).toEqual({ ok: false, failure: { reason: 'not-sendable' } });
  });
});

describe('preparing a barcode scan', () => {
  it('sends the digits with the profile and keeps no thumbnail', () => {
    const prepared = createScanFood({ editor: recordingEditor(), client: queuedClient() }).prepareBarcode('3017620422003', scanner());

    expect(prepared).toEqual({
      ok: true,
      scan: {
        request: { kind: 'barcode', barcode: '3017620422003', installId: INSTALL_ID, profile: { conditions: ['gerd', 'gastritis', 'peptic-ulcer'] }, locale: 'my-MM' },
        thumbnail: null,
      },
    });
  });

  it('accepts product barcodes of 8 to 14 digits and ignores anything else the camera reads', () => {
    expect(['96385074', '3017620422003', '12345678901234'].map(isProductBarcode)).toEqual([true, true, true]);
    expect(['1234567', '123456789012345', 'https://example.com', '3017 6204'].map(isProductBarcode)).toEqual([false, false, false, false]);
  });
});

describe('sending a prepared scan', () => {
  it('sends the prepared request as it is and returns the answer', async () => {
    const client = queuedClient([{ kind: 'verdict', verdict: verdict() }]);
    const scanFood = createScanFood({ editor: recordingEditor(), client });
    const prepared = scanFood.prepareBarcode('3017620422003', scanner());
    if (!prepared.ok) throw new Error('expected a prepared scan');

    const result = await scanFood.send(prepared.scan);

    expect(client.sent).toEqual([prepared.scan.request]);
    expect(result).toEqual({ kind: 'verdict', verdict: verdict() });
  });
});
