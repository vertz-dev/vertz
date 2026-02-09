import { defineConfig } from 'bunup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    external: ['@vertz/compiler', 'commander', 'jiti'],
  },
  {
    entry: ['bin/vertz.ts'],
    format: ['esm'],
    dts: false,
    clean: false,
    external: ['@vertz/compiler', 'commander', 'jiti'],
    banner: '#!/usr/bin/env node',
  },
]);
