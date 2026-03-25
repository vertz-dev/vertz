import { defineConfig } from 'bunup';

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
      'src/bun-plugin/index.ts',
      'src/bun-plugin/fast-refresh-runtime.ts',
      'src/bun-plugin/fast-refresh-dom-state.ts',
      'src/bun-dev-server.ts',
    ],
    dts: true,
    target: 'bun',
    clean: false,
  },
]);
