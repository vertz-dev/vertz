---
'@vertz/db': patch
---

Entity-Driven Architecture (EDA) v0.1.0 — schema and model layer.

- Added `.readOnly()` and `.autoUpdate()` column annotations with `isReadOnly`/`isAutoUpdate` metadata
- Added `$response`, `$create_input`, `$update_input` phantom types on `TableDef`
- Added `d.model(table, relations?)` returning `ModelDef` with derived schemas
- Each schema has a `parse()` method compatible with `SchemaLike` duck type
- Runtime CRUD strips readOnly fields and auto-sets autoUpdate timestamps
