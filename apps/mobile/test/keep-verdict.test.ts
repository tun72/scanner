import { describe, expect, it } from 'vitest';
import { createKeepVerdict } from '../src/history/scan-history.ts';
import { NOW, THUMBNAIL_BASE64, memoryHistory, verdict } from './helpers.ts';

describe('keeping a shown verdict', () => {
  it('saves the verdict with a new ID, the phone time and the thumbnail', async () => {
    const history = memoryHistory();
    const keep = createKeepVerdict({ history, newId: () => 'scan-1', now: () => NOW });

    expect(await keep(verdict(), THUMBNAIL_BASE64)).toBe(true);
    expect(history.saved).toEqual([{ id: 'scan-1', scannedAt: NOW.toISOString(), verdict: verdict(), thumbnail: THUMBNAIL_BASE64 }]);
  });

  it('reports a failed save instead of throwing, so the verdict still shows', async () => {
    const history = memoryHistory();
    history.save = async () => {
      throw new Error('database is full');
    };

    expect(await createKeepVerdict({ history, newId: () => 'scan-1', now: () => NOW })(verdict(), null)).toBe(false);
  });
});
