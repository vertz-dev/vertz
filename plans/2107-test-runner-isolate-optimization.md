# Test Runner Isolate Optimization — Design Document

> "Performance is not optional. [...] If we're not the fastest, we find out why and we fix it." — Vertz Vision, Principle 7

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-30 | Initial draft |
| 2 | 2026-03-30 | Address review findings: move Phase 3 to Future Work, add post-restore steps for snapshot (promise hooks + native functions), specify build.rs with caching, fix compile cache key (add compiler version + target + source maps + CSS), rename `--clear-cache` → `--no-cache`, add regression target for small suites, align acceptance criteria with projections, add V8 bytecode cache to non-goals, reconcile with parent design doc |
| 3 | 2026-03-30 | POC Results: all 8 correctness tests pass, benchmark shows 75% reduction in isolate creation overhead (5.58ms → 1.39ms avg in release). POC validated, ready for implementation. |
| 4 | 2026-03-30 | Implementation deviation: LazyLock instead of build.rs for snapshot creation. Eliminates need for deno_core as build dependency. Same functional behavior, simpler build pipeline. |
| 5 | 2026-04-06 | Shared constants (`ASYNC_CONTEXT_SNAPSHOT_JS`, `ASYNC_CONTEXT_REHOOK_JS`) extracted to `runtime/snapshot.rs` for reuse by the production snapshot (#2116). `ASYNC_CONTEXT_SNAPSHOT_JS` now includes `AsyncContext.Snapshot` class for full parity with `ASYNC_CONTEXT_JS`. |

---

## Executive Summary

Optimize the Vertz test runner's per-file overhead by eliminating redundant V8 startup work. The current architecture creates a **fresh V8 isolate per test file**, costing ~18-28ms each (V8 creation + extension registration + bootstrap JS execution + async context polyfill + test harness injection + module loading). At 100+ files, this overhead dominates total execution time.

Issue #2107 proposed sharing a single V8 isolate across test files using isolated `v8::Context` objects. However, **deno_core 0.311.0 does not expose a multi-context API** (no `JsRealm`, no `create_realm`). This design proposes two optimizations that achieve significant speedups within deno_core's constraints while preserving perfect test isolation.

**Note:** The parent design doc (`plans/vertz-test-runner.md` Rev 2) lists "Isolate pool" as Precondition 1. This was a speculative design that was not implemented — the shipped test runner uses fresh isolates per file and works correctly. The parent doc should be updated to reclassify the isolate pool from a precondition to a deferred optimization. This design doc supersedes that precondition.

---

## The Problem

### Current Per-File Startup Cost Breakdown

| Component | Estimated Time | Snapshottable? |
|---|---|---|
| V8 isolate creation | ~5ms | Faster from snapshot |
| Extension registration (20+ ops, op state) | ~2ms | No (per-runtime state) |
| Bootstrap JS execution (15 modules, ~500 lines) | ~3ms | Yes |
| Async context polyfill — class definitions | ~0.5ms | Yes |
| Async context polyfill — hook registration | ~0.5ms | No (runtime state) |
| Test harness injection (TEST_HARNESS_JS, ~1000 lines) | ~2ms | Yes |
| Native V8 function registration (structuredClone, promise hooks) | ~0.2ms | No (re-register post-restore) |
| Module loading (resolution + TS compilation + evaluation) | ~5-15ms | Phase 2 targets this |
| **Total per file** | **~18-28ms** | |

For 100 files on 8 threads: `100 × 23ms / 8 = ~288ms` of pure overhead — nearly 80% of the total 371ms runtime.

### Current Benchmarks (Vertz vs Bun)

| Suite | Bun (median) | Vertz (median) | Gap |
|---|---|---|---|
| 3 files / 32 tests | 57ms | 60ms | Bun 5% faster |
| 20 files / 220 tests | 110ms | 89ms | Vertz 19% faster |
| 50 files / 550 tests | 215ms | 165ms | Vertz 23% faster |
| 100 files / 1200 tests | 437ms | 371ms | Vertz 15% faster |

Vertz already wins at scale due to thread-level parallelism, but gains plateau because per-file isolate overhead caps throughput.

### Why the Original Proposal Doesn't Work

Issue #2107 proposed: one `v8::Isolate` per thread, multiple `v8::Context` per isolate.

**Blockers:**
1. **deno_core 0.311.0 has no multi-context API.** No `JsRealm`, no `create_realm`. Search across the codebase confirms zero usage.
2. **Op state is per-isolate.** `ConsoleState`, `PerformanceState`, `CryptoKeyStore`, `SqliteStore` all live in deno_core's `OpState`. Multi-context would require per-context op state — a fundamental deno_core rewrite.
3. **Module graph is per-isolate.** deno_core doesn't support clearing the module cache or having per-context module graphs. Modules evaluated in one context leak to others.
4. **Promise hooks are per-isolate.** AsyncContext.Variable uses V8 promise hooks installed on the isolate. Shared isolate = shared async context state across test files.

Dropping deno_core for raw V8 APIs would lose: module loading, event loop, ops system, inspector/coverage. That's a rewrite of the entire runtime.

---

## Proposed Architecture

Two phases, each independently valuable. Ship and benchmark each before proceeding.

### Phase 1: V8 Startup Snapshots

**What:** Pre-bake bootstrap JS + test harness into a V8 heap snapshot at build time. Each new isolate loads from the snapshot instead of re-executing ~1500 lines of JS.

**How it works:**

```
First test file (lazy initialization via LazyLock):
  1. Create JsRuntimeForSnapshot with all ops registered
  2. Execute bootstrap JS (15 modules)
  3. Execute async context polyfill (classes + hook storage on globalThis)
  4. Execute TEST_HARNESS_JS (describe, it, expect, mock, etc.)
  5. Call runtime.snapshot() → serialize V8 heap
  6. Box::leak into &'static [u8] — cached for process lifetime

  Note: build.rs was considered but rejected — it would require deno_core as
  a build dependency, effectively doubling compile time. LazyLock adds ~5ms
  of one-time cost on first test file, amortized across all subsequent files.

Test time (vertz test):
  1. Create JsRuntime with startup_snapshot = SNAPSHOT        ← ~2ms instead of ~11ms
  2. Re-register native V8 functions (post-restore):          ← ~0.2ms
     - clone::register_structured_clone()  (structuredClone)
     - async_context::register_promise_hooks()  (__vertz_setPromiseHooks)
  3. Re-execute async context hook installation:              ← ~0.5ms
     - Calls __vertz_setPromiseHooks(init, before, after, resolve)
     - Hooks are runtime state (Context::set_promise_hooks), NOT heap state
  4. Initialize per-file op state (ConsoleState, etc.)
  5. Set test filter (if any)
  6. Load test file as ES module                              ← unchanged
  7. Run tests                                                ← unchanged
```

**Why native functions and promise hooks need re-registration:**
- `v8::Function::new(scope, callback)` binds a Rust function pointer. The function object survives the snapshot, but the callback pointer must be re-bound at restore time. deno_core handles this for ops via its extension system, but `structuredClone` and `__vertz_setPromiseHooks` are registered as raw V8 functions outside the extension system.
- `Context::set_promise_hooks()` sets per-context runtime state that is NOT serialized into the V8 heap snapshot. The async context polyfill calls this during its IIFE. After restoration, the classes exist in the heap but the hooks are not active.
- **Solution:** Use a modified async context polyfill (`ASYNC_CONTEXT_SNAPSHOT_JS`) that stores hook functions on `globalThis.__vertz_promiseHookFns` during snapshot creation (when `__vertz_setPromiseHooks` is unavailable). After restore, `ASYNC_CONTEXT_REHOOK_JS` re-installs the hooks from the stored functions.

**Snapshot-creation runtime uses `enable_inspector: false`** — no benefit to enabling inspector during snapshot creation, and it avoids unnecessary overhead.

**Expected savings:** ~5-8ms per file (conservative estimate — bootstrap + harness execution eliminated, minus snapshot deserialization cost of ~1-3ms). POC will validate actual numbers.

**deno_core support:** `RuntimeOptions` has a `startup_snapshot` field. deno_core validates that the op count at snapshot creation matches restore time — guaranteed by using shared `VertzJsRuntime::all_op_decls()` for both snapshot creation and restore.

**Isolation:** Perfect — each file still gets a fresh isolate. Zero risk of state leakage.

### Phase 2: Module Compilation Cache

**What:** Cache compiled TypeScript → JavaScript on disk. Skip recompilation for unchanged files across test runs.

**How it works:**

```
Cache key: SHA-256(source_content + compiler_version + compilation_target)

First run:
  module_loader.compile_source("task.test.ts")
  → oxc compile + post_process_compiled()
  → cache to .vertz/compile-cache/<sha256>.json
     { "code": "...", "sourceMap": "...", "css": "..." }
  → return compiled JS

Subsequent runs (file unchanged):
  module_loader.compile_source("task.test.ts")
  → hash source + version + target → cache hit
  → return cached JS + source map + CSS (skip oxc + post-processing)
```

**Cache key includes compiler version** to prevent stale cache hits when Vertz is updated. The runtime version string is included in the hash. On version mismatch, entries are naturally invalidated (different hash = cache miss).

**Cached artifacts:** The cache stores the fully post-processed output (after `post_process_compiled()`), the source map (needed for error stack traces and coverage mapping), and extracted CSS (if any). All three are required for correct behavior.

**Expected savings:** ~3-8ms per file on subsequent runs (depending on file size). First run unchanged.

**Cache location:** `.vertz/compile-cache/` (gitignored).

**Cache bypass:** `vertz test --no-cache` skips the cache for the current run (compiles everything fresh). For a full cache wipe, delete `.vertz/compile-cache/` or run `vertz clean`.

**Isolation:** No impact — compilation is stateless.

### Projected Impact

| Scenario (100 files, 8 threads) | Estimated Time | Improvement |
|---|---|---|
| Current (fresh isolate, no cache) | ~371ms | baseline |
| Phase 1 (snapshot) | ~270ms | ~27% faster |
| Phase 1+2 (snapshot + compile cache, 2nd run) | ~190ms | ~49% faster |

**Non-regression target:** The 3-file suite (where Vertz currently trails Bun by 5%) must not regress. Snapshot deserialization should be comparable to or faster than bootstrap execution even at small scale. Target: 3-file suite ≤ 60ms.

**1000+ file projection:** The Vertz monorepo has 1,010 test files. At 1000 files on 8 threads, current overhead is ~2.9s. Phase 1+2 should reduce this to ~1.5s. This is the real-world workload that matters.

---

## API Surface

### No Public API Changes (Phase 1)

Phase 1 is a pure internal optimization. No user-facing changes.

### Phase 2: One New CLI Flag

```bash
vertz test --no-cache    # Skip compilation cache for this run
```

No other configuration needed. Cache is transparent and self-invalidating.

---

## Manifesto Alignment

### Principle 7: Performance is not optional
This is a pure performance optimization. The test runner is already functional; this makes it faster. The phased approach lets us ship measurable improvements incrementally.

### Principle 8: No ceilings
deno_core's lack of multi-context support is a limitation. Rather than accepting it as a ceiling, we design around it with V8 snapshots (proven technique from Deno/Node.js themselves) and compilation caching.

### Principle 4: Test what matters, nothing more
The optimization preserves test isolation guarantees completely. Both phases are isolation-preserving by design — each file still gets a fresh isolate.

### Principle 2: One way to do things
No new test APIs. No configuration knobs for Phase 1. Phase 2 adds only `--no-cache` (bypass, not an alternative mode). There is one way to run tests; it just runs faster.

---

## Non-Goals

1. **Dropping deno_core** — Too large a rewrite. The snapshot approach works within deno_core's model.
2. **Raw V8 multi-context** — Would lose module loading, event loop, ops, coverage. Not worth it.
3. **Watch mode optimization** — Separate concern (file watcher + module graph invalidation). Not tracked yet — will be a separate design doc when prioritized.
4. **Parallel test execution within a file** — Tests within a file remain sequential. This is a deliberate design choice (sequential execution ensures `beforeEach`/`afterEach` semantics make sense), not a technical limitation.
5. **Upgrading deno_core for JsRealm** — Uncertain timeline, uncertain API stability. Not a dependency.
6. **Sub-millisecond per-file overhead** — Diminishing returns. The goal is to remove the obvious overhead, not micro-optimize.
7. **V8 bytecode cache (code cache)** — V8 supports serializing compiled bytecode separately from heap snapshots. This is an additional optimization on top of Phase 2 (TS compile cache avoids oxc, but V8 still parses JS to bytecode). Evaluated and deferred: the expected gain (~1-2ms) doesn't justify the complexity. Revisit if Phase 1+2 underdeliver.
8. **Persistent isolate with module deduplication** — See "Future Work" section. Weakens isolation guarantees, high complexity, deferred until Phase 1+2 results are measured.

---

## Unknowns

### Must resolve before implementation

1. **Snapshot compatibility with op state initialization.** V8 snapshots capture JS heap state but not Rust-side `OpState`. Need to verify that ops registered at snapshot time work correctly when `OpState` is re-initialized at runtime.
   - **Resolution:** POC — create snapshot with all ops, restore, verify `console.log` / `setTimeout` / `fetch` still work.

2. **Native V8 function re-registration after snapshot restore.** `structuredClone` and `__vertz_setPromiseHooks` are registered as raw V8 functions (not via the extension system). Need to verify they can be re-bound after snapshot restoration.
   - **Resolution:** POC — create snapshot, restore, call `structuredClone({a: 1})` and verify it works. Then call `new AsyncContext.Variable()` and verify promise hooks fire.

3. **Snapshot size and load time.** Measure: (a) snapshot blob size, (b) isolate-from-snapshot creation time vs. fresh creation time.
   - **Resolution:** POC — benchmark with `std::time::Instant` around both paths.

### Acceptable to defer

4. **Compile cache invalidation with transitive dependencies.** If `a.test.ts` imports `utils.ts`, and `utils.ts` changes, the cached `a.test.ts` compilation is still valid (import resolution happens at module load, not compilation). Ambient type changes are rare and a full cache clear handles them.

---

## POC Results

POC code: `native/vertz-runtime/src/test/snapshot_poc.rs`

### POC 1: V8 Snapshot Creation and Restoration — VALIDATED

- **Question:** Can we create a V8 snapshot that includes bootstrap JS + test harness, restore it with per-file op state, and re-register native functions + promise hooks?
- **What was tried:**
  1. Created `JsRuntimeForSnapshot` with all ops
  2. Executed bootstrap JS + modified async context (class defs + stored hook fns on globalThis) + `TEST_HARNESS_JS`
  3. Took snapshot
  4. Restored into new `JsRuntime` with `startup_snapshot`
  5. Re-registered `structuredClone` and `__vertz_setPromiseHooks`
  6. Re-executed hook installation JS (reads stored fns from globalThis)
  7. Ran test suites using `describe`/`it`/`expect`, `structuredClone`, `AsyncContext.Variable` with promise propagation, `setTimeout`, `console`
- **Result:** All 8 correctness tests pass:
  - `poc1_snapshot_creates_successfully` — snapshot created successfully
  - `poc1_snapshot_restores_with_test_harness` — describe/it/expect globals work
  - `poc1_snapshot_restores_with_structured_clone` — structuredClone works after re-registration
  - `poc1_snapshot_restores_with_async_context` — synchronous AsyncContext.Variable works
  - `poc1_snapshot_async_context_propagates_through_promises` — async context propagates through await (promise hooks re-installed correctly)
  - `poc1_snapshot_runs_test_suite_correctly` — full test suite (4 tests: assertion, deep equality, array contains, mock function) passes from snapshot
  - `poc1_snapshot_preserves_console` — console.log available
  - `poc1_snapshot_preserves_timers` — setTimeout works

### POC 2: Snapshot Performance Measurement — VALIDATED

- **Question:** How much time does the snapshot save per isolate creation?
- **What was tried:** 20 iterations comparing fresh isolate (VertzJsRuntime::new + async context + test harness) vs snapshot-based creation (restore + re-register + rehook).
- **Result (release build):**

| Metric | Fresh Isolate | From Snapshot | Savings |
|---|---|---|---|
| Average | 5.58ms | 1.39ms | 4.18ms (75%) |
| Median | 5.24ms | 1.38ms | 3.86ms (74%) |

**75% reduction in per-file isolate creation overhead.** This exceeds the estimated 5-8ms savings — actual savings of ~4.2ms per file, with per-file creation dropping from ~5.6ms to ~1.4ms.

**Projected impact at scale (revised based on POC data):**
- 100 files / 8 threads: saves ~52ms (100 × 4.18ms / 8)
- 1000 files / 8 threads: saves ~523ms (1000 × 4.18ms / 8)

Note: The POC measures isolate creation overhead only (not module loading). Total per-file overhead is higher due to module resolution + compilation + evaluation. Phase 2 (compile cache) targets that portion.

---

## Type Flow Map

Not applicable — this is Rust-level infrastructure. No TypeScript generics involved.

---

## E2E Acceptance Test

### Phase 1: Snapshot

```
Given: 100 test files with simple tests (describe/it/expect)
When: `vertz test` runs with snapshot-based isolate creation
Then:
  - All 100 files pass (correctness preserved)
  - Total runtime ≥25% faster than baseline at 100 files
  - 3-file suite does not regress beyond 60ms
  - Test isolation preserved (globalThis mutations in file A don't leak to file B)
  - AsyncContext.Variable works correctly (promise hooks re-registered)
  - structuredClone works correctly (native function re-bound)
  - Coverage collection still works (--coverage flag)
  - bun:test compatibility shim still works (import { describe } from 'bun:test')
```

### Phase 2: Compilation Cache

```
Given: 100 test files, run twice without code changes
When: Second `vertz test` run executes
Then:
  - Second run ≥15% faster than first run
  - Cache files exist in .vertz/compile-cache/
  - Modifying a source file invalidates only that file's cache entry
  - Updating Vertz (new compiler version) invalidates all cache entries
  - --no-cache bypasses cache (all files recompiled)
  - Error stack traces are correctly source-mapped (source maps cached)
  - All tests still pass (cached compilation produces identical results)
```

---

## Implementation Plan

### Phase 1: V8 Startup Snapshots

**Prerequisites:** POC 1 and POC 2 completed and validated.

#### 1.1 — Split async context polyfill

- Split `ASYNC_CONTEXT_JS` into:
  - `ASYNC_CONTEXT_CLASSES_JS` — class definitions (`AsyncContext.Variable`, `AsyncContext.Snapshot`). Snapshottable.
  - `ASYNC_CONTEXT_HOOKS_JS` — promise hook installation (`__vertz_setPromiseHooks(init, before, after, resolve)`). Must run post-restore.

#### 1.2 — Snapshot creation via build.rs

- Add `build.rs` to `native/vertz-runtime/`
- Hash all bootstrap JS source constants + `TEST_HARNESS_JS` + `ASYNC_CONTEXT_CLASSES_JS`
- Only regenerate snapshot when hash changes (write hash to `OUT_DIR/snapshot.hash`)
- Create `JsRuntimeForSnapshot` with all ops, `enable_inspector: false`
- Execute: bootstrap JS → `ASYNC_CONTEXT_CLASSES_JS` → `TEST_HARNESS_JS`
- Write snapshot to `OUT_DIR/test_snapshot.bin`
- Main binary: `static SNAPSHOT: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/test_snapshot.bin"));`

#### 1.3 — Snapshot-based runtime creation

- Add `VertzJsRuntime::new_for_test(options)` that:
  - Creates `JsRuntime` with `startup_snapshot = SNAPSHOT`
  - Calls `clone::register_structured_clone()` (re-bind native function)
  - Calls `async_context::register_promise_hooks()` (re-bind native function)
  - Executes `ASYNC_CONTEXT_HOOKS_JS` (re-install promise hooks)
  - Initializes per-runtime op state (ConsoleState, PerformanceState, etc.)
  - Creates module loader (per-runtime, as before)

#### 1.4 — Executor integration

- `execute_test_file_inner()` calls `VertzJsRuntime::new_for_test()` instead of `new()`
- Remove: bootstrap JS execution, `load_async_context()` call, `TEST_HARNESS_JS` injection
- Keep: filter setting, preload scripts, module loading, test execution, coverage collection

#### 1.5 — Benchmark validation

- Run existing benchmark suite (3/20/50/100 files)
- Compare with baseline
- Verify non-regression: 3-file suite ≤ 60ms
- Verify correctness: full test suite passes, coverage works, async context works

### Phase 2: Module Compilation Cache

#### 2.1 — Cache infrastructure

- `CompileCache` struct in `module_loader.rs` (or new `compile_cache.rs`)
- Disk-backed, content-hash-keyed
- Key: `SHA-256(source_content + COMPILER_VERSION + target)`
- Value: JSON `{ "code": "...", "sourceMap": "...", "css": "..." }`
- Location: `.vertz/compile-cache/<sha256-prefix>/<sha256>.json`
- API: `get(source, target) -> Option<CachedCompilation>`, `put(source, target, result)`

#### 2.2 — Module loader integration

- In `compile_source()`: compute hash → check cache → on hit: return cached → on miss: compile → post-process → cache → return
- Source maps from cache stored in `VertzModuleLoader::source_maps` as before
- CSS from cache injected as before (`__vertz_inject_css()` call)

#### 2.3 — CLI flag

- `--no-cache` flag: sets `CompileCache` to no-op mode (always miss, never store)
- No other configuration needed

#### 2.4 — Benchmark validation

- Run 100-file suite twice: measure first vs. second run
- Verify source-mapped error stack traces
- Verify coverage works with cached compilation
- Verify cache invalidation on file change

---

## Future Work: Persistent Isolate with Module Deduplication

> This section documents a potential Phase 3 that was evaluated and deferred. It will only be pursued if Phase 1+2 benchmarks show insufficient improvement. A separate design doc will be opened with an explicit trigger condition.

**Trigger:** If Phase 1+2 combined do not achieve ≤200ms at 100 files (≥46% improvement), open a new design doc for persistent isolate optimization.

**Concept:** Keep one `JsRuntime` alive per worker thread across test files. Reset test harness state between files. Module cache persists for shared dependencies.

**Key concerns identified during review:**
- Module-level side effects leak between files (deno_core caches evaluated modules — `let counter = 0` in a shared util runs once, not per-file)
- `globalThis` reset is complex: non-configurable properties, prototype chain mutations, Symbol-keyed properties
- Promise hooks are per-context — shared isolate means shared async context state
- Default must be safe (fresh isolate); persistent mode must be opt-in (`--fast` or `--reuse-isolate`)
- Need explicit diagnostic when a test fails due to state leakage from another file

**Estimated additional savings:** ~50ms at 100 files (from ~190ms to ~90ms).

---

## Key Files

| Component | Path |
|---|---|
| JsRuntime wrapper | `native/vertz-runtime/src/runtime/js_runtime.rs` |
| Test executor | `native/vertz-runtime/src/test/executor.rs` |
| Test runner (thread pool) | `native/vertz-runtime/src/test/runner.rs` |
| Module loader | `native/vertz-runtime/src/runtime/module_loader.rs` |
| Test harness JS | `native/vertz-runtime/src/test/globals.rs` |
| Bootstrap JS modules | `native/vertz-runtime/src/runtime/ops/*.rs` (each has `*_BOOTSTRAP_JS`) |
| Async context polyfill | `native/vertz-runtime/src/runtime/async_context.rs` |
| Existing test runner design | `plans/vertz-test-runner.md` |
