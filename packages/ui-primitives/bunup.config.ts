import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createVertzLibraryPlugin } from '@vertz/ui-compiler';
import type { BunupPlugin } from 'bunup';
import { defineConfig } from 'bunup';

// Auto-discover component entries: each src/<component>/<component>.ts(x) file
// and composed variants src/<component>/<component>-composed.tsx.
const componentDirs = readdirSync('src', { withFileTypes: true }).filter(
  (d) => d.isDirectory() && d.name !== '__tests__' && d.name !== 'utils' && d.name !== 'composed',
);

const componentEntries = componentDirs.flatMap((d) => {
  const tsx = `src/${d.name}/${d.name}.tsx`;
  const ts = `src/${d.name}/${d.name}.ts`;
  if (existsSync(tsx)) return [tsx];
  if (existsSync(ts)) return [ts];
  return [];
});

const composedEntries = componentDirs.flatMap((d) => {
  const composed = `src/${d.name}/${d.name}-composed.tsx`;
  return existsSync(composed) ? [composed] : [];
});

/**
 * Fixes the barrel file (index.js) after build.
 *
 * bunup's multi-entry code splitting generates `export { X }` in the barrel
 * without import statements, producing broken ESM. This plugin rewrites the
 * barrel with proper `export * from "./path"` re-exports that point to the
 * built component entry files.
 */
function fixBarrelReExports(): BunupPlugin {
  return {
    name: 'fix-barrel-re-exports',
    hooks: {
      onBuildDone: ({ files }) => {
        const barrelFile = files.find(
          (f) => f.kind === 'entry-point' && f.fullPath.endsWith('index.js'),
        );
        if (!barrelFile) return;

        // Read the source barrel to know exactly what re-exports exist
        const sourceBarrel = readFileSync('src/index.ts', 'utf8');

        // Parse `export { ... } from './path'` and `export type { ... } from './path'`
        // from the source barrel. Group by source path.
        const reExportsByPath = new Map<string, { names: string[]; typeOnly: boolean }[]>();
        const exportRegex = /export\s+(?:type\s+)?{([^}]+)}\s+from\s+'([^']+)'/g;
        for (const match of sourceBarrel.matchAll(exportRegex)) {
          const names = match[1]
            .split(',')
            .map((n) => n.trim())
            .filter(Boolean);
          const sourcePath = match[2];
          const isType = match[0].startsWith('export type');
          if (!reExportsByPath.has(sourcePath)) reExportsByPath.set(sourcePath, []);
          reExportsByPath.get(sourcePath)?.push({ names, typeOnly: isType });
        }

        // Build the replacement barrel content.
        // For each source path, emit `export { ... } from "./built-path.js"`
        // Skip type-only exports (they're erased at runtime).
        const lines: string[] = [];
        for (const [sourcePath, groups] of reExportsByPath) {
          const runtimeNames = groups.filter((g) => !g.typeOnly).flatMap((g) => g.names);
          if (runtimeNames.length === 0) continue;

          // Source paths (e.g. ./composed/with-styles) are already relative to src/.
          // The barrel lives at dist/src/index.js, so paths stay the same.
          const jsPath = `${sourcePath}.js`;

          lines.push(`export { ${runtimeNames.join(', ')} } from "${jsPath}";`);
        }

        writeFileSync(barrelFile.fullPath, `${lines.join('\n')}\n`);
      },
    },
  };
}

/**
 * Strips bare `import"../shared/chunk-*.js"` statements from entry-point files.
 *
 * bunup's multi-entry code splitting emits bare imports in entries for shared
 * utility chunks. These are unnecessary — each component chunk already imports
 * its needed utilities via named imports. The bare imports prevent tree-shaking
 * when `sideEffects: false` is set.
 */
function stripBareChunkImports(): BunupPlugin {
  return {
    name: 'strip-bare-chunk-imports',
    hooks: {
      onBuildDone: ({ files }) => {
        for (const file of files) {
          if (file.kind !== 'entry-point' || !file.fullPath.endsWith('.js')) continue;
          // Skip the barrel — fixBarrelReExports handles it
          if (file.fullPath.endsWith('src/index.js')) continue;
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
  entry: [
    'src/index.ts',
    'src/utils.ts',
    'src/composed/with-styles.ts',
    ...componentEntries,
    ...composedEntries,
  ],
  dts: true,
  plugins: [createVertzLibraryPlugin(), fixBarrelReExports(), stripBareChunkImports()],
  external: ['@vertz/ui', '@vertz/ui/internals'],
});
