import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', '.viszi/**'],
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
    testTimeout: 20_000,
  },
});
