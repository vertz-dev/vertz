---
"@vertz/db": patch
---

fix(db): address 5 postgres driver issues

- #203: Add 5s timeout to `isHealthy()` via `Promise.race` to prevent hangs
- #204: Document timestamp coercion false-positive risk in JSDoc
- #205: Route `db.query()` through `executeQuery` for consistent error mapping
- #206: Set default `idle_timeout` to 30s for connection pool
- #207: Improve postgres integration test isolation with per-test setup/teardown
