/**
 * Realistic SSR Streaming Benchmark
 *
 * Simulates the actual Vertz SSR pipeline:
 * - renderToStream() produces component HTML chunks
 * - renderPage() wraps in a full HTML document (double-pipe)
 * - Consumer drains the response
 *
 * Compares:
 * 1. Current approach: WebStream → WebStream double-pipe
 * 2. Generator internal + WebStream output (hybrid)
 * 3. Generator internal + string concat output (non-streaming fast path)
 * 4. Single-pass string concat (theoretical best)
 */

const encoder = new TextEncoder();
function encodeChunk(html: string): Uint8Array {
  return encoder.encode(html);
}

// ---------------------------------------------------------------------------
// Simulate realistic SSR fragments
// ---------------------------------------------------------------------------

/** Simulate a todo-list app with N items */
function generateTodoAppFragments(itemCount: number): {
  headHtml: string;
  componentFragments: string[];
  scripts: string;
} {
  const headHtml = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Todo App</title>',
    '<style>body { margin: 0; font-family: sans-serif; }</style>',
    '<style>.app { max-width: 600px; margin: 0 auto; padding: 20px; }</style>',
    '<style>.todo-item { padding: 12px; border-bottom: 1px solid #eee; display: flex; align-items: center; }</style>',
    '<style>.todo-item.completed { opacity: 0.6; text-decoration: line-through; }</style>',
  ].join('\n');

  const componentFragments: string[] = [];

  // App shell
  componentFragments.push('<div id="app" class="app">');
  componentFragments.push('<header><h1>My Todos</h1></header>');
  componentFragments.push('<form class="new-todo"><input name="title" placeholder="What needs to be done?"><button type="submit">Add</button></form>');

  // Filter bar
  componentFragments.push('<nav class="filters"><button class="active">All</button><button>Active</button><button>Completed</button></nav>');

  // Todo list
  componentFragments.push('<ul class="todo-list">');
  for (let i = 0; i < itemCount; i++) {
    const completed = i % 3 === 0;
    componentFragments.push(
      `<li class="todo-item${completed ? ' completed' : ''}" data-id="${i}">` +
      `<input type="checkbox"${completed ? ' checked' : ''}>` +
      `<span class="todo-text">Todo item number ${i} with some realistic content</span>` +
      `<button class="delete" aria-label="Delete todo ${i}">×</button>` +
      '</li>',
    );
  }
  componentFragments.push('</ul>');

  // Footer
  componentFragments.push(`<footer class="info"><span>${itemCount} items</span></footer>`);
  componentFragments.push('</div>');

  const scripts = '<script type="module" src="/app.js"></script>';

  return { headHtml, componentFragments, scripts };
}

// ---------------------------------------------------------------------------
// Strategy 1: Current Vertz approach (double-pipe WebStreams)
// ---------------------------------------------------------------------------

function currentApproach(
  headHtml: string,
  componentFragments: string[],
  scripts: string,
): ReadableStream<Uint8Array> {
  // Inner: renderToStream equivalent
  const inner = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frag of componentFragments) {
        controller.enqueue(encodeChunk(frag));
      }
      controller.close();
    },
  });

  // Outer: renderPage equivalent
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encodeChunk('<!DOCTYPE html>\n'));
      controller.enqueue(encodeChunk('<html lang="en">\n'));
      controller.enqueue(encodeChunk('<head>\n'));
      controller.enqueue(encodeChunk(headHtml));
      controller.enqueue(encodeChunk('\n</head>\n'));
      controller.enqueue(encodeChunk('<body>\n'));

      const reader = inner.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }
      reader.releaseLock();

      controller.enqueue(encodeChunk(scripts));
      controller.enqueue(encodeChunk('\n</body>\n'));
      controller.enqueue(encodeChunk('</html>'));
      controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// Strategy 2: Single WebStream (no double-pipe)
// ---------------------------------------------------------------------------

function singleStreamApproach(
  headHtml: string,
  componentFragments: string[],
  scripts: string,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeChunk(`<!DOCTYPE html>\n<html lang="en">\n<head>\n${headHtml}\n</head>\n<body>\n`));
      for (const frag of componentFragments) {
        controller.enqueue(encodeChunk(frag));
      }
      controller.enqueue(encodeChunk(`${scripts}\n</body>\n</html>`));
      controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// Strategy 3: Generator internal, WebStream output (hybrid)
// ---------------------------------------------------------------------------

async function* generatorRender(
  headHtml: string,
  componentFragments: string[],
  scripts: string,
): AsyncGenerator<string> {
  yield `<!DOCTYPE html>\n<html lang="en">\n<head>\n${headHtml}\n</head>\n<body>\n`;
  for (const frag of componentFragments) {
    yield frag;
  }
  yield `${scripts}\n</body>\n</html>`;
}

function hybridApproach(
  headHtml: string,
  componentFragments: string[],
  scripts: string,
): ReadableStream<Uint8Array> {
  const gen = generatorRender(headHtml, componentFragments, scripts);
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

// ---------------------------------------------------------------------------
// Strategy 4: Generator internal, batched WebStream output
// ---------------------------------------------------------------------------

function hybridBatchedApproach(
  headHtml: string,
  componentFragments: string[],
  scripts: string,
  batchSize: number,
): ReadableStream<Uint8Array> {
  const gen = generatorRender(headHtml, componentFragments, scripts);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let buffer = '';
      let count = 0;
      while (count < batchSize) {
        const { done, value } = await gen.next();
        if (done) {
          if (buffer) controller.enqueue(encodeChunk(buffer));
          controller.close();
          return;
        }
        buffer += value;
        count++;
      }
      controller.enqueue(encodeChunk(buffer));
    },
  });
}

// ---------------------------------------------------------------------------
// Strategy 5: Non-streaming fast path (string concat)
// ---------------------------------------------------------------------------

function stringConcatApproach(
  headHtml: string,
  componentFragments: string[],
  scripts: string,
): string {
  let html = `<!DOCTYPE html>\n<html lang="en">\n<head>\n${headHtml}\n</head>\n<body>\n`;
  for (const frag of componentFragments) {
    html += frag;
  }
  html += `${scripts}\n</body>\n</html>`;
  return html;
}

// ---------------------------------------------------------------------------
// Strategy 6: Array join (often faster than += for many fragments)
// ---------------------------------------------------------------------------

function arrayJoinApproach(
  headHtml: string,
  componentFragments: string[],
  scripts: string,
): string {
  const parts = [
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n${headHtml}\n</head>\n<body>\n`,
    ...componentFragments,
    `${scripts}\n</body>\n</html>`,
  ];
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

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

interface BenchResult {
  name: string;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
}

async function runBench(
  name: string,
  fn: () => Promise<number> | number,
  warmup: number,
  iterations: number,
): Promise<BenchResult> {
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  return {
    name,
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    minMs: times[0],
    maxMs: times[times.length - 1],
    p95Ms: times[Math.floor(times.length * 0.95)],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const WARMUP = 10;
const ITERATIONS = 100;

const pageSizes = [
  { items: 20, label: 'Small page (20 todos)' },
  { items: 100, label: 'Medium page (100 todos)' },
  { items: 500, label: 'Large page (500 todos)' },
  { items: 2000, label: 'XL page (2000 todos)' },
];

console.log('=== Realistic SSR Pipeline Benchmark ===\n');
console.log(`Warmup: ${WARMUP}, Measured: ${ITERATIONS} iterations\n`);

for (const page of pageSizes) {
  const { headHtml, componentFragments, scripts } = generateTodoAppFragments(page.items);
  const totalChars = headHtml.length +
    componentFragments.reduce((s, f) => s + f.length, 0) +
    scripts.length + 100; // ~100 for wrapper HTML

  console.log(`--- ${page.label} (~${(totalChars / 1024).toFixed(1)} KB, ${componentFragments.length} fragments) ---`);

  const r1 = await runBench(
    'Current (double-pipe WS)',
    () => drainStream(currentApproach(headHtml, componentFragments, scripts)),
    WARMUP,
    ITERATIONS,
  );

  const r2 = await runBench(
    'Single WebStream',
    () => drainStream(singleStreamApproach(headHtml, componentFragments, scripts)),
    WARMUP,
    ITERATIONS,
  );

  const r3 = await runBench(
    'Generator→WebStream',
    () => drainStream(hybridApproach(headHtml, componentFragments, scripts)),
    WARMUP,
    ITERATIONS,
  );

  const r4 = await runBench(
    'Generator→WS batched x20',
    () => drainStream(hybridBatchedApproach(headHtml, componentFragments, scripts, 20)),
    WARMUP,
    ITERATIONS,
  );

  const r5 = await runBench(
    'String concat (no stream)',
    async () => {
      const html = stringConcatApproach(headHtml, componentFragments, scripts);
      return html.length;
    },
    WARMUP,
    ITERATIONS,
  );

  const r6 = await runBench(
    'Array.join (no stream)',
    async () => {
      const html = arrayJoinApproach(headHtml, componentFragments, scripts);
      return html.length;
    },
    WARMUP,
    ITERATIONS,
  );

  const results = [r1, r2, r3, r4, r5, r6];
  const baseline = r5.avgMs; // string concat is the theoretical best

  for (const r of results) {
    const ratio = r.avgMs / baseline;
    const ratioStr = ratio < 1.1 ? '~1x' : `${ratio.toFixed(1)}x`;
    console.log(
      `  ${r.name.padEnd(28)} ` +
      `avg: ${r.avgMs.toFixed(3).padStart(8)}ms  ` +
      `p95: ${r.p95Ms.toFixed(3).padStart(8)}ms  ` +
      `min: ${r.minMs.toFixed(3).padStart(8)}ms  ` +
      `(${ratioStr} vs concat)`,
    );
  }
  console.log();
}
