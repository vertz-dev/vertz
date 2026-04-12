import { readFile, writeFile } from 'node:fs/promises';
import type { PostBuildHook } from '@vertz/build';

/**
 * Post-build: strip dead `__require` imports from dialect-agnostic entries.
 *
 * Bundlers may extract CJS interop (createRequire + __require) into a shared chunk
 * and import it from every entry point — even entries that never call require().
 * The bare `import "chunk.js"` triggers `createRequire(import.meta.url)` at
 * module load time, which crashes Cloudflare Workers (import.meta.url is
 * undefined there).
 *
 * This hook strips the dead import from entries that don't use __require.
 * Entries that genuinely need __require (e.g. sqlite, postgres) are left untouched.
 */
export function createStripDeadRequireImportsHook(): PostBuildHook {
  return {
    name: 'strip-dead-require-imports',
    handler: async (ctx) => {
      for (const file of ctx.outputFiles) {
        if (file.kind !== 'entry-point' || !file.path.endsWith('.js')) continue;

        const content = await readFile(file.path, 'utf8').catch(() => null);
        if (!content) continue;

        const matches = content.match(/__require/g);

        // No __require at all — strip bare side-effect imports of chunks
        if (!matches) {
          const bareImport = /import\s*"[^"]*chunk[^"]*";\n?/g;
          const stripped = content.replace(bareImport, '');
          if (stripped !== content) {
            await writeFile(file.path, stripped);
          }
          continue;
        }

        // Imported but never used in body (appears once in import statement only)
        const importLine = /import\s*\{\s*\n?\s*__require\s*\n?\s*\}\s*from\s*"[^"]+";?\n?/;
        if (matches.length === 1 && importLine.test(content)) {
          const stripped = content.replace(importLine, '');
          await writeFile(file.path, stripped);
        }
      }
    },
  };
}
