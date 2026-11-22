import type { CloudScan } from '@food-scanner/contracts';

const scansByOwner = new Map<string, CloudScan[]>();
const photosByOwner = new Map<string, Map<string, string>>();

export async function cached(owner: string) {
  return scansByOwner.get(owner) ?? [];
}

export async function saveCache(owner: string, scans: CloudScan[]) {
  scansByOwner.set(owner, scans);
}

export function hasPendingPhoto(owner: string, id: string) {
  return photosByOwner.get(owner)?.has(id) ?? false;
}

export async function readPendingPhoto(owner: string, id: string) {
  const photo = photosByOwner.get(owner)?.get(id);
  if (!photo) throw new Error('This photo is no longer on this device.');
  return photo;
}

export function savePendingPhoto(owner: string, id: string, photo: string) {
  const photos = photosByOwner.get(owner) ?? new Map<string, string>();
  photos.set(id, photo);
  photosByOwner.set(owner, photos);
}

export function removePendingPhotos(owner: string, id?: string) {
  if (id) photosByOwner.get(owner)?.delete(id);
  else photosByOwner.delete(owner);
}
