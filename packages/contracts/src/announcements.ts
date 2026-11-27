import { z } from 'zod';

const plainText = (max: number) => z.string().trim().min(1)
  .refine(text => !text.includes(String.fromCharCode(0)) && [...text].length <= max);

export const BroadcastContentSchema = z.strictObject({
  title: plainText(80),
  body: plainText(240),
}).refine(({ title, body }) => new TextEncoder().encode(JSON.stringify({ title, body })).length <= 3_500);

export const AnnouncementSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  publishedAt: z.iso.datetime(),
});
export type Announcement = z.infer<typeof AnnouncementSchema>;
export const AnnouncementPageSchema = z.object({
  items: z.array(AnnouncementSchema),
  next: z.uuid().nullable(),
});

export const AccountChangeSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  rollNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,49}$/),
});

export const MyanmarScheduleSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

export const BroadcastScheduleSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('now'), version: z.int().positive() }),
  z.strictObject({ mode: z.literal('scheduled'), version: z.int().positive(), localTime: MyanmarScheduleSchema }),
]);
export type BroadcastSchedule = z.infer<typeof BroadcastScheduleSchema>;
