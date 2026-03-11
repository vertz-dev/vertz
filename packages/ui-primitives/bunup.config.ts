import { existsSync, readdirSync } from 'node:fs';
import { createVertzLibraryPlugin } from '@vertz/ui-compiler';
import { defineConfig } from 'bunup';

// Auto-discover component entries: each src/<component>/<component>.ts(x) file.
const componentEntries = readdirSync('src', { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '__tests__' && d.name !== 'utils')
  .flatMap((d) => {
    const tsx = `src/${d.name}/${d.name}.tsx`;
    const ts = `src/${d.name}/${d.name}.ts`;
    return existsSync(tsx) ? [tsx] : [ts];
  });

export default defineConfig({
  entry: ['src/index.ts', 'src/utils.ts', ...componentEntries],
  dts: true,
  plugins: [createVertzLibraryPlugin()],
  external: ['@vertz/ui', '@vertz/ui/internals'],
});
