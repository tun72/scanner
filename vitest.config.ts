import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    // TC18 changes the working directory, which needs a real process per test file.
    pool: 'forks',
    restoreMocks: true,
  },
});
