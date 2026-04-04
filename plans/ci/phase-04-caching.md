# Phase 4: Caching (Local + GitHub Actions)

## Context

Phases 1-3 deliver a smart task runner with change detection and parallel execution. This phase adds content-addressable caching — the feature that directly replaces Turborepo's paid remote cache. Local cache uses tar+zstd in `.pipe/cache/`, GitHub Actions cache is auto-detected via env vars and accessed through Apache OpenDAL. Fallback cache keys (prefix matching) ensure partial cache hits are useful.

Design doc: `plans/pipe-ci-runner.md`

Depends on: Phase 1-3 (types, scheduler, workspace, changes)

## Tasks

### Task 1: Content hashing + `CacheBackend` trait

**Files:**
- `native/vtz/src/ci/cache.rs` (new)

**What to implement:**

**Cache key computation:**
```rust
pub fn compute_cache_key(
    task: &TaskDef,
    package: &WorkspacePackage,
    root_dir: &Path,
    platform: &str,       // e.g. "linux-x64", "darwin-arm64"
    lockfile_hash: &str,  // pre-computed hash of bun.lock or Cargo.lock
    secret_names: &[String], // only names, not values
) -> Result<String>;
```

Hash inputs (sha256):
1. Command string or steps strings (sorted)
2. Sorted env var keys+values from task config (excluding secret values — only include secret names)
3. Content hash of each input file matching `cache.inputs` globs (file content only, no metadata)
4. `vtz` binary version (from compile-time env or version string)
5. Platform string (from `std::env::consts::OS` + `std::env::consts::ARCH`)
6. Lockfile hash

Use `sha2` crate (already a dependency). Walk input files with `walkdir` + `glob` pattern matching. Hash files incrementally (don't load all into memory).

**Output format:** `pipe-v1-{platform}-{task}-{package}-{hash}` (the full cache key string).

**Restore keys (for fallback matching):**
```rust
pub fn restore_keys(task: &str, package: &str, platform: &str) -> Vec<String>;
// Returns:
// ["pipe-v1-{platform}-{task}-{package}-", "pipe-v1-{platform}-{task}-"]
```

**CacheBackend trait:**
```rust
#[async_trait]
pub trait CacheBackend: Send + Sync {
    /// Try to get a cache entry. Returns (matched_key, data) if found.
    /// Tries exact key first, then restore_keys in order.
    async fn get(&self, key: &str, restore_keys: &[String]) -> Result<Option<(String, Vec<u8>)>>;

    /// Store a cache entry.
    async fn put(&self, key: &str, data: &[u8]) -> Result<()>;

    /// Check if a key exists without downloading.
    async fn exists(&self, key: &str) -> Result<bool>;
}
```

**Acceptance criteria:**
- [ ] Cache key includes command, env, input file contents, version, platform, lockfile
- [ ] Secret values excluded from cache key (only names included)
- [ ] Input files hashed incrementally (memory-efficient)
- [ ] Glob patterns correctly expand to input files
- [ ] Restore keys generated with correct prefix hierarchy
- [ ] `CacheBackend` trait defined with get/put/exists
- [ ] Unit tests: same inputs → same key, different input → different key
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 2: Local cache backend (tar+zstd + LRU eviction)

**Files:**
- `native/vtz/src/ci/cache.rs` (modified — add LocalCache implementation)

**What to implement:**

**`LocalCache` implements `CacheBackend`:**
```rust
pub struct LocalCache {
    cache_dir: PathBuf,  // default: .pipe/cache
    max_size: u64,       // default: 2GB
}
```

**Storage format:**
- Cache entries stored as `<cache_dir>/<key>.tar.zst`
- Manifest at `<cache_dir>/manifest.json`:
  ```json
  {
    "entries": {
      "pipe-v1-linux-x64-build-@vertz/ui-abc123": {
        "size": 1234567,
        "created_at": "2026-04-04T12:00:00Z",
        "last_accessed": "2026-04-04T14:00:00Z"
      }
    }
  }
  ```

**Pack outputs:** Use `tar` crate to create archive, then compress with zstd. Preserve file permissions. Follow symlinks (store as regular files).

**Restore outputs:** Decompress with zstd, extract tar to package directory. Verify no path traversal (tar entries must not escape the package directory).

**Fallback key matching:**
- `get()` first tries exact key
- On miss, iterate restore_keys. For each prefix, scan manifest for entries starting with that prefix. Pick the most recently created match.
- Log whether hit was exact or fallback: `[pipe] Cache hit (stale) for build @vertz/ui — re-executing with warm cache`

**LRU eviction:**
- After each `put()`, check total cache size
- If exceeding `max_size`, evict entries with oldest `last_accessed` until under limit
- Update manifest on every get (touch `last_accessed`) and put

**`vtz ci cache status`:**
```
Cache directory: .pipe/cache
Total size: 847 MB / 2048 MB
Entries: 42
Oldest: pipe-v1-darwin-arm64-build-@vertz/core-... (3 days ago)
Newest: pipe-v1-darwin-arm64-test-@vertz/ui-... (2 hours ago)
```

**`vtz ci cache clean`:**
- Delete all entries and manifest
- Print: `Cleared 42 entries (847 MB)`

**Acceptance criteria:**
- [ ] Pack outputs into tar+zstd archive
- [ ] Restore outputs from archive to correct directory
- [ ] File permissions preserved through pack/restore
- [ ] Symlinks followed (stored as regular files)
- [ ] Path traversal prevention (no `../` escape in tar entries)
- [ ] Exact key match returns cache hit
- [ ] Fallback prefix matching returns stale cache with log message
- [ ] LRU eviction when cache exceeds max size
- [ ] Manifest updated on get (last_accessed) and put
- [ ] `vtz ci cache status` shows cache statistics
- [ ] `vtz ci cache clean` removes all entries
- [ ] Unit tests: pack/restore round-trip, LRU eviction, fallback matching
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 3: Scheduler integration + cache hit/miss flow

**Files:**
- `native/vtz/src/ci/scheduler.rs` (modified — integrate cache)
- `native/vtz/src/ci/output.rs` (modified — cache status in display)

**What to implement:**

Integrate caching into the scheduler's task execution flow:

```
For each task with cache config:
  1. Compute cache key from inputs
  2. Try cache.get(key, restore_keys)
  3. If exact hit:
     - Restore outputs
     - Mark task as cached (skip execution)
     - Record in TaskResult { cached: true, status: Success }
  4. If fallback hit:
     - Restore stale outputs (warm cache)
     - Execute command anyway
     - On success: pack new outputs and cache.put(key)
  5. If miss:
     - Execute command
     - On success: pack outputs and cache.put(key)
```

Tasks without `cache` config always execute.

**Output display:**
- Cached tasks show `●` symbol and "cached" instead of duration
- Fallback-cached tasks show normal duration but with "(warm)" suffix
- Summary line includes cache stats: `(3 cached, 8 executed, 3 skipped)`

**NDJSON log entries:** Add `cached: true/false` and `cache_key` to task log entries.

**Acceptance criteria:**
- [ ] Exact cache hit skips task execution and restores outputs
- [ ] Fallback cache hit restores warm cache, task still executes
- [ ] Cache miss: task executes, outputs cached on success
- [ ] Failed tasks: outputs NOT cached
- [ ] Tasks without cache config always execute
- [ ] Output shows `●` cached for cache hits
- [ ] Summary includes cache hit/miss counts
- [ ] NDJSON logs include cache information
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 4: GitHub Actions cache backend (OpenDAL Ghac)

**Files:**
- `native/vtz/Cargo.toml` (modified — add opendal dependency)
- `native/vtz/src/ci/cache.rs` (modified — add GitHubActionsCache)

**What to implement:**

**Add dependency:**
```toml
opendal = { version = "0.50", features = ["services-ghac"] }
```

(Check latest version at crates.io. The `services-ghac` feature enables GitHub Actions Cache.)

**`GitHubActionsCache` implements `CacheBackend`:**
```rust
pub struct GitHubActionsCache {
    operator: opendal::Operator,
}

impl GitHubActionsCache {
    /// Create from env vars. Returns None if not in GitHub Actions.
    pub fn from_env() -> Option<Self> {
        let cache_url = std::env::var("ACTIONS_CACHE_URL").ok()?;
        let token = std::env::var("ACTIONS_RUNTIME_TOKEN").ok()?;

        let builder = opendal::services::Ghac::default()
            .endpoint(&cache_url)
            .token(&token)
            .version("pipe-v1");  // cache version prefix

        let operator = opendal::Operator::new(builder)?.finish();
        Some(Self { operator })
    }
}
```

**`get()`:** Use OpenDAL's `read()` with the key. For fallback keys, use `list()` with prefix to find matching entries.

**`put()`:** Use OpenDAL's `write()` to upload the tar+zstd data.

**Auto-detection in cache manager:**
```rust
pub fn create_cache_backend(config: &CacheConfig) -> Box<dyn CacheBackend> {
    match &config.remote {
        Some(RemoteCacheConfig::Auto) | None => {
            if let Some(gh) = GitHubActionsCache::from_env() {
                // Layer: try GitHub first, fall back to local
                Box::new(LayeredCache { remote: gh, local: LocalCache::new(config) })
            } else {
                Box::new(LocalCache::new(config))
            }
        }
        Some(RemoteCacheConfig::Disabled) => Box::new(LocalCache::new(config)),
        Some(RemoteCacheConfig::Url(url)) => {
            // S3/R2 — Phase 6
            Box::new(LocalCache::new(config))
        }
    }
}
```

**`LayeredCache`:** Tries remote first for `get()`, pushes to both local and remote on `put()`. Local acts as L1, remote as L2.

**Acceptance criteria:**
- [ ] `GitHubActionsCache::from_env()` returns `None` outside GitHub Actions
- [ ] `GitHubActionsCache::from_env()` creates operator with correct env vars
- [ ] `get()` reads from GitHub Actions cache API
- [ ] `put()` writes to GitHub Actions cache API
- [ ] Fallback key matching works via prefix list
- [ ] `LayeredCache` tries remote first, falls back to local
- [ ] `LayeredCache.put()` pushes to both local and remote
- [ ] `create_cache_backend()` auto-detects GitHub Actions
- [ ] `create_cache_backend()` respects `remote: false`
- [ ] Integration test with mock HTTP server for GH cache API (or skip with `#[ignore]`)
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
