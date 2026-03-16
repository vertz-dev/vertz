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
  plugins: [
    createVertzLibraryPlugin({
      // Batch-1 composed primitives (PR #1323) still use imperative patterns.
      // Skip reactive transforms for them; transpile JSX only.
      // Converted to declarative JSX: tooltip
      exclude:
        /(accordion|alert-dialog|dialog|dropdown-menu|popover|select|sheet|tabs)-composed\.tsx$/,
    }),
  ],
  external: ['@vertz/ui', '@vertz/ui/internals'],
});
