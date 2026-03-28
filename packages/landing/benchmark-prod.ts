/**
 * Benchmark: Production landing page (vertz.dev)
 *
 * Measures real HTTP response times against the production Cloudflare Worker.
 * Run this BEFORE and AFTER deploying the new version to compare.
 *
 * Run: bun run packages/landing/benchmark-prod.ts
 */

const BASE = 'https://vertz.dev';
const ITERATIONS = 50;
const WARMUP = 5;

interface BenchmarkResult {
  name: string;
  iterations: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  statusCode: number;
  sizeKB: number;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

async function benchmarkUrl(
  name: string,
  url: string,
  iterations: number,
): Promise<BenchmarkResult> {
  let statusCode = 0;
  let sizeKB = 0;

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    const res = await fetch(url);
    await res.text();
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const res = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'VertzBenchmark/1.0',
        'Cache-Control': 'no-cache',
      },
    });
    const body = await res.text();
    times.push(performance.now() - start);

    if (i === 0) {
      statusCode = res.status;
      sizeKB = round(body.length / 1024);
    }
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
    statusCode,
    sizeKB,
  };
}

function printResult(r: BenchmarkResult): void {
  console.log(`  ${r.name} (${r.statusCode}, ${r.sizeKB} KB)`);
  console.log(
    `    avg: ${r.avgMs}ms | p50: ${r.p50Ms}ms | p95: ${r.p95Ms}ms | p99: ${r.p99Ms}ms`,
  );
  console.log(`    min: ${r.minMs}ms | max: ${r.maxMs}ms (${r.iterations} runs)`);
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Production Benchmark — vertz.dev (Cloudflare Worker)');
  console.log(`  ${ITERATIONS} iterations, ${WARMUP} warmup`);
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════');

  const pages = [
    { name: 'Home', url: `${BASE}/` },
    { name: 'Manifesto', url: `${BASE}/manifesto` },
  ];

  const results: BenchmarkResult[] = [];

  for (const { name, url } of pages) {
    console.log('');
    console.log(`─── ${name} (${url}) ───`);
    const result = await benchmarkUrl(`GET ${url}`, url, ITERATIONS);
    printResult(result);
    results.push(result);
  }

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(
    '  Page          Status  Size      avg       p50       p95       min',
  );
  console.log(
    '  ────────────  ──────  ────────  ────────  ────────  ────────  ────────',
  );

  for (const r of results) {
    const name = r.name.replace(/^GET https:\/\/vertz\.dev/, '').padEnd(14);
    console.log(
      `  ${name}${String(r.statusCode).padEnd(8)}${`${r.sizeKB} KB`.padEnd(10)}${`${r.avgMs}ms`.padEnd(10)}${`${r.p50Ms}ms`.padEnd(10)}${`${r.p95Ms}ms`.padEnd(10)}${r.minMs}ms`,
    );
  }

  console.log('');
  console.log('  Note: These times include network latency (client → Cloudflare edge → Worker → response).');
  console.log('  Compare these numbers after deploying the new version to measure real-world impact.');
  console.log('');
}

main().catch(console.error);
