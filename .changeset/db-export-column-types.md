---
'@vertz/db': patch
---

fix(db): re-export column/table/relation types referenced by public `d.*` signatures

Consumers writing `export const myTable = d.table(...)` with `declaration: true`
previously hit `TS2742` because the inferred return types referenced internal
modules like `@vertz/db/dist/schema/column`. The following types are now
re-exported from the package entry: `DefaultMeta`, `SerialMeta`, `VectorMeta`
(from `./schema/column`), `ColumnRecord`, `TableOptions` (from `./schema/table`),
`ValidateOneRelationFKs` (from `./schema/model`), `ThroughDef`, `ManyRelationDef`
(from `./schema/relation`).

Closes #2778.
