import { scanPhotoSource } from './history.ts';

export function useScanPhoto(id: string | undefined) {
  return id ? scanPhotoSource(id) : undefined;
}
