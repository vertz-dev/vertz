import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/adapters/index.ts'],
  format: ['esm'],
  dts: { inferTypes: true },
  clean: true,
});
