/**
 * Phase 6: Benchmark — native build-time transforms vs ts-morph.
 *
 * Individual transforms that use ts-morph (route splitting, AOT SSR) must be ≥ 10x faster.
 * Field selection and prefetch manifest TS implementations are lightweight JS (no ts-morph),
 * so individual comparisons are not meaningful. Instead, we benchmark the combined pipeline:
 * a single native compile() with all flags vs running all TS functions separately.
 */

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

import {
  compileForSSRAot as tsCompileForSSRAot,
  transformRouteSplitting as tsTransformRouteSplitting,
  analyzeFieldSelection as tsAnalyzeFieldSelection,
  extractRoutes as tsExtractRoutes,
  analyzeComponentQueries as tsAnalyzeComponentQueries,
} from '@vertz/ui-compiler';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

function loadNativeCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compile: (
      source: string,
      options?: Record<string, unknown>,
    ) => { code: string };
    compileForSsrAot: (
      source: string,
      options?: { filename?: string },
    ) => { code: string; components: unknown[] };
  };
}

function bench(fn: () => void, iterations: number): number {
  // Warmup
  for (let i = 0; i < 3; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  return elapsed / iterations;
}

// ── Fixtures ──────────────────────────────────────────────────────

const ROUTE_SOURCE = `
import { defineRoutes } from '@vertz/ui';
import { HomePage } from './pages/home-page';
import { SettingsPage } from './pages/settings';
import { ProfilePage } from './pages/profile';
import { DashboardPage } from './pages/dashboard';

export const routes = defineRoutes({
  '/': { component: () => <HomePage /> },
  '/settings': { component: () => <SettingsPage /> },
  '/profile': { component: () => <ProfilePage /> },
  '/dashboard': { component: () => <DashboardPage /> },
});
`.trim();

const FIELD_SELECTION_SOURCE = `
import { query } from '@vertz/ui';

function TaskBoard() {
  const tasks = query(() => api.task.list());
  const projects = query(() => api.project.list());
  return (
    <div>
      {tasks.data?.map(t => (
        <div>
          <span>{t.title}</span>
          <span>{t.status}</span>
          <span>{t.assignee.name}</span>
        </div>
      ))}
      {projects.data?.map(p => <span>{p.name}</span>)}
    </div>
  );
}
`.trim();

const AOT_SOURCE = `
function TaskCard({ task }: { task: { title: string; status: string; done: boolean } }) {
  return (
    <div class="card">
      <h3>{task.title}</h3>
      <span class="status">{task.status}</span>
      {task.done ? <span class="done">Done</span> : <span class="pending">Pending</span>}
    </div>
  );
}

function Page({ loading, items }: { loading: boolean; items: Array<{ id: string; name: string }> }) {
  if (loading) return <div class="spinner">Loading...</div>;
  return (
    <div class="page">
      <h1>Items</h1>
      <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>
    </div>
  );
}
`.trim();

// Combined source for pipeline benchmark
const COMBINED_SOURCE = `
import { defineRoutes, query } from '@vertz/ui';
import { HomePage } from './pages/home-page';
import { SettingsPage } from './pages/settings';

function TaskBoard() {
  const tasks = query(() => api.task.list());
  return (
    <div>
      {tasks.data?.map(t => (
        <div><span>{t.title}</span><span>{t.status}</span></div>
      ))}
    </div>
  );
}

export const routes = defineRoutes({
  '/': { component: () => <HomePage /> },
  '/settings': { component: () => <SettingsPage /> },
});
`.trim();

// ── Benchmarks ────────────────────────────────────────────────────

const ITERATIONS = 100;

describe('Build-time transform benchmarks (native vs ts-morph)', () => {
  it('Route splitting: native ≥ 10x faster', () => {
    const { compile } = loadNativeCompiler();

    const tsAvg = bench(
      () => tsTransformRouteSplitting(ROUTE_SOURCE, 'router.tsx'),
      ITERATIONS,
    );
    const nativeAvg = bench(
      () =>
        compile(ROUTE_SOURCE, {
          filename: 'router.tsx',
          routeSplitting: true,
        }),
      ITERATIONS,
    );

    const speedup = tsAvg / nativeAvg;
    console.log(`\n  Route splitting (${ITERATIONS} iterations):`);
    console.log(`    ts-morph:  ${tsAvg.toFixed(2)}ms avg`);
    console.log(`    native:    ${nativeAvg.toFixed(2)}ms avg`);
    console.log(`    speedup:   ${speedup.toFixed(1)}x\n`);

    expect(speedup).toBeGreaterThanOrEqual(10);
  });

  it('AOT SSR: native ≥ 10x faster', () => {
    const { compileForSsrAot } = loadNativeCompiler();

    const tsAvg = bench(
      () => tsCompileForSSRAot(AOT_SOURCE, 'page.tsx'),
      ITERATIONS,
    );
    const nativeAvg = bench(
      () => compileForSsrAot(AOT_SOURCE, { filename: 'page.tsx' }),
      ITERATIONS,
    );

    const speedup = tsAvg / nativeAvg;
    console.log(`\n  AOT SSR (${ITERATIONS} iterations):`);
    console.log(`    ts-morph:  ${tsAvg.toFixed(2)}ms avg`);
    console.log(`    native:    ${nativeAvg.toFixed(2)}ms avg`);
    console.log(`    speedup:   ${speedup.toFixed(1)}x\n`);

    expect(speedup).toBeGreaterThanOrEqual(10);
  });

  it('Combined pipeline: native compile() with all flags vs separate TS calls', () => {
    const { compile } = loadNativeCompiler();

    // TS pipeline: run all separate functions
    const tsAvg = bench(() => {
      tsTransformRouteSplitting(COMBINED_SOURCE, 'app.tsx');
      tsAnalyzeFieldSelection(COMBINED_SOURCE, 'app.tsx');
      tsExtractRoutes(COMBINED_SOURCE, 'app.tsx');
      tsAnalyzeComponentQueries(COMBINED_SOURCE, 'app.tsx');
    }, ITERATIONS);

    // Native: single compile() with all build-time flags
    const nativeAvg = bench(
      () =>
        compile(COMBINED_SOURCE, {
          filename: 'app.tsx',
          routeSplitting: true,
          fieldSelection: true,
          prefetchManifest: true,
          hydrationMarkers: true,
        }),
      ITERATIONS,
    );

    const speedup = tsAvg / nativeAvg;
    console.log(`\n  Combined pipeline (${ITERATIONS} iterations):`);
    console.log(`    TS (all calls): ${tsAvg.toFixed(2)}ms avg`);
    console.log(`    native:         ${nativeAvg.toFixed(2)}ms avg`);
    console.log(`    speedup:        ${speedup.toFixed(1)}x\n`);

    expect(speedup).toBeGreaterThanOrEqual(5);
  });

  it('Native sub-millisecond: all build-time transforms complete under 0.5ms', () => {
    const { compile, compileForSsrAot } = loadNativeCompiler();

    const routeAvg = bench(
      () => compile(ROUTE_SOURCE, { filename: 'r.tsx', routeSplitting: true }),
      ITERATIONS,
    );
    const fieldAvg = bench(
      () =>
        compile(FIELD_SELECTION_SOURCE, {
          filename: 'f.tsx',
          fieldSelection: true,
        }),
      ITERATIONS,
    );
    const prefetchAvg = bench(
      () =>
        compile(ROUTE_SOURCE, {
          filename: 'r.tsx',
          prefetchManifest: true,
        }),
      ITERATIONS,
    );
    const aotAvg = bench(
      () => compileForSsrAot(AOT_SOURCE, { filename: 'p.tsx' }),
      ITERATIONS,
    );

    console.log(`\n  Native absolute times (${ITERATIONS} iterations):`);
    console.log(`    Route splitting:  ${routeAvg.toFixed(3)}ms`);
    console.log(`    Field selection:  ${fieldAvg.toFixed(3)}ms`);
    console.log(`    Prefetch:         ${prefetchAvg.toFixed(3)}ms`);
    console.log(`    AOT SSR:          ${aotAvg.toFixed(3)}ms\n`);

    // All transforms should complete in under 0.5ms per file
    expect(routeAvg).toBeLessThan(0.5);
    expect(fieldAvg).toBeLessThan(0.5);
    expect(prefetchAvg).toBeLessThan(0.5);
    expect(aotAvg).toBeLessThan(0.5);
  });
});
