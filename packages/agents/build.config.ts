import { defineConfig } from '@vertz/build';

export default defineConfig({
  entry: ['src/index.ts', 'src/cloudflare.ts'],
  dts: true,
  external: ['bun:sqlite'],
  clean: true,
});
