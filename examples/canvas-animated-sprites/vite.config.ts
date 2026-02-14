import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@vertz/ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@vertz/canvas': resolve(__dirname, '../../packages/canvas/src/index.ts'),
    },
  },
  server: {
    port: 3000,
  },
});
