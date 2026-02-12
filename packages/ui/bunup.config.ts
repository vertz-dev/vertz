import { defineConfig } from 'bunup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/internals.ts',
    'src/test/index.ts',
    'src/router/public.ts',
    'src/form/public.ts',
    'src/query/public.ts',
    'src/css/public.ts',
  ],
  dts: true,
});
