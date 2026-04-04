# Phase 4: Caching — Adversarial Review

- **Reviewer:** review-agent
- **Date:** 2026-04-04

## Findings

### [BLOCKER-1] Steps sorted in cache key, destroying execution order semantics
**File:** `native/vtz/src/ci/cache.rs:58-60`
**Status:** FIXED — removed sort, use steps.join directly

### [BLOCKER-2] restore_outputs does not reject absolute paths in tar entries
**File:** `native/vtz/src/ci/cache.rs:513-526`
**Status:** FIXED — added RootDir and Prefix checks

### [BLOCKER-3] CacheStatus hardcodes max_mb=2048 and has dead backend variable
**File:** `native/vtz/src/ci/mod.rs:96-107`
**Status:** FIXED — removed dead variable, used LocalCache max_size for display

### [SHOULD-FIX-1] Blocking filesystem I/O on async runtime
**Status:** DEFERRED — LocalCache is only used locally with small files. Will add spawn_blocking in Phase 6 if profiling shows starvation.

### [SHOULD-FIX-2] Manifest race condition under concurrent workers
**Status:** FIXED — added internal Mutex around manifest operations

### [SHOULD-FIX-3] pack_outputs returns non-empty archive for 0 matched files
**Status:** FIXED — return empty Vec when no files match

### [SHOULD-FIX-4] LRU uses string timestamp comparison (fragile)
**Status:** FIXED — changed to u64 seconds storage, numeric comparison

### [SHOULD-FIX-5] lockfile_hash stops at first lockfile, misses multi-lockfile repos
**Status:** FIXED — now hashes all existing lockfiles

### [SHOULD-FIX-6] Missing test for absolute path tar traversal
**Status:** FIXED — added test_restore_absolute_path_rejected

### [NIT-1] Dead code in compute_cache_key (task_name extracted but unused)
**Status:** FIXED — removed dead lines

### [NIT-2] CacheStatus and CacheClean don't share cache directory resolution
**Status:** FIXED — extracted cache_dir helper

### [NIT-3] now_iso doesn't produce ISO format
**Status:** FIXED — renamed to now_unix_secs

## Summary
- 3 blocker(s) — all fixed
- 6 should-fix — 5 fixed, 1 deferred (blocking I/O)
- 3 nit(s) — all fixed
