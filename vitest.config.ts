import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup/test-env.ts'],
    include: ['tests/**/*.test.ts'],
    // The integration tests share one SQLite file, so run serially to avoid
    // write contention / cross-test interference.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
