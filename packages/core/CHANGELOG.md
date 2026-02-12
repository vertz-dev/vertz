# @vertz/core

## 0.1.1

### Patch Changes

- [#200](https://github.com/vertz-dev/vertz/pull/200) [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Published types now correctly preserve generic type parameters in `.d.ts` files. Switched DTS bundler to use `inferTypes` mode, preventing potential erasure of generics to `Record<string, unknown>` or `unknown` in the emitted declarations.

- [#209](https://github.com/vertz-dev/vertz/pull/209) [`c8efe6b`](https://github.com/vertz-dev/vertz/commit/c8efe6b4aef9ea9b9b4e3de414297ce2f829f7bb) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Service types injected via `.router({ inject: { ... } })` now flow through to handler `ctx` automatically. Previously, injected services were typed as `unknown`, requiring manual `as` casts in every handler. The router, module def, and HTTP method types now carry a `TInject` generic parameter that preserves the inject map type through `ExtractMethods` and `ResolveInjectMap` utility types.

- [#194](https://github.com/vertz-dev/vertz/pull/194) [`c1e38d0`](https://github.com/vertz-dev/vertz/commit/c1e38d010da1bea95ed9246968fabc22e300a6e9) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - `app.listen()` now prints registered routes on startup. Disable with `{ logRoutes: false }`.

- Updated dependencies [[`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8), [`6443339`](https://github.com/vertz-dev/vertz/commit/64433394142ddff76d8021b25259c9c901d62b1e)]:
  - @vertz/schema@0.1.1
