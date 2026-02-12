import { defineConfig } from 'bunup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/internals.ts',
    'src/test/index.ts',
    'src/router/index.ts',
    'src/form/index.ts',
    'src/query/index.ts',
    'src/css/index.ts',
  ],
  dts: true,
});
