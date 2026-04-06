---
'@vertz/db': patch
---

Fix autoApply generating invalid SQLite DDL for composite primary keys. Now emits a table-level `PRIMARY KEY(col1, col2)` constraint instead of per-column `PRIMARY KEY` on each column.
