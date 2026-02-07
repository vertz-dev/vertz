import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts', 'src/internals.ts'],
  dts: true,
});
