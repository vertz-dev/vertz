---
"@vertz/ui-server": minor
"@vertz/ui-compiler": minor
"@vertz/ui": minor
---

Zero-config SSR: `vertz({ ssr: true })` makes `vite dev` serve SSR'd HTML automatically.

**@vertz/ui-server:**
- Add `@vertz/ui-server/dom-shim` subpath with SSRElement, installDomShim, toVNode
- Add `@vertz/ui-server/jsx-runtime` subpath for server-side JSX rendering

**@vertz/ui-compiler:**
- Add `ssr: boolean | SSROptions` to vertzPlugin options
- Add `configureServer` hook that intercepts HTML requests and renders SSR'd HTML
- Auto-generate virtual SSR entry module (`\0vertz:ssr-entry`)
- Handle JSX runtime alias swap for SSR builds

**@vertz/ui:**
- Add `@vertz/ui/jsx-runtime` and `@vertz/ui/jsx-dev-runtime` subpath exports
- Make router SSR-compatible (auto-detect `__SSR_URL__`, skip popstate in SSR)
