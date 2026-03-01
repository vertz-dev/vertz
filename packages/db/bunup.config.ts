import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'bunup';

/**
 * Post-build: strip dead `__require` imports from dialect-agnostic entries.
 *
 * bunup extracts CJS interop (createRequire + __require) into a shared chunk
 * and imports it from EVERY entry point — even entries that never call require().
 * The bare `import "chunk.js"` triggers `createRequire(import.meta.url)` at
 * module load time, which crashes Cloudflare Workers (import.meta.url is
 * undefined there).
 *
 * We strip the dead import from entries that don't use __require.
 * Entries that genuinely need __require (sqlite, postgres) are left untouched.
 */
async function stripDeadRequireImports() {
  const distDir = 'dist';

  // Only strip from entries that should never use CJS require
  const entryFiles = [
    join(distDir, 'index.js'),
    join(distDir, 'sql', 'index.js'),
    join(distDir, 'internals.js'),
    join(distDir, 'plugin', 'index.js'),
    join(distDir, 'diagnostic', 'index.js'),
    join(distDir, 'd1', 'index.js'),
    // postgres/index.js and sqlite/index.js genuinely need __require — skip
  ];

  for (const filePath of entryFiles) {
    const content = await readFile(filePath, 'utf8').catch(() => null);
    if (!content) continue;

    // Count how many times __require appears (import line + usages)
    const matches = content.match(/__require/g);

    // If __require never appears, strip bare side-effect imports of the chunk
    // Pattern: import "..." or import"..." where the chunk contains createRequire
    if (!matches) {
      const bareImport = /import\s*"[^"]*chunk[^"]*";\n?/g;
      const stripped = content.replace(bareImport, '');
      if (stripped !== content) {
        await writeFile(filePath, stripped);
      }
      continue;
    }

    // If only imported but never used (appears once in import, zero in body),
    // remove the import line
    const importLine = /import\s*\{\s*\n?\s*__require\s*\n?\s*\}\s*from\s*"[^"]+";?\n?/;
    if (matches.length === 1 && importLine.test(content)) {
      const stripped = content.replace(importLine, '');
      await writeFile(filePath, stripped);
    }
  }
}

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/sql/index.ts',
    'src/internals.ts',
    'src/plugin/index.ts',
    'src/diagnostic/index.ts',
    'src/sqlite/index.ts',
    'src/postgres/index.ts',
    'src/d1/index.ts',
  ],
  format: ['esm'],
  dts: { inferTypes: true },
  clean: true,
  onSuccess: stripDeadRequireImports,
});
