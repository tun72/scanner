import { describe, expect, it } from 'vitest';
import { getOrCreateInstallId } from '../src/install/install-id.ts';
import { memoryStorage } from './helpers.ts';

const FIRST = '7f1c2a3e-6b4d-4c8e-9a1f-2b3c4d5e6f70';
const SECOND = '0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';

function uuids(...values: string[]): () => string {
  const queue = [...values];
  return () => queue.shift() ?? 'no more ids';
}

describe('install ID', () => {
  it('is created on first use and reused afterwards', async () => {
    const storage = memoryStorage();
    const randomUUID = uuids(FIRST, SECOND);

    expect(await getOrCreateInstallId({ storage, randomUUID })).toBe(FIRST);
    expect(await getOrCreateInstallId({ storage, randomUUID })).toBe(FIRST);
  });

  it('replaces a stored value that is not a UUID', async () => {
    const storage = memoryStorage({ 'install-id': 'garbage' });

    expect(await getOrCreateInstallId({ storage, randomUUID: uuids(SECOND) })).toBe(SECOND);
    expect(storage.items.get('install-id')).toBe(SECOND);
  });
});
