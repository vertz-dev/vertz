import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts', 'src/jsx-runtime/index.ts', 'src/test/index.ts'],
  format: ['esm'],
  dts: { inferTypes: true },
  clean: true,
  external: ['@vertz/ui'],
});
