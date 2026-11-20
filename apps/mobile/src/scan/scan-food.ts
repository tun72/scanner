import type { ScanRequest } from '@food-scanner/contracts';
import type { AssessmentClient } from './assessment-client.ts';
import type { ImageEditor } from './image-editor.ts';
import { SCAN_PHOTO_LONGEST_SIDE, SCAN_PHOTO_QUALITY, THUMBNAIL_LONGEST_SIDE, THUMBNAIL_QUALITY, resizeTarget } from './photo-size.ts';
import { buildScanRequest, type Scanner } from './scan-request.ts';
import type { ScanFailure, ScanResult } from './scan-outcome.ts';

/** A photo just taken by the camera. */
export interface CapturedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** A scan ready to send. Kept by the screen so Try again resends exactly the same request. */
export interface PreparedScan {
  request: ScanRequest;
  /** Base64 JPEG for history; null for a barcode scan, which has no photo. */
  thumbnail: string | null;
}

export type Prepared = { ok: true; scan: PreparedScan } | { ok: false; failure: ScanFailure };

const NOT_SENDABLE: Prepared = { ok: false, failure: { reason: 'not-sendable' } };

export interface ScanFoodDeps {
  editor: ImageEditor;
  client: AssessmentClient;
}

/** The app side of "Scan a food": turn a photo or barcode into a checked request, and send it. */
export function createScanFood({ editor, client }: ScanFoodDeps) {
  return {
    /** Shrinks the photo for sending and makes the history thumbnail, then builds the request. */
    async preparePhoto(photo: CapturedPhoto, scanner: Scanner): Promise<Prepared> {
      try {
        const sized = (longestSide: number) => resizeTarget(photo.width, photo.height, longestSide);
        const scanPhoto = await editor.toJpeg(photo.uri, sized(SCAN_PHOTO_LONGEST_SIDE), SCAN_PHOTO_QUALITY);
        const thumbnail = await editor.toJpeg(photo.uri, sized(THUMBNAIL_LONGEST_SIDE), THUMBNAIL_QUALITY);
        const request = buildScanRequest({ kind: 'photo', photo: scanPhoto.base64 }, scanner);
        return request === null ? NOT_SENDABLE : { ok: true, scan: { request, thumbnail: thumbnail.base64 } };
      } catch {
        // The photo could not be read or converted on this phone.
        return NOT_SENDABLE;
      }
    },

    prepareBarcode(barcode: string, scanner: Scanner): Prepared {
      const request = buildScanRequest({ kind: 'barcode', barcode }, scanner);
      return request === null ? NOT_SENDABLE : { ok: true, scan: { request, thumbnail: null } };
    },

    send(scan: PreparedScan): Promise<ScanResult> {
      return client.assess(scan.request);
    },
  };
}

export type ScanFood = ReturnType<typeof createScanFood>;
