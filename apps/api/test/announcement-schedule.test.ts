import { BroadcastContentSchema, BroadcastScheduleSchema } from '@food-scanner/contracts';
import { expect, it } from 'vitest';
import { plannedSendTime } from '../src/announcements/schedule.ts';

const clock = new Date('2026-11-27T15:30:00.000Z');

it('TC9 handles Myanmar midnight and uses the supplied clock for immediate delivery', () => {
  expect(plannedSendTime({ mode: 'now',version: 1 },clock)).toEqual(clock);
  expect(plannedSendTime({ mode: 'scheduled',version: 1,localTime: '2026-11-28T00:15' },clock)?.toISOString())
    .toBe('2026-11-27T17:45:00.000Z');
});

it('TC10 rejects invalid notification content and past or malformed times', () => {
  expect(BroadcastContentSchema.safeParse({ title: 'အသိပေးချက်',body: 'စမ်းသပ်စာ' }).success).toBe(true);
  for (const content of [{ title: ' ',body: 'ok' },{ title: 'စာ',body: 'က'.repeat(241) },{ title: 'a'.repeat(81),body: 'က' }]) {
    expect(BroadcastContentSchema.safeParse(content).success).toBe(false);
  }
  expect(BroadcastScheduleSchema.safeParse({ mode: 'scheduled',version: 1,localTime: '2026-11-28T00:15+06:30' }).success).toBe(false);
  for (const localTime of ['2026-11-27T22:00','2027-02-30T09:00','2027-01-01T24:00']) {
    expect(plannedSendTime({ mode: 'scheduled',version: 1,localTime },clock)).toBeNull();
  }
});
