# VertzModuleLoader Builder — Constructor Consolidation

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-04-17 | Initial draft. Targeted refactor for [#2737](https://github.com/vertz-dev/vertz/issues/2737). |
| 2 | 2026-04-17 | Address review feedback: correct field count; drop builder/`set_test_mode` duplication by deleting `set_test_mode`; rename `compile_cache` → `compile_cache_enabled`; accept `impl Into<Option<Arc<_>>>` for shared-cache setters; put builder tests in existing `mod tests` (reuse `test_plugin()`); drop retrospective and changeset (internal Rust refactor); drop test-only accessors (use private-field access from same-module tests); drop weak equivalence test (compiler-enforced via struct literal exhaustiveness). |

---

## Problem

`native/vtz/src/runtime/module_loader.rs` defines three constructors for `VertzModuleLoader`, all initializing the same struct (14 fields total — 11 cache/state fields per [#2737](https://github.com/vertz-dev/vertz/issues/2737)'s framing, plus `root_dir`, `plugin`, and `test_mode`):

- `new(root_dir, plugin)` — 46+ call sites (mostly tests, 1 production at `js_runtime.rs:191`).
- `new_with_cache(root_dir, cache_enabled, plugin)` — **zero call sites**. Dead code.
- `new_with_shared_cache(root_dir, cache_enabled, plugin, shared_source_cache, v8_code_cache, resolution_cache)` — 2 production call sites (`js_runtime.rs:258, 469`).

Issues:

1. **Field-ordering divergence.** `new_with_shared_cache` initializes fields in a different order (`canon_cache` before `newline_indices` vs. after). A new field can easily be forgotten in one constructor — a silent drift bug.
2. **Dead `new_with_cache`.** Maintained but unused. Confuses readers about the "right" way to construct a loader.
3. **6-positional-argument `new_with_shared_cache`.** Five are `Option`s threaded from `VertzRuntimeOptions`. Positional optional args are error-prone.

This is [#2737](https://github.com/vertz-dev/vertz/issues/2737)'s concrete finding. The broader "consolidate 11 cache fields into a `CacheManager`" suggestion from the issue is **explicitly out of scope** — see "Non-Goals" below and the accompanying rationale doc.

## API Surface

New public API on `VertzModuleLoader`:

```rust
// Convenience (unchanged signature — preserves 46 test call sites).
pub fn new(root_dir: &str, plugin: Arc<dyn FrameworkPlugin>) -> Self;

// Builder entry point.
pub fn builder(root_dir: &str, plugin: Arc<dyn FrameworkPlugin>) -> VertzModuleLoaderBuilder;
```

New builder type:

```rust
pub struct VertzModuleLoaderBuilder {
    root_dir: PathBuf,
    plugin: Arc<dyn FrameworkPlugin>,
    compile_cache_enabled: bool,
    shared_source_cache: Option<Arc<SharedSourceCache>>,
    v8_code_cache: Option<Arc<V8CodeCache>>,
    resolution_cache: Option<Arc<SharedResolutionCache>>,
    test_mode: bool,
}

impl VertzModuleLoaderBuilder {
    pub fn compile_cache_enabled(mut self, enabled: bool) -> Self;
    pub fn shared_source_cache(mut self, cache: impl Into<Option<Arc<SharedSourceCache>>>) -> Self;
    pub fn v8_code_cache(mut self, cache: impl Into<Option<Arc<V8CodeCache>>>) -> Self;
    pub fn resolution_cache(mut self, cache: impl Into<Option<Arc<SharedResolutionCache>>>) -> Self;
    pub fn test_mode(mut self, enabled: bool) -> Self;
    pub fn build(self) -> VertzModuleLoader;
}
```

The `impl Into<Option<Arc<T>>>` trick lets callers pass either `Arc<T>` or `Option<Arc<T>>` — accommodating both the existing `js_runtime.rs` sites (which already hold `Option<Arc<_>>`) and future callers with bare `Arc<_>`. Idiomatic for Rust builders (hyper, tokio).

### Removals

- **Delete** `VertzModuleLoader::new_with_cache()` — zero callers.
- **Delete** `VertzModuleLoader::new_with_shared_cache()` — replaced by the builder.
- **Delete** `VertzModuleLoader::set_test_mode(&mut self, bool)` — the builder's `.test_mode(true)` replaces its only caller (`js_runtime.rs:268`), eliminating the "two ways to set test mode" smell.

### Updated call sites

`js_runtime.rs:191` — unchanged (still `::new(...)`).

`js_runtime.rs:258` (test runtime, currently mutates post-construction):
```rust
// Before:
let mut loader = VertzModuleLoader::new_with_shared_cache(
    &root_dir,
    cache_enabled,
    options.plugin.clone(),
    options.shared_source_cache.clone(),
    options.v8_code_cache.clone(),
    options.resolution_cache.clone(),
);
loader.set_test_mode(true);
let module_loader = Rc::new(loader);

// After (no more `mut`):
let module_loader = Rc::new(
    VertzModuleLoader::builder(&root_dir, options.plugin.clone())
        .compile_cache_enabled(cache_enabled)
        .shared_source_cache(options.shared_source_cache.clone())
        .v8_code_cache(options.v8_code_cache.clone())
        .resolution_cache(options.resolution_cache.clone())
        .test_mode(true)
        .build(),
);
```

`js_runtime.rs:469` (production runtime, already non-mut):
```rust
let module_loader = Rc::new(
    VertzModuleLoader::builder(&root_dir, options.plugin.clone())
        .compile_cache_enabled(cache_enabled)
        .shared_source_cache(options.shared_source_cache.clone())
        .v8_code_cache(options.v8_code_cache.clone())
        .resolution_cache(options.resolution_cache.clone())
        .build(),
);
```

### Internal invariant

`VertzModuleLoader::new()` becomes a one-line façade:

```rust
pub fn new(root_dir: &str, plugin: Arc<dyn FrameworkPlugin>) -> Self {
    Self::builder(root_dir, plugin).build()
}
```

**Exactly one place in the entire module initializes struct fields: `VertzModuleLoaderBuilder::build()` via a complete struct literal.** Adding a new field only requires touching the builder. A forgotten field becomes a compile error (struct literals require every field — no `..Default::default()`). This kills the field-ordering-divergence bug class permanently.

## Manifesto Alignment

Relevant principles:

- **"Type-safety is non-negotiable."** Named builder methods replace 6-positional-arg constructors.
- **"If it builds, it works."** Single construction path; struct literal exhaustiveness catches drift at compile time.
- **"Consolidate aggressively"** (from `policies.md`) — deleting `new_with_cache` (dead) and `set_test_mode` (single-caller duplicate of builder's `.test_mode`) follows directly.

Alternative considered: **full `CacheManager` struct** (the issue's broader proposal). Rejected — the eleven cache fields are already accessed from only 4 functions, so extracting a wrapper pushes complexity one level down without reducing total surface area. Mock state split (`mocked_paths`/`mock_export_names`/`mocked_bare_specifiers`) is load-bearing because each field serves a distinct precedence slot in `resolve()`. Documented in `plans/2737-module-loader-consolidation-rationale.md`.

## Non-Goals

- **Consolidating the eleven cache fields into a `CacheManager` struct.** Rejected after investigation — see rationale doc.
- **Extracting a `MockRegistry`.** Rejected — fields serve distinct precedence slots.
- **Adding a unified `invalidate(path)` method.** The per-loader RefCell caches have zero invalidation today (loaders are recreated per dev/test lifecycle). Separate ticket if/when it matters.
- **Changing `CompileCache`, `SharedSourceCache`, `V8CodeCache`, `SharedResolutionCache`.** Untouched.
- **Changing behavior or test coverage.** Mechanical refactor — every existing test passes unchanged.
- **Modifying the 46 `VertzModuleLoader::new(...)` test call sites.** The `::new` façade keeps them working.
- **Adding a changeset.** Internal Rust refactor with no TypeScript API surface. Per `.claude/rules/policies.md`, changesets track package versions — `vtz`'s version is synced via `scripts/version.sh`, and no TS package needs a bump here.
- **Writing a retrospective.** This is a mechanical one-phase cleanup on a P3 ticket, not a feature.

## Unknowns

None identified.

## POC Results

No POC needed. The builder pattern is standard Rust; correctness is compiler-enforced via struct literal exhaustiveness.

## Type Flow Map

No generics introduced. All types concrete:

- `VertzModuleLoaderBuilder` owns `PathBuf`, `Arc<dyn FrameworkPlugin>`, `Option<Arc<SharedSourceCache>>`, etc. — same types the final struct stores.
- `build()` returns `VertzModuleLoader`. Callers unchanged.

Compile-time verification: any drift between `VertzModuleLoaderBuilder::build()`'s struct literal and `VertzModuleLoader`'s field set is a rustc error. No runtime checks, no tests needed for field completeness.

## E2E Acceptance Test

The **existing 46 `::new(...)` call sites (5000+ lines of tests) + 2 production migrations** are the primary acceptance test: if the refactor breaks any observable behavior, `cargo test --all` fails.

Two new tests proving the builder itself works correctly — placed inside the existing `#[cfg(test)] mod tests` in `module_loader.rs` (line 4246), reusing the existing `test_plugin()` helper (line 4253) and `create_temp_dir()` (line 4249):

```rust
#[test]
fn builder_produces_loader_with_defaults() {
    let tmp = create_temp_dir();
    let loader = VertzModuleLoader::builder(
        &tmp.path().to_string_lossy(),
        test_plugin(),
    )
    .build();
    // Direct private field access — tests live in the same module.
    assert!(loader.shared_source_cache.is_none());
    assert!(loader.v8_code_cache.is_none());
    assert!(loader.resolution_cache.is_none());
    assert!(!loader.test_mode);
    assert_eq!(loader.root_dir, tmp.path());
}

#[test]
fn builder_sets_all_shared_caches_and_test_mode() {
    let tmp = create_temp_dir();
    let shared = Arc::new(SharedSourceCache::new());
    let v8 = Arc::new(V8CodeCache::new());
    let res = Arc::new(SharedResolutionCache::new());
    let loader = VertzModuleLoader::builder(
        &tmp.path().to_string_lossy(),
        test_plugin(),
    )
    .compile_cache_enabled(true)
    .shared_source_cache(shared.clone())
    .v8_code_cache(v8.clone())
    .resolution_cache(res.clone())
    .test_mode(true)
    .build();
    assert!(Arc::ptr_eq(loader.shared_source_cache.as_ref().unwrap(), &shared));
    assert!(Arc::ptr_eq(loader.v8_code_cache.as_ref().unwrap(), &v8));
    assert!(Arc::ptr_eq(loader.resolution_cache.as_ref().unwrap(), &res));
    assert!(loader.test_mode);
    // `Arc::ptr_eq` proves `impl Into<Option<Arc<_>>>` moves the Arc (doesn't re-clone).
}
```

No test-only accessors needed — tests use direct private field access since they're in the same module via `mod tests`.

## Implementation Phases

Single phase — mechanical refactor sized for one PR.

### Phase 1: Builder + migrate callers + delete dead/redundant constructors

**Files (4):**
1. `native/vtz/src/runtime/module_loader.rs` (modified) — add `VertzModuleLoaderBuilder` + `builder()`; rewrite `new()` as façade; delete `new_with_cache()`, `new_with_shared_cache()`, `set_test_mode()`; add 2 tests inside existing `mod tests`.
2. `native/vtz/src/runtime/js_runtime.rs` (modified) — migrate `:258` and `:469` to the builder.
3. `plans/2737-module-loader-consolidation-rationale.md` (new) — short rationale (half a page) for why the broader consolidation proposed in the issue was rejected. Closes the exploration side of #2737.
4. `reviews/2737-module-loader-builder/phase-01-builder.md` (new) — adversarial review artifact.

**TDD order:**
1. **RED:** add `builder_produces_loader_with_defaults` — fails (builder doesn't exist yet).
2. **GREEN:** add `VertzModuleLoaderBuilder` struct, `builder()` entry point, `build()` method using a complete struct literal. Test passes.
3. **RED:** add `builder_sets_all_shared_caches_and_test_mode` — fails on missing setter methods.
4. **GREEN:** add setter methods (`compile_cache_enabled`, `shared_source_cache`, `v8_code_cache`, `resolution_cache`, `test_mode`) with `impl Into<Option<Arc<_>>>` where appropriate. Test passes.
5. **Refactor (still green):** rewrite `VertzModuleLoader::new()` as `Self::builder(root_dir, plugin).build()`. All 46 existing `::new` test sites still pass (they were never touched).
6. Migrate `js_runtime.rs:258` (test runtime) to builder; drop `let mut`, drop `set_test_mode(true)` post-build.
7. Migrate `js_runtime.rs:469` (production runtime) to builder.
8. Delete `new_with_cache`, `new_with_shared_cache`, `set_test_mode`. `cargo build` must pass — struct literal exhaustiveness catches any residual constructor stubs.
9. **Refactor:** tidy imports; ensure the builder is the exemplar of this pattern (no other `*Builder` types exist in `native/vtz` today — this is the first).

**Acceptance criteria:**
- [ ] `cargo test --all` green (existing + 2 new builder tests).
- [ ] `cargo clippy --all-targets -- -D warnings` clean.
- [ ] `cargo fmt --all -- --check` clean.
- [ ] `new_with_cache`, `new_with_shared_cache`, `set_test_mode` all deleted.
- [ ] `VertzModuleLoader` struct fields are initialized in exactly one place: `VertzModuleLoaderBuilder::build()`, via a complete struct literal (no `..Default::default()`).
- [ ] `js_runtime.rs:258` and `:469` use the builder; neither uses `let mut`.
- [ ] Rationale doc committed.
- [ ] Adversarial review written in `reviews/2737-module-loader-builder/phase-01-builder.md`.

## Rollout / Compatibility

Internal-only API. `VertzModuleLoader` is not exported from `vtz`'s public interface — consumed only by the runtime crate itself. No changeset needed.

## Definition of Done

- Phase 1 acceptance criteria all checked.
- PR to `main` opened, GitHub CI green.
- Rationale doc committed (closes exploration side of #2737).
- PR description references #2737 with explicit disposition: "outcome (a) + (b): targeted builder refactor + rationale for rejecting broader consolidation."
