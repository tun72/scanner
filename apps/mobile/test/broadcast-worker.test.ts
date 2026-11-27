import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('TC20 displays Burmese broadcast content and opens the inbox without focusing an admin tab', async () => {
  const events = new Map<string,(event: unknown) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const focus = vi.fn();
  const source = readFileSync(new URL('../public/push-worker.js',import.meta.url),'utf8');
  runInNewContext(source,{ URL,self: {
    addEventListener: (key: string,run: (event: unknown) => void) => events.set(key,run),
    location: { origin: 'https://scanner.test' },registration: { showNotification },
    clients: { matchAll: async () => [{ url: 'https://scanner.test/admin/',focus }],openWindow },
  } });
  const waitUntil = vi.fn<(work: Promise<unknown>) => void>();
  const id = 'cf2704ea-b1d4-46a6-9914-f936173d414c';
  events.get('push')!({ data: { json: () => ({ id,title: 'ကြေညာချက်',body: 'စမ်းသပ်စာ' }) },waitUntil });
  expect(showNotification).toHaveBeenCalledWith('ကြေညာချက်',expect.objectContaining({ tag: id,body: 'စမ်းသပ်စာ' }));
  events.get('notificationclick')!({ notification: { data: { broadcast: true },close: vi.fn() },waitUntil });
  await waitUntil.mock.calls.at(-1)?.[0];
  expect(openWindow).toHaveBeenCalledWith('/notifications');
  expect(focus).not.toHaveBeenCalled();
  events.get('push')!({ data: { json: () => ({ body: 'Sobo' }) },waitUntil });
  expect(showNotification).toHaveBeenLastCalledWith('Scanner',expect.objectContaining({ body: 'Sobo' }));
});
