# @vertz/compiler

## 0.2.1

### Patch Changes

- [`28399f1`](https://github.com/vertz-dev/vertz/commit/28399f13e43afbb3681421f99ff7c04b412b08cf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - EntityAnalyzer now extracts structured field info (name, type, optionality) from resolved schema types. EntitySchemaGenerator produces @vertz/schema validation code from resolved entity field info. EntitySdkGenerator embeds .meta with bodySchema on create SDK methods.

## 0.2.0

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
