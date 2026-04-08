# @vertz/core

## 0.2.54

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.54

## 0.2.53

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.53

## 0.2.52

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.52

## 0.2.51

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.51

## 0.2.50

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.50

## 0.2.49

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.49

## 0.2.48

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.48

## 0.2.47

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.47

## 0.2.46

### Patch Changes

- [#2239](https://github.com/vertz-dev/vertz/pull/2239) [`d029bfc`](https://github.com/vertz-dev/vertz/commit/d029bfcef05d9226f6740b5854827904144dc7ba) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(server): allow customizing or removing the `/api/` route prefix (#2131)

  - `createServer({ apiPrefix: '/v1' })` changes all generated routes from `/api/*` to `/v1/*`
  - API-only apps can use `apiPrefix: ''` to mount routes at the root
  - Full-stack apps require a non-empty prefix (enforced at dev server and Cloudflare handler)
  - Auth cookie paths (`Path=`) automatically follow the resolved prefix
  - Cloudflare handler reads `app.apiPrefix` at runtime when not explicitly configured
  - `basePath` option in `@vertz/cloudflare` renamed to `apiPrefix` for consistency

- Updated dependencies []:
  - @vertz/schema@0.2.46

## 0.2.45

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.45

## 0.2.44

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.44

## 0.2.43

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.43

## 0.2.42

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.42

## 0.2.41

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.41

## 0.2.40

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.40

## 0.2.39

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.39

## 0.2.38

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.38

## 0.2.37

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.37

## 0.2.36

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.36

## 0.2.35

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.35

## 0.2.34

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.34

## 0.2.33

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.33

## 0.2.32

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.32

## 0.2.31

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.31

## 0.2.30

### Patch Changes

- [#1814](https://github.com/vertz-dev/vertz/pull/1814) [`e75e501`](https://github.com/vertz-dev/vertz/commit/e75e5014917608b33fca1668e275948e16a0d773) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `.env` file loading to `createEnv()` via the `load` property. Files listed in `load` are parsed and merged in order, overriding `process.env`. Missing files are silently skipped.

- Updated dependencies []:
  - @vertz/schema@0.2.30

## 0.2.29

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.28

## 0.2.27

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.27

## 0.2.26

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.26

## 0.2.25

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.25

## 0.2.24

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.24

## 0.2.23

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.23

## 0.2.22

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.22

## 0.2.21

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.17

## 0.2.16

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.14

## 0.2.13

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.4

## 0.2.3

### Patch Changes

- [#878](https://github.com/vertz-dev/vertz/pull/878) [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Make `exports` optional in `createModule()` with default `[]`. Previously, omitting `exports` caused a `TypeError: undefined is not an object` crash.

- [#882](https://github.com/vertz-dev/vertz/pull/882) [`b0b6115`](https://github.com/vertz-dev/vertz/commit/b0b6115e0389447ffb951e875b5ce224e4ace51c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove deprecated module system (`createModule`, `createModuleDef`, services, routers) from public API. The entity + action pattern is now the only supported way to define routes. Internal infrastructure (Trie router, middleware runner, schema validation, CORS, error handling) is preserved.

- Updated dependencies []:
  - @vertz/schema@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [[`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084)]:
  - @vertz/schema@0.2.2

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
