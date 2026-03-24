---
'@vertz/server': patch
---

Fix resolvePrimaryKey() in tenant-chain to throw for composite primary keys instead of silently picking the first PK column, consistent with the entity CRUD guard.
