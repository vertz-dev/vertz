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
    fileParallelism: false,
    retry: 2,
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      ignoreSourceErrors: true,
      tsconfig: resolve(__dirname, './tsconfig.typecheck.json'),
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
//# sourceMappingURL=vitest.config.js.map
