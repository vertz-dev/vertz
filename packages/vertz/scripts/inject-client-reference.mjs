#!/usr/bin/env node
/**
 * Prepend `/// <reference types="vertz/client" />` to every client-runtime
 * `.d.ts` that users routinely import from. `tsc` strips the directive when
 * the source (a bare `export * from '@vertz/*'`) doesn't use anything from
 * `client.d.ts`, so we inject post-build. Any file that imports from one of
 * these subpaths then pulls in the `ImportMeta.hot` augmentation automatically
 * (#2893) — no tsconfig change required.
 *
 * The `.d.ts.map` mappings are shifted by one line so go-to-definition still
 * lands correctly after the prepend.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIRECTIVE = '/// <reference types="vertz/client" />';
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(packageRoot, 'dist');

// Client-runtime subpaths. Server-only subpaths (server, db, schema, cloudflare,
// tui, fetch, errors, testing, ui-compiler, ui-server, ui-server-build-plugin)
// don't need HMR types.
const targets = ['ui.d.ts', 'ui-components.d.ts', 'ui-primitives.d.ts', 'ui-auth.d.ts'];

for (const target of targets) {
  const dtsPath = join(distDir, target);
  if (!existsSync(dtsPath)) {
    console.error(`[inject-client-reference] ${target} missing — did tsc run first?`);
    process.exit(1);
  }

  const contents = readFileSync(dtsPath, 'utf-8');
  if (contents.startsWith(DIRECTIVE)) continue;

  writeFileSync(dtsPath, `${DIRECTIVE}\n${contents}`);

  // Shift the sourcemap's `mappings` field by one line so declarationMap
  // stays accurate after the prepend. Mappings uses `;` as the line
  // separator — adding one extra `;` at the start offsets everything by 1.
  const mapPath = `${dtsPath}.map`;
  if (existsSync(mapPath)) {
    const map = JSON.parse(readFileSync(mapPath, 'utf-8'));
    if (typeof map.mappings === 'string') {
      map.mappings = `;${map.mappings}`;
      writeFileSync(mapPath, JSON.stringify(map));
    }
  }
}
