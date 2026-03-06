/**
 * Streaming Primitives Micro-Benchmark
 *
 * Compares four approaches for producing HTML-like output:
 * 1. String concatenation (baseline — no streaming overhead)
 * 2. Web Streams ReadableStream with per-chunk encode/enqueue
 * 3. Async generator producing strings, consumed with for-await
 * 4. Async generator → ReadableStream.from() (generator internally, stream externally)
 *
 * Simulates SSR workload: many small HTML fragments concatenated into a response.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function encodeChunk(html: string): Uint8Array {
  return encoder.encode(html);
}

/** Generate N HTML fragments of ~size bytes each. */
function generateFragments(count: number, size: number): string[] {
  const base = '<div class="item">'.padEnd(size - 6, 'x') + '</div>';
  return Array.from({ length: count }, (_, i) => base.replace('item', `item-${i}`));
}

/** Consume a ReadableStream to completion, return total bytes. */
async function drainStream(stream: ReadableStream<Uint8Array>): Promise<number> {
  const reader = stream.getReader();
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
  }
  return totalBytes;
}

/** Consume an async iterable to completion, return total chars. */
async function drainAsyncIterable(iter: AsyncIterable<string>): Promise<number> {
  let totalChars = 0;
  for await (const chunk of iter) {
    totalChars += chunk.length;
  }
  return totalChars;
}

/** Wrap an async string generator into a ReadableStream<Uint8Array>. */
function generatorToStream(gen: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await gen.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(encodeChunk(value));
      }
    },
  });
}

/** Consume an async generator wrapped in ReadableStream, return total bytes. */
async function drainGeneratorViaStream(
  gen: AsyncGenerator<string>,
): Promise<number> {
  return drainStream(generatorToStream(gen));
}

// ---------------------------------------------------------------------------
// Benchmark strategies
// ---------------------------------------------------------------------------

/** 1. String concatenation — baseline */
function benchStringConcat(fragments: string[]): string {
  let result = '';
  for (const frag of fragments) {
    result += frag;
  }
  return result;
}

/** 2. Web Streams ReadableStream — current Vertz approach */
function benchWebStream(fragments: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frag of fragments) {
        controller.enqueue(encodeChunk(frag));
      }
      controller.close();
    },
  });
}

/** 3. Async generator — proposed alternative */
async function* benchAsyncGenerator(fragments: string[]): AsyncGenerator<string> {
  for (const frag of fragments) {
    yield frag;
  }
}

/**
 * 4. Web Streams with batched encoding — optimization.
 *    Concatenates N fragments before encoding, reducing per-chunk overhead.
 */
function benchWebStreamBatched(
  fragments: string[],
  batchSize: number,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let buffer = '';
      let count = 0;
      for (const frag of fragments) {
        buffer += frag;
        count++;
        if (count >= batchSize) {
          controller.enqueue(encodeChunk(buffer));
          buffer = '';
          count = 0;
        }
      }
      if (buffer) {
        controller.enqueue(encodeChunk(buffer));
      }
      controller.close();
    },
  });
}

/**
 * 5. Double-pipe Web Streams — simulates renderPage() piping renderToStream()
 *    Inner stream produces chunks, outer stream reads and re-enqueues them.
 */
function benchDoublePipeWebStream(fragments: string[]): ReadableStream<Uint8Array> {
  const inner = benchWebStream(fragments);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // Prefix (like doctype + head)
      controller.enqueue(encodeChunk('<!DOCTYPE html><html><head></head><body>'));

      // Pipe inner stream
      const reader = inner.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }
      reader.releaseLock();

      // Suffix
      controller.enqueue(encodeChunk('</body></html>'));
      controller.close();
    },
  });
}

/**
 * 6. Async generator with wrapping — simulates what a generator-based
 *    renderPage() would look like (yield* inner generator).
 */
async function* benchDoubleGenerator(
  fragments: string[],
): AsyncGenerator<string> {
  yield '<!DOCTYPE html><html><head></head><body>';
  yield* benchAsyncGenerator(fragments);
  yield '</body></html>';
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface BenchResult {
  name: string;
  chunkCount: number;
  chunkSize: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
  throughputMBps: number;
}

async function runBench(
  name: string,
  fn: () => Promise<number> | number,
  totalBytes: number,
  warmup: number,
  iterations: number,
): Promise<BenchResult & { chunkCount: number; chunkSize: number }> {
  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);

  return {
    name,
    chunkCount: 0,
    chunkSize: 0,
    avgMs,
    minMs,
    maxMs,
    opsPerSec: 1000 / avgMs,
    throughputMBps: (totalBytes / (1024 * 1024)) / (avgMs / 1000),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const WARMUP = 5;
const ITERATIONS = 50;

const scenarios: Array<{ count: number; size: number; label: string }> = [
  { count: 100, size: 100, label: 'SSR small page (100 x 100B)' },
  { count: 1000, size: 100, label: 'SSR medium page (1K x 100B)' },
  { count: 5000, size: 100, label: 'SSR large page (5K x 100B)' },
  { count: 1000, size: 1024, label: 'SSR medium chunks (1K x 1KB)' },
  { count: 100, size: 10240, label: 'SSR large chunks (100 x 10KB)' },
];

console.log('=== Vertz SSR Streaming Benchmark ===\n');
console.log(`Warmup: ${WARMUP} iterations, Measured: ${ITERATIONS} iterations\n`);

const allResults: BenchResult[] = [];

for (const scenario of scenarios) {
  const fragments = generateFragments(scenario.count, scenario.size);
  const totalBytes = fragments.reduce((sum, f) => sum + f.length, 0);

  console.log(`--- ${scenario.label} (${(totalBytes / 1024).toFixed(1)} KB total) ---`);

  const results = await Promise.all([
    // We need to run sequentially to avoid GC interference
  ]);

  // 1. String concatenation baseline
  const r1 = await runBench(
    'String concat',
    () => {
      const result = benchStringConcat(fragments);
      return result.length;
    },
    totalBytes,
    WARMUP,
    ITERATIONS,
  );
  r1.chunkCount = scenario.count;
  r1.chunkSize = scenario.size;

  // 2. Web Streams (current approach)
  const r2 = await runBench(
    'WebStream (per-chunk)',
    () => drainStream(benchWebStream(fragments)),
    totalBytes,
    WARMUP,
    ITERATIONS,
  );
  r2.chunkCount = scenario.count;
  r2.chunkSize = scenario.size;

  // 3. Async generator
  const r3 = await runBench(
    'AsyncGenerator',
    () => drainAsyncIterable(benchAsyncGenerator(fragments)),
    totalBytes,
    WARMUP,
    ITERATIONS,
  );
  r3.chunkCount = scenario.count;
  r3.chunkSize = scenario.size;

  // 4. Generator → ReadableStream.from()
  const r4 = await runBench(
    'Generator→Stream.from()',
    () => drainGeneratorViaStream(benchAsyncGenerator(fragments)),
    totalBytes,
    WARMUP,
    ITERATIONS,
  );
  r4.chunkCount = scenario.count;
  r4.chunkSize = scenario.size;

  // 5. Batched WebStream (10 fragments per chunk)
  const r5 = await runBench(
    'WebStream (batched x10)',
    () => drainStream(benchWebStreamBatched(fragments, 10)),
    totalBytes,
    WARMUP,
    ITERATIONS,
  );
  r5.chunkCount = scenario.count;
  r5.chunkSize = scenario.size;

  // 6. Double-pipe WebStream (simulates renderPage piping renderToStream)
  const r6 = await runBench(
    'DoublePipe WebStream',
    () => drainStream(benchDoublePipeWebStream(fragments)),
    totalBytes,
    WARMUP,
    ITERATIONS,
  );
  r6.chunkCount = scenario.count;
  r6.chunkSize = scenario.size;

  // 7. Double generator (yield* composition)
  const r7 = await runBench(
    'DoubleGenerator (yield*)',
    () => drainAsyncIterable(benchDoubleGenerator(fragments)),
    totalBytes,
    WARMUP,
    ITERATIONS,
  );
  r7.chunkCount = scenario.count;
  r7.chunkSize = scenario.size;

  const scenarioResults = [r1, r2, r3, r4, r5, r6, r7];
  allResults.push(...scenarioResults);

  // Print results as table
  const baseline = r1.avgMs;
  for (const r of scenarioResults) {
    const overhead = ((r.avgMs / baseline - 1) * 100).toFixed(0);
    const overheadStr = r.name === 'String concat' ? '(baseline)' : `+${overhead}%`;
    console.log(
      `  ${r.name.padEnd(28)} avg: ${r.avgMs.toFixed(3).padStart(8)}ms  ` +
      `min: ${r.minMs.toFixed(3).padStart(8)}ms  ` +
      `${r.throughputMBps.toFixed(1).padStart(8)} MB/s  ${overheadStr}`,
    );
  }
  console.log();
}

// Summary: overhead comparison for most SSR-like scenario (5K x 100B)
console.log('=== Summary: Overhead vs String Concat ===\n');
const summaryScenario = allResults.filter((r) => r.chunkCount === 5000 && r.chunkSize === 100);
const summaryBaseline = summaryScenario.find((r) => r.name === 'String concat')!;
for (const r of summaryScenario) {
  if (r.name === 'String concat') continue;
  const ratio = r.avgMs / summaryBaseline.avgMs;
  console.log(`  ${r.name.padEnd(28)} ${ratio.toFixed(1)}x slower (${r.avgMs.toFixed(3)}ms vs ${summaryBaseline.avgMs.toFixed(3)}ms)`);
}
