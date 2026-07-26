import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    env: {
      MCPSHIELD_E2E: process.env.MCPSHIELD_E2E || '',
    },
  },
});
