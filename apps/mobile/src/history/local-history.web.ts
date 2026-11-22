import type { ScanHistory } from './scan-history.ts';

// Browser scans are saved by the authenticated API. The mobile import has no browser data source.
export const localHistory: ScanHistory = {
  async save() { throw new Error('Sign in to save a scan.'); },
  async get() { return null; },
  async listNewestFirst() { return []; },
  async deleteById() {},
  async deleteAll() {},
};
