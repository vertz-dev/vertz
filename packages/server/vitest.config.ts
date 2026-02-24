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
    // Type tests (.test-d.ts) only - Bun doesn't support type-level testing
    include: ['src/**/*.test-d.ts'],
    environment: 'node',
    testTimeout: 15_000,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      ignoreSourceErrors: true,
      tsconfig: resolve(__dirname, './tsconfig.typecheck.json'),
    },
    coverage: {
      reporter: ['text', 'json-summary', 'json'],
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test-d.ts', 'src/index.ts'],
    },
  },
});
