# VertzModuleLoader Cache Consolidation — Rationale for Limited Scope

Companion to `plans/2737-module-loader-builder.md` and issue [#2737](https://github.com/vertz-dev/vertz/issues/2737).

#2737 proposed extracting a `CacheManager` struct that owns the per-loader caches (`canon_cache`, `mocked_paths`, `pkg_type_cache`, `mock_export_names`, `mocked_bare_specifiers`, `source_maps`, `newline_indices`) behind a narrow API (`canonical(&Path)`, `invalidate(&Path)`, `mock_registry()`). After investigation, we **did not** do that. We shipped a targeted builder refactor for the constructors instead.

This doc records why, so the next contributor doesn't re-ask the same question.

## What we investigated

1. **Mutation call sites.** All RefCell mutations across the eleven cache fields happen in exactly **4 functions**: `compile_source()`, `register_mocked_specifiers()`, `canonicalize_cached()`, and `is_cjs_module_cached()`. The cognitive load from "eleven fields" lives in the struct declaration, not in scattered mutation sites.
2. **HMR invalidation.** The per-loader RefCell caches have **zero explicit invalidation today** — they rely on the loader being reconstructed per dev/test lifecycle (`persistent_isolate.rs` owns the lifecycle). The cross-isolate `Arc` caches (`SharedSourceCache`, `V8CodeCache`, `SharedResolutionCache`) already expose `.clear()` on their own types; `module_loader.rs` never calls them.
3. **Mock state split.** `mocked_paths`, `mock_export_names`, and `mocked_bare_specifiers` serve **distinct precedence slots in `resolve()`**: `mocked_bare_specifiers` gates early-exit from synthetic intercepts; `mocked_paths` gates URL rewriting after resolution; `mock_export_names` is read during synthetic/proxy module generation. Recent fix [#2750](https://github.com/vertz-dev/vertz/pull/2750) (vi.mock transitive imports) depended on that split ordering.
4. **Known bugs.** No TODO/FIXME near the caches. No user reports of stale-cache issues. Recent cache-related fixes were about precedence, not about the split itself.

## Why `CacheManager` was rejected

- **Doesn't reduce surface area.** The four mutation sites become four calls into `CacheManager` methods. Total fields the reader must reason about goes from 11 (in the struct) + 4 (mutation sites) to 11 (in CacheManager) + 4 (call sites) + 1 (the wrapper). Net indirection, no net simplification.
- **Hides a real invariant.** The split between "caches that depend on file content" vs. "caches that don't" is load-bearing for whoever eventually wires up HMR invalidation. A `CacheManager::invalidate(&Path)` method has to pick — and its answer is non-obvious without context that only lives in the current code's mutation sites.
- **Breaks mock precedence locality.** If mock state moves into `MockRegistry`, the precedence ordering in `resolve()` becomes split between `resolve()` and the registry's internals. Precedence is easier to read when it's all in one function.

## Why `MockRegistry` was rejected

The three mock fields are not a unit. They're accessed at three different points in `resolve()` with three different semantics:

| Field | Read at | Purpose |
|---|---|---|
| `mocked_bare_specifiers` | Line 3956 (early) | Skip synthetic intercepts for mocked modules |
| `mocked_paths` | Lines 4029, 4062 (mid) | Rewrite resolved URLs to mock proxies |
| `mock_export_names` | Lines 4105, 4154 (late) | Generate proxy export lists |

Wrapping them forces a single API surface on three distinct concerns — and collapses the timing information that makes `resolve()` understandable.

## Why `invalidate(&Path)` was rejected (for now)

The per-loader caches accumulate for the loader's lifetime because the loader is short-lived by construction (per-test, per-isolate). Adding invalidation today would be writing an unused method. If HMR invalidation ever needs to happen at the loader level (instead of the isolate level), the right fix is to introduce `.clear()` on the specific affected caches at that time — not speculatively today.

## What we did ship

**Builder refactor** (`plans/2737-module-loader-builder.md`):

- Replaced three constructors (`new`, `new_with_cache`, `new_with_shared_cache`) with one builder.
- Deleted dead `new_with_cache` (zero callers).
- Deleted `set_test_mode` (single caller migrated to builder's `.test_mode(true)`).
- `VertzModuleLoader` struct fields are now initialized in exactly **one** place: `VertzModuleLoaderBuilder::build()`. Struct-literal exhaustiveness means a forgotten field is a compile error.

This addresses the one concrete latent-bug concern from #2737 (constructor drift) without taking on the rest of the speculative consolidation.

## When to revisit

Re-open the broader consolidation question if:

- A stale-cache bug shows up in HMR or isolate reuse.
- A new cache-adjacent feature (e.g., loader-level cache warming, per-request invalidation) genuinely needs a unified API.
- The count of RefCell-backed fields grows past ~15 or the number of mutation sites grows past ~8.

Until then, the current split is load-bearing and the right shape.
