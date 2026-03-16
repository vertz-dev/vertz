---
'@vertz/db': patch
---

fix(db): externalize better-sqlite3 and improve SQLite fallback error messages

- Externalize `better-sqlite3` from the bundle to prevent hardcoded build-machine paths in the dist (fixes Electrobun and other bundled runtimes)
- Move `better-sqlite3` to optional `peerDependencies` (same pattern as `postgres`)
- Extract `resolveLocalSqliteDatabase()` with proper error handling — when both `bun:sqlite` and `better-sqlite3` fail, the error now includes both failure reasons and actionable guidance
