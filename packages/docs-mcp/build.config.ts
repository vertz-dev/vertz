import { defineConfig } from '@vertz/build';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/search.ts', 'src/tools.ts'],
  dts: true,
  clean: true,
});
