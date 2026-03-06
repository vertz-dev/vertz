# Research: Next-Gen Streaming Primitives (#789)

**Date:** 2026-03-05
**Context:** James Snell (Cloudflare) published a critique of Web Streams arguing fundamental design flaws, with benchmarks showing 2x–120x overhead. Vercel published `fast-webstreams` showing 10x improvement by reimplementing the same API with fast paths.

## Executive Summary

**Vertz's SSR streaming overhead is minimal in practice.** Our architecture already avoids the worst Web Streams pitfalls through design choices made before this research. The main optimization opportunity is eliminating `renderPage()`'s double-pipe pattern, but the absolute savings are small (~0.1ms for a 500-todo page).

## Benchmark Setup

Three benchmark files, all run on Bun 1.3.9, Apple Silicon:
- `streaming-bench.ts` — micro-benchmark: raw chunk transport overhead
- `streaming-bench-realistic.ts` — simulated todo-app HTML fragments through different transport strategies
- `streaming-bench-vnode.ts` — actual VNode tree walking + serialization + transport

## Key Findings

### 1. Vertz's Current Approach Is Already Near-Optimal

`renderToStream()` walks the VNode tree synchronously to a **single string**, then enqueues it as **one chunk**. This means we pay the WebStream per-chunk overhead exactly **once**, not per-element.

| Approach | Avg (500 todos, ~103KB) | vs Pure String |
|---|---|---|
| Pure string (no stream) | 0.877ms | 1.0x |
| String → Response | 0.903ms | ~1.0x |
| String → WebStream (current) | 0.921ms | ~1.0x |
| Generator → WebStream (per-element) | 2.014ms | **2.3x** |
| Generator batched x50 → WebStream | 1.088ms | 1.2x |
| Generator batched x200 → WebStream | 1.032ms | 1.1x |

**The tree walk + string serialization dominates.** WebStream wrapping adds <5% overhead for a single-chunk enqueue.

### 2. The Double-Pipe Pattern Has Measurable but Small Overhead

`renderPage()` creates an outer ReadableStream that reads from `renderToStream()`'s inner ReadableStream. In the micro-benchmark (transport only, no serialization):

| Approach | Avg (500 fragments, ~104KB) |
|---|---|
| Single WebStream | 0.086ms |
| Double-pipe WebStream (current) | 0.131ms |
| Single WebStream (batched) | better at small counts |

The double-pipe adds ~0.05ms. Against the ~0.9ms serialization cost, this is ~5% — worth fixing but not urgent.

### 3. Fine-Grained Generators Are Slower, Not Faster

Contrary to Snell's findings, yielding per-element through an async generator is **2.2–2.9x slower** than the current single-string approach in Bun. The per-yield overhead dominates. Batching at x200 elements recovers to ~1.1x, but at that point you've lost the incremental streaming benefit.

**Why Snell's numbers don't apply here:** His benchmarks compare transport-only (pre-existing chunks moved through pipes). Our bottleneck is serialization (building HTML strings from a VNode tree), where the transport strategy barely matters.

### 4. `Response(string)` Is 14.6x Faster Than `Response(ReadableStream)`

Bun fast-paths string responses, avoiding the encode/decode roundtrip entirely. **We already exploit this** — `renderToHTML()` returns `new Response(html)` when there are no pending queries (the common case).

### 5. The Streaming Path Is Already Minimal-Overhead

For the streaming path (pending SSR queries), we:
1. Enqueue the full initial HTML as one chunk (one encode)
2. Enqueue each resolved query's data chunk (typically 1–5 queries)
3. Close

Total WebStream operations: ~2–6 enqueues. The per-chunk overhead Snell criticizes (promise creation, `{value, done}` allocation) is negligible at this volume.

## Where Overhead Actually Lives

Based on profiling the code paths:

1. **VNode tree walk + string serialization** — ~95% of render time. `walkAndSerialize()` builds HTML strings through recursive concatenation. This is CPU-bound string work, independent of streaming.

2. **Double-pipe in `renderPage()`** — ~5% overhead. Creates an unnecessary reader/writer pair between inner and outer streams.

3. **Per-chunk TextEncoder.encode()** — negligible for 1–6 chunks, but would matter if we moved to fine-grained streaming.

4. **Mutex serialization** (`withRenderLock`) — not measured in these benchmarks, but serializes concurrent SSR requests. This is a concurrency bottleneck, not a streaming one.

## Recommendations

### Do Now (Low-effort, measurable wins)

1. **Eliminate the double-pipe in `renderPage()`**
   - Instead of `renderPage()` creating a new ReadableStream that reads from `renderToStream()`'s stream, have `renderToStream()` accept head/footer options and emit everything in one stream.
   - Saves ~0.05ms per render (~5% of streaming overhead).

2. **Keep the `renderToHTML()` string fast path**
   - The current fast path (`Response(html)` when no pending queries) is already optimal.
   - Ensure this path is hit for the majority of requests.

### Consider (Medium-effort, situational)

3. **Synchronous generator for Suspense streaming**
   - If we add more Suspense boundaries, switch from `walkAndSerialize()` returning a single string to a synchronous `function*` generator that yields per-subtree.
   - Batch into ~50KB chunks before `encodeChunk()` + `enqueue()`.
   - Only worthwhile if we have many Suspense boundaries per page (currently rare).

4. **Benchmark the mutex bottleneck**
   - The `withRenderLock()` pattern serializes all SSR renders. Under concurrent load, this may matter more than streaming overhead.
   - Consider per-request isolation (separate DOM shim instances) to enable parallel renders.

### Don't Do (Not worth the complexity)

5. **Don't adopt async generators for SSR rendering**
   - Per-yield overhead in Bun is too high (2.2x slower even for the simplest case).
   - The serialization is synchronous — making it async adds overhead with no benefit.
   - Snell's async generator wins apply to transport (piping pre-existing chunks), not generation.

6. **Don't adopt Cloudflare's new streaming API**
   - It doesn't exist yet (conversation starter, no spec).
   - Our streaming overhead is already minimal (1–6 chunks per render).
   - When/if it ships in Workers, evaluate then — our adapter layer is thin.

7. **Don't use Vercel's `fast-webstreams`**
   - Node.js only, not applicable to Bun.
   - Our overhead comes from serialization, not stream transport.

### Watch

8. **Bun's `ReadableStream.from()` support**
   - Not available in Bun 1.3.9. When it ships, it could enable a cleaner generator→stream bridge.
   - Would make recommendation #3 simpler to implement.

9. **Cloudflare's proposal evolution**
   - If it becomes a real spec and Bun adopts it, our thin streaming layer makes migration easy.
   - The dual-output strategy (generator internal, stream/string external) is already our architecture.

## Benchmark Data

Raw benchmark outputs are in:
- `backstage/research/streaming-bench.ts` — micro-benchmarks
- `backstage/research/streaming-bench-realistic.ts` — simulated SSR pipeline
- `backstage/research/streaming-bench-vnode.ts` — full VNode rendering

Run with: `bun run backstage/research/<file>.ts`
