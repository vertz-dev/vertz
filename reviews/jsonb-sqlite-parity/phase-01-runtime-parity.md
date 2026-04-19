# Phase A: Runtime Parity — Adversarial Review

- **Author:** claude (TDD loop)
- **Reviewer:** claude (adversarial pass)
- **Commits:** 0b589abfa..1d53dc399
- **Date:** 2026-04-19

## CI Status
- [x] Quality gates green (test + typecheck + lint) at 1d53dc399 — 1683 tests passing

## Findings

### BLOCKERS

**B1. The design's central promise is NOT met: `JsonbParseError` / `JsonbValidationError` do NOT surface through the Result layer with their identity preserved.**

The Phase A plan explicitly states "new `JsonbParseError` / `JsonbValidationError` surface through the existing Result machinery." This is false. I proved it with a direct test against `executeQuery` and `toReadError` (probe deleted):

```
✗ JsonbParseError is PRESERVED through executeQuery
  Expected UnknownDbError: Failed to parse jsonb value at install.meta
    to be instance of JsonbParseError
✗ toReadError preserves JsonbParseError code
  Expected "QUERY_ERROR" to be "JSONB_PARSE_ERROR"
```

Two layers conspire to destroy the typed error:

1. `executeQuery` (`packages/db/src/query/executor.ts:36-49`) calls `isPgError(error)` which only checks for a `code` string + `message` string. Every `DbError` subclass passes that predicate — including `JsonbParseError`. It then invokes `parsePgError` which switches on well-known PG SQLSTATE codes; `'JSONB_PARSE_ERROR'` / `'JSONB_VALIDATION_ERROR'` hit the `default` branch and are repackaged into a fresh `UnknownDbError`. The original instance is gone.
2. `toReadError` (`packages/db/src/errors.ts:90-152`) then maps the resulting `UnknownDbError` to `{ code: 'QUERY_ERROR', cause: ... }` because the code neither equals `'NotFound'` nor starts with `'08'`.

Net effect: a user writing `if (result.error.code === 'JSONB_PARSE_ERROR') …` will never hit the branch; the discriminated union surface is `{ code: 'QUERY_ERROR' }` with the typed class buried under `cause`. Worse, the `table` / `column` enrichment added in commit 2 is pushed into a generic field on `UnknownDbError`, not the public `ReadError` shape. Phase A is functionally incomplete.

**Fix options:**
- Add `JsonbParseError` / `JsonbValidationError` as explicit `ReadError` variants (`DbJsonbParseError`, `DbJsonbValidationError`) and short-circuit both `executeQuery` and `toReadError` to skip pg-parser and emit the typed variant.
- Or: have `executeQuery` early-return when `error instanceof DbError`, bypassing `parsePgError` entirely — covers all existing typed errors too (`UniqueConstraintError` etc. survive only coincidentally today because their `code` is `'UNIQUE_VIOLATION'`, which also falls through `parsePgError`'s default).

Either way, **a test at the `db.<model>.list()` level must assert on the surfaced `result.error`**, not just driver-level throws. The current `jsonb-parity.test.ts` tests the `driver.query()` throw path directly and never hits the `ModelDelegate` Result wrapping — which is exactly where the bug hides.

---

### SHOULD-FIX

**S1. `d.jsonb()` JSDoc overstates the Result contract.** `d.ts:77-79` says "surfaces `JsonbValidationError` through the existing Result machinery on failure." Given B1, this sentence is misleading. Either fix the plumbing (preferred) or scope the JSDoc to what actually happens today. Docs went out alongside broken plumbing is the worst of both worlds.

**S2. Validator skipped on `undefined`, but SQLite reads should not produce `undefined`.** `sqlite-driver.ts:129` guards `next !== null && next !== undefined`. `undefined` is unreachable for a SQLite column value (D1 / better-sqlite3 yield `null`, not `undefined`). The guard is harmless but the test "skips validator when value is null" only covers the `null` branch — the `undefined` half of the condition is dead code / uncovered. Either drop the `undefined` check or add a test that drives it (e.g. a row where a column is legitimately missing from the result object, though this is also synthetic).

**S3. End-to-end parity tests for `JsonbParseError` and `JsonbValidationError` use the D1 mock, not `createDb(...).list()`.** `jsonb-parity.test.ts:79-98` and `101-163` go straight to `createSqliteDriver(mock.d1, schema).query(...)`. That never exercises the CRUD Result layer, so it can't catch B1. Add a test that builds a model with corrupt JSONB (e.g. via a secondary `createDb` without jsonb typing, write raw TEXT, then re-open with the typed model) and asserts on `result.ok === false` / `result.error.code === 'JSONB_PARSE_ERROR'`.

**S4. No tests added for the `createLocalSqliteDriver` jsonb paths.** The commit message claims "used by both the D1 driver and the local driver". Shared `convertRowWithSchema` means the happy path is covered via the integration tests in `jsonb-parity.test.ts`, but the enriched-error path and the validator path run only against the D1 mock. If a local-driver-specific row shape ever diverges (e.g. better-sqlite3 returning `Buffer` for TEXT in some config) we'd miss it. A mirror of the three driver tests against a local `:memory:` DB with raw INSERT would be cheap.

**S5. `buildTableSchema` emits `string | ColumnSchemaEntry` — assert invariant.** For columns with no validator but sqlType `'jsonb'`, the string shortcut is fine. But if a future contributor adds another piece of per-column read metadata (e.g. `castMode`), the string shortcut becomes a foot-gun. Low cost: add a brief comment on `TableSchemaRegistry` saying "string form = sqlType only, no extra metadata" (the JSDoc on `ColumnSchemaEntry` says this, but the shortcut is the default path).

---

### NITS

**N1. `JsonbParseError.cause` is assigned via `(this as { cause?: unknown }).cause = ...`.** Works, but the ES2022 `Error` cause option is native. `super(message, { cause })` would be cleaner and avoids the read-modify-write on `this`. Same pattern in `JsonbValidationError`.

**N2. `convertRowWithSchema` catches `JsonbParseError`, re-throws a new one for enrichment.** The re-throw reads `(err as { cause?: unknown }).cause`. If the original `JsonbParseError` was already enriched upstream (hypothetical, but possible if `fromSqliteValue` gets a richer signature later), the `table` / `column` on the original are silently dropped because the catch re-reads only `columnType` + `cause`. Preserve `err.table ?? tableName` and `err.column ?? key` to be safe.

**N3. `extractTableName` for enrichment.** The regex uses the first `FROM`/`INSERT INTO` match. For a JOIN `SELECT ... FROM install JOIN user ...` the enriched `table` is `'install'`, which is correct. For `SELECT ... FROM user JOIN install ...` it would wrongly blame `'user'` when the bad jsonb cell is on `install`. Out-of-scope for Phase A per the design doc, but worth a TODO near `extractTableName` — current code has no comment warning future readers.

**N4. TDD compliance.** Commit 2 added the enrichment branch and the `null` skip guard with matching tests in the same commit. Hard to prove one-at-a-time from a single squashed commit, but the tests in `sqlite-driver.test.ts:341-403` do each drive a distinct branch (enrichment, validator call, validator reject, null skip) and would all fail against commit 1's code — acceptable.

**N5. Postgres untouched.** Confirmed: `git diff origin/main..HEAD -- packages/db/src/dialect/postgres.ts packages/db/src/client/postgres-driver.ts` is empty.

---

## Verdict

**CHANGES REQUESTED** — B1 is a real functional gap that defeats the phase goal. The tests all pass because they stop at the driver layer; the Result-layer promise in the design doc, the JSDoc, and the commit messages is untrue. Fix the plumbing in `executeQuery` / `toReadError`, add a CRUD-level test, and this phase is solid.

---

## Resolution (commit `80776fc6f`)

**B1 fixed.** `executeQuery` short-circuits on `DbError` instances so they reach the Result layer unchanged. `ReadError` gained `DbJsonbParseError` (`code: 'JSONB_PARSE_ERROR'`) and `DbJsonbValidationError` (`code: 'JSONB_VALIDATION_ERROR'`) with all enrichment (`table`, `column`, `columnType`, `value`) preserved. `toReadError` maps the typed throws to these variants before the generic code-sniffing path.

**CRUD-level tests added.** Two new tests in `jsonb-parity.test.ts` seed corrupt / invalid JSONB via `db.query(sql\`INSERT…\`)` against a local `:memory:` DB and assert `{ ok: false, error.code === 'JSONB_PARSE_ERROR' }` / `'JSONB_VALIDATION_ERROR'` with `table` / `column` preserved. Both green.

**S1/S2/S5, N1/N2/N3 addressed.** Validator guard no longer checks `undefined`; `DbError` constructor accepts `{ cause }`; `JsonbParseError` re-throw preserves upstream table/column; docstrings on `TableSchemaRegistry` shortcut invariant and `convertRowWithSchema` JOIN caveat.

**S4 intentionally deferred.** The two new CRUD-level tests exercise the local driver path end-to-end, so explicit local-only error tests would be redundant.

**Reviewer verdict on resolution: APPROVED.** All 1685 tests green. Phase A ready to merge.
