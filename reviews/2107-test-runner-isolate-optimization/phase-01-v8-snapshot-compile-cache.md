# Phase 1+2: V8 Startup Snapshot + Module Compilation Cache

- **Author:** Claude Opus
- **Reviewer:** Claude (adversarial)
- **Commits:** c72838d34 (V8 startup snapshot) .. e8e299a87 (disk-backed compilation cache)
- **Date:** 2026-03-30

## Changes

- `native/vertz-runtime/src/test/snapshot.rs` (new) -- V8 startup snapshot creation and caching via `LazyLock`
- `native/vertz-runtime/src/test/snapshot_poc.rs` (new) -- POC tests validating snapshot approach
- `native/vertz-runtime/src/runtime/compile_cache.rs` (new) -- Disk-backed SHA-256-keyed compilation cache
- `native/vertz-runtime/src/runtime/js_runtime.rs` (modified) -- Added `new_for_test()` constructor, `compile_cache` option
- `native/vertz-runtime/src/runtime/module_loader.rs` (modified) -- Cache integration in `compile_source()`, new `new_with_cache()` constructor
- `native/vertz-runtime/src/runtime/mod.rs` (modified) -- Export `compile_cache` module
- `native/vertz-runtime/src/runtime/persistent_isolate.rs` (modified) -- Added `compile_cache: false` to `VertzRuntimeOptions`
- `native/vertz-runtime/src/test/executor.rs` (modified) -- Switched to `new_for_test()`, removed manual bootstrap/harness injection
- `native/vertz-runtime/src/test/mod.rs` (modified) -- Export `snapshot` module, conditional `snapshot_poc`
- `native/vertz-runtime/src/test/runner.rs` (modified) -- Thread `no_cache` through config
- `native/vertz-runtime/src/test/watch.rs` (modified) -- Thread `no_cache` through watch mode
- `native/vertz-runtime/src/cli.rs` (modified) -- Added `--no-cache` CLI flag
- `native/vertz-runtime/src/main.rs` (modified) -- Wire `no_cache` from CLI to config
- `native/vertz-runtime/tests/test_runner.rs` (modified) -- Added `no_cache: false` to test config

## CI Status

- [ ] Quality gates passed at (not verified -- needs `cargo test` + `cargo clippy` run)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (POC tests written first, then production snapshot.rs, then integration)
- [ ] No type gaps or missing edge cases (see findings)
- [x] No security issues (cache key is SHA-256 of content, no path-based input in key)
- [x] Public API changes match design doc (`--no-cache` flag, `new_for_test()` internal)

## Findings

### Changes Requested

#### BLOCKER-1: Design deviation -- LazyLock at runtime vs build.rs at build time

The design doc (Section 1.2) specifies snapshot creation via `build.rs` with `include_bytes!()` to embed the snapshot in the binary. The implementation uses `LazyLock` to create the snapshot lazily at first use during runtime.

**Impact:**
- First test run per process pays a ~10-15ms snapshot creation cost that `build.rs` would eliminate.
- The snapshot is leaked (`Box::leak`) to get `&'static [u8]`, which is an intentional memory leak. With `build.rs`, the snapshot would be statically embedded -- no allocation, no leak.
- With `LazyLock`, every process that runs `vertz test` creates the snapshot from scratch. With `build.rs` + `include_bytes!()`, the snapshot would be part of the binary, shared across all invocations with zero runtime cost.

**Verdict:** This is an acceptable simplification IF the author explicitly acknowledged the deviation. The LazyLock approach is functionally correct and much simpler to implement (no build.rs complexity, no hash-based invalidation logic). The snapshot creation is fast (~5ms in release) and only happens once per process. However, the design doc should be updated to reflect this decision, or the build.rs approach should be implemented as planned.

**Recommendation:** If keeping LazyLock, add a comment explaining the deviation and update the design doc. The performance impact is minimal for the test runner use case (one process per `vertz test` invocation).

#### SHOULD-FIX-1: Duplicated code between snapshot.rs and js_runtime.rs

`snapshot::all_op_decls()` and `snapshot::bootstrap_js()` duplicate the op list and bootstrap module list from `VertzJsRuntime::new()` / `VertzJsRuntime::bootstrap_js()`. If a new op module is added to `VertzJsRuntime::new()` but not to `snapshot::all_op_decls()`, the snapshot creation will produce an op count mismatch at runtime, causing a panic.

**Risk:** This is a time bomb. The next developer who adds an op module to the runtime will forget to update `snapshot::all_op_decls()` because there is no compile-time enforcement. The op count mismatch will manifest as a runtime crash.

**Recommendation:** Extract `all_op_decls()` and `bootstrap_js()` into a shared function (or at minimum, add a test that asserts the two lists produce the same count). The `VertzJsRuntime::bootstrap_js()` is currently `fn bootstrap_js() -> String` -- making it `pub(crate)` would let `snapshot.rs` call it directly.

#### SHOULD-FIX-2: Duplicated code -- snapshot_poc.rs duplicates snapshot.rs

`snapshot_poc.rs` contains a complete second copy of the snapshot creation logic, async context JS, rehook JS, op list, and bootstrap list. This is 636 lines of POC code that duplicates the 483 lines in `snapshot.rs`. The POC was meant to validate the approach and has served its purpose.

**Recommendation:** The POC is test-only (`#[cfg(test)]`), so it doesn't affect binary size. But it's a maintenance burden. Consider:
1. Deleting `snapshot_poc.rs` entirely (the snapshot.rs tests now cover the same scenarios), or
2. Converting the POC benchmarks into the snapshot.rs test module, and deleting the duplicated infrastructure.

#### SHOULD-FIX-3: Duplicated CSS injection logic

The CSS injection logic in `compile_source()` is now written twice: once for the cache-hit path (lines 294-305) and once for the fresh-compilation path (lines 360-372). Both construct the same `__vertz_inject_css(...)` format string with the same escaping. If one is updated without the other, CSS injection will break for cached vs. uncached files.

**Recommendation:** Extract a helper function like `fn inject_css_prefix(code: &str, css: &str, filename: &str) -> String` and call it in both paths.

#### NOTE-1: `Box::leak` is intentional but deserves a comment

`Box::leak(snapshot)` in the `LazyLock` initializer is an intentional "leak" to obtain `&'static [u8]`. This is a common pattern for process-lifetime data, but it would benefit from a comment explaining why this is acceptable (the snapshot is process-lifetime, created once, and freed when the process exits).

#### NOTE-2: `compile_cache: bool` added to `VertzRuntimeOptions` but ignored by `new()`

The `compile_cache` field is added to `VertzRuntimeOptions` but only used by `new_for_test()`. The `new()` constructor always creates a `VertzModuleLoader::new()` (without cache). The `persistent_isolate.rs` correctly passes `compile_cache: false`. This is fine for now, but if caching is ever desired for the dev server, the `new()` path needs updating.

#### NOTE-3: Missing `microtask::op_decls()` from `snapshot::all_op_decls()` -- NOT a bug

The `microtask` module has `op_decls()` that returns an empty vec. It's not included in `snapshot::all_op_decls()`, but it's also not included in `VertzJsRuntime::new()`'s op list. Both lists are consistent. The `microtask` bootstrap JS IS included in both `bootstrap_js()` functions. No issue here.

#### NOTE-4: `ASYNC_CONTEXT_SNAPSHOT_JS` slightly diverges from `ASYNC_CONTEXT_JS`

The snapshot variant adds `globalThis.__vertz_promiseHookFns` storage and a conditional guard around `__vertz_setPromiseHooks` call. The core logic (Variable, AsyncLocalStorage, AsyncResource, promise hooks) is semantically identical. The re-hook script (`ASYNC_CONTEXT_REHOOK_JS`) correctly reads the stored functions and re-installs them. This is well-designed.

However, this creates a maintenance risk: if `ASYNC_CONTEXT_JS` is updated (new class, changed behavior), the author must remember to update `ASYNC_CONTEXT_SNAPSHOT_JS` in parallel. There is no automated check.

**Recommendation:** Add a test that verifies both the snapshot path and non-snapshot path produce the same observable behavior for a comprehensive set of AsyncContext operations.

#### NOTE-5: Compile cache silently swallows write errors

`CompileCache::put()` ignores errors from `std::fs::create_dir_all()` and `std::fs::write()` via `let _ = ...`. This is acceptable for a cache (failure to cache should not crash), but worth noting. A degraded-mode warning log would help diagnose issues.

#### NOTE-6: No cache eviction / size limit

The compile cache grows indefinitely. For a large project with many file edits over time, the `.vertz/compile-cache/` directory could accumulate thousands of orphaned entries. The 2-character prefix subdirectory structure mitigates filesystem inode pressure, but there's no TTL or LRU eviction.

**Impact:** Low for now. Users can `rm -rf .vertz/compile-cache/` manually. A `vertz clean` command would be the right solution (mentioned in the design doc).

### Test Isolation Assessment

**Test isolation is preserved.** Each test file still gets a fresh `JsRuntime` instance. The snapshot contains only bootstrap JS + class definitions + test harness globals -- no mutable state that could leak between files. The `LazyLock` is read-only after initialization. The compile cache is keyed by content hash, so it cannot produce cross-file state leakage.

The `test_isolation_between_files` test in `executor.rs` directly validates that `globalThis` mutations in one file don't leak to another. This test now runs through the snapshot path.

### Test Coverage Assessment

**Snapshot tests (snapshot.rs):** 8 tests covering:
- Snapshot creation succeeds
- Test harness globals available post-restore
- structuredClone works post-restore
- AsyncContext.Variable sync operations
- AsyncContext.Variable async propagation through promises
- Full test suite execution from snapshot
- Console availability
- Timer availability
- DOM stubs availability

**Compile cache tests (compile_cache.rs):** 7 tests covering:
- Cache miss returns None
- Put then get roundtrip
- CSS storage and retrieval
- Disabled cache always returns None
- Different source produces different key (miss)
- Different target produces different key (miss)
- Files stored in 2-char prefix subdirectory

**Missing test coverage:**
- No integration test verifying that the compile cache actually speeds up a second run (end-to-end with real TS files)
- No test for cache invalidation when `CARGO_PKG_VERSION` changes (would require mocking)
- No test for the module_loader's cache-hit path with CSS injection specifically
- No test for `--no-cache` CLI flag actually bypassing the cache in an end-to-end scenario

### Security Assessment

No security issues identified:
- Cache keys are SHA-256 hashes -- no user-controlled path components in the cache key
- Cache paths are always within `.vertz/compile-cache/` under the root_dir -- no path traversal possible
- Cache contents (JSON with code/sourceMap/css) are deserialized safely via `serde_json` -- malformed JSON returns None
- The snapshot is process-internal, not loaded from disk

### Performance Assessment

- `LazyLock` snapshot creation adds ~5ms overhead to the first test file only (amortized across all files)
- Compile cache uses SHA-256 hashing per file -- ~microsecond overhead, negligible
- Disk I/O for cache reads/writes is per-file but sequential within each thread -- no contention
- The 2-character prefix subdirectory prevents filesystem performance degradation from too many files in one directory

## Resolution

(Pending author response to findings)

### Summary of Action Items

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| B1 | Blocker | LazyLock vs build.rs deviation | Update design doc or implement build.rs |
| S1 | Should-fix | Duplicated op/bootstrap lists | Extract shared function or add parity test |
| S2 | Should-fix | snapshot_poc.rs duplication | Delete or consolidate with snapshot.rs |
| S3 | Should-fix | Duplicated CSS injection logic | Extract helper function |
| N1 | Note | Box::leak comment | Add comment explaining intentional leak |
| N2 | Note | compile_cache ignored by new() | Document or guard |
| N4 | Note | ASYNC_CONTEXT_SNAPSHOT_JS divergence | Add behavioral parity test |
| N5 | Note | Silent write error swallowing | Consider warning log |
| N6 | Note | No cache eviction | Defer to `vertz clean` command |
