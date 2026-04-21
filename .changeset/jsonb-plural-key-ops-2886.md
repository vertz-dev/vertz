---
'@vertz/db': patch
---

feat(db): add `hasAllKeys` / `hasAnyKey` JSONB operators

Closes [#2886](https://github.com/vertz-dev/vertz/issues/2886).

Extends the typed JSONB operator surface shipped in #2868 with the plural-key helpers that were deferred:

- `hasAllKeys` emits Postgres `col ?& $N::text[]` — row matches when the JSONB object contains every listed top-level key.
- `hasAnyKey` emits Postgres `col ?| $N::text[]` — row matches when the JSONB object contains at least one listed top-level key.

Operand type is `readonly JsonbKeyOf<T>[]`, so the key array is constrained to `keyof T & string` at compile time. Primitive and array JSONB payloads collapse the operand to `readonly never[]`, matching the existing `hasKey` behavior.

Both operators are dialect-gated to Postgres through the existing keyed-never brand (`JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS`). On SQLite the diagnostic name itself carries the recovery guidance; the runtime throws a descriptive error that mirrors `hasKey`.
