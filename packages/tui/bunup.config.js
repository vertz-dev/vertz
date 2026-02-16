import { defineConfig } from 'bunup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { inferTypes: true },
  clean: true,
  external: ['ink', 'react'],
});
//# sourceMappingURL=bunup.config.js.map
