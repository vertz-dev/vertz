import { defineConfig } from '@vertz/build';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/adapters/index.ts'],
  dts: true,
  clean: true,
});
