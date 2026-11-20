/** The photo sent for judging: big enough to see the food, small enough to send quickly and cheaply. */
export const SCAN_PHOTO_LONGEST_SIDE = 1024;
export const SCAN_PHOTO_QUALITY = 0.7;

/** The picture kept with a scan in history. */
export const THUMBNAIL_LONGEST_SIDE = 256;
export const THUMBNAIL_QUALITY = 0.6;

/** How to resize a photo, giving one side so the other keeps the photo's shape. Null when it already fits. */
export type ResizeTarget = { width: number } | { height: number } | null;

/** Resizes by the longer side so that side becomes `longestSide`; a photo that already fits is left as it is. */
export function resizeTarget(width: number, height: number, longestSide: number): ResizeTarget {
  if (Math.max(width, height) <= longestSide) return null;
  return width >= height ? { width: longestSide } : { height: longestSide };
}
