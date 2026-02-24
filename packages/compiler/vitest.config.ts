import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Type tests (.test-d.ts) only - bun doesn't support type-level testing
    include: ['src/**/*.test-d.ts'],
    environment: 'node',
    testTimeout: 15_000,
    pool: 'forks',
    maxForks: process.env.CI ? 2 : undefined,
    teardownTimeout: 120_000,
    // Disable normal test execution, only run typecheck
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      ignoreSourceErrors: true,
      tsconfig: resolve(__dirname, './tsconfig.typecheck.json'),
    },
  },
});
