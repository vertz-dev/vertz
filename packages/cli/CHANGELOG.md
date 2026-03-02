# @vertz/cli

## 0.2.1

### Patch Changes

- [#808](https://github.com/vertz-dev/vertz/pull/808) [`e4c15ac`](https://github.com/vertz-dev/vertz/commit/e4c15ac37ec290bbde34bf27bfeae08287db0808) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove legacy domain codegen (defineDomain, generateTypes, generateClient) and domain-gen CLI command. This dead pre-EDA code is superseded by the domain() grouping primitive.

- [#743](https://github.com/vertz-dev/vertz/pull/743) [`e6dd5dd`](https://github.com/vertz-dev/vertz/commit/e6dd5dd81343e5a0ed6c3b19e2ce6e4c5250a72a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove Vite dependency. Dev server now uses Bun.serve() natively with two modes:
  HMR mode (default) for fast UI iteration with Fast Refresh, SSR mode (`--ssr`) for
  server-side rendering verification with `bun --watch`.
- Updated dependencies [[`9dc2134`](https://github.com/vertz-dev/vertz/commit/9dc21349e18b35d2f254c12160c27ac89acd7f0a), [`023f1fc`](https://github.com/vertz-dev/vertz/commit/023f1fc4c6c8a121edf448bcd11421a3add7b9d2), [`c19527e`](https://github.com/vertz-dev/vertz/commit/c19527e815fde35bdeefad9d00ceafa35eae1b0a), [`8144690`](https://github.com/vertz-dev/vertz/commit/8144690d9ffe24bba8bd9e73cd0c16e91a1e1396), [`e4c15ac`](https://github.com/vertz-dev/vertz/commit/e4c15ac37ec290bbde34bf27bfeae08287db0808), [`e6dd5dd`](https://github.com/vertz-dev/vertz/commit/e6dd5dd81343e5a0ed6c3b19e2ce6e4c5250a72a), [`28399f1`](https://github.com/vertz-dev/vertz/commit/28399f13e43afbb3681421f99ff7c04b412b08cf), [`33d4337`](https://github.com/vertz-dev/vertz/commit/33d4337d3263d534c56b7516e46897cf17247792), [`eb79314`](https://github.com/vertz-dev/vertz/commit/eb7931433ef1b7871df7d2d969a708e0562296ad)]:
  - @vertz/errors@0.1.1
  - @vertz/db@0.2.1
  - @vertz/ui-server@0.2.1
  - @vertz/compiler@0.2.1
  - @vertz/codegen@0.2.1
  - @vertz/tui@0.1.1

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
