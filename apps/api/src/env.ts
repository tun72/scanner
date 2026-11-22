import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Load .env file into process.env if present. Safe in production/Docker where env is already set. */
export function loadEnv(): void {
  for (const candidate of ['.env', 'apps/api/.env', '../apps/api/.env']) {
    const full = resolve(candidate);
    if (existsSync(full)) {
      try {
        process.loadEnvFile?.(full);
        break;
      } catch {
        // Continue if unreadable
      }
    }
  }
}
