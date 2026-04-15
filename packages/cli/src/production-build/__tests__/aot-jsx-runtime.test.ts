/**
 * AOT JSX Runtime Tests
 *
 * Verifies that the AOT routes bundle does NOT import react/jsx-dev-runtime.
 * Regression test for #1935: AOT routes bundle imports react/jsx-dev-runtime
 * instead of Vertz JSX runtime, causing loadAotManifest() to return null.
 */

import { afterEach, describe, expect, it } from '@vertz/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aotJsxStubPlugin } from '../ui-build-pipeline';

// Bun.build is not available in the vtz runtime — skip the entire suite.
// These tests exercise the Bun bundler plugin (aotJsxStubPlugin) which requires
// the real Bun.build() API. vtz shims Bun.build as a function that throws.
const isVtzRuntime = !!(globalThis as Record<string, unknown>).__vtz_runtime;
const hasBunBuild =
  !isVtzRuntime &&
  typeof globalThis.Bun !== 'undefined' &&
  typeof globalThis.Bun.build === 'function';

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

describe.skipIf(!hasBunBuild)('AOT bundle JSX runtime (#1935)', () => {
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

  it('does not import react/jsx-dev-runtime in bundled output', async () => {
    const { barrelPath, outDir } = setupFixture();

    const result = await Bun.build({
      entrypoints: [barrelPath],
      plugins: [aotJsxStubPlugin],
      target: 'bun',
      format: 'esm',
      outdir: outDir,
      naming: 'aot-routes.[ext]',
      external: ['@vertz/ui-server', '@vertz/ui', '@vertz/ui/internals'],
    });

    expect(result.success).toBe(true);

    const output = readFileSync(join(outDir, 'aot-routes.js'), 'utf-8');
    expect(output).not.toContain('react/jsx-dev-runtime');
    expect(output).not.toContain('react/jsx-runtime');
  });

  it('preserves __ssr_* function exports in bundled output', async () => {
    const { barrelPath, outDir } = setupFixture();

    const result = await Bun.build({
      entrypoints: [barrelPath],
      plugins: [aotJsxStubPlugin],
      target: 'bun',
      format: 'esm',
      outdir: outDir,
      naming: 'aot-routes.[ext]',
      external: ['@vertz/ui-server', '@vertz/ui', '@vertz/ui/internals'],
    });

    expect(result.success).toBe(true);

    const output = readFileSync(join(outDir, 'aot-routes.js'), 'utf-8');
    expect(output).toContain('__ssr_HomePage');
  });

  it('does not include unused JSX stub functions in output', async () => {
    const { barrelPath, outDir } = setupFixture();

    const result = await Bun.build({
      entrypoints: [barrelPath],
      plugins: [aotJsxStubPlugin],
      target: 'bun',
      format: 'esm',
      outdir: outDir,
      naming: 'aot-routes.[ext]',
      external: ['@vertz/ui-server', '@vertz/ui', '@vertz/ui/internals'],
    });

    expect(result.success).toBe(true);

    const output = readFileSync(join(outDir, 'aot-routes.js'), 'utf-8');

    // Tree-shaking should remove the original HomePage component and JSX stub
    expect(output).not.toContain('function HomePage');
  });

  it('handles production mode JSX runtime (jsxs for multi-child elements)', async () => {
    const { barrelPath, outDir } = setupFixture();

    const result = await Bun.build({
      entrypoints: [barrelPath],
      plugins: [aotJsxStubPlugin],
      target: 'bun',
      format: 'esm',
      outdir: outDir,
      naming: 'aot-routes.[ext]',
      external: ['@vertz/ui-server', '@vertz/ui', '@vertz/ui/internals'],
      define: { 'process.env.NODE_ENV': '"production"' },
    });

    expect(result.success).toBe(true);

    const output = readFileSync(join(outDir, 'aot-routes.js'), 'utf-8');
    expect(output).not.toContain('react/jsx-runtime');
    expect(output).not.toContain('react/jsx-dev-runtime');
    expect(output).toContain('__ssr_HomePage');
  });
});
