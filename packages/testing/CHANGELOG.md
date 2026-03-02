# @vertz/testing

## 0.2.1

### Patch Changes

- Updated dependencies [[`463e6f0`](https://github.com/vertz-dev/vertz/commit/463e6f0ea47041a953000471ef1f35708bd4b774), [`9dc2134`](https://github.com/vertz-dev/vertz/commit/9dc21349e18b35d2f254c12160c27ac89acd7f0a), [`023f1fc`](https://github.com/vertz-dev/vertz/commit/023f1fc4c6c8a121edf448bcd11421a3add7b9d2), [`023f1fc`](https://github.com/vertz-dev/vertz/commit/023f1fc4c6c8a121edf448bcd11421a3add7b9d2), [`869699d`](https://github.com/vertz-dev/vertz/commit/869699d52d9fa685996acb418b8f8fb1bb554f6f)]:
  - @vertz/server@0.2.1
  - @vertz/core@0.2.1

## 0.2.0

### Minor Changes

- [#322](https://github.com/vertz-dev/vertz/pull/322) [`4f780bb`](https://github.com/vertz-dev/vertz/commit/4f780bba6bee7a493c9a1e0b8463ea2126a7285b) Thanks [@vertz-tech-lead](https://github.com/apps/vertz-tech-lead)! - Add schema-validated options and env to ServiceDef

- [#323](https://github.com/vertz-dev/vertz/pull/323) [`6814cd8`](https://github.com/vertz-dev/vertz/commit/6814cd8da818cd0b36deaea132ca589cf6a03a89) Thanks [@vertz-tech-lead](https://github.com/apps/vertz-tech-lead)! - Add typed routes, params, and response types in test app. New emit-routes generator in codegen.

### Patch Changes

- [#290](https://github.com/vertz-dev/vertz/pull/290) [`a207936`](https://github.com/vertz-dev/vertz/commit/a2079362c54a8b61ea2368039abcb08681448380) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Rename `@vertz/core` → `@vertz/server` and `createApp()` → `createServer()`

  - Added `@vertz/server` package that re-exports all public API from `@vertz/core`
  - Added `createServer` as the preferred factory function (alias for `createApp`)
  - Added `vertz.server` namespace alias for `vertz.app`
  - Deprecated `createApp()` with console warning pointing to `createServer()`
  - Updated all internal imports to use `@vertz/server`
  - Compiler now recognizes both `vertz.app()` and `vertz.server()` calls

- Updated dependencies [[`a207936`](https://github.com/vertz-dev/vertz/commit/a2079362c54a8b61ea2368039abcb08681448380), [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8), [`c8efe6b`](https://github.com/vertz-dev/vertz/commit/c8efe6b4aef9ea9b9b4e3de414297ce2f829f7bb), [`3407afd`](https://github.com/vertz-dev/vertz/commit/3407afdf543481cd559e550454144d16e6a26e06), [`4f780bb`](https://github.com/vertz-dev/vertz/commit/4f780bba6bee7a493c9a1e0b8463ea2126a7285b), [`c1e38d0`](https://github.com/vertz-dev/vertz/commit/c1e38d010da1bea95ed9246968fabc22e300a6e9)]:
  - @vertz/core@0.2.0
  - @vertz/server@0.2.0
