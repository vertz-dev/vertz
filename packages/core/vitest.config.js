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
    include: ['src/**/*.test.ts'],
    environment: 'node',
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
