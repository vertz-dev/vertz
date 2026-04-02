# @vertz/runtime

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
