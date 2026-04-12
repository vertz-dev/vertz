import { defineConfig } from '@vertz/build';
import { createVertzLibraryPlugin } from '@vertz/ui-server';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  plugins: [createVertzLibraryPlugin()],
  external: ['@vertz/ui', '@vertz/ui/internals'],
});
