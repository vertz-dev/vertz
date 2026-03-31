import { createVertzLibraryPlugin } from '@vertz/ui-server';
import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: { inferTypes: true },
  plugins: [createVertzLibraryPlugin()],
  external: ['@vertz/ui', '@vertz/ui/internals'],
});
