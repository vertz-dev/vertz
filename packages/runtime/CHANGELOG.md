# @vertz/runtime

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
