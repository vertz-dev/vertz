---
'@vertz/ui-server': patch
---

feat(ui-server): production SSR handler with nav pre-fetch

Adds `createSSRHandler()` — a web-standard `(Request) => Response` handler
for production SSR. Handles initial page loads (two-pass render with query
pre-fetching) and client-side navigation pre-fetch via SSE (`X-Vertz-Nav`
header). Works on any runtime: Cloudflare Workers, Bun, Node, Deno.

Also exports `ssrRenderToString()` and `ssrDiscoverQueries()` for custom
server setups.
