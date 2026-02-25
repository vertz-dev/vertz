import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts', 'src/fast-refresh-runtime.ts'],
  dts: true,
});
