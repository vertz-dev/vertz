import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts', 'src/configs.ts', 'src/base.ts'],
  dts: true,
});
