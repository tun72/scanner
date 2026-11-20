import type { ResizeTarget } from './photo-size.ts';

export interface JpegImage {
  /** The JPEG bytes as base64, without a data: prefix. */
  base64: string;
  width: number;
  height: number;
}

/** Turns a photo on the phone into a JPEG of a chosen size. Declared here so the scan code needs no image library. */
export interface ImageEditor {
  toJpeg(uri: string, resize: ResizeTarget, quality: number): Promise<JpegImage>;
}
