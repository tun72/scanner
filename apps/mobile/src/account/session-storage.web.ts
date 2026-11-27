// A sign-out marker prevents another open window from restoring an old tab-scoped session.
const signedOut = 'null';

export async function getItemAsync(key: string) {
  try {
    const saved = window.localStorage.getItem(key);
    if (saved !== null) return saved === signedOut ? null : saved;
    const legacy = window.sessionStorage.getItem(key);
    if (legacy !== null) {
      window.localStorage.setItem(key, legacy);
      window.sessionStorage.removeItem(key);
    }
    return legacy;
  } catch {
    return window.sessionStorage.getItem(key);
  }
}

export async function setItemAsync(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    window.sessionStorage.setItem(key, value);
    return;
  }
  window.sessionStorage.removeItem(key);
}

export async function deleteItemAsync(key: string) {
  window.sessionStorage.removeItem(key);
  try {
    window.localStorage.setItem(key, signedOut);
  } catch {
    // The tab-scoped fallback was cleared above.
  }
}
