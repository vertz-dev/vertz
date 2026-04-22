import { defineConfig } from '@vertz/build';

export default defineConfig({
  entry: ['src/index.ts', 'src/cloudflare.ts', 'src/entities/index.ts', 'src/testing/index.ts'],
  dts: true,
  external: ['bun:sqlite', '@vertz/db', '@vertz/server'],
  clean: true,
});
