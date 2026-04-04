# vtz Test Runner Performance — Design Document

> "Performance is not optional. [...] If we're not the fastest, we find out why and we fix it." — Vertz Vision, Principle 7

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-04-04 | Initial draft |
| 2 | 2026-04-04 | Address review findings: Fix V8 code cache API (use `code_cache_ready()` on ModuleLoader, not nonexistent `ModuleCodeCacheHandler`), swap Phase 1↔2 (simpler source cache first), revise single-file estimates (V8 code cache provides zero benefit for single-file runs), `--no-cache` now bypasses all caches, add memory budget, use `RwLock<HashMap>` instead of DashMap, fix JUnit/JSON reporters in Phase 4, add sequential E2E target, add watch mode invalidation note |

---

## Executive Summary

The vtz test runner reports a 4-7x "time" gap vs bun test on `@vertz/schema` (63 files, 465 tests). However, profiling reveals the reported "Time:" metric is the **sum of per-file durations** (aggregate CPU time), not wall clock. The actual wall clock gap is **~1.5x** (214ms vtz vs 146ms bun) for parallel execution — already within the `< 2x` target.

**Why this matters now:** The parallel gap is acceptable, but the **TDD hot path is not**. Single-file runs (the most common developer action during TDD) take 87ms in vtz vs 11ms in bun — a 6x gap. Sequential execution (CI on constrained runners) is 520ms vs 150ms — a 3.5x gap. And the reporter is actively misleading by showing aggregate CPU time as "Time:", eroding trust in the tool. The test runner is a priority for CI adoption (see memory: `project-test-runner-priority.md`).

**The real problems:**
1. **Per-file overhead is 6x** (87ms vs 11ms) — impacts single-file TDD runs
2. **Misleading reporter metric** — "Time:" shows aggregate, not wall clock
3. **Disk I/O per import per isolate** — compile cache is disk-only, no in-memory sharing
4. **V8 module parsing is repeated per isolate** — deno_core supports V8 code caching via `code_cache_ready()` on `ModuleLoader` but it's not being used
5. **Module resolution is repeated per isolate** — no shared resolution cache across threads

This design proposes three optimizations that build on the existing snapshot and compile cache (#2107), ordered by implementation simplicity and risk:

1. **In-memory module source cache** — eliminate disk I/O for repeated imports (simplest, most predictable)
2. **V8 code cache** — cache V8 bytecode across isolates via `ModuleLoader::code_cache_ready()` (highest per-file impact for multi-file runs)
3. **Shared module resolution cache** — eliminate redundant filesystem lookups
4. **Reporter fix** — show wall clock time, fix all reporter formats (terminal, JUnit, JSON)

Issue: [#2259](https://github.com/vertz-dev/vertz/issues/2259)

---

## Current Benchmarks (@vertz/schema, 63 files, 465 tests)

### Parallel Execution (default concurrency, 10 CPUs)

| Runner | Wall Clock (avg of 3) | Reported "Time:" |
|---|---|---|
| **vtz test** | 214ms | 2018ms (sum of per-file durations) |
| **bun test** | 146ms | 146ms (wall clock) |
| **Gap** | **1.5x** | **~14x (misleading)** |

### Sequential Execution (concurrency=1)

| Runner | Wall Clock |
|---|---|
| **vtz test** | 520ms |
| **bun test** | 150ms |
| **Gap** | **3.5x** |

### Single File (core/errors.test.ts, 4 tests)

| Runner | Wall Clock |
|---|---|
| **vtz test** | 87ms |
| **bun test** | 11ms |
| **Gap** | **~6x** |

### Per-File Duration Distribution (vtz, 63 files)

| Range | Count | Notes |
|---|---|---|
| 0-10ms | 1 | Minimal imports |
| 10-20ms | 15 | Simple tests |
| 20-30ms | 20 | Average |
| 30-50ms | 16 | Moderate imports |
| 50-100ms | 11 | Complex import graphs |

The floor of ~10ms per file is the irreducible cost of V8 isolate creation from snapshot + minimal module load. The variance (10-90ms) correlates with import graph depth.

### Where Time Is Spent Per File (estimated)

| Component | Time | Cacheable? |
|---|---|---|
| V8 isolate from snapshot | ~1.4ms | Already optimized (#2107) |
| Module resolution (FS lookups) | ~3-8ms | **Yes — resolution cache** |
| Source read + compile cache lookup (disk) | ~2-5ms | **Yes — in-memory cache** |
| V8 JS → bytecode parsing | ~5-15ms | **Yes — V8 code cache** (multi-file only) |
| V8 module evaluation | ~5-30ms | No (per-isolate state) |
| Tokio runtime creation | ~1ms | Minimal |
| Test execution | ~2-10ms | N/A (the actual work) |

---

## Proposed Architecture

Four phases, ordered by simplicity and risk. Ship and benchmark each before proceeding.

### Phase 1: In-Memory Module Source Cache

**What:** Replace per-isolate disk reads with a thread-safe in-memory cache for compiled module sources. Currently, every module import in every test file reads from the disk compile cache (`.vertz/compile-cache/`), even when the same module was already loaded by another isolate in the same process.

**Why first:** Simplest to implement, most predictable benefit, zero API unknowns. Establishes the shared cache pattern that Phase 2 and 3 build on.

**How it works:**

```
Current (per-isolate):
  load("@vertz/schema") →
    resolve path → read source from disk → check disk cache →
    disk hit: read JSON, parse → return compiled source

Proposed (shared across isolates):
  load("@vertz/schema") →
    resolve path → check in-memory cache (RwLock<HashMap>) →
    hit: return Arc<CachedCompilation> (zero-copy) →
    miss: read source → disk cache check → compile → store in cache → return
```

**Implementation:**

1. Create `SharedSourceCache` wrapping `Arc<RwLock<HashMap<PathBuf, Arc<CachedCompilation>>>>`, passed to each `VertzModuleLoader` as an `Arc<...>` field
2. In `compile_source()`: check shared cache first → on miss, proceed with existing compile + disk cache logic → store result in shared cache
3. The shared cache is populated naturally during the first few test files and serves all subsequent files

**Why `RwLock<HashMap>` over `DashMap`:** Low contention scenario (populate during first ~6 files per thread, then read-mostly). Standard library `RwLock<HashMap>` performs similarly and avoids a new dependency. If profiling shows contention, we can switch to `DashMap` later.

**Expected savings:**
- **Multi-file parallel (63 files):** ~30-50ms wall clock (eliminates ~2-5ms disk I/O per module per file)
- **Single-file:** ~5-10ms (eliminates disk reads for the test file's imports — even a single file loads 5-20 modules from disk)
- **Sequential:** ~100-150ms (eliminates all repeated disk reads)

**Isolation:** Perfect — cached data is immutable compiled source. No runtime state shared.

### Phase 2: V8 Code Cache

**What:** Use deno_core's `code_cache_ready()` callback on the `ModuleLoader` trait to cache V8's compiled bytecode across isolates within the same process. When V8 parses JavaScript to bytecode in one isolate, the bytecode is stored in a shared cache. Subsequent isolates loading the same module provide the cached bytecode via `ModuleSource::code_cache`, allowing V8 to skip parsing.

**Important limitation:** V8 code cache provides **zero benefit for single-file runs**. A single-file run creates exactly one V8 isolate — there's no second isolate to consume the cached bytecode. This optimization only helps when multiple test files are executed in the same process.

**How it works (deno_core 0.311.0 actual API):**

```
ModuleLoader trait has:

  fn code_cache_ready(
    &self,
    specifier: ModuleSpecifier,
    hash: u64,
    code_cache: &[u8],
  ) -> Pin<Box<dyn Future<Output = ()>>>
  // Called by deno_core AFTER V8 compiles a module.
  // Store (specifier, hash, code_cache bytes) in shared cache.

  fn load(...) -> ModuleLoadResponse
  // Return ModuleSource with code_cache: Some(SourceCodeCacheInfo { hash, data })
  // when cache hit. V8 validates hash, uses cached bytecode.
```

**Implementation approach:**

1. Create `V8CodeCache` struct wrapping `Arc<RwLock<HashMap<String, (u64, Vec<u8>)>>>` — maps module specifier → (hash, bytecode)
2. Pass `V8CodeCache` as an `Arc<...>` field on each `VertzModuleLoader` instance (the loader is `!Send` via `Rc<RefCell<>>`, but can hold `Arc<...>` fields — the `Arc` is only accessed through the loader's methods, never moved across threads directly)
3. Implement `code_cache_ready()` on `VertzModuleLoader` — store bytecode in shared cache
4. In `load()` — check shared cache for specifier, return `SourceCodeCacheInfo` on hit
5. Code cache is populated lazily during execution and reused across isolates within the same process

**Expected savings:**
- **Multi-file parallel (63 files):** ~10-15% wall clock improvement. Each test file loads 5-20 modules. V8 parsing costs ~1-3ms per module. With 10 threads processing ~6 files each, the first file per thread has zero cache benefit (cold start). Subsequent files benefit from modules already cached by other threads.
- **Single-file:** **Zero** — only one isolate, nothing to cache from
- **Sequential:** ~15-20% — every file after the first benefits from cached modules

**V8 code cache correctness:** Within a single process, V8 version is guaranteed to be the same. The hash check (provided by deno_core) validates that source code hasn't changed. Code cache bytecode is safe to reuse across isolates with the same snapshot as long as the source and V8 version match.

**Isolation:** Perfect — bytecode cache is read-only compiled data. No runtime state shared.

### Phase 3: Shared Module Resolution Cache

**What:** Cache module resolution results (specifier → resolved filesystem path) in a thread-safe map shared across isolates. Currently each isolate independently resolves every import, hitting the filesystem for extension probing, package.json parsing, and symlink following.

**How it works:**

```
Current (per-isolate):
  resolve("@vertz/schema") →
    walk node_modules → read package.json → parse exports →
    resolve with extensions (.ts, .tsx, .js, .jsx, .mjs) → follow symlinks
    Cost: ~0.5-2ms per import × 10 imports × 63 files

Proposed (shared):
  resolve("@vertz/schema", referrer_dir) →
    check RwLock<HashMap<(String, PathBuf), PathBuf>> →
    hit: return cached path →
    miss: full resolution → store → return
```

**Implementation:**

1. Create `SharedResolutionCache` wrapping `Arc<RwLock<HashMap<(String, PathBuf), PathBuf>>>`, passed to each `VertzModuleLoader` as an `Arc<...>` field
2. Cache key is `(raw_specifier, referrer_directory)` — same specifier from same directory always resolves identically
3. In `resolve()`: check cache first → on miss, proceed with existing resolution → store result

**Expected savings:** ~10-30ms wall clock for multi-file runs.

### Phase 4: Reporter Fix + Documentation

**What:** Fix the "Time:" metric in **all three reporters** (terminal, JUnit, JSON) to show wall clock time. Benchmark all 5 packages and document results.

**Current output (terminal):**
```
Tests:   465 passed
Suites:  63 passed
Time:    2018ms        ← misleading: sum of per-file durations
```

**Proposed output (terminal):**
```
Tests:   465 passed
Suites:  63 passed
Time:    214ms         ← wall clock time
```

**Implementation:**

1. Add `wall_clock_ms: f64` field to `TestRunResult`, measured via `std::time::Instant` around `execute_parallel()` + type tests in `run_tests()`
2. **Terminal reporter:** use `wall_clock_ms` instead of summing per-file durations
3. **JUnit reporter:** use `wall_clock_ms` for the `<testsuites time="...">` attribute (CI tools expect wall clock by convention)
4. **JSON reporter:** add `wallClockMs` and `aggregateCpuMs` top-level fields (programmatic consumers get both values)

### Projected Impact

| Scenario (@vertz/schema, 63 files) | Parallel (10 CPUs) | Sequential | Single File |
|---|---|---|---|
| Current baseline | 214ms | 520ms | 87ms |
| + Source cache (Phase 1) | ~180ms | ~380ms | ~77ms |
| + V8 code cache (Phase 2) | ~155ms | ~320ms | ~77ms (no benefit) |
| + Resolution cache (Phase 3) | ~140ms | ~290ms | ~70ms |
| + Reporter fix (Phase 4) | ~140ms (accurate) | ~290ms (accurate) | ~70ms (accurate) |

**Conservative estimates.** V8 code cache benefit is modest for parallel (10-15%) due to cold-start on first file per thread. The biggest single-file improvement comes from in-memory source cache (Phase 1) and resolution cache (Phase 3) — eliminating disk I/O.

---

## API Surface

### No Public API Changes (Phases 1-3)

Phases 1-3 are internal optimizations. No user-facing changes.

### `--no-cache` Semantics (Updated)

`--no-cache` now bypasses **all** caching layers:
- Compile cache (disk) — existing behavior, unchanged
- In-memory source cache (Phase 1) — disabled when `--no-cache` is set
- V8 code cache (Phase 2) — disabled when `--no-cache` is set (don't store in `code_cache_ready()`, don't return `SourceCodeCacheInfo` in `load()`)
- Resolution cache (Phase 3) — **not** affected (resolution is deterministic and stateless; disabling it provides no debugging value)

This ensures `--no-cache` provides a true "clean room" execution for debugging caching issues.

### Phase 4: Reporter Output Change

```
# Before (terminal)
Time:    2018ms

# After (terminal)
Time:    214ms
```

The "Time:" field changes from aggregate CPU time to wall clock time in terminal and JUnit reporters. JSON reporter adds both `wallClockMs` and `aggregateCpuMs`.

---

## Manifesto Alignment

### Principle 7: Performance is not optional
This is a pure performance optimization. The phased approach ships measurable improvements incrementally, with benchmarks after each phase.

### Principle 8: No ceilings
deno_core's per-isolate model is a limitation. Rather than accepting it, we use V8's own code caching mechanism to share compiled bytecode across isolate boundaries, and add in-memory caches to eliminate redundant disk I/O.

### Principle 4: Test what matters, nothing more
All optimizations preserve test isolation. Each file still gets a fresh V8 isolate. The caches share only immutable, deterministic data (compiled source, resolved paths, V8 bytecode).

### Principle 2: One way to do things
No new configuration knobs. No opt-in flags. The optimizations are transparent and always active. `--no-cache` provides a consistent escape hatch.

---

## Non-Goals

1. **Shared/persistent isolate** — Reusing V8 isolates across test files would weaken isolation. Deferred per #2107's "Future Work" section. Only revisit if Phases 1-3 underdeliver.
2. **Disk-persisted V8 bytecode cache** — Process-scoped in-memory cache is sufficient. V8 bytecode generation is fast (~1-3ms per module); the win comes from not repeating it across isolates within a single run.
3. **Parallel test execution within a file** — Tests within a file remain sequential. This is a deliberate design choice for `beforeEach`/`afterEach` semantics.
4. **Watch mode optimization** — Separate concern. Not in scope. **Note:** Watch mode keeps the process alive, so the in-memory caches persist. Changed files must invalidate their cache entries. The in-memory source cache and V8 code cache should evict entries for changed file paths when watch mode triggers a re-run. This is a correctness requirement, not a performance optimization, and will be addressed as part of each phase's implementation.
5. **Matching bun's per-file overhead** — Bun shares a single JavaScriptCore context; vtz uses fresh V8 isolates for isolation. Some per-file overhead is inherent to the architecture. Target is 2-3x, not 1x.
6. **Coverage mode optimization** — Coverage adds inspector overhead; optimizing it is separate work.
7. **New dependencies** — All shared caches use `std::sync::RwLock<HashMap>` from the standard library. No `dashmap` or other new crate dependencies.

---

## Memory Budget

| Cache | Est. Size (63 files) | Est. Size (1000 files) | Notes |
|---|---|---|---|
| In-memory source cache | ~2MB | ~15MB | ~10KB compiled JS per unique module, ~200 unique modules for 63 files |
| V8 code cache | ~5MB | ~30MB | ~25KB bytecode per module (V8 bytecode is larger than source) |
| Resolution cache | ~0.1MB | ~1MB | Path strings, negligible |
| **Total** | **~7MB** | **~46MB** | Acceptable for a test runner process |

All caches are process-scoped and freed on exit. For watch mode (long-lived process), the caches grow monotonically but are bounded by the number of unique modules in the project.

---

## Unknowns

### Must resolve before implementation

1. **`code_cache_ready()` callback timing.** deno_core calls this after V8 compiles a module, but the exact timing relative to module evaluation is unclear. Need to verify: is the callback called before or after the module's top-level code runs? This affects whether early isolates can benefit from cache entries stored by concurrent isolates.
   - **Resolution:** Write a test: load a module, verify `code_cache_ready()` fires, then load the same module in a new isolate with the cached data. Verify V8 accepts it.

2. **V8 code cache effectiveness for ES modules.** V8 code caching is well-documented for scripts, but ES module bytecode caching behavior may differ (especially with top-level await, module namespace objects).
   - **Resolution:** Implement Phase 2, benchmark with a module-heavy test file, compare per-file times with/without code cache.

### Acceptable to defer

3. **Thread safety of `RwLock<HashMap>` under initial write contention.** With 10 threads loading the same popular modules simultaneously, the initial write phase may cause brief contention. `RwLock` allows concurrent reads but exclusive writes. In practice, the write phase is brief (first ~6 files per thread), then all accesses are reads.

4. **Interaction between V8 code cache and source maps.** V8 bytecode doesn't include source map references. Source maps are handled separately by the compile cache — no interaction expected.

---

## POC Results

### Already Validated (#2107)

- V8 snapshot creation and restoration — VALIDATED (all 8 correctness tests pass)
- Snapshot performance — 75% reduction in isolate creation (5.58ms → 1.39ms)
- Compile cache — saves ~25% on subsequent runs

### Needed for This Design

1. **V8 code cache via `code_cache_ready()`** — Verify the `ModuleLoader` callback fires correctly, bytecode is stored and consumed across isolates, and V8 actually skips parsing. This will be validated as part of Phase 2 implementation (write the code, run the tests, measure).

---

## Type Flow Map

Not applicable — this is Rust-level infrastructure. No TypeScript generics involved.

---

## E2E Acceptance Test

### Performance Targets (all phases combined)

```
Given: @vertz/schema test suite (63 files, 465 tests) on 10-core machine
Then:
  - All 465 tests pass (correctness preserved)
  - Parallel wall clock ≤ 170ms (≥20% faster than 214ms baseline)
  - Sequential wall clock ≤ 350ms (≥33% faster than 520ms baseline)
  - Single-file run ≤ 75ms (≥14% faster than 87ms baseline)
  - "Time:" output reflects wall clock, not aggregate CPU time
  - Test isolation preserved (no state leakage between files)
  - Coverage mode still works (--coverage)
  - --no-cache bypasses all caches (compile, source, V8 code)
```

### Cross-Package Benchmarking

```
Given: 5 packages (schema, errors, core, auth, server)
When: `vtz test packages/<name>` runs for each
Then:
  - All tests pass in all packages
  - Performance documented with wall clock times
  - Gap vs bun test is < 2x for parallel execution on all packages
  - CI-relevant documentation produced: recommended concurrency per runner size,
    expected overhead per file for capacity planning, coverage mode overhead
```

---

## Implementation Plan

### Phase 1: In-Memory Module Source Cache

**What:** Thread-safe in-memory cache for compiled TypeScript sources, eliminating disk I/O.

**Tasks:**

1.1 — Create `SharedSourceCache` with `Arc<RwLock<HashMap<PathBuf, Arc<CachedCompilation>>>>` and integrate into `compile_source()`
1.2 — Wire shared cache through runner → executor → module loader
1.3 — Handle `--no-cache` flag (bypass shared cache when set)
1.4 — Benchmark: measure improvement for multi-file and single-file runs

**Files:**
- `native/vtz/src/runtime/compile_cache.rs` (modified — add `SharedSourceCache`)
- `native/vtz/src/runtime/module_loader.rs` (modified — check shared cache in `compile_source()`)
- `native/vtz/src/test/executor.rs` (modified — accept and pass shared cache)
- `native/vtz/src/test/runner.rs` (modified — create shared cache, pass to executor)

### Phase 2: V8 Code Cache

**What:** Cache V8 bytecode across isolates via `ModuleLoader::code_cache_ready()`.

**Tasks:**

2.1 — Create `V8CodeCache` struct wrapping `Arc<RwLock<HashMap<String, (u64, Vec<u8>)>>>`
2.2 — Implement `code_cache_ready()` on `VertzModuleLoader` (store bytecode)
2.3 — Return `SourceCodeCacheInfo` from `load()` when cache hit
2.4 — Handle `--no-cache` flag (disable code cache store and retrieval)
2.5 — Benchmark: measure per-file improvement for multi-file runs

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (modified — `code_cache_ready()` impl, `load()` cache hit path)
- `native/vtz/src/runtime/compile_cache.rs` (modified — add `V8CodeCache` struct)
- `native/vtz/src/test/executor.rs` (modified — create and share `V8CodeCache`)
- `native/vtz/src/test/runner.rs` (modified — create shared cache, pass to executor)

### Phase 3: Shared Module Resolution Cache

**What:** Thread-safe cache for module specifier → filesystem path resolution.

**Tasks:**

3.1 — Create `SharedResolutionCache` with `Arc<RwLock<HashMap<(String, PathBuf), PathBuf>>>`
3.2 — Integrate into `VertzModuleLoader::resolve()` — check cache before FS lookups
3.3 — Benchmark: measure reduction in resolution time

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (modified — check cache in resolve)
- `native/vtz/src/test/executor.rs` (modified — pass shared cache)
- `native/vtz/src/test/runner.rs` (modified — create shared cache)

### Phase 4: Reporter Fix + Cross-Package Benchmarks

**What:** Fix "Time:" metric in all reporters, benchmark all 5 packages, document results.

**Tasks:**

4.1 — Add `wall_clock_ms: f64` to `TestRunResult`, measure with `Instant::now()` around `execute_parallel()` + type tests
4.2 — Fix terminal reporter: use `wall_clock_ms` instead of sum of per-file durations
4.3 — Fix JUnit reporter: use `wall_clock_ms` for `<testsuites time="...">`
4.4 — Fix JSON reporter: add `wallClockMs` and `aggregateCpuMs` top-level fields
4.5 — Run benchmarks across schema, errors, core, auth, server — document in issue #2259

**Files:**
- `native/vtz/src/test/runner.rs` (modified — add `wall_clock_ms` to result, measure with Instant)
- `native/vtz/src/test/reporter/terminal.rs` (modified — use wall_clock_ms)
- `native/vtz/src/test/reporter/junit.rs` (modified — use wall_clock_ms)
- `native/vtz/src/test/reporter/json.rs` (modified — add both time fields)

---

## Key Files

| Component | Path |
|---|---|
| Test executor | `native/vtz/src/test/executor.rs` |
| Test runner | `native/vtz/src/test/runner.rs` |
| Module loader | `native/vtz/src/runtime/module_loader.rs` |
| Compile cache | `native/vtz/src/runtime/compile_cache.rs` |
| JS runtime | `native/vtz/src/runtime/js_runtime.rs` |
| V8 snapshot | `native/vtz/src/test/snapshot.rs` |
| Terminal reporter | `native/vtz/src/test/reporter/terminal.rs` |
| JUnit reporter | `native/vtz/src/test/reporter/junit.rs` |
| JSON reporter | `native/vtz/src/test/reporter/json.rs` |
| Prior optimization | `plans/2107-test-runner-isolate-optimization.md` |
