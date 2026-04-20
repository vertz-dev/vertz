---
'@vertz/db': patch
---

feat(db): run `d.jsonb<T>({ validator })` on write paths across Postgres and SQLite/D1

Closes [#2867](https://github.com/vertz-dev/vertz/issues/2867) — follow-up to the read-side wiring merged in [#2870](https://github.com/vertz-dev/vertz/pull/2870).

A validator attached to a `d.jsonb<T>()` column (via `{ validator }` or a schema-like `.parse()` object) now runs on every write value — `create`, `createMany`, `createManyAndReturn`, `update`, `updateMany`, and both branches of `upsert`. Invalid payloads surface as `{ ok: false, error: { code: 'JSONB_VALIDATION_ERROR', table, column, value } }` **without reaching the driver**. The validator's return value (not the caller's input) is what gets persisted, so Zod `.default()` / `.transform()` outputs round-trip cleanly.

Caller-visible break: the `WriteError` union gains `DbJsonbValidationError`. If you discriminate on `err.code` with a `never` default (`satisfies never` on the default arm, or an exhaustive switch without a fallthrough), you'll need to add a `'JSONB_VALIDATION_ERROR'` arm. Non-exhaustive `if (err.code === '...')` chains keep compiling.

Implementation details:
- `runJsonbValidators` helper in `crud.ts` runs before `buildInsert` / `buildUpdate` on every write code path. A per-table `WeakMap<TableDef, boolean>` memoises the "has any validator" check so `createMany` on a validator-free table pays one WeakMap hit per row, not a column walk per row.
- The helper skips `null` / `undefined` / `DbExpr` values. It intentionally does **not** skip the literal string `'now'` by value — autoUpdate timestamp `'now'` sentinels are skipped structurally because timestamp columns have no validator, so a jsonb column legitimately carrying `'now'` still runs through validation.
- `toWriteError` maps `JsonbValidationError` above the generic `'code' in error` path (necessary because `JsonbValidationError extends DbError` which exposes `code`, and the generic branch would otherwise collapse it to `QUERY_ERROR`).
- On SQLite specifically, `INSERT ... RETURNING` rows still pass through the read-side validator. If your validator is non-idempotent (produces a shape it would itself reject), a successful write can still surface `JSONB_VALIDATION_ERROR` on the write Result. Keep validators idempotent — the tip is in the mint-docs "JSONB across dialects" section.
