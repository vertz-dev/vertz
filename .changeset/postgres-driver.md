---
'@vertz/db': patch
---

Wire up real PostgreSQL driver using porsager/postgres.

- `createDb({ url })` now creates a real postgres connection pool when `_queryFn` is not provided
- Connection pool config from `PoolConfig` (max, idleTimeout, connectionTimeout) is passed through
- `close()` properly shuts down the connection pool
- `isHealthy()` performs a real `SELECT 1` health check
- Timestamps from PostgreSQL are properly converted to `Date` objects
- postgres.js errors are mapped to the existing DbError hierarchy (UniqueConstraintError, ForeignKeyError, etc.)
- The `_queryFn` escape hatch still works for PGlite-based testing
- Fix: relation loader correctly handles multiple includes with the same value (e.g., `{ author: true, comments: true }`)
