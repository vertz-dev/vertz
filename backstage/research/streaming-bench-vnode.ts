/**
 * VNode Rendering Benchmark
 *
 * Simulates the actual VNode tree walking + serialization that renderToStream does,
 * comparing generator vs WebStream vs string approaches at the rendering level
 * (not just chunk transport).
 *
 * This measures the real overhead: tree walk + HTML serialization + streaming transport.
 */

// ---------------------------------------------------------------------------
// Minimal VNode types (matching Vertz)
// ---------------------------------------------------------------------------

interface VNode {
  tag: string;
  attrs: Record<string, string>;
  children: (VNode | string)[];
}

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const encoder = new TextEncoder();
function encodeChunk(html: string): Uint8Array {
  return encoder.encode(html);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Generate a realistic VNode tree
// ---------------------------------------------------------------------------

function createTodoApp(itemCount: number): VNode {
  const items: VNode[] = [];
  for (let i = 0; i < itemCount; i++) {
    const completed = i % 3 === 0;
    items.push({
      tag: 'li',
      attrs: { class: `todo-item${completed ? ' completed' : ''}`, 'data-id': String(i) },
      children: [
        {
          tag: 'input',
          attrs: { type: 'checkbox', ...(completed ? { checked: '' } : {}) },
          children: [],
        },
        {
          tag: 'span',
          attrs: { class: 'todo-text' },
          children: [`Todo item number ${i} with some realistic content`],
        },
        {
          tag: 'button',
          attrs: { class: 'delete', 'aria-label': `Delete todo ${i}` },
          children: ['\u00d7'],
        },
      ],
    });
  }

  return {
    tag: 'div',
    attrs: { id: 'app', class: 'app' },
    children: [
      {
        tag: 'header',
        attrs: {},
        children: [{ tag: 'h1', attrs: {}, children: ['My Todos'] }],
      },
      {
        tag: 'form',
        attrs: { class: 'new-todo' },
        children: [
          { tag: 'input', attrs: { name: 'title', placeholder: 'What needs to be done?' }, children: [] },
          { tag: 'button', attrs: { type: 'submit' }, children: ['Add'] },
        ],
      },
      { tag: 'ul', attrs: { class: 'todo-list' }, children: items },
      {
        tag: 'footer',
        attrs: { class: 'info' },
        children: [
          { tag: 'span', attrs: {}, children: [`${itemCount} items`] },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Strategy 1: String concatenation walk (current renderToStream uses this internally)
// ---------------------------------------------------------------------------

function walkToString(node: VNode | string): string {
  if (typeof node === 'string') return escapeHtml(node);

  const { tag, attrs, children } = node;
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');

  if (VOID_ELEMENTS.has(tag)) return `<${tag}${attrStr}>`;

  const childrenHtml = children.map((child) => walkToString(child)).join('');
  return `<${tag}${attrStr}>${childrenHtml}</${tag}>`;
}

// ---------------------------------------------------------------------------
// Strategy 2: Current Vertz — walk to string, then WebStream
// ---------------------------------------------------------------------------

function currentRenderToStream(tree: VNode): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const html = walkToString(tree);
      controller.enqueue(encodeChunk(html));
      controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// Strategy 3: Generator that yields per-element (fine-grained streaming)
// ---------------------------------------------------------------------------

function* walkToChunks(node: VNode | string): Generator<string> {
  if (typeof node === 'string') {
    yield escapeHtml(node);
    return;
  }

  const { tag, attrs, children } = node;
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');

  if (VOID_ELEMENTS.has(tag)) {
    yield `<${tag}${attrStr}>`;
    return;
  }

  yield `<${tag}${attrStr}>`;
  for (const child of children) {
    yield* walkToChunks(child);
  }
  yield `</${tag}>`;
}

function generatorRenderToStream(tree: VNode): ReadableStream<Uint8Array> {
  const gen = walkToChunks(tree);
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const { done, value } = gen.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(encodeChunk(value));
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Strategy 4: Generator with batching — yield per-element, batch into chunks
// ---------------------------------------------------------------------------

function batchedGeneratorRenderToStream(
  tree: VNode,
  batchSize: number,
): ReadableStream<Uint8Array> {
  const gen = walkToChunks(tree);
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      let buffer = '';
      let count = 0;
      while (count < batchSize) {
        const { done, value } = gen.next();
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
// Strategy 5: Walk to string, no WebStream wrapping at all
// ---------------------------------------------------------------------------

// Just returns string — measures pure serialization cost
function pureStringRender(tree: VNode): string {
  return walkToString(tree);
}

// ---------------------------------------------------------------------------
// Strategy 6: Walk to string, then Response (what Bun actually needs)
// ---------------------------------------------------------------------------

function stringToResponse(tree: VNode): Response {
  const html = walkToString(tree);
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
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

async function drainResponse(response: Response): Promise<number> {
  const text = await response.text();
  return text.length;
}

interface BenchResult {
  name: string;
  avgMs: number;
  minMs: number;
  p95Ms: number;
}

async function runBench(
  name: string,
  fn: () => Promise<number> | number,
  warmup: number,
  iterations: number,
): Promise<BenchResult> {
  for (let i = 0; i < warmup; i++) await fn();

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
    p95Ms: times[Math.floor(times.length * 0.95)],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const WARMUP = 10;
const ITERATIONS = 100;

const pageSizes = [
  { items: 20, label: 'Small (20 todos)' },
  { items: 100, label: 'Medium (100 todos)' },
  { items: 500, label: 'Large (500 todos)' },
  { items: 2000, label: 'XL (2000 todos)' },
];

console.log('=== VNode Rendering Pipeline Benchmark ===\n');
console.log(`Warmup: ${WARMUP}, Measured: ${ITERATIONS}\n`);

for (const page of pageSizes) {
  const tree = createTodoApp(page.items);
  const sampleHtml = walkToString(tree);

  console.log(
    `--- ${page.label} (~${(sampleHtml.length / 1024).toFixed(1)} KB HTML) ---`,
  );

  const r1 = await runBench(
    'Pure string (no stream)',
    () => pureStringRender(tree).length,
    WARMUP,
    ITERATIONS,
  );

  const r2 = await runBench(
    'String → Response',
    () => drainResponse(stringToResponse(tree)),
    WARMUP,
    ITERATIONS,
  );

  const r3 = await runBench(
    'String → WebStream (current)',
    () => drainStream(currentRenderToStream(tree)),
    WARMUP,
    ITERATIONS,
  );

  const r4 = await runBench(
    'Generator → WebStream',
    () => drainStream(generatorRenderToStream(tree)),
    WARMUP,
    ITERATIONS,
  );

  const r5 = await runBench(
    'Generator batched x50 → WS',
    () => drainStream(batchedGeneratorRenderToStream(tree, 50)),
    WARMUP,
    ITERATIONS,
  );

  const r6 = await runBench(
    'Generator batched x200 → WS',
    () => drainStream(batchedGeneratorRenderToStream(tree, 200)),
    WARMUP,
    ITERATIONS,
  );

  const results = [r1, r2, r3, r4, r5, r6];
  const baseline = r1.avgMs;

  for (const r of results) {
    const ratio = r.avgMs / baseline;
    const ratioStr = ratio < 1.1 ? '~1x' : `${ratio.toFixed(1)}x`;
    console.log(
      `  ${r.name.padEnd(32)} ` +
      `avg: ${r.avgMs.toFixed(3).padStart(8)}ms  ` +
      `p95: ${r.p95Ms.toFixed(3).padStart(8)}ms  ` +
      `(${ratioStr})`,
    );
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Key question: Does Bun's Response(string) avoid the encode/decode roundtrip?
// ---------------------------------------------------------------------------

console.log('=== Bun Response Optimization Check ===\n');
console.log('Does Response(string) avoid ReadableStream overhead?\n');

const tree = createTodoApp(500);
const html = walkToString(tree);

const rString = await runBench(
  'new Response(string)',
  async () => {
    const resp = new Response(html, { headers: { 'content-type': 'text/html' } });
    return (await resp.text()).length;
  },
  WARMUP,
  ITERATIONS,
);

const rStream = await runBench(
  'new Response(ReadableStream)',
  async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeChunk(html));
        controller.close();
      },
    });
    const resp = new Response(stream, { headers: { 'content-type': 'text/html' } });
    return (await resp.text()).length;
  },
  WARMUP,
  ITERATIONS,
);

console.log(`  Response(string):          avg: ${rString.avgMs.toFixed(3)}ms`);
console.log(`  Response(ReadableStream):  avg: ${rStream.avgMs.toFixed(3)}ms`);
console.log(`  Ratio: ${(rStream.avgMs / rString.avgMs).toFixed(1)}x overhead for ReadableStream`);
