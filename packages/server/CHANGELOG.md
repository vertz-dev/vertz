# @vertz/server

## 0.2.1

### Patch Changes

- [#749](https://github.com/vertz-dev/vertz/pull/749) [`463e6f0`](https://github.com/vertz-dev/vertz/commit/463e6f0ea47041a953000471ef1f35708bd4b774) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Migrate action pipeline from throwing `NotFoundException` to returning `Result<CrudResult, EntityError>`, aligning custom entity actions with the CRUD pipeline's errors-as-values pattern.

- [#751](https://github.com/vertz-dev/vertz/pull/751) [`9dc2134`](https://github.com/vertz-dev/vertz/commit/9dc21349e18b35d2f254c12160c27ac89acd7f0a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Migrate auth module and access enforcer to use Result from @vertz/errors instead of throwing exceptions or using custom result types.

  - Add `AuthValidationError` to `@vertz/errors` with `field` + `constraint` discriminators, replacing per-code error types (`INVALID_EMAIL`, `PASSWORD_TOO_SHORT`, etc.)
  - Access enforcer returns `Result<void, EntityForbiddenError>` instead of throwing `ForbiddenException`
  - Auth API methods return `Result<T, AuthError>` from `@vertz/errors` instead of custom `AuthResult<T>`
  - Remove `AuthResult` and local `AuthError` types from `@vertz/server` (consumers import `AuthError` from `@vertz/errors`)

- [`023f1fc`](https://github.com/vertz-dev/vertz/commit/023f1fc4c6c8a121edf448bcd11421a3add7b9d2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Entity-Driven Architecture (EDA) v0.1.0 — entity system and server integration.

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

- Updated dependencies [[`9dc2134`](https://github.com/vertz-dev/vertz/commit/9dc21349e18b35d2f254c12160c27ac89acd7f0a), [`023f1fc`](https://github.com/vertz-dev/vertz/commit/023f1fc4c6c8a121edf448bcd11421a3add7b9d2), [`023f1fc`](https://github.com/vertz-dev/vertz/commit/023f1fc4c6c8a121edf448bcd11421a3add7b9d2), [`869699d`](https://github.com/vertz-dev/vertz/commit/869699d52d9fa685996acb418b8f8fb1bb554f6f), [`c19527e`](https://github.com/vertz-dev/vertz/commit/c19527e815fde35bdeefad9d00ceafa35eae1b0a), [`e4c15ac`](https://github.com/vertz-dev/vertz/commit/e4c15ac37ec290bbde34bf27bfeae08287db0808)]:
  - @vertz/errors@0.1.1
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
