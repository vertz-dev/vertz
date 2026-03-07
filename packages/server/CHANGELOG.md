# @vertz/server

## 0.2.13

### Patch Changes

- [#967](https://github.com/vertz-dev/vertz/pull/967) [`eab229b`](https://github.com/vertz-dev/vertz/commit/eab229bc63a08ae6877ff4905d99c364a8694358) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Validate entity models are registered in createDb() at server creation time. When an entity name doesn't match a key in the DatabaseClient's model registry, createServer() now throws a clear error listing all missing models and showing which models are registered. Previously this caused a cryptic runtime TypeError when the entity was first accessed.

- Updated dependencies [[`127df59`](https://github.com/vertz-dev/vertz/commit/127df59424102142ac1aee9dfcc31b22c2959343)]:
  - @vertz/db@0.2.13
  - @vertz/core@0.2.13
  - @vertz/errors@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.12
  - @vertz/db@0.2.12
  - @vertz/errors@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.11
  - @vertz/db@0.2.11
  - @vertz/errors@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.8
  - @vertz/db@0.2.8
  - @vertz/errors@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.7
  - @vertz/db@0.2.7
  - @vertz/errors@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.6
  - @vertz/db@0.2.6
  - @vertz/errors@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.5
  - @vertz/db@0.2.5
  - @vertz/errors@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.4
  - @vertz/db@0.2.4

## 0.2.3

### Patch Changes

- [#882](https://github.com/vertz-dev/vertz/pull/882) [`b0b6115`](https://github.com/vertz-dev/vertz/commit/b0b6115e0389447ffb951e875b5ce224e4ace51c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove deprecated module system (`createModule`, `createModuleDef`, services, routers) from public API. The entity + action pattern is now the only supported way to define routes. Internal infrastructure (Trie router, middleware runner, schema validation, CORS, error handling) is preserved.

- Updated dependencies [[`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`b0b6115`](https://github.com/vertz-dev/vertz/commit/b0b6115e0389447ffb951e875b5ce224e4ace51c)]:
  - @vertz/core@0.2.3
  - @vertz/db@0.2.3

## 0.2.2

### Patch Changes

- [#861](https://github.com/vertz-dev/vertz/pull/861) [`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix: address second-pass security audit findings — hidden field stripping in action pipeline, CSS value sanitization, empty string coercion guard

- Updated dependencies []:
  - @vertz/core@0.2.2
  - @vertz/db@0.2.2

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
