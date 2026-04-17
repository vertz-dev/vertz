import { defineConfig } from '@vertz/build';

export default defineConfig([
  {
    entry: [
      'src/index.ts',
      'src/ssr/index.ts',
      'src/dom-shim/index.ts',
      'src/jsx-runtime/index.ts',
      'src/fetch-scope.ts',
      'src/node-handler.ts',
    ],
    dts: true,
  },
  {
    entry: [
      'src/build-plugin/index.ts',
      'src/build-plugin/fast-refresh-runtime.ts',
      'src/build-plugin/fast-refresh-dom-state.ts',
      'src/build-plugin/state-inspector.ts',
    ],
    outDir: 'dist/build-plugin',
    dts: false,
    target: 'node',
  },
]);
