import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@vertz/schema': resolve(__dirname, '../schema/src/index.ts'),
    },
  },
  test: {
    // Run type tests (.test-d.ts) and Bun-specific tests (.test-vitest.ts) with Vitest
    // - Bun doesn't support type-level testing (.test-d.ts)
    // - Bun global mocking doesn't work in bun:test (.test-vitest.ts)
    include: ['src/**/*.test-d.ts', 'src/**/*.test-vitest.ts'],
    environment: 'node',
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
