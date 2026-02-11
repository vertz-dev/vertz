import { defineConfig } from 'bunup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/sql/index.ts',
    'src/internals.ts',
    'src/plugin/index.ts',
    'src/diagnostic/index.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
});
