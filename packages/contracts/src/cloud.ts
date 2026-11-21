import { z } from 'zod';
import { MAX_PHOTO_BASE64_LENGTH } from './scan-request.ts';
import { VerdictResponseSchema } from './verdict-response.ts';

export const AccountSchema = z.object({ id: z.uuid(), name: z.string().min(1), rollNumber: z.string().min(1) });
export const SessionSchema = z.object({ user: AccountSchema, token: z.string().min(40), expiresAt: z.iso.datetime() });
export type AccountSession = z.infer<typeof SessionSchema>;

export const LoginSchema = z.strictObject({
  rollNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,49}$/),
  password: z.string().min(1).max(128),
});

export const PhotoStateSchema = z.enum(['none', 'pending', 'ready']);
export type PhotoState = z.infer<typeof PhotoStateSchema>;
export const CloudScanSchema = z.object({
  id: z.uuid(), scannedAt: z.iso.datetime(), verdict: VerdictResponseSchema, photoState: PhotoStateSchema,
});
export type CloudScan = z.infer<typeof CloudScanSchema>;
export const CloudHistorySchema = z.array(CloudScanSchema);

export const CloudPhotoSchema = z.base64().min(4).max(MAX_PHOTO_BASE64_LENGTH).refine(value => value.startsWith('/9j/'));
export const ImportScanSchema = z.strictObject({
  installId: z.uuid(), id: z.uuid(), scannedAt: z.iso.datetime(), verdict: VerdictResponseSchema,
  thumbnail: CloudPhotoSchema.max(350_000).nullable(),
});
