---
'@vertz/db': patch
---

feat(db): add atomic update expressions — d.expr(), d.increment(), d.decrement()

Enables atomic column operations in update/upsert without read-modify-write cycles. Supports arbitrary SQL expressions via `d.expr(col => sql`...`)`, with `d.increment(n)` and `d.decrement(n)` as sugar. Works across PostgreSQL and SQLite dialects.
