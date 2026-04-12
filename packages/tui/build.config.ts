import { defineConfig } from '@vertz/build';

export default defineConfig({
  entry: ['src/index.ts', 'src/jsx-runtime/index.ts', 'src/test/index.ts'],
  dts: true,
  external: ['@vertz/ui'],
  clean: true,
});
