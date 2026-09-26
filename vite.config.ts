import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/echo-of-life/',
  build: {
    target: 'es2022',
    // Recordings are fetched at runtime; never inline them.
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
