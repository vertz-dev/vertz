# Phase 4: Native Signal Runtime + Parallel SSR — Design Document

> Runtime Phase 4 of the [Vertz Runtime design](./vertz-runtime.md). Moves signal graph evaluation to Rust and parallelizes SSR across an Isolate pool.

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-04-05 | Initial draft |
| 2 | 2026-04-05 | Address 8 blockers + 18 should-fix items from DX, Product/Scope, and Technical reviews |

---

## Executive Summary

Phase 4 delivers two performance multipliers:

1. **SSR Isolate Pool** — Multiple V8 Isolates handle SSR requests in parallel. Throughput scales linearly with pool size. This is the primary performance win: the current single-isolate architecture processes SSR requests sequentially, making it the bottleneck under concurrent load.

2. **Rust-native signal graph** — The reactive dependency graph (topology, dirty propagation, effect scheduling) moves to Rust. V8 retains signal values and callback execution. This eliminates JS GC pressure on the graph metadata and enables Rust-side optimizations (arena allocation, cache-friendly traversal).

3. **Streaming SSR** — True chunked HTML streaming with Suspense-aware boundaries. The shell (`<head>` + layout) streams immediately while async data resolves. Completed Suspense boundaries flush as they resolve, out of order.

**Preconditions:**
- The Vertz native runtime (`vtz`) can serve SSR requests via `PersistentIsolate` (already true today)
- Phase 2's cooperative scheduling model is implemented (N:M thread pool for entity Isolates)
- Existing signal test suite (500+ lines in `signal.test.ts`) provides correctness baseline
- POC 1 (Signal Graph Benchmark) must pass before Sub-Phase 4.2 begins (hard gate)
- POC 3 (Streaming Hydration) must pass before Sub-Phase 4.3 begins (hard gate)

> **Note on Phase 3:** The parent runtime design doc lists "Phase 3 complete" as a precondition. In practice, Phase 4 does not depend on `vertz deploy` or the Cloudflare adapter. It depends on the runtime's ability to run SSR (Phase 1) and the cooperative scheduling model (Phase 2). Phase 4 can proceed in parallel with Phase 3's deployment work.

---

## API Surface

### 1. SSR Isolate Pool — Zero-config, tunable

The pool is transparent to application code. No API changes for SSR consumers.

```typescript
// vertz.config.ts — optional tuning
import { defineConfig } from '@vertz/config';

export default defineConfig({
  ssr: {
    poolSize: 'auto',          // default: max(2, cpuCores / 2)
    maxConcurrentRequests: 50, // per-pool queue limit (rejects with 503 beyond this)
    maxRenderTime: 5000,       // ms, max time for a single SSR render (kills render if exceeded)
    queueTimeout: 2000,        // ms, max time a request waits in queue before 503
    warmupRoutes: ['/', '/dashboard'], // pre-render on startup to warm JIT
    strategy: 'least-loaded',  // 'round-robin' | 'least-loaded' (default)
  },
});
```

**Timeout model (two levels):**
- `query()` options have `ssrTimeout` (per-query): how long to wait for a single query before rendering the fallback. Default: 300ms. This is the **data timeout**.
- `ssr.maxRenderTime` (per-request): how long the entire SSR render may take before being killed. Default: 5000ms. This is the **render timeout**.
- `ssr.queueTimeout` (per-request): how long a request waits in the pool queue before being rejected with 503. Default: 2000ms. This is the **admission timeout**.

If a query has `ssrTimeout: 3000` and the pool has `maxRenderTime: 5000`, and the query takes 4 seconds: the query times out at 3s, SSR renders with the fallback, total render completes well within `maxRenderTime`.

**Pool startup logging:**
```
[Server] SSR pool: 4 Isolates (auto, 8 cores detected)
[Server] SSR pool: strategy=least-loaded, maxConcurrentRequests=50, maxRenderTime=5000ms
[Server] SSR pool: warming up 2 routes...
[Server] SSR pool: /dashboard warmed in 45ms
[Server] SSR pool: / warmed in 12ms
[Server] SSR pool: ready
```

If a warmup route fails, the server logs a warning and continues (does not block startup):
```
[Server] SSR pool: warmup failed for /dashboard: QueryError: ECONNREFUSED (DB not ready)
[Server] SSR pool: ready (1 of 2 warmup routes failed — JIT will warm on first request)
```

**503 response body:**
```json
{
  "error": "ssr_pool_saturated",
  "message": "SSR pool queue full (50/50). Increase ssr.maxConcurrentRequests or ssr.poolSize.",
  "retryAfter": 2
}
```
Includes `Retry-After` header with estimated seconds.

```typescript
// Runtime diagnostics (available via /__vertz_diagnostics)
interface SsrPoolDiagnostics {
  status: 'healthy' | 'degraded' | 'saturated';
  poolSize: number;
  nativeSignals: boolean;    // true if Rust signal graph is active
  activeRequests: number;
  queuedRequests: number;
  completedRequests: number;
  avgRenderTimeMs: number;
  p99RenderTimeMs: number;
  isolateMemoryMb: number[];  // per-isolate V8 heap size
}
// status: 'healthy' when queuedRequests < poolSize,
//         'degraded' when queuedRequests > 0,
//         'saturated' when queuedRequests >= maxConcurrentRequests
```

### 2. Rust-native signal graph — Transparent replacement

The compiler output is unchanged. The signal/computed/effect functions are **replaced at the runtime level**, not the compiler level. The same `signal()`, `computed()`, `effect()` calls are emitted. On the Vertz native runtime, these functions are pre-bound to Rust ops during Isolate bootstrap. On Bun/Node, they use the JS implementation as today.

```typescript
// Developer writes (unchanged):
let count = 0;
const doubled = count * 2;

// Compiler output (SAME as today — no change):
const count = signal(0, 'count');
const doubled = computed(() => count.value * 2);
```

```typescript
// Runtime bootstrap (in Isolate init, transparent to developer):
// On native runtime: signal/computed/effect are backed by Rust ops
// On Bun/Node: signal/computed/effect are the JS implementations from @vertz/ui/runtime
//
// The compiler does NOT emit different code. The runtime swaps the implementation.
// This means:
//   - Stack traces show signal(), computed(), effect() — familiar names
//   - No __vtz_signal in developer-visible surfaces
//   - Source maps are unchanged
//   - No compiler flag needed — the runtime handles the swap
```

**Compiler flag:** The native compiler (`vertz-compiler-core`) does NOT need a new flag for native signals. The compiler output is identical. The runtime's `bootstrap.js` script registers the Rust-backed implementations under the same `signal()` / `computed()` / `effect()` names by overriding the module exports during Isolate initialization.

**SSR-specific effect behavior:** During SSR, `domEffect()` and `deferredDomEffect()` do NOT allocate nodes in the Rust signal graph. The op handler detects SSR context and executes the callback inline (synchronously, without tracking) then returns a sentinel ID (`u32::MAX`). The JS wrapper treats this as "no cleanup needed." This matches the current JS behavior exactly: no `EffectImpl` allocated, no subscriptions registered, function runs once. This avoids wasting arena space on 100+ effects per page render that will never fire again.

### 3. Streaming SSR — Opt-in progressive mode

```typescript
// vertz.config.ts
export default defineConfig({
  ssr: {
    streaming: true,  // default: false (buffered)
  },
});
```

When streaming is enabled, the HTTP response begins immediately:

```
HTTP/1.1 200 OK
Transfer-Encoding: chunked
Content-Type: text/html

<!-- Chunk 1: Shell (immediate) -->
<!DOCTYPE html>
<html><head>...</head><body><div id="app">
  <nav><!-- layout renders immediately --></nav>
  <main>
    <!-- Suspense placeholder -->
    <template id="B:0"></template>
    <div data-suspense-fallback="B:0">Loading...</div>

<!-- Chunk 2: Resolved boundary (when data arrives) -->
    <template id="S:0"><div class="task-list">...</div></template>
    <script>__vtz_swap("B:0","S:0")</script>

<!-- Chunk 3: Tail -->
  </main></div>
  <script>__VERTZ_SSR_DATA__=...</script>
  <script type="module" src="/_bun/client/app.js"></script>
</body></html>
```

**Important:** Streaming SSR only streams content inside `<Suspense>` boundaries. Content outside `<Suspense>` is rendered synchronously into the shell chunk. If you enable `ssr.streaming: true` but don't wrap async content in `<Suspense>`, you get zero TTFB improvement — the behavior is identical to buffered SSR.

The `__vtz_swap` function is defined once in the shell `<head>` (not repeated per boundary):
```html
<script>function __vtz_swap(b,s){/* ... minified swap logic */}</script>
```

Application code uses standard async patterns:

```tsx
// No new API — existing query() + Suspense work
function TaskList() {
  const tasks = query(() => fetchTasks(), { key: 'task-list' });

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div class="task-list">
        {tasks.data.items.map((t) => <TaskCard task={t} />)}
      </div>
    </Suspense>
  );
}
```

### 4. Native Signal Rust API (internal)

```rust
/// Signal graph node types
pub enum SignalNode {
    Signal {
        id: u32,
        value: v8::Global<v8::Value>,
        subscribers: SmallVec<[u32; 2]>,  // 95%+ signals have <=2 subscribers
        hmr_key: Option<String>,
    },
    Computed {
        id: u32,
        compute_fn: v8::Global<v8::Function>,
        cached_value: Option<v8::Global<v8::Value>>,
        state: ComputedState,
        sources: SmallVec<[u32; 2]>,
        subscribers: SmallVec<[u32; 2]>,
    },
    Effect {
        id: u32,
        effect_fn: v8::Global<v8::Function>,
        sources: SmallVec<[u32; 2]>,
        disposed: bool,
    },
}

#[derive(Clone, Copy)]
pub enum ComputedState {
    Clean,
    Dirty,
    Computing,
}

/// The graph lives per-request (fresh for each SSR render, disposed after).
/// Implements Drop to guarantee v8::Global handle cleanup even on panic.
pub struct SignalGraph {
    nodes: Vec<SignalNode>,
    free_list: Vec<u32>,
    batch_depth: u32,
    pending_effects: Vec<u32>,
    /// Bitset for O(1) effect dedup. Pre-allocated to 1024 bits, grows on demand.
    effect_scheduled: BitVec,
    tracking_subscriber: Option<u32>,
}

/// SAFETY: Drop guarantees all v8::Global handles are released.
/// If the graph is dropped due to panic/unwind, all Global handles are
/// properly disposed, preventing handle leaks in the Isolate.
impl Drop for SignalGraph {
    fn drop(&mut self) {
        self.dispose_all();
    }
}
```

**SmallVec sizing rationale:** `SmallVec<[u32; 2]>` is chosen because profiling the linear-clone app shows 95%+ of signals have 1-2 subscribers. The inline threshold of 2 saves 8 bytes per node vs `SmallVec<[u32; 4]>` while spilling to heap only for high-fanout signals (e.g., theme, router context). High-fanout signals (50+ subscribers) are rare and the Vec spill cost is amortized over many notifications.

**Memory layout note:** The arena (Vec) holds graph **metadata** (IDs, subscriber lists, dirty flags, enum states). Signal **values** and computed **callbacks** are `v8::Global` handles — references to V8 heap objects managed by V8's GC. The arena does not control value allocation. The performance benefit comes from cache-friendly metadata traversal during dirty propagation, which only touches IDs and subscriber lists — not values.

**Effect dedup across flush iterations:** The `effect_scheduled` BitVec is cleared entirely at the start of each flush iteration. This ensures effects that re-queue themselves (because they wrote a signal during execution) are correctly re-executed in the next iteration. The flush loop mirrors the JS implementation: drain `pending_effects`, execute each, if new effects were queued, clear bitset and drain again. Loop exits when `pending_effects` is empty after a full drain.

**Render dispatch wraps in catch_unwind:**
```rust
// In the Isolate's render handler:
let graph = SignalGraph::new();
let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
    render_ssr(scope, &mut graph, request)
}));
// graph.drop() runs here, cleaning up all Global handles
// regardless of whether render_ssr panicked or succeeded
```

### 5. Pool Request Routing (internal)

```rust
/// SSR pool routes requests to isolates
pub struct SsrPool {
    isolates: Vec<SsrIsolate>,
    strategy: RoutingStrategy,
    /// Admission control: limits total queued + active requests
    admission: tokio::sync::Semaphore,
    /// Queue timeout: how long a request waits for a permit before 503
    queue_timeout: Duration,
    metrics: Arc<PoolMetrics>,
}

pub enum RoutingStrategy {
    /// Route to isolate with no active request or shortest queue (default)
    LeastLoaded,
    /// Round-robin across isolates (fair distribution, ignores load)
    RoundRobin,
}

pub struct SsrIsolate {
    runtime: VertzJsRuntime,
    active_request: AtomicBool,
    thread: JoinHandle<()>,
    tx: mpsc::Sender<SsrRequest>,
}
// Note: SignalGraph is NOT stored on SsrIsolate — it is created per-request
// on the Isolate's dedicated thread, used during render, and dropped after.
```

**Thread model:** SSR Isolates each get a dedicated OS thread, separate from the Phase 2 cooperative scheduling pool. Entity Isolates use cooperative scheduling (N:M model) because they are I/O-bound and naturally yield. SSR Isolates are CPU-bound during rendering and benefit from dedicated threads to avoid blocking entity Isolates. The two pools (entity cooperative + SSR dedicated) are independent.

**Memory estimate:** Each SSR Isolate loads the full app module tree via V8 snapshot. Expected memory per Isolate: ~15-30MB for a typical app (linear-clone). Pool of 4: ~60-120MB. This should be benchmarked during Sub-Phase 4.1 and documented in the diagnostics endpoint. If total pool memory exceeds 500MB, V8 snapshot sharing (shared read-only pages across Isolates) becomes a requirement, not an optimization.

### 6. Error Messages

**Invalid signal ID:**
```
SignalError: signal 'count' (id: 42) in TaskList.tsx was accessed after disposal.
  This typically means a component tried to read a signal from a previous render.
  Signals are per-request and disposed after SSR completes.
```

**Computed cycle detection:**
```
SignalError: circular dependency detected in computed 'doubled' (TaskList.tsx).
  Evaluation chain: doubled -> count -> doubled
  Break the cycle by using untrack() for one of the reads.
```

**Effect execution failure:**
```
SignalError: effect in TaskList.tsx threw during execution.
  Original error: TypeError: Cannot read property 'items' of undefined
  Signal context: triggered by write to 'tasks' (query result)
```

**Graph disposal during active tracking:**
```
SignalError: signal graph disposed while tracking was active.
  This is a framework bug — tracking context should be cleared before disposal.
  Please report this at https://github.com/vertz-dev/vertz/issues
```

All error messages include the signal's `hmr_key` (e.g., `'count'`) which maps to the developer's variable name, making errors actionable without understanding internal IDs.

---

## Manifesto Alignment

### Principle 7: "Performance is not optional"

This IS the performance phase. The Isolate pool directly addresses SSR throughput — the #1 production bottleneck. Native signals reduce per-request GC pressure. Streaming SSR improves perceived performance (TTFB).

### Principle 1: "If it builds, it works"

The native signal graph must be a **transparent replacement**. If the JS signal tests pass with native signals, correctness is proven. The runtime handles the switch at bootstrap — compiler output is unchanged, developers never interact with the native API directly.

### Principle 3: "AI agents are first-class users"

Zero new concepts for developers or LLMs. The pool, native signals, and streaming are all runtime implementation details. An LLM writes the same `query()` + `Suspense` code it writes today.

### Principle 8: "No ceilings"

The JS signal runtime has inherent limits: single-threaded V8 GC, no parallel evaluation, no cache-friendly memory layout. Moving the graph to Rust removes these ceilings.

### What was rejected

- **WASM-based signal runtime** — Adds another compilation target and runtime layer. Direct Rust ops via deno_core are simpler and faster (no WASM sandbox overhead).
- **Shared-memory signal graph across Isolates** — V8 Isolates cannot share JS heap objects. Each Isolate gets its own `SignalGraph`. Cross-Isolate signal synchronization is out of scope (see Non-Goals).
- **Full Rust rendering (no V8 for SSR)** — Would require porting JSX evaluation, component lifecycle, context, and all of `@vertz/ui` to Rust. Prohibitive scope. The hybrid approach (Rust graph + V8 evaluation) is the pragmatic choice.
- **Server Components (React-style)** — Different paradigm. Vertz's signal model works across server and client uniformly. Server Components would split the model.

---

## Non-Goals

1. **Client-side native signals.** The browser runs JS; there's no Rust runtime in the browser. Native signals are SSR-only for this phase. Client-side continues using the JS signal runtime.
2. **Cross-Isolate signal synchronization.** Each SSR Isolate has an independent signal graph. No shared reactive state between requests.
3. **Replacing the JS signal runtime package.** `@vertz/ui/runtime` stays. The native runtime provides an alternative backend for the same API contract.
4. **SSR Isolate persistence between requests.** Each request gets a clean signal graph. Isolates are reused (module code stays loaded) but signal state is per-request.
5. **Adaptive pool sizing at runtime.** Pool size is set at startup. Dynamic scaling is a future optimization.
6. **HTTP/2 Server Push.** Streaming SSR uses chunked transfer encoding over HTTP/1.1 or HTTP/2 response bodies. Server Push is deprecated by browsers.

---

## Timeline Reconciliation

The parent runtime design doc estimates Phase 4 at **3 months optimistic / 4 months realistic / 6 months pessimistic**. The sub-phase breakdown in this doc totals **16-22 weeks (4-5.5 months)**. This exceeds the parent doc's realistic estimate.

**Why the difference:** The parent doc's estimates were high-level guesses made before Phase 0 was complete. This detailed breakdown accounts for:
- POC work (benchmarks + hydration POC) as hard gates before sub-phases begin
- The streaming SSR hydration protocol (not considered in the parent estimate)
- Comprehensive test parity verification for native signals

**By Phase 4, the team has 12+ months of Rust experience** (Phases 0-2 complete). The estimates already reflect this — a team starting fresh would need 8+ months for this scope.

**Acceptable descoped outcome ("Phase 4 Lite"):** If time pressure mounts, delivering only 4.1 (pool) + 4.3 (streaming) without 4.2 (native signals) provides the most user-visible value. The pool delivers ~4x throughput, streaming delivers TTFB improvement. Native signals can be deferred to a future phase without blocking either.

---

## Kill Criteria

| Sub-Phase | Checkpoint | Kill if... |
|---|---|---|
| 4.1 (Pool) | 4 weeks | Pool of 4 Isolates achieves <2x throughput vs single Isolate (overhead too high) |
| 4.2 (Native Signals) | POC 1 complete | Benchmark shows native signals >2x slower than JS for <2000 nodes (boundary crossing overhead dominates) |
| 4.2 (Native Signals) | 4 weeks after POC | Signal test suite has >5% test failures after 4 weeks of implementation (correctness gap too large) |
| 4.3 (Streaming) | POC 3 complete | Hydration reconciliation requires >500 LOC of new hydration walker code (complexity not justified) |
| Any | Any | Sub-phase takes >2x its pessimistic estimate |

**Sub-Phase 4.2 ROI note:** Signal evaluation is ~0.5-2ms of a typical 30ms SSR render. The Rust signal graph is a **strategic investment in cache-friendly architecture for future scaling** (>1000 nodes per page), not a primary performance multiplier at current workload sizes. If the POC benchmark shows no measurable improvement for pages with <1000 nodes, 4.2 should be deferred rather than killed — the pool (4.1) delivers the primary performance win regardless.

---

## HMR Propagation to Pool Isolates

When a source file changes, the pool coordinator broadcasts a "reload modules" message to each Isolate's channel. Isolates are reloaded using a **rolling strategy**:

1. Pick Isolate #0, mark it as "reloading" (stop routing new requests to it)
2. Wait for Isolate #0's current request to complete (drain)
3. Clear module cache, re-evaluate changed modules (~5ms with native compiler)
4. Mark Isolate #0 as ready, route requests to it
5. Repeat for Isolate #1, #2, ..., #N

**During rolling reload:**
- At least N-1 Isolates are always serving requests (no total downtime)
- In-flight requests complete with old code (no mid-render code swap)
- After all Isolates are reloaded, all requests use new code

**Total HMR propagation time:** ~5ms * N (sequential per Isolate). For pool of 4: ~20ms. During this window, throughput is temporarily reduced (N-1 Isolates serving instead of N).

**Edge case:** If a source change arrives while a previous rolling reload is in progress, the new change is queued and applied to remaining Isolates (merged with the previous reload).

---

## Competitive Context

| Framework | SSR Parallelism | Streaming SSR | Native Signals |
|---|---|---|---|
| **Next.js** | Worker threads (experimental) | Stable since Next 13 (`renderToPipeableStream`) | No (React reconciler is JS) |
| **SolidStart** | Single-threaded | Stable (`renderToStream`) | No (Solid signals are JS) |
| **Remix** | Single-threaded | Stable (`renderToPipeableStream`) | No |
| **Nuxt** | Limited | Limited | No |
| **Vertz (Phase 4)** | V8 Isolate pool (dedicated threads) | Suspense-aware chunked streaming | Rust-native graph (SSR only) |

Vertz's Isolate pool approach is genuinely novel. Next.js uses Node worker threads (shared memory model, GIL-like constraints). Vertz uses V8 Isolates (true memory isolation, no shared state, matches production topology). The native signal graph is unique — no other framework moves reactive evaluation to a systems language.

---

## Unknowns

### U1: V8 Global handle overhead for signal values — NEEDS BENCHMARK (hard gate for 4.2)

**Question:** What is the overhead of storing signal values as `v8::Global<v8::Value>` handles vs keeping them in JS?

**Context:** Each signal stores its value as a V8 Global handle (prevents GC). Creating, reading, and dropping Global handles has overhead (~50-200ns per operation). For a page with 500 signals, this is 500 handle allocations per SSR request.

**Resolution:** Benchmark with a realistic component tree (500 signals, 200 computeds, 100 effects). Compare: (a) native graph with Global handles vs (b) pure JS signals. If overhead exceeds 2ms per render, evaluate arena-based handle pools or V8 `HandleScope` batching.

**Gate:** This benchmark must show positive results before Sub-Phase 4.2 implementation begins. If native signals are >2x slower for <2000 nodes, 4.2 is deferred (see Kill Criteria).

**Op call overhead quantification:** For a page with 500 signals each read 3 times: ~1500 op boundary crossings for reads, plus 500 creates, plus computed evaluations and effect flushes. At ~100-300ns per op call, signal reads alone cost 150-450us. This must be compared against the JS signal runtime's total evaluation time for the same workload. If the op overhead dominates, consider batch-read ops that return multiple signal values in a single crossing.

### U2: Isolate warmup time with V8 snapshots — NEEDS BENCHMARK

**Question:** How long does it take to create an SSR Isolate from a V8 snapshot vs fresh module loading?

**Context:** Phase 2 already uses V8 snapshots for test Isolates. SSR Isolates need framework code + the application's component tree. If snapshot restore is <10ms, warm-up is acceptable. If >50ms, we may need a pre-warmed pool that never shrinks.

**Resolution:** Benchmark with linear-clone example app. Measure: snapshot creation time, restore time, memory overhead of snapshot vs fresh load.

### U3: Streaming SSR hydration mismatch — NEEDS POC (hard gate for 4.3)

**Question:** When the server streams HTML with Suspense placeholders and then swaps in resolved content, does the client hydration correctly reconcile?

**Context:** The swap script (`__vtz_swap`) modifies the DOM before hydration. The current hydration walker (`hydration-context.ts`) uses a cursor-based tree walk: `claimElement(tag)`, `claimText()`, `claimComment()`. None of these handle `<template>` elements or DOM that mutates during the walk.

**Hydration protocol (proposed):**

1. **`__vtz_swap` executes BEFORE hydration.** The swap script is inline `<script>` tags that execute synchronously as the browser parses the streamed HTML. By the time the client-side app module loads and hydration begins, all swaps have already occurred. The DOM tree is in its final state.

2. **The hydration walker skips `<template>` nodes.** During the walk, `<template>` elements (both `B:*` placeholder markers and `S:*` resolved content containers) are treated as inert — the walker steps over them. After swap, the `<template>` elements are removed from the DOM by `__vtz_swap`, so the walker never encounters them.

3. **The fallback `<div data-suspense-fallback="B:0">` is also removed by `__vtz_swap`.** After swap, the DOM contains only the resolved content at the Suspense boundary position.

4. **If swap races with hydration (e.g., very late-resolving boundary):** The hydration walker encounters the fallback content. It hydrates the fallback. When the boundary resolves and the server sends the swap chunk, the client's Suspense component re-renders with real data — matching the existing client-side Suspense behavior.

5. **Streaming timeout per boundary:** If a Suspense boundary does not resolve within `ssrTimeout`, the server closes the stream with fallback content visible. The client hydrates with the fallback, and the Suspense component triggers a client-side query. This matches non-streaming timeout behavior.

**Resolution:** POC — implement the swap script + hydration walker for a single Suspense boundary. Verify: (a) hydration succeeds after swap, (b) hydration succeeds with fallback (no swap), (c) no flash of placeholder, (d) event handlers attach correctly to swapped content, (e) cursor-based walker correctly skips template nodes.

**Gate:** POC 3 must pass before Sub-Phase 4.3 implementation begins. If the hydration reconciliation requires >500 LOC of new walker code, streaming SSR is deferred (see Kill Criteria).

### U4: Effect execution ordering across native/JS boundary — NEEDS VERIFICATION

**Question:** Does the Rust batch-flush → V8 effect execution preserve the same ordering guarantees as the JS implementation?

**Context:** The JS scheduler runs effects in Map insertion order (which correlates with creation order). The Rust implementation uses `Vec<u32>` with deduplication. Order must match to avoid subtle rendering differences.

**Resolution:** Run the full `signal.test.ts` suite against native signals. Add specific ordering tests for: diamond dependencies, nested batches, effect-triggers-effect chains.

---

## POC Results

*No POCs completed yet. Planned:*

### POC 1: Signal Graph Benchmark (resolves U1)

- Build Rust `SignalGraph` struct with `v8::Global<v8::Value>` storage
- Create 500 signals, 200 computeds, 100 effects in a single Isolate
- Benchmark: create → read all → mutate 50 signals → flush effects
- Compare against same workload with JS signal runtime
- Target: native graph within 1.5x of JS for small workloads, faster for >1000 nodes

### POC 2: Isolate Pool Throughput (resolves U2)

- Create pool of 4 Isolates from V8 snapshots
- Load linear-clone app in each
- Benchmark: 100 concurrent SSR requests, measure p50/p99 latency
- Compare: pool of 4 vs single Isolate (sequential)
- Target: 4x throughput with pool of 4

### POC 3: Streaming Hydration (resolves U3)

- Implement `__vtz_swap` script and server-side `<template>` emission
- Single Suspense boundary with 500ms delayed data
- Verify: hydration succeeds, no layout shift, events work
- Measure: TTFB improvement vs buffered SSR

---

## Type Flow Map

### Signal Creation → Graph Node → V8 Value

```
Compiler transforms (UNCHANGED from today):
  let count = 0
    ↓
  const count = signal(0, 'count')

Runtime bootstrap swaps signal() implementation:
  signal(init, key)
    ↓ (on native runtime, backed by Rust op)
  op_signal_create(init: v8::Value, key: &str) → signal_id: u32
    ↓
  SignalGraph.nodes.push(SignalNode::Signal {
    id,
    value: v8::Global::new(scope, init),  // V8 heap reference
    subscribers: SmallVec::new(),
    hmr_key: Some(key),
  })
    ↓
  Returns: SignalHandle { id: u32 } (opaque JS object with .value getter/setter)
```

### Signal Read → Dependency Tracking

```
developer code:
  count.value  // .value getter on SignalHandle (inside a computed or effect)
    ↓ (dispatches to Rust op)
  op_signal_read(signal_id: u32) → v8::Value
    ↓
  graph.tracking_subscriber is Some(subscriber_id)?
    YES → graph.add_edge(signal_id → subscriber_id)
    NO  → (untracked read)
    ↓
  return node.value.get(scope)  // V8 Global → Local conversion
```

### Signal Write → Dirty Propagation → Effect Flush

```
compiler-generated code:
  count.value = 5  // .value setter on SignalHandle
    ↓ (dispatches to Rust op)
  op_signal_write(signal_id: u32, new_value: v8::Value)
    ↓
  graph.batch_depth > 0?
    YES → mark_dirty(signal_id), queue effects
    NO  → auto_batch { mark_dirty(signal_id), flush_effects() }

  mark_dirty(signal_id):
    for subscriber_id in node.subscribers:
      if node_is_computed(subscriber_id):
        set state = Dirty (synchronous, propagates further)
      if node_is_effect(subscriber_id):
        push to pending_effects (deduped by id, via effect_scheduled BitVec)

  flush_effects():
    loop:
      clear effect_scheduled BitVec
      drain pending_effects into local vec
      for each effect_id in local vec:
        call_v8_function(effect_node.effect_fn, scope)
        // Effect may read computeds (triggering lazy eval) and write signals (re-queuing)
      if pending_effects is empty: break
```

### Computed Lazy Evaluation

```
__vtz_computed_read(computed_id)
    ↓
  op_computed_read(computed_id: u32) → v8::Value
    ↓
  computed.state == Clean?
    YES → return computed.cached_value
    NO  → recompute:
      1. Clear old sources
      2. Set tracking_subscriber = computed_id
      3. Call V8: compute_fn.call(scope)
         (reads inside capture new source edges)
      4. Restore tracking_subscriber
      5. Cache result, set state = Clean
      6. If value changed (Object.is), notify own subscribers
      ↓
  return cached_value
```

### SSR Request → Isolate Dispatch

```
HTTP GET /dashboard
    ↓
  SsrPool.route(request)
    ↓
  strategy.pick_isolate() → isolate_idx
    ↓
  isolate.tx.send(SsrRequest { url, session, cookies })
    ↓ (dedicated thread)
  SignalGraph::new()  // fresh graph for this request
  call globalThis.__vertz_ssr_render_fn(request)
    ↓ (during render, signals use this graph)
  SsrResponse { html_chunks: Vec<String>, css, ssr_data }
    ↓
  graph.dispose_all()  // drop all Global handles
```

### Type Safety: No generics cross the Rust boundary

Signal values are `v8::Value` (untyped) in Rust. TypeScript generics (`Signal<number>`, `Computed<string>`) are enforced at **compile time only**. Rust does not need generic types — it treats all values as opaque V8 references. This means:

- No dead generics in the Rust code
- TypeScript's type checking is the single source of type safety (Principle 1)
- `.test-d.ts` files from the existing signal package validate the developer-facing types

---

## E2E Acceptance Test

### Test 1: SSR throughput scales linearly with pool size

```typescript
describe('Feature: SSR Isolate pool throughput', () => {
  describe('Given a pool of N Isolates rendering a page with 3 queries', () => {
    describe('When N concurrent SSR requests arrive simultaneously', () => {
      it('Then throughput scales linearly: pool(4) handles ~4x the requests of pool(1) in the same time', async () => {
        // Measure throughput with pool size 1
        const single = await benchmarkSsr({ poolSize: 1, requests: 20 });

        // Measure throughput with pool size 4
        const quad = await benchmarkSsr({ poolSize: 4, requests: 20 });

        // Linear scaling: 4x pool should yield >= 3x throughput
        // (3x not 4x to account for coordination overhead)
        expect(quad.requestsPerSecond).toBeGreaterThan(single.requestsPerSecond * 3);
      });
    });
  });

  describe('Given a pool under load', () => {
    describe('When requests exceed pool capacity', () => {
      it('Then excess requests queue and complete without error (up to maxConcurrentRequests)', async () => {
        const pool = await createSsrPool({ poolSize: 2, maxConcurrentRequests: 10 });
        const results = await Promise.all(
          Array.from({ length: 8 }, () => pool.render('/dashboard')),
        );

        expect(results.every((r) => r.status === 200)).toBe(true);
      });

      it('Then requests beyond maxConcurrentRequests receive 503', async () => {
        const pool = await createSsrPool({ poolSize: 1, maxConcurrentRequests: 2 });

        // Fill the pool + queue
        const blocker1 = pool.render('/slow-page'); // occupies isolate
        const blocker2 = pool.render('/slow-page'); // queued

        // This one should be rejected
        const rejected = await pool.render('/dashboard');
        expect(rejected.status).toBe(503);

        await blocker1;
        await blocker2;
      });
    });
  });
});
```

### Test 2: p99 SSR latency under 50ms for typical pages

```typescript
describe('Feature: SSR latency target', () => {
  describe('Given the linear-clone dashboard page (task list + sidebar + nav)', () => {
    describe('When rendered 100 times with pre-warmed pool', () => {
      it('Then p99 latency is under 50ms', async () => {
        const pool = await createSsrPool({ poolSize: 4, warmupRoutes: ['/dashboard'] });
        const latencies: number[] = [];

        for (let i = 0; i < 100; i++) {
          const start = performance.now();
          await pool.render('/dashboard');
          latencies.push(performance.now() - start);
        }

        latencies.sort((a, b) => a - b);
        const p99 = latencies[Math.floor(latencies.length * 0.99)];
        expect(p99).toBeLessThan(50);
      });
    });
  });
});
```

### Test 3: Signal graph correctness matches JS implementation

```typescript
describe('Feature: Native signal graph correctness', () => {
  describe('Given the full existing signal test suite', () => {
    describe('When run on the native Vertz runtime (native signals auto-activated)', () => {
      it('Then all existing tests pass without modification', async () => {
        // On the native runtime, signal() is backed by Rust ops automatically.
        // The same test suite runs with zero changes — the API is identical.
        const result = await runTests('packages/ui/src/runtime/__tests__/signal.test.ts');
        expect(result.exitCode).toBe(0);
        expect(result.failed).toBe(0);
      });
    });
  });

  describe('Given a diamond dependency graph (a -> b,c -> d)', () => {
    describe('When signal a changes', () => {
      it('Then computed d evaluates exactly once', () => {
        // Uses the standard signal/computed/effect API.
        // On native runtime, these dispatch to Rust ops.
        // On Bun, these use JS implementation. Both must pass.
        const a = signal(1, 'a');
        const b = computed(() => a.value * 2);
        const c = computed(() => a.value + 1);
        const d = computed(() => b.value + c.value);

        let evalCount = 0;
        domEffect(() => {
          d.value;
          evalCount++;
        });

        evalCount = 0;
        a.value = 2;

        expect(evalCount).toBe(1); // d evaluated once, not twice
        expect(d.value).toBe(7); // 2*2 + 2+1
      });
    });
  });

  describe('Given dynamic dependencies (conditional branch)', () => {
    describe('When the condition changes', () => {
      it('Then stale dependencies are cleaned up', () => {
        const toggle = signal(true, 'toggle');
        const a = signal('A', 'a');
        const b = signal('B', 'b');

        let effectValue = '';
        domEffect(() => {
          effectValue = toggle.value ? a.value : b.value;
        });

        expect(effectValue).toBe('A');

        toggle.value = false;
        expect(effectValue).toBe('B');

        // Changing a should NOT trigger the effect (no longer a dependency)
        effectValue = '';
        a.value = 'A2';
        expect(effectValue).toBe(''); // no re-run

        // Changing b SHOULD trigger
        b.value = 'B2';
        expect(effectValue).toBe('B2');
      });
    });
  });
});
```

### Test 4: Streaming SSR delivers chunks progressively

```typescript
describe('Feature: Streaming SSR with Suspense', () => {
  describe('Given a page with a Suspense boundary wrapping a slow query', () => {
    describe('When SSR streaming is enabled', () => {
      it('Then the shell arrives before the Suspense content', async () => {
        const chunks: string[] = [];
        const response = await pool.renderStream('/tasks', {
          onChunk: (chunk) => chunks.push(chunk),
        });

        // First chunk: shell with fallback
        expect(chunks[0]).toContain('<nav>');
        expect(chunks[0]).toContain('data-suspense-fallback');

        // Later chunk: resolved content + swap script
        const resolvedChunk = chunks.find((c) => c.includes('__vtz_swap'));
        expect(resolvedChunk).toBeDefined();
        expect(resolvedChunk).toContain('task-list');
      });

      it('Then TTFB is under 10ms regardless of query latency', async () => {
        // Query takes 500ms, but shell should arrive immediately
        const start = performance.now();
        const response = await pool.renderStream('/slow-tasks');
        const firstByte = performance.now() - start;

        expect(firstByte).toBeLessThan(10);
        // Full response takes longer (waiting for data)
        const body = await response.text();
        expect(body).toContain('task-list');
      });
    });
  });
});
```

### Test 5: Signal API works identically on Bun and native runtime

```typescript
describe('Feature: Signal API portability across runtimes', () => {
  describe('Given code using standard signal/computed/effect API', () => {
    describe('When running on Bun (JS signal implementation)', () => {
      it('Then the same code produces the same results', () => {
        // Compiler output is IDENTICAL on both runtimes.
        // On Bun: signal() uses JS SignalImpl
        // On native: signal() uses Rust-backed ops
        // Both must produce the same behavior.
        const count = signal(0, 'count');
        const doubled = computed(() => count.value * 2);

        expect(doubled.value).toBe(0);
        count.value = 5;
        expect(doubled.value).toBe(10);
      });
    });
  });
});
```

### Test 6: Pool graceful degradation

```typescript
describe('Feature: SSR pool resilience', () => {
  describe('Given an SSR Isolate that crashes during render', () => {
    describe('When the crash occurs', () => {
      it('Then the crashed Isolate is replaced and subsequent requests succeed', async () => {
        const pool = await createSsrPool({ poolSize: 2 });

        // Inject a crashing route
        const crashResult = await pool.render('/crash-route');
        expect(crashResult.status).toBe(500);

        // Pool should recover — next request works
        const okResult = await pool.render('/dashboard');
        expect(okResult.status).toBe(200);
        expect(okResult.body).toContain('dashboard');
      });
    });
  });
});
```

---

## Architecture

### SSR Isolate Pool

```
                      HTTP Request (GET /dashboard)
                              │
                    ┌─────────▼──────────┐
                    │   Axum HTTP Handler │
                    │   (server/http.rs)  │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │   SsrPool.route()  │
                    │   RoutingStrategy  │
                    └────┬────┬────┬─────┘
                         │    │    │
              ┌──────────┘    │    └──────────┐
              │               │               │
    ┌─────────▼───┐  ┌───────▼─────┐  ┌──────▼──────┐
    │ Isolate #0  │  │ Isolate #1  │  │ Isolate #2  │
    │ (Thread A)  │  │ (Thread B)  │  │ (Thread C)  │
    │             │  │             │  │             │
    │ V8 Runtime  │  │ V8 Runtime  │  │ V8 Runtime  │
    │ SignalGraph  │  │ SignalGraph  │  │ SignalGraph  │
    │ App Module  │  │ App Module  │  │ App Module  │
    │ DOM Shim    │  │ DOM Shim    │  │ DOM Shim    │
    └─────────────┘  └─────────────┘  └─────────────┘
```

**Each Isolate:**
- Runs on a dedicated OS thread (V8 requires single-threaded access)
- Loads application modules once at startup (from V8 snapshot if available)
- Gets a fresh `SignalGraph` per SSR request
- Shares no mutable state with other Isolates

**Pool lifecycle:**
1. **Startup:** Create N Isolates, load app modules, optionally warm up with `warmupRoutes`
2. **Request:** Route to Isolate via strategy, create per-request `SignalGraph`, render, dispose graph
3. **HMR:** When source changes, reload modules in ALL pool Isolates (sequential, ~5ms each with native compiler)
4. **Crash:** Replace crashed Isolate with a fresh one, log the error, continue serving

### Signal Graph Per-Request Lifecycle

```
Request arrives at Isolate
    │
    ▼
SignalGraph::new()          ← Fresh graph, zero nodes
    │
    ▼
SSR Render begins
    │
    ├── Component creates signal → graph.create_signal(init)
    ├── Component creates computed → graph.create_computed(fn)
    ├── domEffect registered → graph.create_effect(fn, is_dom: true)
    │   └── SSR: runs once without tracking (same as JS impl)
    ├── Signal read in computed → graph.add_edge(signal → computed)
    ├── Signal read in JSX → graph.read(id) returns value
    │
    ▼
SSR Render completes → HTML string produced
    │
    ▼
graph.dispose_all()         ← Drop all v8::Global handles
    │                         Free graph memory (arena reset)
    ▼
SignalGraph dropped
```

### Streaming SSR Architecture

```
Request arrives
    │
    ▼
Discovery Phase (same as current single-pass)
    │
    ▼
Prefetch Phase (parallel query execution)
    │
    ├── Query A resolves → cache
    ├── Query B resolves → cache
    └── Query C pending...
    │
    ▼ (don't wait for all queries)
Render Phase (streaming)
    │
    ├── Shell renders immediately (layout, nav, etc.)
    │   └── Flush chunk: <!DOCTYPE html><head>...</head><body><nav>...
    │
    ├── Suspense boundary encountered, data not ready
    │   └── Flush chunk: <template id="B:0"></template><div data-suspense-fallback>Loading...
    │
    ├── Non-suspended content renders
    │   └── Flush chunk: <div class="sidebar">...
    │
    │   ... Query C resolves ...
    │
    ├── Suspense boundary resolves
    │   └── Flush chunk: <template id="S:0"><div class="tasks">...</template>
    │                     <script>__vtz_swap("B:0","S:0")</script>
    │
    └── Tail (SSR data, client scripts)
        └── Flush chunk: <script>__VERTZ_SSR_DATA__=...</script>
                         </body></html>
```

**Key decisions:**
- **Shell-first:** The HTML `<head>`, layout components, and any non-data-dependent content stream immediately. This delivers CSS, fonts, and layout to the browser ASAP.
- **Out-of-order resolution:** Suspense boundaries flush as their data arrives, not in DOM order. The swap script handles reordering on the client.
- **Fallback rendering:** Suspense fallback content is rendered inline (visible immediately). When data arrives, it's replaced by the swap script before hydration.
- **Hydration compatibility:** The client hydration walker understands the `<template>` + swap protocol. Swapped content is treated as pre-rendered.

### Native Signal Graph Memory Layout

**Graph metadata layout:** The `Vec<SignalNode>` stores graph metadata (IDs, subscriber/source lists, dirty flags, enum states) contiguously. Signal **values** and computed **callbacks** are `v8::Global` handles pointing to V8 heap objects — these are NOT part of the contiguous layout.

**Why contiguous metadata matters:**
- Dirty propagation only touches IDs and subscriber lists → fits in cache lines
- No per-node Rust heap allocation for metadata → no Rust allocator pressure
- Graph disposal drops the Vec + runs Drop for Global handles → deterministic cleanup

**Comparison with JS implementation:**
| Aspect | JS (current) | Rust (Phase 4) | Notes |
|---|---|---|---|
| Graph metadata | JS heap (GC'd) | Contiguous Vec | Rust wins: cache-friendly |
| Subscriber sets | JS `Set<Subscriber>` | `SmallVec<[u32; 2]>` | Rust wins: inline for <=2 |
| Effect dedup | `Map<number, Subscriber>` | `BitVec` (O(1) check) | Rust wins: bitset vs hashmap |
| Dirty propagation | JS function calls | Rust iteration | Rust wins: no call overhead |
| Value storage | JS heap (direct) | `v8::Global<v8::Value>` (handle) | **JS wins:** direct access vs indirection |
| Batch flush | JS while loop | Rust while loop (no GC pauses) | Rust wins: deterministic timing |

**Key tradeoff:** Value storage is worse in Rust (Global handles are indirections requiring explicit lifecycle management). But dirty propagation and effect scheduling — the hot paths during SSR renders with many signals — benefit from contiguous metadata and zero GC pauses.

---

## Phased Implementation

### Sub-Phase 4.1: SSR Isolate Pool (6-8 weeks)

The biggest throughput win. Parallelize SSR without changing signal implementation.

**Deliverables:**
- `SsrPool` struct with configurable pool size and `queueTimeout`
- Least-loaded (default) and round-robin routing strategies
- Per-Isolate dedicated V8 thread with channel-based dispatch
- Pool metrics (active, queued, completed, latency percentiles, per-isolate memory)
- Rolling HMR propagation to all pool Isolates (drain → reload → resume)
- Crash recovery (replace crashed Isolate)
- `/__vertz_diagnostics` pool section with `status`, `nativeSignals`, memory
- Warmup routes (pre-render on startup, non-blocking on failure)
- 503 response body with `ssr_pool_saturated` error + `Retry-After` header
- Startup logging with resolved pool size and configuration

**Acceptance criteria:**
- Pool of 4 Isolates handles >= 3x throughput of single Isolate
- p99 latency < 50ms for linear-clone dashboard (with warm pool)
- Crashed Isolate is replaced within 1 second
- Rolling HMR updates all pool Isolates; no request sees partially-updated state
- 503 returned with structured body when queue exceeds `maxConcurrentRequests` or `queueTimeout`
- Per-Isolate memory measured and exposed in diagnostics
- Total pool memory for linear-clone app documented (expected: 60-120MB for pool of 4)

### Sub-Phase 4.2: Rust Signal Graph (6-8 weeks)

**Hard gate:** POC 1 (Signal Graph Benchmark) must pass before this sub-phase begins.

Replace JS signal runtime with Rust-native graph for SSR Isolates. This is a **strategic investment** — the primary performance win comes from the pool (4.1). Native signals improve cache-friendly metadata traversal and eliminate GC pauses during dirty propagation. The ROI is most significant for pages with >1000 signal nodes.

**Deliverables:**
- `SignalGraph` struct with contiguous metadata, `Drop` impl for handle cleanup
- deno_core ops: `op_signal_create`, `op_signal_read`, `op_signal_write`, `op_computed_create`, `op_computed_read`, `op_effect_create`, `op_batch_start`, `op_batch_end`, `op_dispose`
- Runtime-level signal function swap (same compiler output, Rust-backed implementation)
- Fallback to JS signals on non-native runtimes (automatic, no env var needed)
- Full parity with JS signal test suite
- SSR-specific: domEffect/deferredDomEffect execute inline without graph allocation
- Catch_unwind wrapping to prevent handle leaks on render panic

**Acceptance criteria:**
- All existing `signal.test.ts` tests pass with native signals active
- Diamond dependency: computed evaluates exactly once
- Dynamic dependencies: stale sources cleaned up
- Batch deduplication: effect runs once per batch regardless of trigger count
- Effect ordering matches JS implementation (insertion order preserved)
- Per-request graph disposal: no V8 handle leaks between requests (verified with handle counting)
- SSR render time <= JS signal render time (no regression; improvement expected for >1000 nodes)
- Error messages include signal name from `hmr_key`, not just internal ID

### Sub-Phase 4.3: Streaming SSR (4-6 weeks)

**Hard gate:** POC 3 (Streaming Hydration) must pass before this sub-phase begins.

Progressive HTML streaming with Suspense boundary support.

**Deliverables:**
- Chunked response writer (shell → content → tail)
- `__vtz_swap` function defined once in `<head>`, called per boundary
- Suspense placeholder emission (`<template>` + fallback)
- Out-of-order boundary resolution (swap script executes before hydration)
- Hydration walker updated to skip `<template>` nodes
- Per-boundary streaming timeout (reuses `ssrTimeout` from query options)
- `ssr.streaming` config option (default: false)

**Acceptance criteria:**
- Shell (head + layout) arrives within 10ms regardless of data fetch time
- Suspense boundaries swap correctly (no flash, events attach)
- Hydration succeeds after streaming completes (both swapped and fallback paths)
- TTFB improvement: >= 50% reduction vs buffered SSR for pages with slow queries
- Graceful degradation: if all boundaries timeout, output matches buffered SSR
- Cursor-based hydration walker handles `<template>` elements without errors

---

## Testing Strategy

### Correctness: Signal parity

The existing `packages/ui/src/runtime/__tests__/signal.test.ts` suite (500+ lines) is the correctness baseline. Phase 4 runs this suite in two modes:

1. **JS signals (on Bun):** `bun test` — unchanged, JS signal implementation
2. **Native signals (on Vertz runtime):** `vtz test` — same tests, Rust graph backend auto-activated

Both must produce identical results. Any divergence is a bug in the native implementation. No env var needed — the native runtime automatically uses Rust-backed signals.

### Performance: Benchmarks

New benchmark suite at `native/vtz/benches/`:
- `signal_graph.rs` — micro-benchmarks for create/read/write/propagate/flush
- `ssr_pool.rs` — pool throughput under concurrent load
- `streaming_ssr.rs` — TTFB and full-render latency comparison

### Integration: E2E

- Linear-clone app renders correctly with native signals + pool
- SSR output byte-for-byte identical (excluding timing-dependent data like render time headers)
- HMR works across pool Isolates
- Crash recovery works without user intervention

### Stress: Edge cases

- 10,000 signals in a single render (memory pressure)
- Deeply nested computed chains (100 levels)
- Effect that creates new signals during execution
- Concurrent SSR requests that all trigger slow queries
- Pool at max capacity with 503 rejection
