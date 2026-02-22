# @vertz/server

## 0.2.1

### Patch Changes

- [#463](https://github.com/vertz-dev/vertz/pull/463) [`6fb830e`](https://github.com/vertz-dev/vertz/commit/6fb830e04c7fd7e3325ad32fc154b90e811b95d4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Entity-Driven Architecture (EDA) v0.1.0 — entity system and server integration.

  - Added `entity(name, config)` function with full type-safe config (access, before, after, actions, relations)
  - Added `EntityContext` with `authenticated()`, `role()`, `tenant()` guard methods
  - Added `EntityRegistry` for cross-entity access
  - Added CRUD pipeline with before/after lifecycle hooks
  - Added custom action pipeline with input schema validation
  - Added `enforceAccess()` with deny-by-default semantics
  - Added `stripHiddenFields()` and `stripReadOnlyFields()` field filters
  - Added `entityErrorHandler()` mapping exceptions to `{ error: { code, message } }`
  - Added `generateEntityRoutes()` producing HTTP routes from entity definitions
  - Added `createServer()` wrapper injecting entity routes into core
  - Removed `domain()` and all `Domain*` types (full replacement)

- Updated dependencies [[`6fb830e`](https://github.com/vertz-dev/vertz/commit/6fb830e04c7fd7e3325ad32fc154b90e811b95d4), [`6fb830e`](https://github.com/vertz-dev/vertz/commit/6fb830e04c7fd7e3325ad32fc154b90e811b95d4)]:
  - @vertz/core@0.2.1
  - @vertz/db@0.2.1

## 0.2.0

### Minor Changes

- [#290](https://github.com/vertz-dev/vertz/pull/290) [`a207936`](https://github.com/vertz-dev/vertz/commit/a2079362c54a8b61ea2368039abcb08681448380) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Rename `@vertz/core` → `@vertz/server` and `createApp()` → `createServer()`

  - Added `@vertz/server` package that re-exports all public API from `@vertz/core`
  - Added `createServer` as the preferred factory function (alias for `createApp`)
  - Added `vertz.server` namespace alias for `vertz.app`
  - Deprecated `createApp()` with console warning pointing to `createServer()`
  - Updated all internal imports to use `@vertz/server`
  - Compiler now recognizes both `vertz.app()` and `vertz.server()` calls

### Patch Changes

- Updated dependencies [[`a207936`](https://github.com/vertz-dev/vertz/commit/a2079362c54a8b61ea2368039abcb08681448380), [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8), [`c8efe6b`](https://github.com/vertz-dev/vertz/commit/c8efe6b4aef9ea9b9b4e3de414297ce2f829f7bb), [`3407afd`](https://github.com/vertz-dev/vertz/commit/3407afdf543481cd559e550454144d16e6a26e06), [`4f780bb`](https://github.com/vertz-dev/vertz/commit/4f780bba6bee7a493c9a1e0b8463ea2126a7285b), [`c1e38d0`](https://github.com/vertz-dev/vertz/commit/c1e38d010da1bea95ed9246968fabc22e300a6e9)]:
  - @vertz/core@0.2.0
