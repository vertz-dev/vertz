# @vertz/create-vertz-app

## 0.2.13

### Patch Changes

- [#944](https://github.com/vertz-dev/vertz/pull/944) [`cbda042`](https://github.com/vertz-dev/vertz/commit/cbda042603f9137cea2f032b7c842edc4c341dd7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `vertz start` command to serve production builds. Supports API-only, UI-only, and full-stack modes with SSR, static file serving, CSS inlining, and graceful shutdown.

## 0.2.12

## 0.2.11

## 0.2.8

### Patch Changes

- [#903](https://github.com/vertz-dev/vertz/pull/903) [`2a2cadc`](https://github.com/vertz-dev/vertz/commit/2a2cadcaf6dee9eee9c4f869bb387f7bff67a123) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add bunfig.toml and bun-plugin-shim.ts to scaffolded projects. Without these, Bun's dev server client bundler skips the Vertz compiler plugin, causing SSR content to vanish after hydration.

## 0.2.7

## 0.2.6

## 0.2.5

## 0.2.2

### Patch Changes

- [#878](https://github.com/vertz-dev/vertz/pull/878) [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix bin entry: change shebang to `#!/usr/bin/env bun` and import from `dist/` instead of `src/` so the published CLI actually runs.
