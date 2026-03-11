---
"@vertz/db": patch
"@vertz/server": patch
---

Add transaction support to DatabaseClient with full model delegates

- `db.transaction(async (tx) => { ... })` wraps multiple operations atomically
- `TransactionClient` provides the same model delegates as `DatabaseClient` (`tx.users.create()`, `tx.tasks.list()`, etc.)
- PostgreSQL uses `sql.begin()` for connection-scoped transactions
- SQLite uses `BEGIN`/`COMMIT`/`ROLLBACK` via single-connection queryFn
- Auth plan store operations (`assignPlan`, `removePlan`, `updateOverrides`) now use transactions for atomicity
- Failure injection tests verify rollback behavior
