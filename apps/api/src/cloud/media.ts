import { v2 as cloudinary } from 'cloudinary';
import { MAX_PHOTO_BYTES } from '@food-scanner/contracts';

export interface PrivateMedia {
  upload(id: string, jpeg: string): Promise<void>;
  read(id: string): Promise<Buffer | null>;
  remove(id: string): Promise<void>;
}

export function createCloudinaryMedia(url: string): PrivateMedia {
  try {
    const credentials = new URL(url);
    if (credentials.protocol !== 'cloudinary:' || !credentials.username || !credentials.password || !credentials.hostname) throw new Error();
    cloudinary.config({
      cloud_name: credentials.hostname, api_key: decodeURIComponent(credentials.username),
      api_secret: decodeURIComponent(credentials.password), secure: true,
    });
  } catch {
    throw new Error('CLOUDINARY_URL is not a valid account configuration.');
  }

  return {
    async upload(id, jpeg) {
      await cloudinary.uploader.upload(`data:image/jpeg;base64,${jpeg}`, {
        public_id: id, type: 'authenticated', resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg'], overwrite: true, timeout: 10_000,
      });
    },
    async read(id) {
      const url = cloudinary.utils.private_download_url(id, 'jpg', { type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 60 });
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (response.status === 404) return null;
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Private photo could not be loaded.');
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > MAX_PHOTO_BYTES) throw new Error('Private photo is too large.');
      return data;
    },
    async remove(id) {
      const options = { type: 'authenticated', resource_type: 'image', invalidate: true, timeout: 10_000 } as const;
      const result = await cloudinary.uploader.destroy(id, options);
      if (!['ok', 'not found'].includes(result.result)) throw new Error('Private photo could not be removed.');
    },
  };
}
