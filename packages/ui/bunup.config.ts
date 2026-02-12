import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts', 'src/internals.ts', 'src/test/index.ts'],
  dts: true,
});
