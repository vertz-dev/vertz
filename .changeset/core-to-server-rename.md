---
"@vertz/core": minor
"@vertz/server": minor
"@vertz/testing": patch
"@vertz/integration-tests": patch
---

Rename `@vertz/core` → `@vertz/server` and `createApp()` → `createServer()`

- Added `@vertz/server` package that re-exports all public API from `@vertz/core`
- Added `createServer` as the preferred factory function (alias for `createApp`)
- Added `vertz.server` namespace alias for `vertz.app`
- Deprecated `createApp()` with console warning pointing to `createServer()`
- Updated all internal imports to use `@vertz/server`
- Compiler now recognizes both `vertz.app()` and `vertz.server()` calls
