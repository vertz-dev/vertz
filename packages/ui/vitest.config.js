import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test-d.ts', 'src/index.ts'],
    },
    typecheck: {
      include: ['src/**/*.test-d.ts'],
    },
  },
});
//# sourceMappingURL=vitest.config.js.map
