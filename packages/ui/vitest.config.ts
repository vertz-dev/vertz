import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@vertz/ui/jsx-runtime': path.resolve(__dirname, 'src/jsx-runtime/index.ts'),
      '@vertz/ui/jsx-dev-runtime': path.resolve(__dirname, 'src/jsx-runtime/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.test-d.{ts,tsx}', 'src/index.ts'],
    },
    typecheck: {
      include: ['src/**/*.test-d.{ts,tsx}'],
    },
  },
});
