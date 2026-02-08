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
    include: ['src/**/*.test.ts'],
    exclude: ['src/runtime-adapters/bun.test.ts', 'src/__tests__/e2e-listen.test.ts'],
    environment: 'node',
  },
});
