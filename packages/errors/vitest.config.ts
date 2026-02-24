import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['src/**/*.test-d.ts'],
    environment: 'node',
    alias: {
      '@': resolve(__dirname, './src'),
    },
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
