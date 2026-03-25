---
'@vertz/db': patch
---

Fixed Postgres introspection to include explicitly-created unique indexes in the snapshot. Previously, `NOT ix.indisunique` filtered out all unique indexes. Now only constraint-backed unique indexes are excluded (they are already represented as `column.unique = true`).
