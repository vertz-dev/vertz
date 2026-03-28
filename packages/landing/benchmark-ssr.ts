/**
 * Benchmark: Landing page SSR — Two-pass vs Discovery vs Zero-discovery
 *
 * Measures real HTTP response times against the running dev server,
 * then compares the three rendering paths.
 *
 * Run: bun run packages/landing/benchmark-ssr.ts
 * (requires dev server running on port 4000)
 */

const PORT = Number(process.env.PORT) || 4000;
const BASE = `http://localhost:${PORT}`;
const ITERATIONS = 100;
const WARMUP = 10;

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

async function benchmarkUrl(name: string, url: string, iterations: number): Promise<BenchmarkResult> {
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    await fetch(url);
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const res = await fetch(url);
    await res.text(); // consume body
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
  console.log(`    avg: ${r.avgMs}ms | p50: ${r.p50Ms}ms | p95: ${r.p95Ms}ms | p99: ${r.p99Ms}ms`);
  console.log(`    min: ${r.minMs}ms | max: ${r.maxMs}ms (${r.iterations} runs)`);
}

async function main() {
  // Verify server is running
  try {
    await fetch(BASE);
  } catch {
    console.error(`Dev server not running at ${BASE}. Start it with: cd sites/landing && bun run dev`);
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Landing Page SSR Benchmark (HTTP, end-to-end)');
  console.log(`  ${ITERATIONS} iterations, ${WARMUP} warmup, server at ${BASE}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // Benchmark the home page
  console.log('');
  console.log('─── Home Page (/) ───');
  const home = await benchmarkUrl('GET /', BASE + '/', ITERATIONS);
  printResult(home);

  // Benchmark the manifesto page
  console.log('');
  console.log('─── Manifesto Page (/manifesto) ───');
  const manifesto = await benchmarkUrl('GET /manifesto', BASE + '/manifesto', ITERATIONS);
  printResult(manifesto);

  // Get response size for context
  const homeRes = await fetch(BASE + '/');
  const homeHtml = await homeRes.text();
  const manifestoRes = await fetch(BASE + '/manifesto');
  const manifestoHtml = await manifestoRes.text();

  console.log('');
  console.log('─── Response Sizes ───');
  console.log(`  Home:      ${(homeHtml.length / 1024).toFixed(1)} KB`);
  console.log(`  Manifesto: ${(manifestoHtml.length / 1024).toFixed(1)} KB`);

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Page          avg       p50       p95       Size');
  console.log('  ────────────  ────────  ────────  ────────  ────────');
  console.log(`  Home          ${home.avgMs}ms`.padEnd(24) + `${home.p50Ms}ms`.padEnd(10) + `${home.p95Ms}ms`.padEnd(10) + `${(homeHtml.length / 1024).toFixed(1)} KB`);
  console.log(`  Manifesto     ${manifesto.avgMs}ms`.padEnd(24) + `${manifesto.p50Ms}ms`.padEnd(10) + `${manifesto.p95Ms}ms`.padEnd(10) + `${(manifestoHtml.length / 1024).toFixed(1)} KB`);
  console.log('');
  console.log('  Note: The landing page has NO data queries — it is fully static.');
  console.log('  The zero-discovery optimization targets pages with query() calls.');
  console.log('  These numbers represent the baseline SSR cost (component tree + HTML serialization).');
  console.log('');
}

main().catch(console.error);
