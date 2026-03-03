import { defineConfig } from 'bunup';
import { createVertzLibraryPlugin } from '@vertz/ui-compiler';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  plugins: [createVertzLibraryPlugin()],
  external: ['@vertz/ui', '@vertz/ui/internals'],
});
