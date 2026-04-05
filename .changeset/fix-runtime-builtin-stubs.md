---
'@vertz/runtime': patch
---

fix(runtime): stub node:/bun: built-ins in dev module server

The dev module server now returns empty ES module stubs for `node:*` and `bun:*` specifiers instead of attempting to auto-install them from npm. This eliminates the "Auto-install failed" error overlay noise when server-only packages like `@vertz/db` are transitively pulled into the client bundle.
