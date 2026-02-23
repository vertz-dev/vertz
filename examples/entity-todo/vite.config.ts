import vertzPlugin from '@vertz/ui-compiler';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vertzPlugin()],
  server: {
    // API routes are handled by dev-server.ts middleware, not proxy
    // Proxy removed to prevent infinite loop
  },
  // SSR-specific configuration (only applies to server builds)
  ssr: {
    resolve: {
      alias: {
        '@vertz/ui/jsx-runtime': '@vertz/ui-server/jsx-runtime',
        '@vertz/ui/jsx-dev-runtime': '@vertz/ui-server/jsx-runtime',
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
