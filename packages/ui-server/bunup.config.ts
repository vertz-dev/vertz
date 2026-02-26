import { defineConfig } from 'bunup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/ssr/index.ts',
    'src/dom-shim/index.ts',
    'src/jsx-runtime/index.ts',
    'src/bun-plugin/index.ts',
    'src/bun-plugin/fast-refresh-runtime.ts',
  ],
  dts: true,
});
