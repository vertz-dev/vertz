import { defineConfig } from '@vertz/build';

export default defineConfig({
  entry: ['src/index.ts', 'src/loader.ts'],
  dts: true,
  clean: true,
});
