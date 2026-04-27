---
'@vertz/ui': patch
'@vertz/runtime': patch
---

fix(ui,runtime): return correct HTTP status for SSR routes

Closes [#3001](https://github.com/vertz-dev/vertz/issues/3001).

The dev server returned `404 GET /` for the task-manager example even though SSR rendered the page successfully. Two related bugs collapsed three states into two:

- `matchForSSR()` only set `ctx.matchedRoutePatterns` when a route matched, leaving it `undefined` for an unmatched URL — indistinguishable from "no router was rendered". Now it explicitly records `[]` for "router rendered, no match".
- The vtz JS↔Rust bridge in `persistent_isolate.rs` serialized `result.matchedRoutePatterns ?? null` instead of `|| []`, preserving the `undefined`-vs-empty distinction so the Rust handler can return `200` for routerless apps and `404` only when a router actually failed to match.

Status mapping is now uniform across `@vertz/ui-server`'s handlers and the `vtz dev` server: missing/`null` → 200, `[]` → 404, `[…]` → 200.
