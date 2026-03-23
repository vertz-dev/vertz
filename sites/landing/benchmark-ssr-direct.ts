/**
 * Direct SSR benchmark — isolates rendering time from HTTP overhead.
 *
 * Loads the landing page SSR module via the Vertz compiler plugin,
 * then benchmarks two-pass vs discovery vs zero-discovery directly.
 *
 * Run: bun --preload ./benchmark-plugin.ts run ./benchmark-ssr-direct.ts
 * (from sites/landing/)
 */
import { ssrRenderToString, ssrRenderSinglePass } from '@vertz/ui-server';
import { installDomShim } from '@vertz/ui-server/dom-shim';

installDomShim();

// Import the landing page app as an SSR module
const ssrMod = await import('./src/app.tsx');

// ─── Benchmark helpers ─────────────────────────────────────────

interface BenchmarkResult {
  name: string;
  iterations: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

async function benchmark(
  name: string,
  fn: () => Promise<unknown>,
  iterations: number,
): Promise<BenchmarkResult> {
  // Warmup
  for (let i = 0; i < 10; i++) {
    await fn();
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const total = times.reduce((a, b) => a + b, 0);

  return {
    name,
    iterations,
    avgMs: round(total / iterations),
    p50Ms: round(times[Math.floor(times.length * 0.5)]!),
    p95Ms: round(times[Math.floor(times.length * 0.95)]!),
    p99Ms: round(times[Math.floor(times.length * 0.99)]!),
    minMs: round(times[0]!),
    maxMs: round(times[times.length - 1]!),
  };
}

function printResult(r: BenchmarkResult): void {
  console.log(`  ${r.name}`);
  console.log(
    `    avg: ${r.avgMs}ms | p50: ${r.p50Ms}ms | p95: ${r.p95Ms}ms | p99: ${r.p99Ms}ms`,
  );
  console.log(`    min: ${r.minMs}ms | max: ${r.maxMs}ms (${r.iterations} runs)`);
}

// ─── Run ───────────────────────────────────────────────────────

const ITERATIONS = 200;

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  Landing Page — Direct SSR Benchmark (no HTTP overhead)');
  console.log(`  ${ITERATIONS} iterations, 10 warmup, rendering / (home page)`);
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get HTML size for reference
  const ref = await ssrRenderToString(ssrMod, '/');
  console.log(`  HTML size: ${(ref.html.length / 1024).toFixed(1)} KB`);
  console.log(`  CSS size:  ${(ref.css.length / 1024).toFixed(1)} KB`);
  console.log('');

  // 1. Two-pass (ssrRenderToString)
  const twoPass = await benchmark(
    'Two-pass (ssrRenderToString)',
    () => ssrRenderToString(ssrMod, '/'),
    ITERATIONS,
  );
  printResult(twoPass);

  // 2. Discovery-based single-pass (no manifest)
  const discovery = await benchmark(
    'Discovery single-pass (no manifest)',
    () => ssrRenderSinglePass(ssrMod, '/'),
    ITERATIONS,
  );
  printResult(discovery);

  // 3. Zero-discovery single-pass (with manifest, empty queries for static page)
  const manifest = {
    routePatterns: ['/', '/manifesto'],
    routeEntries: {
      '/': { queries: [] },
      '/manifesto': { queries: [] },
    },
  };
  const zeroDisc = await benchmark(
    'Zero-discovery single-pass (with manifest)',
    () => ssrRenderSinglePass(ssrMod, '/', { manifest }),
    ITERATIONS,
  );
  printResult(zeroDisc);

  // Comparisons
  console.log('');
  console.log('─── Comparisons ───');
  const discVsTp = ((1 - discovery.avgMs / twoPass.avgMs) * 100).toFixed(1);
  const zdVsTp = ((1 - zeroDisc.avgMs / twoPass.avgMs) * 100).toFixed(1);
  const zdVsDisc = ((1 - zeroDisc.avgMs / discovery.avgMs) * 100).toFixed(1);

  console.log(
    `  Discovery vs Two-pass:       ${discVsTp}% (${(twoPass.avgMs / discovery.avgMs).toFixed(2)}x)`,
  );
  console.log(
    `  Zero-disc vs Two-pass:       ${zdVsTp}% (${(twoPass.avgMs / zeroDisc.avgMs).toFixed(2)}x)`,
  );
  console.log(
    `  Zero-disc vs Discovery:      ${zdVsDisc}% (${(discovery.avgMs / zeroDisc.avgMs).toFixed(2)}x)`,
  );

  // Summary table
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(
    '  Approach                          avg       p50       p95       vs Two-pass',
  );
  console.log(
    '  ────────────────────────────────  ────────  ────────  ────────  ───────────',
  );
  console.log(
    `  Two-pass                          ${`${twoPass.avgMs}ms`.padEnd(10)}${`${twoPass.p50Ms}ms`.padEnd(10)}${`${twoPass.p95Ms}ms`.padEnd(10)}baseline`,
  );
  console.log(
    `  Discovery single-pass             ${`${discovery.avgMs}ms`.padEnd(10)}${`${discovery.p50Ms}ms`.padEnd(10)}${`${discovery.p95Ms}ms`.padEnd(10)}${discVsTp}%`,
  );
  console.log(
    `  Zero-discovery single-pass        ${`${zeroDisc.avgMs}ms`.padEnd(10)}${`${zeroDisc.p50Ms}ms`.padEnd(10)}${`${zeroDisc.p95Ms}ms`.padEnd(10)}${zdVsTp}%`,
  );
  console.log('');
}

main().catch(console.error);
