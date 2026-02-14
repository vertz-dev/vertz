import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@vertz/ui': resolve(__dirname, '../../../ui/src/index.ts'),
      '@vertz/canvas': resolve(__dirname, '../../src/index.ts'),
    },
  },
  server: {
    port: 3000,
  },
});
