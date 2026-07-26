import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    env: {
      SKIP_E2E: process.env.SKIP_E2E || '',
    },
  },
});
