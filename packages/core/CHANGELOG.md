# @vertz/core

## 0.2.1

### Patch Changes

- [`023f1fc`](https://github.com/vertz-dev/vertz/commit/023f1fc4c6c8a121edf448bcd11421a3add7b9d2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Entity-Driven Architecture (EDA) v0.1.0 — core integration.

  - Added `EntityRouteEntry` interface and `_entityRoutes` hook in `AppConfig`
  - Entity routes registered in Trie via `buildHandler()` alongside module routes
  - `router.routes` uses `_entityRoutes` as source of truth when provided by `@vertz/server`

- [#630](https://github.com/vertz-dev/vertz/pull/630) [`869699d`](https://github.com/vertz-dev/vertz/commit/869699d52d9fa685996acb418b8f8fb1bb554f6f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Standardize error response codes across all exception classes.

  - HTTP exceptions now use short codes (`NotFound`, `BadRequest`, `Unauthorized`, etc.) instead of class names (`NotFoundException`, `BadRequestException`, etc.) in `toJSON()` output
  - `ValidationException.toJSON()` now returns `details` instead of `errors` for the validation array, consistent with the entity error handler format
  - All framework error responses (`404 Not Found`, `405 Method Not Allowed`, `500 Internal Server Error`) use the same `{ error: { code, message } }` structure

- Updated dependencies []:
  - @vertz/schema@0.2.1

## 0.2.0

### Minor Changes

- [#290](https://github.com/vertz-dev/vertz/pull/290) [`a207936`](https://github.com/vertz-dev/vertz/commit/a2079362c54a8b61ea2368039abcb08681448380) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Rename `@vertz/core` → `@vertz/server` and `createApp()` → `createServer()`

  - Added `@vertz/server` package that re-exports all public API from `@vertz/core`
  - Added `createServer` as the preferred factory function (alias for `createApp`)
  - Added `vertz.server` namespace alias for `vertz.app`
  - Deprecated `createApp()` with console warning pointing to `createServer()`
  - Updated all internal imports to use `@vertz/server`
  - Compiler now recognizes both `vertz.app()` and `vertz.server()` calls

- [#322](https://github.com/vertz-dev/vertz/pull/322) [`4f780bb`](https://github.com/vertz-dev/vertz/commit/4f780bba6bee7a493c9a1e0b8463ea2126a7285b) Thanks [@vertz-tech-lead](https://github.com/apps/vertz-tech-lead)! - Add schema-validated options and env to ServiceDef

### Patch Changes

- [#200](https://github.com/vertz-dev/vertz/pull/200) [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Published types now correctly preserve generic type parameters in `.d.ts` files. Switched DTS bundler to use `inferTypes` mode, preventing potential erasure of generics to `Record<string, unknown>` or `unknown` in the emitted declarations.

- [#209](https://github.com/vertz-dev/vertz/pull/209) [`c8efe6b`](https://github.com/vertz-dev/vertz/commit/c8efe6b4aef9ea9b9b4e3de414297ce2f829f7bb) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Service types injected via `.router({ inject: { ... } })` now flow through to handler `ctx` automatically. Previously, injected services were typed as `unknown`, requiring manual `as` casts in every handler. The router, module def, and HTTP method types now carry a `TInject` generic parameter that preserves the inject map type through `ExtractMethods` and `ResolveInjectMap` utility types.

- [#295](https://github.com/vertz-dev/vertz/pull/295) [`3407afd`](https://github.com/vertz-dev/vertz/commit/3407afdf543481cd559e550454144d16e6a26e06) Thanks [@vertz-dev-dx](https://github.com/apps/vertz-dev-dx)! - Process route-level middlewares in app runner. Routes with a `middlewares` field now have those middlewares executed after global middlewares, with their contributions merged into the handler context.

- [#194](https://github.com/vertz-dev/vertz/pull/194) [`c1e38d0`](https://github.com/vertz-dev/vertz/commit/c1e38d010da1bea95ed9246968fabc22e300a6e9) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - `app.listen()` now prints registered routes on startup. Disable with `{ logRoutes: false }`.

- Updated dependencies [[`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8), [`6443339`](https://github.com/vertz-dev/vertz/commit/64433394142ddff76d8021b25259c9c901d62b1e), [`3407afd`](https://github.com/vertz-dev/vertz/commit/3407afdf543481cd559e550454144d16e6a26e06)]:
  - @vertz/schema@0.2.0
