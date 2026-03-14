import { createVertzLibraryPlugin } from '@vertz/ui-compiler';
import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  plugins: [createVertzLibraryPlugin()],
  external: [
    '@vertz/ui',
    '@vertz/ui/internals',
    '@vertz/ui/auth',
    '@vertz/ui/router',
    '@vertz/ui/jsx-runtime',
  ],
});
