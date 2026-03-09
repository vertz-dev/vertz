import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts', 'src/edge.ts'],
  format: ['esm'],
  dts: { inferTypes: true },
  clean: true,
});
