/**
 * Tree-shaking verification tests.
 *
 * For each package we bundle two things with esbuild:
 * 1. A "full" bundle that re-exports everything from the package
 * 2. A "single" bundle that imports just one symbol
 *
 * If the single-import bundle is >50% of the full bundle, tree-shaking
 * is broken for that package.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(ROOT, 'tests/tree-shaking/.tmp');

const EXTERNAL = [
  'node:*',
  'fs',
  'path',
  'crypto',
  'http',
  'https',
  'net',
  'url',
  'stream',
  'zlib',
  'util',
  'os',
  'child_process',
  'events',
  'buffer',
  'querystring',
  'tty',
  'assert',
  'pg',
  'postgres',
  'better-sqlite3',
];

/** Packages to test: [name, singleImport, symbol] */
const PACKAGES: { name: string; singleImport: string; distEntry: string }[] = [
  {
    name: '@vertz/schema',
    singleImport: `import { ErrorCode } from '@vertz/schema'; console.log(ErrorCode);`,
    distEntry: 'packages/schema/dist/index.js',
  },
  {
    name: '@vertz/server',
    singleImport: `import { createEnv } from '@vertz/server'; console.log(createEnv);`,
    distEntry: 'packages/server/dist/index.js',
  },
  {
    name: '@vertz/db',
    singleImport: `import { migrateDev } from '@vertz/db'; console.log(migrateDev);`,
    distEntry: 'packages/db/dist/index.js',
  },
  {
    name: '@vertz/core',
    singleImport: `import { createEnv } from '@vertz/core'; console.log(createEnv);`,
    distEntry: 'packages/core/dist/index.js',
  },
  {
    name: '@vertz/ui-primitives',
    singleImport: `import { Button } from '@vertz/ui-primitives'; console.log(Button);`,
    distEntry: 'packages/ui-primitives/dist/src/index.js',
  },
  {
    name: '@vertz/fetch',
    singleImport: `import { FetchError } from '@vertz/fetch'; console.log(FetchError);`,
    distEntry: 'packages/fetch/dist/index.js',
  },
  {
    name: '@vertz/ui',
    singleImport: `import { ref } from '@vertz/ui'; console.log(ref);`,
    distEntry: 'packages/ui/dist/src/index.js',
  },
  {
    name: '@vertz/icons',
    singleImport: `import { MoonIcon } from '@vertz/icons'; console.log(MoonIcon);`,
    distEntry: 'packages/icons/dist/index.js',
  },
  {
    name: '@vertz/theme-shadcn',
    singleImport: `import { configureThemeBase } from '@vertz/theme-shadcn/base'; console.log(configureThemeBase);`,
    distEntry: 'packages/theme-shadcn/dist/index.js',
  },
  {
    name: '@vertz/ui/components',
    singleImport: `import { Button } from '@vertz/ui/components'; console.log(Button);`,
    distEntry: 'packages/ui/dist/src/components/index.js',
  },
];

/**
 * Maximum ratio of (single-import bundle) / (full re-export bundle).
 * Importing one small symbol should not pull in >50% of the package.
 */
const MAX_RATIO = 0.5;

/** Subpath aliases for packages that use conditional exports (e.g. @vertz/ui/internals). */
const SUBPATH_ALIASES: Record<string, string> = {
  '@vertz/ui/internals': 'packages/ui/dist/src/internals.js',
  '@vertz/core/internals': 'packages/core/dist/internals.js',
  '@vertz/db/sql': 'packages/db/dist/sql/index.js',
  '@vertz/theme-shadcn/base': 'packages/theme-shadcn/dist/base.js',
  '@vertz/ui/components': 'packages/ui/dist/src/components/index.js',
};

const aliases: Record<string, string> = {
  ...Object.fromEntries(PACKAGES.map((p) => [p.name, path.join(ROOT, p.distEntry)])),
  ...Object.fromEntries(Object.entries(SUBPATH_ALIASES).map(([k, v]) => [k, path.join(ROOT, v)])),
};

interface BundleResult {
  size: number;
  warnings: esbuild.Message[];
}

async function bundleWithWarnings(code: string, name: string): Promise<BundleResult> {
  const entry = path.join(TMP, `${name}.ts`);
  fs.writeFileSync(entry, code);
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    treeShaking: true,
    platform: 'node',
    external: EXTERNAL,
    nodePaths: [path.join(ROOT, 'node_modules')],
    alias: aliases,
    minify: false,
  });
  return { size: result.outputFiles[0].contents.byteLength, warnings: result.warnings };
}

async function bundleSize(code: string, name: string): Promise<number> {
  const { size } = await bundleWithWarnings(code, name);
  return size;
}

beforeAll(() => {
  fs.mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('tree-shaking', () => {
  for (const pkg of PACKAGES) {
    it(`${pkg.name} — single import should be <${MAX_RATIO * 100}% of full bundle`, async () => {
      const safeName = pkg.name.replace(/[/@]/g, '_');

      // Full bundle: import everything
      const fullCode = `export * from '${pkg.name}';\n`;
      const fullSize = await bundleSize(fullCode, `full-${safeName}`);

      // Single-import bundle
      const singleSize = await bundleSize(pkg.singleImport, `single-${safeName}`);

      const ratio = singleSize / fullSize;

      console.log(
        `  ${pkg.name}: single=${singleSize}B, full=${fullSize}B, ratio=${(ratio * 100).toFixed(1)}%`,
      );

      // Skip tiny packages (<2KB full bundle) — nothing meaningful to shake
      if (fullSize < 2048) {
        return;
      }

      expect(
        ratio,
        `${pkg.name}: single-import bundle is ${(ratio * 100).toFixed(1)}% of full — tree-shaking may be broken`,
      ).toBeLessThan(MAX_RATIO);
    });
  }
});

describe('tree-shaking warnings', () => {
  it('@vertz/ui-primitives — single import builds without ignored-bare-import warnings', async () => {
    const pkg = PACKAGES.find((p) => p.name === '@vertz/ui-primitives');
    if (!pkg) throw new Error('missing @vertz/ui-primitives in PACKAGES');
    const safeName = pkg.name.replace(/[/@]/g, '_');
    const { warnings } = await bundleWithWarnings(pkg.singleImport, `warn-${safeName}`);

    const bareImportWarnings = warnings.filter((w) => w.id === 'ignored-bare-import');

    expect(
      bareImportWarnings,
      `Expected no ignored-bare-import warnings but got ${bareImportWarnings.length}`,
    ).toHaveLength(0);
  });
});
