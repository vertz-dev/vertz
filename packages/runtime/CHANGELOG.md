# @vertz/runtime

## 0.2.63

### Patch Changes

- [#2646](https://github.com/vertz-dev/vertz/pull/2646) [`5e770e0`](https://github.com/vertz-dev/vertz/commit/5e770e0ddef46960ec9cf2c20027d16527a23b39) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(pm): install optional platform-specific dependencies from stale v1 lockfiles

  Packages using the `optionalDependencies` pattern for platform-specific native binaries
  (e.g., lefthook, @typescript/native-preview, oxfmt) were not getting their binaries installed
  because v1 lockfiles didn't record optional dependencies. Added lockfile versioning (v1/v2)
  and a migration path that discovers missing optional deps from the registry for direct
  dependencies when upgrading from a v1 lockfile.

## 0.2.62

### Patch Changes

- [#2639](https://github.com/vertz-dev/vertz/pull/2639) [`5e9a614`](https://github.com/vertz-dev/vertz/commit/5e9a614833d967e8cdce4a37c47d387842e04ad3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Expand `node:perf_hooks` CJS stub with `PerformanceEntry`, `PerformanceObserver`, `PerformanceObserverEntryList`, and `monitorEventLoopDelay` (required by happy-dom v20.8.3). Add `import.meta.dirname` / `import.meta.dir` polyfill that derives the directory path from `import.meta.url` since deno_core only sets the latter.

## 0.2.61

### Patch Changes

- [#2594](https://github.com/vertz-dev/vertz/pull/2594) [`b002f4f`](https://github.com/vertz-dev/vertz/commit/b002f4f15ea29f8cd79b23d112e04eb1edb64807) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix CJS relative path resolution to check exports field before main, and add array fallback support to both CJS and ESM exports resolvers

- [#2588](https://github.com/vertz-dev/vertz/pull/2588) [`129c7d2`](https://github.com/vertz-dev/vertz/commit/129c7d2705dfb71fb04ed293dc0823511a1a81cd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix CJS require() to resolve package.json exports field and fix execSync to use shell execution instead of splitting on spaces

- [#2637](https://github.com/vertz-dev/vertz/pull/2637) [`d6c978e`](https://github.com/vertz-dev/vertz/commit/d6c978ea1f6f9879357d9f5d480f270a37bbcef4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix cli.sh to walk full PATH when resolving native binary, so nested vtz invocations in CI find the binary even when self-referencing symlinks shadow it

- [#2568](https://github.com/vertz-dev/vertz/pull/2568) [`69d82ed`](https://github.com/vertz-dev/vertz/commit/69d82ed1c525cba840c45d42a0e01230ccb00599) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix docs test failures: add CJS-to-ESM interop, readdir withFileTypes/recursive, cpSync, workspace source fallback, and pkg_type_cache for module loader

- [#2597](https://github.com/vertz-dev/vertz/pull/2597) [`6aff68e`](https://github.com/vertz-dev/vertz/commit/6aff68efb4b06aeceaccd9adec441b95b868a858) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add path traversal validation to both Rust deps resolver and JS CJS resolver to prevent malicious package.json exports from resolving files outside the package directory

- [#2628](https://github.com/vertz-dev/vertz/pull/2628) [`5d06b58`](https://github.com/vertz-dev/vertz/commit/5d06b58201a3f51bac591c78532727cd694e0483) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix runtime detection tests to support vtz as a valid runtime, fix path.dirname("/") returning "." instead of "/" in the vtz runtime, and fix version-check tests to explicitly chmod shell scripts

- [#2603](https://github.com/vertz-dev/vertz/pull/2603) [`ec5627f`](https://github.com/vertz-dev/vertz/commit/ec5627f557a4696a9b6e6dd939c06be7a8adf603) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix scoping bug where object properties inside nested parentheses were incorrectly stripped as TypeScript type annotations, causing `await expect(fn({key: Value})).rejects.toThrow()` to fail with "key is not defined"

- [#2614](https://github.com/vertz-dev/vertz/pull/2614) [`0b15e3a`](https://github.com/vertz-dev/vertz/commit/0b15e3a95c4ebb4d2a3e7182c0c1cdaa192095c8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `vm` module to ESM resolution layer and add `isContext` to both CJS and ESM implementations, fixing happy-dom test failures under `vtz test`

## 0.2.60

### Patch Changes

- [#2526](https://github.com/vertz-dev/vertz/pull/2526) [`92de65b`](https://github.com/vertz-dev/vertz/commit/92de65bb43fd34ffd9f4e8b979052b5475bcf73e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): support file:// URLs in fetch for PGlite WASM loading

- [#2527](https://github.com/vertz-dev/vertz/pull/2527) [`985d282`](https://github.com/vertz-dev/vertz/commit/985d2823c2f7f9e6a24497661d75e39f8a0f7764) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(desktop): shell.spawn now kills entire process group on kill(), preventing orphaned subprocesses

## 0.2.59

## 0.2.58

## 0.2.57

## 0.2.56

## 0.2.55

### Patch Changes

- [#2441](https://github.com/vertz-dev/vertz/pull/2441) [`e2126aa`](https://github.com/vertz-dev/vertz/commit/e2126aa0dca54dbb11c917c030895417ba6285da) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(runtime): expose `process.cwd()` globally so `@vertz/server` auth module works in the vtz test runtime

- [#2434](https://github.com/vertz-dev/vertz/pull/2434) [`a4957d6`](https://github.com/vertz-dev/vertz/commit/a4957d6160ce9ba181cdc54239a947106bc2c67f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(install): remove macOS quarantine xattr and ad-hoc sign binaries in CI to prevent Gatekeeper from killing the vtz binary after curl install

## 0.2.54

## 0.2.53

### Patch Changes

- [#2420](https://github.com/vertz-dev/vertz/pull/2420) [`83be8f7`](https://github.com/vertz-dev/vertz/commit/83be8f7501c7487c4896855c7becfb6d5aa4fa7e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove Bun dependency from vtzx/vtz fallback paths. When the native binary is unavailable, the CLI now resolves commands from node_modules/.bin directly instead of delegating to bunx/bun.

## 0.2.52

## 0.2.51

## 0.2.50

### Patch Changes

- [#2387](https://github.com/vertz-dev/vertz/pull/2387) [`00c4d91`](https://github.com/vertz-dev/vertz/commit/00c4d91c8a5c3760ea1cd8e858e621f602a09999) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Ship Node.js CLI shims (`cli.js`, `cli-exec.js`) so npm creates working `node_modules/.bin/{vtz,vertz,vtzx}` entries. Previously the `bin` field pointed to `./vtz` which was not included in the published tarball.

## 0.2.49

## 0.2.48

### Patch Changes

- [#2318](https://github.com/vertz-dev/vertz/pull/2318) [`13cebc3`](https://github.com/vertz-dev/vertz/commit/13cebc335bf9d278419f550aaa01360a9597306f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(runtime): stub node:/bun: built-ins in dev module server

  The dev module server now returns empty ES module stubs for `node:*` and `bun:*` specifiers instead of attempting to auto-install them from npm. This eliminates the "Auto-install failed" error overlay noise when server-only packages like `@vertz/db` are transitively pulled into the client bundle.

## 0.2.47

## 0.2.46

## 0.0.3

### Patch Changes

- [#55](https://github.com/vertz-dev/vtz/pull/55) [`2e81192`](https://github.com/vertz-dev/vtz/commit/2e81192b7511849ec6a38ffbd6e95b93d6e59c38) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - ### New Features
  - **Plugin API** — `FrameworkPlugin` trait with React plugin (TSX compilation, HMR, React Refresh)
  - **CSS file imports** — `import './styles.css'` injects styles in dev server
  - **PostCSS pipeline** — CSS imports processed through PostCSS when configured
  - **Asset imports** — `import logo from './logo.png'` resolves to URL strings
  - **`import.meta.env`** — `.env` file loading with `VERTZ_` prefix filtering
  - **tsconfig path aliases** — `paths` from `tsconfig.json` resolved in import rewriter
  - **Reverse proxy** — subdomain routing, WebSocket proxying, TLS/HTTPS with auto-generated certs, `/etc/hosts` sync, loop detection

## 0.0.2

### Patch Changes

- [`a75a484`](https://github.com/vertz-dev/vtz/commit/a75a4842f04ff4e250d3cbe24a58ffc184d30008) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Initial release of the Vertz runtime as a standalone package. Includes V8 dev server, test runner, package manager, and native compiler bindings. Binary renamed from `vertz-runtime` to `vtz` with `vertz` as an alias.
