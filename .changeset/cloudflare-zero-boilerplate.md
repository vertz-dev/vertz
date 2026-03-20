---
'@vertz/cloudflare': patch
---

Improve Cloudflare adapter DX with zero-boilerplate defaults:
- `basePath` is now optional, defaults to `'/api'` (matches `createServer`'s `apiPrefix` default)
- `ssr` is now required — enforces SSR-first at the type level
- `securityHeaders` now defaults to `true` (security by default)
- Auto-detect `requestHandler` on ServerInstance for auth-aware routing (auth routes no longer require manual wiring)
