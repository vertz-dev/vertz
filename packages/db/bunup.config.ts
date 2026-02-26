import { defineConfig } from 'bunup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/sql/index.ts',
    'src/internals.ts',
    'src/plugin/index.ts',
    'src/diagnostic/index.ts',
    'src/sqlite/index.ts',
    'src/postgres/index.ts',
    'src/d1/index.ts',
  ],
  format: ['esm'],
  dts: { inferTypes: true },
  clean: true,
});
