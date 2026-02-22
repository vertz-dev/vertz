import vertzPlugin from '@vertz/ui-compiler';
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vertzPlugin({ ssr: true })],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  // Build configuration for SSR + client bundles
  build: {
    // Generate SSR build for Cloudflare Worker
    ssr: true,
    rollupOptions: {
      input: {
        // Server entry for worker SSR
        server: resolve(__dirname, 'src/entry-server.ts'),
        // Client entry for browser hydration
        client: resolve(__dirname, 'src/entry-client.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Server entry goes to worker script
          if (chunkInfo.name === 'server') {
            return 'worker.js';
          }
          // Client entry goes to assets folder
          return 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  test: {
    include: ['src/__tests__/api.test.ts'],
  },
});
