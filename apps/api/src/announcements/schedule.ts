import type { BroadcastSchedule } from '@food-scanner/contracts';

const myanmar = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Yangon', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function plannedSendTime(schedule: BroadcastSchedule, now: Date) {
  if (schedule.mode === 'now') return now;
  const when = new Date(schedule.localTime + ':00+06:30');
  if (!Number.isFinite(when.getTime()) || when <= now
      || myanmar.format(when).replace(' ', 'T') !== schedule.localTime) return null;
  return when;
}
