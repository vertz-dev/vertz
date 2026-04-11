import { defineConfig } from '@vertz/build';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    dts: true,
    clean: true,
    external: [
      '@vertz/compiler',
      '@vertz/tui',
      '@vertz/sqlite',
      'commander',
      'esbuild',
      'jiti',
      'postgres',
    ],
  },
  {
    entry: ['bin/vertz.ts'],
    dts: false,
    external: [
      '@vertz/compiler',
      '@vertz/tui',
      '@vertz/sqlite',
      'commander',
      'esbuild',
      'jiti',
      'postgres',
    ],
    banner: '#!/usr/bin/env node',
  },
]);
