import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@vertz/schema': resolve(__dirname, '../schema/src/index.ts'),
      '@vertz/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    // Only DOM-dependent tests that need happy-dom run under vitest
    include: ['src/**/*.test-vitest.ts'],
    environment: 'node',
  },
});
