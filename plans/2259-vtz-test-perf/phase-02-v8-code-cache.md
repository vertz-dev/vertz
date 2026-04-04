# Phase 2: V8 Code Cache

## Context

Phase 1 added an in-memory source cache to eliminate redundant disk I/O for compiled TypeScript sources. This phase adds V8 bytecode caching — when V8 parses JavaScript to bytecode in one isolate, the bytecode is stored in a shared cache and reused by subsequent isolates, skipping V8's parsing step entirely.

deno_core 0.311.0 supports this via `ModuleLoader::code_cache_ready()` (called after V8 compiles a module) and `SourceCodeCacheInfo` on `ModuleSource` (provides cached bytecode when loading a module).

**Important:** V8 code cache provides zero benefit for single-file runs (only one isolate exists). This optimization helps multi-file parallel and sequential runs.

Design doc: `plans/2259-vtz-test-perf.md` (Rev 2)

## Tasks

### Task 1: Create V8CodeCache struct

**Files:**
- `native/vtz/src/runtime/compile_cache.rs` (modified — add V8CodeCache)

**What to implement:**

Add a `V8CodeCache` struct to `compile_cache.rs` that stores V8 bytecode keyed by module specifier:

```rust
/// Thread-safe in-memory cache for V8 compiled bytecode.
/// Shared across worker threads. V8 provides bytecode after compiling a module;
/// subsequent isolates skip parsing by providing this bytecode back.
pub struct V8CodeCache {
    inner: RwLock<HashMap<String, V8CodeCacheEntry>>,
    enabled: bool,
}

struct V8CodeCacheEntry {
    hash: u64,
    data: Vec<u8>,
}

impl V8CodeCache {
    pub fn new(enabled: bool) -> Self {
        Self { inner: RwLock::new(HashMap::new()), enabled }
    }

    /// Store bytecode for a module specifier.
    pub fn store(&self, specifier: &str, hash: u64, data: &[u8]) {
        if !self.enabled { return; }
        let mut map = self.inner.write().unwrap();
        map.entry(specifier.to_string()).or_insert_with(|| V8CodeCacheEntry {
            hash,
            data: data.to_vec(),
        });
    }

    /// Retrieve cached bytecode for a module specifier.
    pub fn get(&self, specifier: &str) -> Option<deno_core::SourceCodeCacheInfo> {
        if !self.enabled { return None; }
        let map = self.inner.read().unwrap();
        map.get(specifier).map(|entry| deno_core::SourceCodeCacheInfo {
            hash: entry.hash,
            data: Some(std::borrow::Cow::Owned(entry.data.clone())),
        })
    }
}
```

The `enabled` flag is `false` when `--no-cache` is set.

**Acceptance criteria:**
- [ ] `V8CodeCache` struct exists with `store()` and `get()` methods
- [ ] `store()` is a no-op when `enabled = false`
- [ ] `get()` returns `None` when `enabled = false` or cache miss
- [ ] `get()` returns `SourceCodeCacheInfo` with hash and data on hit
- [ ] Unit tests: store → get returns same hash and data; disabled cache always returns None

---

### Task 2: Implement code_cache_ready() on VertzModuleLoader

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (modified — add field, implement callback, modify load())

**What to implement:**

1. Add `v8_code_cache: Option<Arc<V8CodeCache>>` field to `VertzModuleLoader` (alongside the existing `shared_source_cache` field from Phase 1).

2. Update the constructors to accept the new field. Extend `new_with_shared_cache()`:
```rust
pub fn new_with_shared_caches(
    root_dir: &str,
    cache_enabled: bool,
    plugin: Arc<dyn FrameworkPlugin>,
    shared_source_cache: Option<Arc<SharedSourceCache>>,
    v8_code_cache: Option<Arc<V8CodeCache>>,
) -> Self
```

3. Implement `code_cache_ready()` on the `ModuleLoader` trait impl. The current implementation likely has a default no-op. Override it:
```rust
fn code_cache_ready(
    &self,
    specifier: ModuleSpecifier,
    hash: u64,
    code_cache: &[u8],
) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()>>> {
    if let Some(ref cache) = self.v8_code_cache {
        cache.store(specifier.as_str(), hash, code_cache);
    }
    Box::pin(std::future::ready(()))
}
```

4. Modify `load()` (line 1464-1469) to provide `SourceCodeCacheInfo` when available:
```rust
// In the ModuleSource::new() call, replace the `None` code_cache parameter:
let code_cache = self.v8_code_cache
    .as_ref()
    .and_then(|cache| cache.get(module_specifier.as_str()));

Ok(ModuleSource::new(
    module_type,
    ModuleSourceCode::String(code.into()),
    module_specifier,
    code_cache,  // was None
))
```

**Acceptance criteria:**
- [ ] `code_cache_ready()` is implemented on `VertzModuleLoader`
- [ ] Bytecode is stored in shared `V8CodeCache` when callback fires
- [ ] `load()` returns `SourceCodeCacheInfo` on cache hit
- [ ] `load()` returns `None` for code_cache when cache is disabled or miss
- [ ] Existing tests still pass

---

### Task 3: Wire V8 code cache through runtime options, executor, and runner

**Files:**
- `native/vtz/src/runtime/js_runtime.rs` (modified — add field to options, pass to loader)
- `native/vtz/src/test/executor.rs` (modified — add to ExecuteOptions)
- `native/vtz/src/test/runner.rs` (modified — create and pass V8CodeCache)

**What to implement:**

1. Add `v8_code_cache: Option<Arc<V8CodeCache>>` to `VertzRuntimeOptions`.

2. In `new_for_test()` (js_runtime.rs line 220-224), pass it to the module loader constructor:
```rust
let module_loader = Rc::new(VertzModuleLoader::new_with_shared_caches(
    &root_dir,
    cache_enabled,
    options.plugin.clone(),
    options.shared_source_cache.clone(),
    options.v8_code_cache.clone(),
));
```

3. Add `v8_code_cache: Option<Arc<V8CodeCache>>` to `ExecuteOptions`.

4. In `execute_test_file_with_options()`, pass to `VertzRuntimeOptions`.

5. In `run_tests()`, create the V8CodeCache (disabled when `--no-cache`):
```rust
let v8_code_cache = if config.no_cache {
    None
} else {
    Some(Arc::new(V8CodeCache::new(true)))
};
```

**Acceptance criteria:**
- [ ] `V8CodeCache` is created in runner and passed through to each module loader
- [ ] `--no-cache` disables V8 code cache
- [ ] All existing tests pass
- [ ] `vtz test packages/schema` produces identical results

---

### Task 4: Benchmark and validate

**Files:**
- No new files — run commands and verify

**What to implement:**

1. Build release: `cd native && cargo build --release`
2. Run `vtz test packages/schema` 3 times, record wall clock times
3. Compare with Phase 1 baseline
4. Run sequential (`--concurrency 1`) to measure improvement
5. Run single-file to verify zero regression
6. Verify all tests pass, coverage works

**Acceptance criteria:**
- [ ] All 465 tests pass
- [ ] Multi-file parallel wall clock improved vs Phase 1 (target: 10-15% additional improvement)
- [ ] Sequential wall clock improved vs Phase 1
- [ ] Single-file shows no improvement (expected — validates the "zero benefit for single-file" claim)
- [ ] `--no-cache` still works correctly
- [ ] Quality gates pass: `cargo test --all && cargo clippy --all-targets --release -- -D warnings && cargo fmt --all -- --check`
