---
'@vertz/cloudflare': patch
---

Add `beforeRender` middleware hook to `createHandler()` config. The hook runs before SSR rendering on non-API routes and can return a `Response` to short-circuit (e.g., redirect to `/login`). Returns `undefined`/`void` to proceed normally.
