import { z } from 'zod';
import { CONDITION_IDS, ConditionIdSchema } from './conditions.ts';

export const MAX_NOTES_LENGTH = 300;

/** Photos are shrunk on the phone; 1.5 MB is far above a 1024 px JPEG and bounds cost and abuse. */
export const MAX_PHOTO_BYTES = 1_572_864;

/** Base64 writes every 3 bytes as 4 characters, so the byte limit is checked on the text length. */
export const MAX_PHOTO_BASE64_LENGTH = Math.ceil(MAX_PHOTO_BYTES / 3) * 4;

const hasNoDuplicates = (items: readonly string[]): boolean => new Set(items).size === items.length;

/**
 * The part of the stomach profile that travels with every scan.
 * The server keeps no profile, so a scan without one cannot be judged.
 */
export const ScanProfileSchema = z
  .strictObject({
    conditions: z.array(ConditionIdSchema).max(CONDITION_IDS.length).refine(hasNoDuplicates, 'Conditions must not repeat.'),
    notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  })
  .refine((profile) => profile.conditions.length > 0 || (profile.notes ?? '').length > 0, 'A profile needs at least one condition or a note.');
export type ScanProfile = z.infer<typeof ScanProfileSchema>;

/** The locale is placed into the AI prompt, so it is limited to a plain language tag such as en or pt-BR. */
const LocaleSchema = z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/, 'Locale must be a language tag such as en.');

const scanBase = {
  /** Random ID made on first launch; identifies an install for rate limits, never a person. */
  installId: z.uuid(),
  profile: ScanProfileSchema,
  locale: LocaleSchema,
};

export const PhotoScanRequestSchema = z.strictObject({
  ...scanBase,
  kind: z.literal('photo'),
  photo: z.base64().min(1).max(MAX_PHOTO_BASE64_LENGTH),
  foodOnly: z.literal(true).optional(),
});

export const BarcodeScanRequestSchema = z.strictObject({
  ...scanBase,
  kind: z.literal('barcode'),
  barcode: z.string().regex(/^\d{8,14}$/, 'A barcode is 8 to 14 digits.'),
});

/** What the app sends to POST /v1/assessments. Unknown fields are refused. */
export const ScanRequestSchema = z.discriminatedUnion('kind', [PhotoScanRequestSchema, BarcodeScanRequestSchema]);
export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type PhotoScanRequest = z.infer<typeof PhotoScanRequestSchema>;
export type BarcodeScanRequest = z.infer<typeof BarcodeScanRequestSchema>;
