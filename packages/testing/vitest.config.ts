import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@vertz\/core\/(.*)/, replacement: resolve(__dirname, '../core/$1') },
      { find: '@vertz/schema', replacement: resolve(__dirname, '../schema/src/index.ts') },
    ],
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test-d.ts'],
    environment: 'node',
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: resolve(__dirname, './tsconfig.typecheck.json'),
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
