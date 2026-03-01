import { defineConfig } from 'bunup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: { inferTypes: true },
    clean: true,
    external: ['@vertz/compiler', '@vertz/tui', 'bun:sqlite', 'commander', 'esbuild', 'jiti', 'postgres'],
  },
  {
    entry: ['bin/vertz.ts'],
    format: ['esm'],
    dts: false,
    clean: false,
    external: ['@vertz/compiler', '@vertz/tui', 'bun:sqlite', 'commander', 'esbuild', 'jiti', 'postgres'],
    banner: '#!/usr/bin/env node',
  },
]);
