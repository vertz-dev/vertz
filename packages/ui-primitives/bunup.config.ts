import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createVertzLibraryPlugin } from '@vertz/ui-compiler';
import type { BunupPlugin } from 'bunup';
import { defineConfig } from 'bunup';

// Auto-discover component entries: each src/<component>/<component>.ts(x) file.
const componentEntries = readdirSync('src', { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '__tests__' && d.name !== 'utils')
  .flatMap((d) => {
    const tsx = `src/${d.name}/${d.name}.tsx`;
    const ts = `src/${d.name}/${d.name}.ts`;
    return existsSync(tsx) ? [tsx] : [ts];
  });

/**
 * Strips bare `import"../shared/chunk-*.js"` statements from entry-point files.
 *
 * bunup's multi-entry code splitting emits bare imports in the barrel for shared
 * utility chunks whose exports aren't directly re-exported. These are unnecessary —
 * every component chunk already imports its needed utilities via named imports.
 * The bare imports prevent tree-shaking when `sideEffects: false` is set.
 */
function stripBareChunkImports(): BunupPlugin {
  return {
    name: 'strip-bare-chunk-imports',
    hooks: {
      onBuildDone: ({ files }) => {
        for (const file of files) {
          if (file.kind !== 'entry-point' || !file.fullPath.endsWith('.js')) continue;
          const content = readFileSync(file.fullPath, 'utf8');
          const cleaned = content.replace(/^import\s*"[^"]*chunk-[^"]*\.js";\n?/gm, '');
          if (cleaned !== content) {
            writeFileSync(file.fullPath, cleaned);
          }
        }
      },
    },
  };
}

export default defineConfig({
  entry: ['src/index.ts', 'src/utils.ts', ...componentEntries],
  dts: true,
  plugins: [createVertzLibraryPlugin(), stripBareChunkImports()],
  external: ['@vertz/ui', '@vertz/ui/internals'],
});
