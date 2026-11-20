import { z } from 'zod';
import type { KeyValueStorage } from '../profile/secure-profile-store.ts';

export interface InstallIdDeps {
  storage: KeyValueStorage;
  randomUUID: () => string;
}

const INSTALL_ID_KEY = 'install-id';
const isInstallId = (value: string | null): value is string => z.uuid().safeParse(value).success;

/**
 * The random ID of this install, created on first use and kept on the phone.
 * It identifies the install for scan limits; it says nothing about who the user is.
 */
export async function getOrCreateInstallId({ storage, randomUUID }: InstallIdDeps): Promise<string> {
  const stored = await storage.getItemAsync(INSTALL_ID_KEY);
  if (isInstallId(stored)) return stored;
  const created = randomUUID();
  await storage.setItemAsync(INSTALL_ID_KEY, created);
  return created;
}
