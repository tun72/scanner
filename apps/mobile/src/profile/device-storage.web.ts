export async function getItemAsync(key: string) {
  return window.localStorage.getItem(key);
}

export async function setItemAsync(key: string, value: string) {
  window.localStorage.setItem(key, value);
}
