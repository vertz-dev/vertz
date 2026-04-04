# Phase 3: Shared Module Resolution Cache

## Context

Phases 1 and 2 optimized module compilation (in-memory source cache) and V8 bytecode parsing (V8 code cache). This phase optimizes module resolution — the process of converting an import specifier (e.g., `@vertz/schema`) to a filesystem path. Currently each isolate independently resolves every import, hitting the filesystem for extension probing, package.json parsing, and symlink following.

A shared resolution cache eliminates redundant filesystem syscalls. The resolution cache is deterministic (same specifier + same referrer directory = same result), so it's always safe to cache. Unlike the source and V8 caches, the resolution cache is NOT disabled by `--no-cache` since it has no correctness implications.

Design doc: `plans/2259-vtz-test-perf.md` (Rev 2)

## Tasks

### Task 1: Create SharedResolutionCache struct

**Files:**
- `native/vtz/src/runtime/compile_cache.rs` (modified — add SharedResolutionCache)

**What to implement:**

Add a `SharedResolutionCache` struct:

```rust
/// Thread-safe cache for module resolution results.
/// Maps (specifier, referrer_directory) → resolved canonical path.
/// Always active (not affected by --no-cache) because resolution is deterministic.
pub struct SharedResolutionCache {
    inner: RwLock<HashMap<(String, PathBuf), PathBuf>>,
}

impl SharedResolutionCache {
    pub fn new() -> Self {
        Self { inner: RwLock::new(HashMap::new()) }
    }

    /// Look up a cached resolution result.
    pub fn get(&self, specifier: &str, referrer_dir: &Path) -> Option<PathBuf> {
        let key = (specifier.to_string(), referrer_dir.to_path_buf());
        self.inner.read().unwrap().get(&key).cloned()
    }

    /// Store a resolution result.
    pub fn insert(&self, specifier: &str, referrer_dir: &Path, resolved: PathBuf) {
        let key = (specifier.to_string(), referrer_dir.to_path_buf());
        let mut map = self.inner.write().unwrap();
        map.entry(key).or_insert(resolved);
    }
}
```

**Acceptance criteria:**
- [ ] `SharedResolutionCache` exists with `get()` and `insert()` methods
- [ ] Unit tests: insert → get returns same path; miss returns None; concurrent access doesn't panic

---

### Task 2: Integrate into VertzModuleLoader resolve path

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (modified — add field, check cache in resolve)
- `native/vtz/src/runtime/js_runtime.rs` (modified — pass cache to loader)

**What to implement:**

1. Add `resolution_cache: Option<Arc<SharedResolutionCache>>` field to `VertzModuleLoader`.

2. Update constructor to accept it (extend the existing `new_with_shared_caches()`).

3. In the `resolve()` method (line 1350-1421), add cache check for non-synthetic specifiers. The cache check should happen **after** synthetic module handling (vertz:test, vertz:sqlite, node:*) but **before** calling `resolve_specifier()`:

```rust
// After synthetic checks, before resolve_specifier:
if let Some(ref cache) = self.resolution_cache {
    let referrer_dir = referrer_path.parent().unwrap_or(Path::new("."));
    if let Some(cached_path) = cache.get(raw_specifier, referrer_dir) {
        let url = ModuleSpecifier::from_file_path(&cached_path)
            .map_err(|_| anyhow::anyhow!("Invalid path"))?;
        return Ok(url);
    }
}

// Existing resolve_specifier + canonicalize logic
let resolved = self.resolve_specifier(raw_specifier, &referrer_dir)?;
let canonical = self.canonicalize_path(&resolved)?;

// Store in cache
if let Some(ref cache) = self.resolution_cache {
    cache.insert(raw_specifier, &referrer_dir, canonical.clone());
}

let url = ModuleSpecifier::from_file_path(&canonical)...
```

4. Add to `VertzRuntimeOptions` and pass through in `new_for_test()`.

**Acceptance criteria:**
- [ ] Resolution cache is checked before filesystem resolution
- [ ] Cache is populated after successful resolution
- [ ] Synthetic modules (vertz:test, etc.) bypass the cache
- [ ] All existing tests pass
- [ ] `vtz test packages/schema` produces identical results

---

### Task 3: Wire through executor and runner

**Files:**
- `native/vtz/src/test/executor.rs` (modified — add to ExecuteOptions)
- `native/vtz/src/test/runner.rs` (modified — create and pass resolution cache)

**What to implement:**

1. Add `resolution_cache: Option<Arc<SharedResolutionCache>>` to `ExecuteOptions`.

2. In `run_tests()`, create the resolution cache (always enabled — not affected by `--no-cache`):
```rust
let resolution_cache = Some(Arc::new(SharedResolutionCache::new()));
```

3. Pass through executor → runtime options → module loader.

**Acceptance criteria:**
- [ ] Resolution cache is always created (not affected by --no-cache)
- [ ] Shared across all worker threads
- [ ] All tests pass

---

### Task 4: Benchmark and validate

**Files:**
- No new files — run commands and verify

**What to implement:**

1. Build release and benchmark against Phase 2 baseline
2. Test all 5 packages (schema, errors, core, auth, server)
3. Verify correctness: all tests pass, coverage works

**Acceptance criteria:**
- [ ] All tests pass across all packages
- [ ] Parallel wall clock improved vs Phase 2 (target: additional ~5-10ms)
- [ ] Quality gates pass: `cargo test --all && cargo clippy --all-targets --release -- -D warnings && cargo fmt --all -- --check`
