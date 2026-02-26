import vertzPlugin from '@vertz/ui-compiler';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vertzPlugin({ ssr: true })],
  optimizeDeps: {
    exclude: ['fsevents', 'lightningcss'],
  },
  // Build configuration for SSR + client bundles (production)
  build: {
    ssr: true,
    rollupOptions: {
      input: {
        server: resolve(__dirname, 'src/entry-server.ts'),
        client: resolve(__dirname, 'src/entry-client.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'server') {
            return 'worker.js';
          }
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
