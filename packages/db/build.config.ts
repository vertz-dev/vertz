import { defineConfig } from '@vertz/build';
import { createStripDeadRequireImportsHook } from './src/build-hooks';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/sql/index.ts',
    'src/internals.ts',
    'src/plugin/index.ts',
    'src/diagnostic/index.ts',
    'src/schema-derive/index.ts',
    'src/postgres/index.ts',
  ],
  dts: true,
  clean: true,
  external: ['better-sqlite3'],
  onSuccess: createStripDeadRequireImportsHook(),
});
