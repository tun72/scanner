import { setTimeout as delay } from 'node:timers/promises';
import type { createBroadcastDelivery } from './delivery.ts';

export function startBroadcastProcessor(work: ReturnType<typeof createBroadcastDelivery>, onError: () => void) {
  const shutdown = new AbortController();
  let active: Promise<boolean> | undefined;

  // The timer and the scheduler can ask for work at the same time.
  const run = () => {
    if (shutdown.signal.aborted) return Promise.resolve(false);
    return active ??= (async () => {
      await work.heartbeat();
      if (shutdown.signal.aborted) return false;
      const published = await work.publishDue();
      const delivered = shutdown.signal.aborted ? 0 : await work.deliverBatch();
      return published > 0 || delivered === 5;
    })().finally(() => { active = undefined; });
  };

  const stopped = (async () => {
    while (!shutdown.signal.aborted) {
      const busy = await run().catch(() => { onError(); return false; });
      await delay(busy ? 100 : 10_000, undefined, { signal: shutdown.signal }).catch(() => undefined);
    }
    await active?.catch(() => undefined);
  })();

  return { run, stopped, stop: () => { shutdown.abort(); return stopped; } };
}
