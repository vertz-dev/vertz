import { defineConfig } from 'vite';
import vertzPlugin from '@vertz/ui-compiler';

export default defineConfig({
  plugins: [vertzPlugin()],
});
