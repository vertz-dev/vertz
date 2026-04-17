# Phase 1: VertzModuleLoaderBuilder

## Context

Targeted refactor for [#2737](https://github.com/vertz-dev/vertz/issues/2737). Replace three `VertzModuleLoader` constructors with a builder. See `plans/2737-module-loader-builder.md` for full design and rationale.

Accompanying doc `plans/2737-module-loader-consolidation-rationale.md` (written as part of this phase) documents why the broader `CacheManager`/`invalidate()` proposal from the issue was rejected.

## Tasks

### Task 1: Introduce `VertzModuleLoaderBuilder` + rewrite `::new` as façade

**Files (5):**
- `native/vtz/src/runtime/module_loader.rs` (modified)
- `native/vtz/src/runtime/js_runtime.rs` (modified)
- `plans/2737-module-loader-consolidation-rationale.md` (new)
- `reviews/2737-module-loader-builder/phase-01-builder.md` (new, after implementation)

**What to implement:**

1. **RED** — inside the existing `#[cfg(test)] mod tests` in `module_loader.rs` (line 4246), reusing `test_plugin()` (line 4253) and `create_temp_dir()` (line 4249), add:

   ```rust
   #[test]
   fn builder_produces_loader_with_defaults() {
       let tmp = create_temp_dir();
       let loader = VertzModuleLoader::builder(&tmp.path().to_string_lossy(), test_plugin()).build();
       assert!(loader.shared_source_cache.is_none());
       assert!(loader.v8_code_cache.is_none());
       assert!(loader.resolution_cache.is_none());
       assert!(!loader.test_mode);
       assert_eq!(loader.root_dir, tmp.path());
   }
   ```

2. **GREEN** — add `VertzModuleLoaderBuilder` struct + `builder()` entry point + `build()` that uses a **complete struct literal** (no `..Default::default()`).

3. **RED** — add:

   ```rust
   #[test]
   fn builder_sets_all_shared_caches_and_test_mode() {
       let tmp = create_temp_dir();
       let shared = std::sync::Arc::new(SharedSourceCache::new());
       let v8 = std::sync::Arc::new(V8CodeCache::new());
       let res = std::sync::Arc::new(SharedResolutionCache::new());
       let loader = VertzModuleLoader::builder(&tmp.path().to_string_lossy(), test_plugin())
           .compile_cache_enabled(true)
           .shared_source_cache(shared.clone())
           .v8_code_cache(v8.clone())
           .resolution_cache(res.clone())
           .test_mode(true)
           .build();
       assert!(std::sync::Arc::ptr_eq(loader.shared_source_cache.as_ref().unwrap(), &shared));
       assert!(std::sync::Arc::ptr_eq(loader.v8_code_cache.as_ref().unwrap(), &v8));
       assert!(std::sync::Arc::ptr_eq(loader.resolution_cache.as_ref().unwrap(), &res));
       assert!(loader.test_mode);
   }
   ```

4. **GREEN** — add builder setters:
   - `compile_cache_enabled(bool)`
   - `shared_source_cache(impl Into<Option<Arc<SharedSourceCache>>>)`
   - `v8_code_cache(impl Into<Option<Arc<V8CodeCache>>>)`
   - `resolution_cache(impl Into<Option<Arc<SharedResolutionCache>>>)`
   - `test_mode(bool)`

5. **Refactor** — rewrite `VertzModuleLoader::new` as:
   ```rust
   pub fn new(root_dir: &str, plugin: Arc<dyn FrameworkPlugin>) -> Self {
       Self::builder(root_dir, plugin).build()
   }
   ```

6. **Migrate callers** in `js_runtime.rs`:
   - `:258` — drop `let mut`; use builder with `.test_mode(true)`.
   - `:469` — use builder (production, no test mode).

7. **Delete**:
   - `VertzModuleLoader::new_with_cache`
   - `VertzModuleLoader::new_with_shared_cache`
   - `VertzModuleLoader::set_test_mode`

8. Write `plans/2737-module-loader-consolidation-rationale.md` — half-page rationale explaining why the broader `CacheManager`/`MockRegistry`/`invalidate(path)` consolidation proposed in #2737 was rejected.

**Acceptance criteria:**
- [ ] `cargo test --all` (in `native/`) passes — existing tests + 2 new builder tests.
- [ ] `cargo clippy --all-targets -- -D warnings` clean.
- [ ] `cargo fmt --all -- --check` clean.
- [ ] `VertzModuleLoader::new_with_cache`, `new_with_shared_cache`, `set_test_mode` deleted.
- [ ] `VertzModuleLoader` struct literal appears in exactly one place: `VertzModuleLoaderBuilder::build()`.
- [ ] `js_runtime.rs:258` and `:469` use the builder; no `let mut` in either site.
- [ ] Rationale doc committed.
- [ ] Adversarial review written in `reviews/2737-module-loader-builder/phase-01-builder.md`.
