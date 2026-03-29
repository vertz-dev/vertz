# Technical Review: Vertz Test Runner

- **Reviewer:** Technical Agent
- **Date:** 2026-03-28
- **Document:** plans/vertz-test-runner.md Rev 1

## Review Checklist

- [x] Can be built on existing infrastructure
- [ ] No hidden complexity or architectural blockers
- [ ] Performance targets are achievable
- [ ] V8 context isolation model is sound
- [ ] Coverage collection approach is viable
- [x] Watch mode can reuse existing watcher
- [x] Module graph integration is correct
- [x] Rust implementation is feasible with current codebase

## Findings

### Blockers

#### B1: V8 "contexts" vs full Isolates — deno_core creates Isolates, not lightweight contexts

The design doc says "Each test file gets its own V8 context" and targets < 5ms creation time and < 10MB memory. But `deno_core::JsRuntime` creates a **full V8 Isolate** (with its own heap, GC, and compiled code cache), not a lightweight V8 Context within a shared Isolate.

**Impact with 1,010 test files:**
- Full Isolate creation: ~10-50ms each (not the < 5ms target)
- Memory per Isolate: ~10-30MB (V8 heap + compiled framework code)
- Sequential creation of 1,010 Isolates: 10-50 seconds just for setup
- Peak memory: 10-30GB (if all Isolates alive simultaneously)

deno_core 0.311 does not expose a `JsRealm` or `v8::Context` API suitable for lightweight per-file isolation within a shared Isolate. The `JsRuntime` IS the Isolate.

**Revised architecture options:**

| Strategy | Isolation | Memory | Speed | Complexity |
|---|---|---|---|---|
| **A: Isolate pool (N workers)** | Full isolation, N Isolates reused across files | N × 20MB | Limited by pool size | Medium |
| **B: Single Isolate, fresh global per file** | Weak (shared compiled code, must reset globals) | ~50MB total | Fast (reset < 1ms) | High (cleanup correctness) |
| **C: Process pool (like Vitest workers)** | Full isolation via OS process | N × 30MB | Fork is fast on Linux, slow on macOS | Low |

**Recommendation:** Strategy A (Isolate pool). Create N Isolates (default: CPU cores), reuse each for multiple test files with a global reset between files. This gives real isolation per file while capping memory at N × 20MB. The global reset clears module cache, timers, and test state — the same pattern used for SSR Isolate reuse in the dev server.

**The design doc must update the isolation model and performance targets accordingly.** The "< 5ms per context" target is not achievable with deno_core's current API.

#### B2: V8 coverage requires Inspector Protocol, not a direct API

The design doc says "V8 has built-in precise coverage collection (`v8::Coverage`)" and implies a simple enable/collect flow. This is incorrect:

1. **rusty_v8 0.106 does not expose `v8::debug::Coverage` bindings.** The V8 C++ coverage API exists but is not surfaced through rusty_v8.

2. **V8 coverage is accessed via the Inspector Protocol (CDP).** You send `Profiler.startPreciseCoverage` and `Profiler.takePreciseCoverage` over the Inspector WebSocket. This is how Node.js, Deno, and Bun all collect coverage.

3. **deno_core has Inspector support** (`JsRuntime::inspector()`), which connects to V8's Inspector. Coverage collection must go through this channel.

**Revised approach:**
```rust
// 1. Get inspector session from JsRuntime
let inspector = runtime.inspector();
let session = inspector.create_local_session();

// 2. Enable precise coverage via CDP
session.post_message("Profiler.enable");
session.post_message("Profiler.startPreciseCoverage", json!({
    "callCount": true,
    "detailed": true
}));

// 3. Run tests...

// 4. Collect coverage
let coverage = session.post_message("Profiler.takePreciseCoverage");
// Returns: { result: [{ scriptId, url, functions: [{ ranges, functionName }] }] }
```

This works but adds complexity: Inspector session management, CDP JSON message parsing, and mapping scriptId → file path. The doc should acknowledge this is CDP-based, not a direct V8 API call.

**The design doc must revise the coverage architecture section to use Inspector Protocol.**

### Should Fix

#### S1: Test global injection mechanism unspecified

The doc says "inject test globals (describe, it, expect, mock, etc.)" but doesn't explain how. deno_core modules use ES module semantics — globals aren't automatically available. Options:

1. **Bootstrap script:** Execute a `[vertz:test-bootstrap]` script that sets `globalThis.describe`, `globalThis.it`, etc. before loading the test file. This is how the runtime currently bootstraps `console`, `setTimeout`, etc.
2. **Virtual module:** Register `vertz:test` as a virtual module in the module loader that returns the test framework objects. Test files import from it explicitly.
3. **Both:** Bootstrap for globals (tests that don't import), virtual module for explicit imports.

**Recommendation:** Option 2 (virtual module) is cleaner and matches the explicit import pattern. The module loader already handles virtual modules for `@vertz/*` packages. Add `vertz:test` (or `@vertz/test`) as a virtual module that returns Rust-backed ops for describe/it/expect. Bootstrap only for compatibility with files that use globals without importing.

#### S2: Mock/spy implementation should be primarily JS, not Rust ops

The doc lists mock/spy under "Rust Implementation Notes" but mock tracking (call count, call args, return values) is naturally a JS data structure. Implementing in Rust means constant V8↔Rust boundary crossings for every mock call.

**Recommendation:** Implement mock/spy as a JS module loaded via the bootstrap/virtual module. Rust ops only needed for: timer mocking (intercept setTimeout), module mocking (intercept imports). The tracking layer (toHaveBeenCalled, toHaveBeenCalledWith) should be pure JS.

#### S3: Compilation cache sharing between dev server and test runner

The design says "reuse existing CompilationCache" but the dev server cache is keyed by file path + mtime and stores browser-compiled output. Test files need SSR-target compilation (or a test-specific target). The cache can be shared for file-level invalidation logic, but the compiled output is different.

**Recommendation:** Specify that the test runner uses its own cache partition (same mtime-based invalidation, different compiled output keyed by `target: "test"` vs `target: "browser"` vs `target: "ssr"`).

#### S4: Timer management in test contexts

Tests that use `setTimeout`/`setInterval` can prevent V8 event loop from completing. The current runtime registers timer ops that drive a tokio timer. In test mode:

1. **Pending timers after test completion** — must be cancelled per-test, not per-file
2. **Fake timers** (`vi.useFakeTimers()`) — not mentioned in the doc but commonly needed
3. **`afterEach` cleanup** — timers created in test body must be cleared even if test throws

**Recommendation:** Add timer management to the isolation model. Each test gets a timer scope; on test completion (pass or fail), all pending timers in that scope are cancelled. Fake timers can be Phase 2 or later.

#### S5: Bun-specific API shims needed for test files

Test files may import modules that use `Bun.file()`, `Bun.write()`, `Bun.env`, `Bun.hash()`, etc. The current runtime provides `Bun.file()` as an op (used in SSR). But the full `Bun.*` compatibility surface for tests is larger.

**Recommendation:** Audit Bun APIs used in test files (not just test framework APIs). The module loader may need a `bun:*` virtual module that provides shims. At minimum: `Bun.file()`, `Bun.write()`, `Bun.env`, `Bun.hash()`.

#### S6: Parallel test execution threading model

deno_core's `JsRuntime` is single-threaded — it must be driven from one OS thread. Running N test files in parallel means N OS threads, each with its own `JsRuntime` instance and tokio runtime.

With the Isolate pool strategy (B1 fix), this means:
- N threads × N JsRuntime instances
- Each thread runs its own tokio `current_thread` runtime
- Results sent back to the main thread via channels

This is feasible (the dev server already uses multi-thread patterns for SSR), but the doc should explicitly state the threading model.

#### S7: Source map handling for coverage and error reporting

The native compiler produces source maps (oxc codegen), but coverage ranges are in compiled JS byte offsets. Mapping back to TypeScript requires:

1. Loading the source map for each covered file
2. Mapping byte offset ranges to original line/column via the `sourcemap` crate
3. Handling multi-step mappings (if file was compiled through multiple stages)

The dev server already has source map support (`src/errors/source_mapper.rs`), but it maps stack trace frames (single positions), not coverage ranges (start/end pairs). The coverage mapper needs a different API.

**Recommendation:** Specify that source map range mapping is a new utility built on top of the existing `source_mapper.rs`.

### Nice to Have

#### N1: Consider `--seed` for deterministic test ordering

Randomized test order catches hidden dependencies between tests. A `--seed` flag enables reproducible random ordering.

#### N2: Test result caching

If a test file and all its transitive dependencies are unchanged since the last run, skip execution and replay the cached result. Significant speedup for large suites where only a few files changed.

#### N3: ANSI color handling for CI environments

The terminal reporter should auto-detect CI (via `CI`, `GITHUB_ACTIONS`, etc.) and disable colors. Or use `--no-color` flag.

#### N4: Segfault/crash recovery

If a test crashes the V8 Isolate (e.g., infinite recursion, OOM), the test runner should catch the crash, report it as a failure, and continue with remaining tests. With the Isolate pool strategy, only the crashed Isolate is lost — create a replacement.

#### N5: `--repeat N` for flaky test detection

Run each test N times to surface flaky tests. Useful before merging PRs.

#### N6: Memory leak detection per test file

After a test file completes, check if the Isolate's heap grew beyond a threshold. Log a warning if so. Helps catch tests that accumulate state.

## Verdict: Changes Requested

The two blockers (Isolate vs Context, Coverage via CDP) are architectural — they change the implementation approach, not the user-facing design. The test runner is absolutely buildable on the existing infrastructure, but the design doc must accurately reflect HOW it will be built. The current doc describes an idealized V8 API that doesn't match deno_core's reality.

Once the isolation model is revised to Isolate pool and coverage is revised to Inspector Protocol, all performance targets become achievable and the phasing is sound.
