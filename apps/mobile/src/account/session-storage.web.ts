// Keep bearer tokens scoped to this web app session, including reloads.
export async function getItemAsync(key: string) {
  return window.sessionStorage.getItem(key);
}

export async function setItemAsync(key: string, value: string) {
  window.sessionStorage.setItem(key, value);
}

export async function deleteItemAsync(key: string) {
  window.sessionStorage.removeItem(key);
}
