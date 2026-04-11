import { defineConfig } from '@vertz/build';

export default defineConfig({
  entry: ['src/index.ts', 'src/edge.ts'],
  dts: true,
  clean: true,
});
