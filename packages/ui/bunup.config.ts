import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts', 'src/test/index.ts'],
  dts: true,
});
