import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PostBuildHook } from '@vertz/build';

/**
 * Fixes the barrel file (index.js) after build.
 *
 * Multi-entry code splitting may generate `export { X }` in the barrel
 * without import statements, producing broken ESM. This hook rewrites the
 * barrel with proper `export { ... } from "./path.js"` re-exports that
 * point to the built component entry files.
 */
export function createFixBarrelReExportsHook(): PostBuildHook {
  return {
    name: 'fix-barrel-re-exports',
    handler: (ctx) => {
      const barrelFile = ctx.outputFiles.find(
        (f) => f.kind === 'entry-point' && f.path.endsWith('index.js'),
      );
      if (!barrelFile) return;

      // Read the source barrel to know exactly what re-exports exist.
      // Assumes outDir is a direct child of the package root (e.g. 'dist').
      const sourceBarrel = readFileSync(join(ctx.outDir, '..', 'src', 'index.ts'), 'utf8');

      // Parse `export { ... } from './path'` and `export type { ... } from './path'`
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

      // Build replacement barrel — skip type-only exports (erased at runtime)
      const lines: string[] = [];
      for (const [sourcePath, groups] of reExportsByPath) {
        const runtimeNames = groups.filter((g) => !g.typeOnly).flatMap((g) => g.names);
        if (runtimeNames.length === 0) continue;

        const jsPath = `${sourcePath}.js`;
        lines.push(`export { ${runtimeNames.join(', ')} } from "${jsPath}";`);
      }

      writeFileSync(barrelFile.path, `${lines.join('\n')}\n`);
    },
  };
}

/**
 * Strips bare `import "chunk-*.js"` statements from entry-point files.
 *
 * Multi-entry code splitting may emit bare imports in entries for shared
 * utility chunks. These are unnecessary — each component chunk already imports
 * its needed utilities via named imports. The bare imports prevent tree-shaking
 * when `sideEffects: false` is set.
 */
export function createStripBareChunkImportsHook(): PostBuildHook {
  return {
    name: 'strip-bare-chunk-imports',
    handler: (ctx) => {
      for (const file of ctx.outputFiles) {
        if (file.kind !== 'entry-point' || !file.path.endsWith('.js')) continue;
        // Skip the barrel — fixBarrelReExports handles it
        if (file.path.endsWith('src/index.js')) continue;

        const content = readFileSync(file.path, 'utf8');
        const cleaned = content.replace(/^import\s*"[^"]*chunk-[^"]*\.js";\n?/gm, '');
        if (cleaned !== content) {
          writeFileSync(file.path, cleaned);
        }
      }
    },
  };
}
