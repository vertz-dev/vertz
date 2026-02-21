import vertzPlugin from '@vertz/ui-compiler';
import { defineConfig } from 'vite';

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
  test: {
    include: ['src/__tests__/api.test.ts'],
  },
});
