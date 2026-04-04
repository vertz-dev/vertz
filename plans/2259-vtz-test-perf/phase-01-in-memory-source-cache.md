# Phase 1: In-Memory Module Source Cache

## Context

The vtz test runner (#2259) has a ~1.5x wall clock gap vs bun test for parallel execution, and ~6x for single-file runs. Each test file creates a fresh V8 isolate and independently loads its import tree. Even with the existing disk-backed compile cache, every module import in every test file reads from `.vertz/compile-cache/` on disk.

This phase adds a thread-safe in-memory cache (`Arc<RwLock<HashMap>>`) shared across all worker threads. Once a module is compiled and loaded by any isolate, subsequent isolates get the compiled source from memory (zero disk I/O).

Design doc: `plans/2259-vtz-test-perf.md` (Rev 2)

## Tasks

### Task 1: Create SharedSourceCache struct

**Files:**
- `native/vtz/src/runtime/compile_cache.rs` (modified)
- `native/vtz/src/runtime/compile_cache.rs` test section (modified)

**What to implement:**

Add a `SharedSourceCache` struct to `compile_cache.rs` that wraps `Arc<RwLock<HashMap<PathBuf, Arc<CachedCompilation>>>>`.

```rust
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

/// Thread-safe in-memory cache for compiled module sources.
/// Shared across worker threads to avoid redundant disk I/O.
pub struct SharedSourceCache {
    inner: RwLock<HashMap<PathBuf, Arc<CachedCompilation>>>,
}

impl SharedSourceCache {
    pub fn new() -> Self {
        Self { inner: RwLock::new(HashMap::new()) }
    }

    /// Look up a compiled module by its canonical filesystem path.
    pub fn get(&self, path: &Path) -> Option<Arc<CachedCompilation>> {
        self.inner.read().unwrap().get(path).cloned()
    }

    /// Store a compiled module. If the path already exists (race), the first write wins.
    pub fn insert(&self, path: PathBuf, compilation: Arc<CachedCompilation>) {
        let mut map = self.inner.write().unwrap();
        map.entry(path).or_insert(compilation);
    }
}
```

The `CachedCompilation` struct already exists at line 17 of `compile_cache.rs`:
```rust
pub struct CachedCompilation {
    pub code: String,
    pub source_map: Option<String>,
    pub css: Option<String>,
}
```

**Acceptance criteria:**
- [ ] `SharedSourceCache` struct exists with `get()` and `insert()` methods
- [ ] `get()` returns `None` on miss, `Some(Arc<CachedCompilation>)` on hit
- [ ] `insert()` uses `entry().or_insert()` to handle concurrent writes safely
- [ ] Unit tests: insert → get returns same data; get on empty returns None; concurrent insert from multiple threads doesn't panic

---

### Task 2: Integrate SharedSourceCache into VertzModuleLoader

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (modified — add field, modify `compile_source()`)
- `native/vtz/src/runtime/js_runtime.rs` (modified — pass cache to module loader)

**What to implement:**

1. Add `shared_source_cache: Option<Arc<SharedSourceCache>>` field to `VertzModuleLoader` (line 39-45).

2. Add a new constructor that accepts the shared cache:
```rust
pub fn new_with_shared_cache(
    root_dir: &str,
    cache_enabled: bool,
    plugin: Arc<dyn FrameworkPlugin>,
    shared_source_cache: Option<Arc<SharedSourceCache>>,
) -> Self
```

3. Modify `compile_source()` (line 367-442) to check the shared cache **before** the disk cache:
```rust
fn compile_source(&self, source: &str, filename: &str) -> Result<String, AnyError> {
    let target = "ssr";
    let file_path = PathBuf::from(filename);

    // 1. Check in-memory shared cache first
    if let Some(ref cache) = self.shared_source_cache {
        if let Some(cached) = cache.get(&file_path) {
            // Store source map if present (needed for error stack traces)
            if let Some(ref sm) = cached.source_map {
                self.source_maps.borrow_mut().insert(filename.to_string(), sm.clone());
            }
            // Return code with CSS injection if needed
            return Ok(self.prepend_css_injection(&cached.code, &cached.css, filename));
        }
    }

    // 2. Existing disk cache check
    if let Some(cached) = self.compile_cache.get(source, target) {
        // ... existing logic ...
        // After getting from disk, store in shared cache
        if let Some(ref cache) = self.shared_source_cache {
            cache.insert(file_path, Arc::new(CachedCompilation {
                code: result_code.clone(),
                source_map: cached.source_map.clone(),
                css: cached.css.clone(),
            }));
        }
        return Ok(result_code);
    }

    // 3. Full compilation (existing logic)
    // ... compile, post-process, store in disk cache ...
    // After compilation, store in shared cache
    if let Some(ref cache) = self.shared_source_cache {
        cache.insert(file_path, Arc::new(CachedCompilation {
            code: compiled_code.clone(),
            source_map: source_map.clone(),
            css: css.clone(),
        }));
    }
    Ok(result_code)
}
```

4. In `js_runtime.rs` `new_for_test()` (line 220-224): Add `shared_source_cache` to `VertzRuntimeOptions` and pass it through:
```rust
pub struct VertzRuntimeOptions {
    // ... existing fields ...
    pub shared_source_cache: Option<Arc<SharedSourceCache>>,
}
```

**Acceptance criteria:**
- [ ] `VertzModuleLoader` has `shared_source_cache: Option<Arc<SharedSourceCache>>` field
- [ ] `compile_source()` checks shared cache before disk cache
- [ ] Compilation results are stored in shared cache after compilation
- [ ] Source maps are correctly restored from shared cache entries
- [ ] CSS injection works correctly from shared cache entries
- [ ] `VertzRuntimeOptions` accepts optional shared cache

---

### Task 3: Wire shared cache through runner and executor

**Files:**
- `native/vtz/src/test/executor.rs` (modified — accept shared cache in options)
- `native/vtz/src/test/runner.rs` (modified — create and pass shared cache)

**What to implement:**

1. Add `shared_source_cache` to `ExecuteOptions` (executor.rs line 90-104):
```rust
pub struct ExecuteOptions {
    // ... existing fields ...
    pub shared_source_cache: Option<Arc<SharedSourceCache>>,
}
```

2. Pass it through to `VertzRuntimeOptions` in `execute_test_file_with_options()` (executor.rs line 177-183):
```rust
let mut runtime = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
    // ... existing fields ...
    shared_source_cache: options.shared_source_cache.clone(),
})?;
```

3. In `run_tests()` (runner.rs line 128-135), create the shared cache and include it in `ExecuteOptions`:
```rust
let shared_source_cache = if config.no_cache {
    None
} else {
    Some(Arc::new(SharedSourceCache::new()))
};

let exec_options = Arc::new(ExecuteOptions {
    // ... existing fields ...
    shared_source_cache,
});
```

4. Since `ExecuteOptions` is wrapped in `Arc` and shared across threads (runner.rs line 137), and `SharedSourceCache` is inside an `Option<Arc<...>>`, this is automatically thread-safe. The `Arc<ExecuteOptions>` is `Send + Sync` as long as all fields are `Send + Sync`. `Arc<SharedSourceCache>` is `Send + Sync` because `SharedSourceCache` uses `RwLock<HashMap>` which is `Send + Sync`.

**Acceptance criteria:**
- [ ] `ExecuteOptions` has `shared_source_cache` field
- [ ] `run_tests()` creates `SharedSourceCache` (unless `--no-cache`)
- [ ] Shared cache is passed through to each `VertzModuleLoader` instance
- [ ] `--no-cache` disables the shared source cache (passes `None`)
- [ ] All existing tests pass (cargo test)
- [ ] `vtz test packages/schema` produces identical results with and without cache

---

### Task 4: Benchmark and validate

**Files:**
- No new files — run commands and verify

**What to implement:**

1. Build release: `cd native && cargo build --release`
2. Run `vtz test packages/schema` 3 times, record wall clock times
3. Run `vtz test --no-cache packages/schema` to verify bypass works
4. Run `vtz test packages/schema --concurrency 1` (sequential) to measure sequential improvement
5. Run `vtz test packages/schema/src/core/errors.test.ts` (single file) to measure single-file improvement
6. Compare with baseline (214ms parallel, 520ms sequential, 87ms single-file)
7. Verify all tests pass, coverage works, source-mapped stack traces are correct

**Acceptance criteria:**
- [ ] All 465 tests pass in @vertz/schema
- [ ] Parallel wall clock improved (target: ≤195ms, ~10% faster than 214ms)
- [ ] Sequential wall clock improved (target: ≤420ms, ~20% faster than 520ms)
- [ ] Single-file improved (target: ≤80ms, ~8% faster than 87ms)
- [ ] `--no-cache` bypasses shared cache correctly
- [ ] Coverage mode still works
- [ ] Error stack traces are correctly source-mapped
- [ ] Quality gates pass: `cargo test --all && cargo clippy --all-targets --release -- -D warnings && cargo fmt --all -- --check`
