---
'@vertz/db': patch
'@vertz/server': patch
---

fix(db): handle null direct values in where clause as IS NULL

Previously, passing `null` as a direct value in a where clause (e.g., `{ revokedAt: null }`)
generated `column = $N` with a null parameter, which in SQL always evaluates to NULL (not TRUE),
silently breaking the entire WHERE clause. Now correctly generates `column IS NULL`.

Also reverts DbSessionStore raw SQL workarounds back to ORM-based `get()` calls.
