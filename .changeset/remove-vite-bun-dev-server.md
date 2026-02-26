---
'@vertz/ui-server': patch
'@vertz/ui-compiler': patch
'@vertz/cli': patch
---

Remove Vite dependency. Dev server now uses Bun.serve() natively with two modes:
HMR mode (default) for fast UI iteration with Fast Refresh, SSR mode (`--ssr`) for
server-side rendering verification with `bun --watch`.
