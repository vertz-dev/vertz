# @vertz/cli

## 0.2.0

### Minor Changes

- [#331](https://github.com/vertz-dev/vertz/pull/331) [`2cfb2b9`](https://github.com/vertz-dev/vertz/commit/2cfb2b9a39640b5f1f006de3caadd54aebfe6421) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `vertz build` production build command and `vertz create` project scaffold

### Patch Changes

- [#272](https://github.com/vertz-dev/vertz/pull/272) [`6669f6f`](https://github.com/vertz-dev/vertz/commit/6669f6f73733376816f99c1658803475cf91a5bb) Thanks [@vertz-devops](https://github.com/apps/vertz-devops)! - Replace Dagger with Turborepo for CI pipeline

  Migrate from Dagger to Turborepo for improved reliability, caching, and local/CI parity.

  **Breaking changes:**

  - Removed `codegen` property from `VertzConfig` interface in `@vertz/compiler`. This was an unused configuration option that created a circular dependency. Codegen configuration should be passed directly to codegen functions.

  **Key improvements:**

  - Content-hash-based caching for deterministic builds
  - Identical commands run locally and in CI
  - No external engine dependencies (Dagger was causing instability)
  - Fixed circular dependency between @vertz/compiler and @vertz/codegen by removing type re-exports

  **Migration notes:**

  - `bun run ci` now uses Turborepo instead of Dagger
  - `bun run ci:affected` runs only tasks for packages changed since main
  - All existing package scripts remain unchanged

- Updated dependencies [[`db53497`](https://github.com/vertz-dev/vertz/commit/db534979df714d51227a34b4d5b80960e34ec33c), [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8), [`2ec4dd3`](https://github.com/vertz-dev/vertz/commit/2ec4dd3be1ac13f74015e977a699cd59fd7291bc), [`f3b132a`](https://github.com/vertz-dev/vertz/commit/f3b132af4f6ff39e967d4ca3d33f7e6ee12eff84), [`6669f6f`](https://github.com/vertz-dev/vertz/commit/6669f6f73733376816f99c1658803475cf91a5bb), [`6814cd8`](https://github.com/vertz-dev/vertz/commit/6814cd8da818cd0b36deaea132ca589cf6a03a89)]:
  - @vertz/db@0.2.0
  - @vertz/compiler@0.2.0
  - @vertz/codegen@0.2.0
