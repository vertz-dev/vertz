import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@vertz/db': resolve(__dirname, '../db/src/index.ts'),
      '@vertz/core': resolve(__dirname, '../core/src/index.ts'),
      '@vertz/schema': resolve(__dirname, '../schema/src/index.ts'),
      '@vertz/server': resolve(__dirname, './src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
