import { defineConfig } from '@vertz/build';
import { createVertzLibraryPlugin } from '@vertz/ui-server';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  plugins: [createVertzLibraryPlugin()],
  external: [
    '@vertz/icons',
    '@vertz/ui',
    '@vertz/ui/internals',
    '@vertz/ui/auth',
    '@vertz/ui/router',
    '@vertz/ui/jsx-runtime',
  ],
});
