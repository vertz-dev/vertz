# Sub-Phase 4.2: Rust-Native Signal Graph

## Context

This is the second sub-phase of Phase 4. It replaces the JavaScript signal runtime with a Rust-native reactive graph for SSR Isolates. The graph metadata (nodes, edges, dirty flags) lives in Rust; signal values and callbacks remain in V8.

**Hard gate:** POC 1 (Signal Graph Benchmark) must show native signals are not >2x slower than JS for <2000 nodes. If the benchmark fails, this sub-phase is deferred.

Design doc: `plans/native-signal-runtime-parallel-ssr.md`

**Current JS implementation:**
- `packages/ui/src/runtime/signal.ts` — SignalImpl, ComputedImpl, EffectImpl (~330 LOC)
- `packages/ui/src/runtime/scheduler.ts` — batch/flush (~80 LOC)
- `packages/ui/src/runtime/tracking.ts` — subscriber context (~80 LOC)
- `packages/ui/src/runtime/signal-types.ts` — types
- `packages/ui/src/runtime/__tests__/signal.test.ts` — test suite (~500 LOC)

**Key behaviors to replicate exactly:**
1. Signal read subscribes the active tracking subscriber
2. Signal write propagates dirtiness to computed (synchronous) and queues effects (batched)
3. Computed is lazy: only re-evaluates when dirty AND accessed
4. Diamond dependencies: computed evaluates exactly once per batch
5. Dynamic dependencies: old sources cleaned up on re-evaluation
6. Batch dedup: effects run once per batch regardless of trigger count
7. Effect ordering: insertion order preserved (Map semantics in JS)
8. domEffect in SSR: runs once synchronously without tracking, no graph allocation
9. lifecycleEffect in SSR: complete no-op
10. `Object.is()` equality for value comparison (NaN === NaN, +0 !== -0)

## Tasks

### Task 1: SignalGraph struct + signal create/read/write

**Files:**
- `native/vtz/src/runtime/signal_graph.rs` (new)
- `native/vtz/src/runtime/mod.rs` (modified — add `pub mod signal_graph;`)
- `native/vtz/src/runtime/signal_graph_tests.rs` (new)

**What to implement:**

Core `SignalGraph` struct with signal node operations. This task implements ONLY signals (not computed or effects).

```rust
use smallvec::SmallVec;

pub struct SignalGraph {
    nodes: Vec<SignalNode>,
    free_list: Vec<u32>,
    batch_depth: u32,
    pending_effects: Vec<u32>,
    effect_scheduled: bitvec::vec::BitVec,
    tracking_subscriber: Option<u32>,
}

pub enum SignalNode {
    Signal {
        value: v8::Global<v8::Value>,
        subscribers: SmallVec<[u32; 2]>,
        hmr_key: Option<String>,
    },
    Computed { /* Task 2 */ },
    Effect { /* Task 3 */ },
    Empty, // Free slot
}

impl SignalGraph {
    pub fn new() -> Self { /* pre-allocate 256 capacity */ }

    /// Create a signal. Returns node ID.
    pub fn create_signal(
        &mut self,
        scope: &mut v8::HandleScope,
        value: v8::Local<v8::Value>,
        hmr_key: Option<String>,
    ) -> u32 { /* allocate from free_list or push */ }

    /// Read signal value. If tracking_subscriber is active, adds dependency edge.
    pub fn read_signal(
        &mut self,
        scope: &mut v8::HandleScope,
        id: u32,
    ) -> Result<v8::Local<v8::Value>, SignalGraphError> { /* ... */ }

    /// Write signal value. Uses Object.is() semantics for equality check.
    /// If value changed, notifies subscribers (batch-aware).
    pub fn write_signal(
        &mut self,
        scope: &mut v8::HandleScope,
        id: u32,
        new_value: v8::Local<v8::Value>,
    ) -> Result<(), SignalGraphError> { /* ... */ }

    /// Dispose a single node. Drops v8::Global handles.
    pub fn dispose(&mut self, id: u32) { /* ... */ }

    /// Dispose entire graph. Called by Drop impl.
    pub fn dispose_all(&mut self) { /* ... */ }
}

impl Drop for SignalGraph {
    fn drop(&mut self) { self.dispose_all(); }
}

pub enum SignalGraphError {
    InvalidId(u32),
    NodeDisposed { id: u32, hmr_key: Option<String> },
    // More variants in Task 2-3
}
```

For `Object.is()` equality check in Rust: use `v8::Value::same_value()`.

**Acceptance criteria:**
- [ ] `create_signal()` allocates a signal node, returns ID
- [ ] `read_signal()` returns the V8 value
- [ ] `read_signal()` adds dependency edge when `tracking_subscriber` is set
- [ ] `write_signal()` updates value if `Object.is()` comparison shows change
- [ ] `write_signal()` with same value (Object.is) does nothing
- [ ] `dispose()` drops the V8 Global handle
- [ ] `Drop` impl calls `dispose_all()` for leak-free cleanup
- [ ] `SignalGraphError::InvalidId` returned for out-of-range or disposed nodes
- [ ] Error messages include `hmr_key` (signal name) when available

---

### Task 2: Computed nodes + lazy evaluation

**Files:**
- `native/vtz/src/runtime/signal_graph.rs` (modified)
- `native/vtz/src/runtime/signal_graph_tests.rs` (modified)

**What to implement:**

Add `Computed` variant to `SignalNode` and implement lazy evaluation with dirty propagation.

```rust
SignalNode::Computed {
    compute_fn: v8::Global<v8::Function>,
    cached_value: Option<v8::Global<v8::Value>>,
    state: ComputedState,
    sources: SmallVec<[u32; 2]>,
    subscribers: SmallVec<[u32; 2]>,
}

#[derive(Clone, Copy, PartialEq)]
pub enum ComputedState { Clean, Dirty, Computing }
```

Methods:
```rust
impl SignalGraph {
    pub fn create_computed(
        &mut self,
        scope: &mut v8::HandleScope,
        compute_fn: v8::Local<v8::Function>,
    ) -> u32 { /* ... */ }

    /// Read computed value. If Dirty, re-evaluates by calling compute_fn in V8.
    /// Sets tracking_subscriber to self during evaluation to capture dependencies.
    /// Compares new value with cached via Object.is() — only notifies if changed.
    pub fn read_computed(
        &mut self,
        scope: &mut v8::HandleScope,
        id: u32,
    ) -> Result<v8::Local<v8::Value>, SignalGraphError> { /* ... */ }
}
```

Re-evaluation algorithm (must match JS `ComputedImpl._compute`):
1. Set state to `Computing`
2. Clear old sources: remove self from each source's subscribers list
3. Save and set `tracking_subscriber = Some(id)`
4. Call `compute_fn.call(scope, undefined, &[])` in V8
5. Restore previous `tracking_subscriber`
6. Cache new value
7. If value changed (Object.is), notify own subscribers
8. Set state to `Clean`

Dirty propagation (called when a source changes):
- If computed is already `Dirty`, skip (dedup)
- Set state to `Dirty`
- Propagate to own subscribers (synchronously for computeds, queue for effects)

**Acceptance criteria:**
- [ ] Computed evaluates lazily (only when dirty AND accessed)
- [ ] Clean computed returns cached value without re-evaluating
- [ ] Dependencies captured dynamically during evaluation
- [ ] Old dependencies cleaned up on re-evaluation (conditional branches work)
- [ ] Diamond dependency: `a -> b, c -> d` — `d` evaluates exactly once when `a` changes
- [ ] Cycle detection: `ComputedState::Computing` detected, returns error
- [ ] `Object.is()` comparison: only notifies subscribers if value actually changed
- [ ] Test: diamond dependency evaluates computed exactly once
- [ ] Test: conditional branch cleans up stale dependency

---

### Task 3: Effects + batch scheduling

**Files:**
- `native/vtz/src/runtime/signal_graph.rs` (modified)
- `native/vtz/src/runtime/signal_graph_tests.rs` (modified)

**What to implement:**

Add `Effect` variant and batch scheduling.

```rust
SignalNode::Effect {
    effect_fn: v8::Global<v8::Function>,
    sources: SmallVec<[u32; 2]>,
    disposed: bool,
}
```

Methods:
```rust
impl SignalGraph {
    pub fn create_effect(
        &mut self,
        scope: &mut v8::HandleScope,
        effect_fn: v8::Local<v8::Function>,
    ) -> u32 {
        // Create node, run effect_fn immediately (captures initial dependencies)
    }

    pub fn batch_start(&mut self) { self.batch_depth += 1; }

    pub fn batch_end(&mut self, scope: &mut v8::HandleScope) -> Result<(), SignalGraphError> {
        self.batch_depth -= 1;
        if self.batch_depth == 0 {
            self.flush_effects(scope)?;
        }
        Ok(())
    }

    /// Flush pending effects. Iterative: effects may trigger new signals,
    /// queuing more effects. Loop exits when pending_effects is empty.
    fn flush_effects(&mut self, scope: &mut v8::HandleScope) -> Result<(), SignalGraphError> {
        loop {
            self.effect_scheduled.fill(false); // Clear bitset each iteration
            if self.pending_effects.is_empty() { break; }
            let effects: Vec<u32> = self.pending_effects.drain(..).collect();
            for effect_id in effects {
                self.run_effect(scope, effect_id)?;
            }
        }
        Ok(())
    }

    fn run_effect(&mut self, scope: &mut v8::HandleScope, id: u32) -> Result<(), SignalGraphError> {
        // 1. Clear old sources
        // 2. Set tracking_subscriber = Some(id)
        // 3. Call effect_fn in V8
        // 4. Restore tracking_subscriber
        // Note: effect may read signals/computeds during execution,
        // which re-establishes dependency edges
    }
}
```

Scheduling (called from `write_signal` and computed dirty propagation):
```rust
fn schedule_notify(&mut self, subscriber_id: u32) {
    match &self.nodes[subscriber_id] {
        SignalNode::Computed { .. } => {
            // Synchronous: mark dirty and propagate further
            self.mark_computed_dirty(subscriber_id);
        }
        SignalNode::Effect { disposed, .. } if !disposed => {
            // Queue for batch flush
            if !self.effect_scheduled[subscriber_id as usize] {
                self.effect_scheduled.set(subscriber_id as usize, true);
                self.pending_effects.push(subscriber_id);
            }
        }
        _ => {}
    }
}
```

Auto-batching: `write_signal()` wraps notification in implicit batch (batch_start + batch_end) if batch_depth == 0.

**Acceptance criteria:**
- [ ] Effect runs immediately on creation (capturing initial dependencies)
- [ ] Effect re-runs when any dependency changes
- [ ] Batching: multiple signal writes → single effect run
- [ ] Effect dedup: same effect queued multiple times runs once per batch
- [ ] Nested batches: only outermost batch triggers flush
- [ ] Auto-batching: signal writes outside explicit batch still batch correctly
- [ ] Iterative flush: effect-triggers-effect chains resolve correctly
- [ ] Disposed effects do not run
- [ ] Effect ordering: insertion order preserved (creation order)
- [ ] Test: batch of 3 signal writes → effect runs once
- [ ] Test: effect that writes a signal → triggers another effect correctly

---

### Task 4: deno_core ops + V8 bootstrap swap

**Files:**
- `native/vtz/src/runtime/ops/signals.rs` (new)
- `native/vtz/src/runtime/js_runtime.rs` (modified — register signal ops)
- `native/vtz/src/runtime/ops/mod.rs` (modified — add `pub mod signals;`)

**What to implement:**

Register deno_core ops that bridge V8 calls to `SignalGraph`. The graph is stored as a thread-local (one per V8 thread).

```rust
use deno_core::op2;

thread_local! {
    static SIGNAL_GRAPH: RefCell<Option<SignalGraph>> = RefCell::new(None);
}

/// Called at the start of each SSR render to create a fresh graph.
#[op2(fast)]
pub fn op_signal_graph_init() {
    SIGNAL_GRAPH.with(|g| *g.borrow_mut() = Some(SignalGraph::new()));
}

/// Called at the end of each SSR render to dispose the graph.
#[op2(fast)]
pub fn op_signal_graph_dispose() {
    SIGNAL_GRAPH.with(|g| *g.borrow_mut() = None);
}

#[op2]
pub fn op_signal_create(
    scope: &mut v8::HandleScope,
    value: v8::Local<v8::Value>,
    #[string] hmr_key: Option<String>,
) -> u32 {
    SIGNAL_GRAPH.with(|g| {
        let mut graph = g.borrow_mut();
        let graph = graph.as_mut().expect("signal graph not initialized");
        graph.create_signal(scope, value, hmr_key)
    })
}

// ... op_signal_read, op_signal_write, op_computed_create, op_computed_read,
//     op_effect_create, op_batch_start, op_batch_end, op_dispose
```

In `js_runtime.rs`, add these ops to `all_op_decls()` and register them in the extension.

The bootstrap script swaps `signal()`, `computed()`, `effect()` etc. in `@vertz/ui/runtime`:

```javascript
// signal_bootstrap.js — injected during Isolate init when native signals are available
(function() {
  const nativeSignal = Deno.core.ops.op_signal_create;
  if (!nativeSignal) return; // Not available, keep JS implementation

  globalThis.__VERTZ_NATIVE_SIGNALS__ = true;

  // The module system resolves @vertz/ui/runtime to the loaded module.
  // We override the factory functions with native-backed versions.
  // This must run AFTER the module is loaded but BEFORE any components render.
  // Implementation: override globalThis.__vertz_signal_factory etc.
})();
```

**Acceptance criteria:**
- [ ] All ops registered and callable from JavaScript
- [ ] `op_signal_graph_init/dispose` correctly manage thread-local graph lifecycle
- [ ] `op_signal_create` returns a valid ID usable in subsequent ops
- [ ] `op_signal_read/write` correctly dispatch to SignalGraph methods
- [ ] Bootstrap script swaps signal runtime when native ops are available
- [ ] On Bun (no native ops), bootstrap is a no-op, JS signals work as before
- [ ] `/__vertz_diagnostics` reports `nativeSignals: true` when active

---

### Task 5: SSR-specific behavior + disposal safety

**Files:**
- `native/vtz/src/runtime/signal_graph.rs` (modified)
- `native/vtz/src/runtime/ops/signals.rs` (modified)
- `native/vtz/src/runtime/signal_graph_tests.rs` (modified)

**What to implement:**

**SSR domEffect behavior:** When `op_effect_create` is called in SSR context, it must:
1. Execute the callback once synchronously (via V8 function call)
2. Do NOT allocate a node in the graph
3. Do NOT set tracking_subscriber (no dependency capture)
4. Return a sentinel ID (`u32::MAX`) meaning "no cleanup needed"

This matches the JS implementation where `domEffect()` in SSR creates no `EffectImpl`.

```rust
#[op2]
pub fn op_dom_effect_create(
    scope: &mut v8::HandleScope,
    effect_fn: v8::Local<v8::Function>,
    is_ssr: bool,
) -> u32 {
    if is_ssr {
        // Execute once without tracking, no graph allocation
        let undefined = v8::undefined(scope).into();
        let _ = effect_fn.call(scope, undefined, &[]);
        return u32::MAX; // sentinel: no cleanup
    }
    // Normal CSR path: create effect node with tracking
    SIGNAL_GRAPH.with(|g| { /* ... */ })
}
```

**Disposal safety with catch_unwind:**
The SSR render path must wrap the entire render in `catch_unwind` to ensure `SignalGraph::drop()` runs even on V8 callback panics. The `op_signal_graph_dispose` op is a safety net, but the thread-local drop on thread exit also catches leaks.

**lifecycleEffect in SSR:** Complete no-op. `op_lifecycle_effect_create` in SSR context returns `u32::MAX` immediately without executing the callback.

**Acceptance criteria:**
- [ ] `domEffect` in SSR: callback executes once, no graph allocation, no tracking
- [ ] `lifecycleEffect` in SSR: complete no-op, returns sentinel
- [ ] `deferredDomEffect` in SSR: same as domEffect (execute once, no tracking)
- [ ] Graph disposal: all V8 Global handles released (verified with handle counting)
- [ ] Panic during effect execution: graph still disposed correctly via Drop
- [ ] Test: SSR render with 100 domEffects allocates zero effect nodes
- [ ] Test: V8 callback panic → graph dropped, no handle leak

---

### Task 6: Full parity test suite + benchmark

**Files:**
- `native/vtz/src/runtime/signal_graph_tests.rs` (modified)
- `native/vtz/benches/signal_graph.rs` (new)

**What to implement:**

**Parity testing:** Run the existing `packages/ui/src/runtime/__tests__/signal.test.ts` suite on the native runtime. The tests use `signal()`, `computed()`, `effect()` — on the native runtime, these are now backed by Rust ops via the bootstrap swap.

No test modifications should be needed. If any test fails, it's a bug in the native implementation.

**Rust-level unit tests** in `signal_graph_tests.rs`:
- Signal create/read/write/dispose lifecycle
- Computed lazy evaluation + dirty propagation
- Diamond dependency deduplication
- Dynamic dependency cleanup (conditional branches)
- Effect scheduling + batch deduplication
- Effect ordering preservation
- Nested batch semantics
- Iterative flush (effect-triggers-effect)
- SSR domEffect inline execution
- Disposal safety (Drop impl)
- Error messages include hmr_key

**Benchmark** in `benches/signal_graph.rs`:
```rust
// Micro-benchmarks:
// 1. Create 500 signals: measure allocation time
// 2. Read 500 signals with tracking: measure boundary crossing overhead
// 3. Write 50 signals in batch → propagate → flush: measure full cycle
// 4. Diamond dependency (a → b,c → d): measure propagation + dedup
// 5. Full SSR render simulation: 500 signals, 200 computeds, 100 effects
//
// Compare against: baseline measurement of JS signal runtime doing the same work
```

**Kill gate validation:** If benchmark 5 (full SSR simulation) shows native signals >2x slower than JS for <2000 nodes, document the results and defer this sub-phase.

**Acceptance criteria:**
- [ ] All existing `signal.test.ts` tests pass on native runtime
- [ ] Benchmark: native signals within 1.5x of JS for 500-node workload
- [ ] Benchmark: native signals faster than JS for >1000 nodes
- [ ] Zero test modifications needed (API compatibility verified)
- [ ] Error messages in test output include signal names, not raw IDs
