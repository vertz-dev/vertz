import vertzPlugin from '@vertz/ui-compiler';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vertzPlugin({ ssr: true })],
});
