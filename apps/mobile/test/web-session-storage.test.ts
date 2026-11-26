import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteItemAsync, getItemAsync, setItemAsync } from '../src/account/session-storage.web.ts';

const key = 'mobile-account-session';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); },
    removeItem: (name: string) => { values.delete(name); },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('PWA session storage', () => {
  it('restores a sign-in after the app opens in a fresh browsing session', async () => {
    const localStorage = storage();
    vi.stubGlobal('window', { localStorage, sessionStorage: storage() });
    await setItemAsync(key, 'session');
    vi.stubGlobal('window', { localStorage, sessionStorage: storage() });
    expect(await getItemAsync(key)).toBe('session');
  });

  it('migrates an existing sign-in and keeps a signed-out session from returning', async () => {
    const sessionStorage = storage();
    const localStorage = storage();
    sessionStorage.setItem(key, 'old-session');
    vi.stubGlobal('window', { localStorage, sessionStorage });
    expect(await getItemAsync(key)).toBe('old-session');
    expect(localStorage.getItem(key)).toBe('old-session');
    expect(sessionStorage.getItem(key)).toBeNull();
    await deleteItemAsync(key);
    sessionStorage.setItem(key, 'stale-session-from-another-window');
    expect(await getItemAsync(key)).toBeNull();
  });

  it('uses tab storage when the browser blocks persistent storage', async () => {
    const window = { sessionStorage: storage(), get localStorage(): never { throw new Error('Blocked'); } };
    vi.stubGlobal('window', window);
    await setItemAsync(key, 'session');
    expect(await getItemAsync(key)).toBe('session');
    await deleteItemAsync(key);
    expect(await getItemAsync(key)).toBeNull();
  });
});
