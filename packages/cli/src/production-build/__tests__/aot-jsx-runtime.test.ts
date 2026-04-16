/**
 * AOT JSX Runtime Tests
 *
 * Verifies that the AOT routes bundle does NOT import react/jsx-dev-runtime.
 * Regression test for #1935: AOT routes bundle imports react/jsx-dev-runtime
 * instead of Vertz JSX runtime, causing loadAotManifest() to return null.
 *
 * Shells out to a Node.js script that runs esbuild programmatically with the
 * aotJsxStubPlugin logic, so the tests work on both Bun and vtz runtimes.
 */

import { afterEach, describe, expect, it } from '@vertz/test';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Compiled TSX fixture — contains original JSX alongside __ssr_* function. */
const COMPILED_TSX = `import { __esc } from '@vertz/ui-server';

export function HomePage() {
  return <div class="container"><h1>Welcome</h1><p>Multi-child</p></div>;
}

export function __ssr_HomePage(): string {
  return '<div class="container"><h1>Welcome</h1><p>Multi-child</p></div>';
}
`;

/** Barrel that re-exports only __ssr_* functions. */
const BARREL_SOURCE = `import { __esc } from '@vertz/ui-server';
export { __ssr_HomePage } from './__aot_0_home';
`;

/** Monorepo node_modules — used as NODE_PATH so Node.js can resolve esbuild. */
const NODE_MODULES = resolve(import.meta.dir, '../../../../../node_modules');

/**
 * Node.js build script that runs esbuild programmatically with the
 * aotJsxStubPlugin logic inlined. Executed via `node` from the monorepo
 * root so esbuild resolves from node_modules.
 */
function buildScript(barrelPath: string, outDir: string, define?: Record<string, string>): string {
  const defineJson = define ? JSON.stringify(define) : 'undefined';
  return `
const esbuild = require('esbuild');

const aotJsxStubPlugin = {
  name: 'aot-jsx-stub',
  setup(build) {
    build.onResolve({ filter: /^react\\/(jsx-dev-runtime|jsx-runtime)$/ }, () => {
      return { namespace: 'aot-jsx-stub', path: 'stub' };
    });
    build.onLoad({ filter: /.*/, namespace: 'aot-jsx-stub' }, () => {
      return {
        contents: 'export function jsxDEV() {} export function jsx() {} export function jsxs() {} export const Fragment = Symbol("Fragment");',
        loader: 'js',
      };
    });
  },
};

const defineOpt = ${defineJson};

esbuild.build({
  entryPoints: [${JSON.stringify(barrelPath)}],
  plugins: [aotJsxStubPlugin],
  bundle: true,
  format: 'esm',
  outdir: ${JSON.stringify(outDir)},
  entryNames: 'aot-routes',
  external: ['@vertz/ui-server', '@vertz/ui', '@vertz/ui/internals'],
  treeShaking: true,
  write: true,
  logLevel: 'silent',
  ...(defineOpt ? { define: defineOpt } : {}),
}).then(result => {
  if (result.errors.length > 0) {
    console.error(JSON.stringify(result.errors));
    process.exit(1);
  }
}).catch(err => {
  console.error(err.message);
  process.exit(1);
});
`;
}

describe('AOT bundle JSX runtime (#1935)', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function setupFixture(): { barrelPath: string; outDir: string } {
    tmpDir = join(tmpdir(), `aot-jsx-test-${Date.now()}`);
    const outDir = join(tmpDir, 'out');
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });

    writeFileSync(join(tmpDir, '__aot_0_home.tsx'), COMPILED_TSX);

    const barrelPath = join(tmpDir, 'aot-barrel.ts');
    writeFileSync(barrelPath, BARREL_SOURCE);

    return { barrelPath, outDir };
  }

  function bundle(barrelPath: string, outDir: string, define?: Record<string, string>): string {
    const scriptPath = join(tmpDir, 'build.cjs');
    writeFileSync(scriptPath, buildScript(barrelPath, outDir, define));
    execSync(`node "${scriptPath}"`, {
      env: { ...process.env, NODE_PATH: NODE_MODULES },
      encoding: 'utf-8',
    });
    return readFileSync(join(outDir, 'aot-routes.js'), 'utf-8');
  }

  it('does not import react/jsx-dev-runtime in bundled output', () => {
    const { barrelPath, outDir } = setupFixture();
    const output = bundle(barrelPath, outDir);

    expect(output).not.toContain('react/jsx-dev-runtime');
    expect(output).not.toContain('react/jsx-runtime');
  });

  it('preserves __ssr_* function exports in bundled output', () => {
    const { barrelPath, outDir } = setupFixture();
    const output = bundle(barrelPath, outDir);

    expect(output).toContain('__ssr_HomePage');
  });

  it('does not include unused JSX stub functions in output', () => {
    const { barrelPath, outDir } = setupFixture();
    const output = bundle(barrelPath, outDir);

    // Tree-shaking should remove the original HomePage component and JSX stub
    expect(output).not.toContain('function HomePage');
  });

  it('handles production mode JSX runtime (jsxs for multi-child elements)', () => {
    const { barrelPath, outDir } = setupFixture();
    const output = bundle(barrelPath, outDir, {
      'process.env.NODE_ENV': '"production"',
    });

    expect(output).not.toContain('react/jsx-runtime');
    expect(output).not.toContain('react/jsx-dev-runtime');
    expect(output).toContain('__ssr_HomePage');
  });
});
