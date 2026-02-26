import { resolve } from 'node:path';
import vertzPlugin from '@vertz/ui-compiler';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vertzPlugin({ ssr: true })],
  optimizeDeps: {
    exclude: ['fsevents', 'lightningcss'],
  },
  // Build configuration for Cloudflare Worker + client bundles (production)
  build: {
    ssr: true,
    rollupOptions: {
      input: {
        server: resolve(__dirname, 'src/worker.ts'),
        client: resolve(__dirname, 'src/entry-client.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'server') {
            return 'worker.js';
          }
          // Client assets go under client/ — served by Cloudflare [assets]
          return 'client/assets/[name].js';
        },
        chunkFileNames: 'client/assets/[name].js',
        assetFileNames: 'client/assets/[name].[ext]',
      },
    },
  },
  test: {
    include: ['src/__tests__/api.test.ts'],
  },
});
