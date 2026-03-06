# @vertz/cli

## 0.2.12

### Patch Changes

- Updated dependencies [[`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9)]:
  - @vertz/ui-server@0.2.12
  - @vertz/codegen@0.2.12
  - @vertz/compiler@0.2.12
  - @vertz/create-vertz-app@0.2.12
  - @vertz/db@0.2.12
  - @vertz/errors@0.2.12
  - @vertz/tui@0.2.12

## 0.2.11

### Patch Changes

- [#918](https://github.com/vertz-dev/vertz/pull/918) [`1fc9e33`](https://github.com/vertz-dev/vertz/commit/1fc9e33a9aa5283898c8974084f519a3caacbabb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove index.html from the framework

  UI apps no longer require an `index.html` file in the project root. The production build now generates the HTML shell programmatically with the correct asset references, eliminating the need for:

  - Manual `index.html` maintenance
  - Fast Refresh runtime stripping during build
  - Dev script tag replacement with hashed entries
  - `./public/` path rewriting

  The `createIndexHtmlStasher` dev server mechanism (which renamed `index.html` during development to prevent Bun from auto-serving it) has been removed entirely.

  `UIBuildConfig` gains an optional `title` field (default: `'Vertz App'`) to set the HTML page title.

- Updated dependencies [[`b2878cf`](https://github.com/vertz-dev/vertz/commit/b2878cfe2acb3d1155ca5e0da13b2ee91c9aea9a), [`5ed4c1a`](https://github.com/vertz-dev/vertz/commit/5ed4c1a4c5c9ea946e97b1636011251c6287eaf4), [`1fc9e33`](https://github.com/vertz-dev/vertz/commit/1fc9e33a9aa5283898c8974084f519a3caacbabb)]:
  - @vertz/ui-server@0.2.11
  - @vertz/codegen@0.2.11
  - @vertz/compiler@0.2.11
  - @vertz/create-vertz-app@0.2.11
  - @vertz/db@0.2.11
  - @vertz/errors@0.2.11
  - @vertz/tui@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies [[`2a2cadc`](https://github.com/vertz-dev/vertz/commit/2a2cadcaf6dee9eee9c4f869bb387f7bff67a123)]:
  - @vertz/create-vertz-app@0.2.8
  - @vertz/codegen@0.2.8
  - @vertz/compiler@0.2.8
  - @vertz/db@0.2.8
  - @vertz/errors@0.2.8
  - @vertz/tui@0.2.8
  - @vertz/ui-server@0.2.8

## 0.2.7

### Patch Changes

- chore: republish as 0.2.7 (0.2.6 stuck in npm ghost state)

- Updated dependencies []:
  - @vertz/codegen@0.2.7
  - @vertz/compiler@0.2.7
  - @vertz/create-vertz-app@0.2.7
  - @vertz/db@0.2.7
  - @vertz/errors@0.2.7
  - @vertz/tui@0.2.7
  - @vertz/ui-server@0.2.7

## 0.2.6

### Patch Changes

- [#899](https://github.com/vertz-dev/vertz/pull/899) [`ecbc594`](https://github.com/vertz-dev/vertz/commit/ecbc594830c8fcb2dea2e7b66d8b04aa2d58a47d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(cli): add esbuild dependency, use bun shebang, remove dead ink/react deps

  - Added missing `esbuild` to dependencies (externalized in bundle but not declared)
  - Changed CLI shebang from `#!/usr/bin/env node` to `#!/usr/bin/env bun` so the framework's Bun-dependent features (bun:sqlite, Bun.serve) work correctly
  - Removed unused ink-based components (Banner, DiagnosticDisplay, DiagnosticSummary) and their ink/react dependencies

- Updated dependencies []:
  - @vertz/codegen@0.2.6
  - @vertz/compiler@0.2.6
  - @vertz/create-vertz-app@0.2.6
  - @vertz/db@0.2.6
  - @vertz/errors@0.2.6
  - @vertz/tui@0.2.6
  - @vertz/ui-server@0.2.6

## 0.2.5

### Patch Changes

- [#897](https://github.com/vertz-dev/vertz/pull/897) [`d72c099`](https://github.com/vertz-dev/vertz/commit/d72c0997f38c723a4b8c077a91b09f15eaea931f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(release): use workspace:^ protocol and unify fixed version group

  Two changes to prevent broken npm installs caused by version gaps:

  1. Changed all `workspace:*` to `workspace:^` so published packages use
     caret ranges (e.g., `"^0.2.3"`) instead of exact versions (`"0.2.3"`).
     This makes installs resilient when an exact patch version is missing.

  2. Expanded the changeset `fixed` group to include all 20 publishable
     packages. Every release now bumps all packages to the same version,
     eliminating version gaps between sibling dependencies.

- Updated dependencies []:
  - @vertz/codegen@0.2.5
  - @vertz/compiler@0.2.5
  - @vertz/create-vertz-app@0.2.5
  - @vertz/db@0.2.5
  - @vertz/errors@0.2.5
  - @vertz/tui@0.2.5
  - @vertz/ui-server@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies [[`a986d07`](https://github.com/vertz-dev/vertz/commit/a986d0788ca0210dfa4f624153d4bda72257a78c)]:
  - @vertz/ui-server@0.2.4
  - @vertz/compiler@0.2.4
  - @vertz/db@0.2.4
  - @vertz/codegen@0.2.4

## 0.2.3

### Patch Changes

- [#882](https://github.com/vertz-dev/vertz/pull/882) [`b0b6115`](https://github.com/vertz-dev/vertz/commit/b0b6115e0389447ffb951e875b5ce224e4ace51c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove deprecated module system (`createModule`, `createModuleDef`, services, routers) from public API. The entity + action pattern is now the only supported way to define routes. Internal infrastructure (Trie router, middleware runner, schema validation, CORS, error handling) is preserved.

- Updated dependencies [[`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`2e86c55`](https://github.com/vertz-dev/vertz/commit/2e86c55e3c04f3c534bf0dc124d18dcdc5d9eefc), [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b)]:
  - @vertz/create-vertz-app@0.2.2
  - @vertz/ui-server@0.2.3
  - @vertz/codegen@0.2.3
  - @vertz/compiler@0.2.3
  - @vertz/tui@0.2.3
  - @vertz/db@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies []:
  - @vertz/tui@0.2.2
  - @vertz/ui-server@0.2.2
  - @vertz/db@0.2.2
  - @vertz/compiler@0.2.2
  - @vertz/codegen@0.2.2

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
