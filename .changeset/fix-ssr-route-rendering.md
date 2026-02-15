---
'@vertz/ui-compiler': patch
---

fix(ui-compiler): SSR routing — correct URL normalization and middleware order

- Register SSR middleware BEFORE Vite internals (pre-hook) to prevent SPA fallback from rewriting URLs
- Normalize URLs in SSR entry: strip /index.html suffix
- Use surgical module invalidation (only SSR entry module, not entire module graph)
