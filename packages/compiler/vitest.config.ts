import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
    pool: 'forks',
    maxForks: process.env.CI ? 2 : undefined,
    teardownTimeout: 120_000,
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
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
