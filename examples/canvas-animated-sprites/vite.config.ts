import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@vertz/ui/internals': resolve(__dirname, '../../packages/ui/src/internals.ts'),
      '@vertz/ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
});
