# Phase 1-2: DbExpr Primitives + SQL Builder Integration

- **Author:** claude
- **Reviewer:** claude (adversarial)
- **Commits:** 663746503..b543fff53
- **Date:** 2026-04-04

## Changes

- `packages/db/src/sql/expr.ts` (new) — `DbExpr` interface, `isDbExpr()` type guard
- `packages/db/src/sql/tagged.ts` (modified) — added `renumberParamsWithDialect()`
- `packages/db/src/sql/update.ts` (modified) — `DbExpr` detection in SET clause
- `packages/db/src/sql/insert.ts` (modified) — `DbExpr` detection in ON CONFLICT SET clause
- `packages/db/src/query/crud.ts` (modified) — autoUpdate injection guard (`if (!(col in filteredData))`)
- `packages/db/src/d.ts` (modified) — `expr`, `increment`, `decrement` on `d` namespace
- `packages/db/src/schema/table.ts` (modified) — widened `$update` and `$update_input` to accept `DbExpr`
- `packages/db/src/index.ts` (modified) — re-exported `DbExpr`, `isDbExpr`, `sql`, `SqlFragment`
- `packages/db/src/sql/index.ts` (modified) — re-exported `DbExpr`, `isDbExpr`
- `packages/db/src/sql/__tests__/expr.test.ts` (new) — unit tests for `DbExpr`, `isDbExpr`, shortcuts
- `packages/db/src/sql/__tests__/update.test.ts` (modified) — DbExpr tests for `buildUpdate`
- `packages/db/src/sql/__tests__/insert.test.ts` (modified) — DbExpr tests for `buildInsert` ON CONFLICT

## CI Status

- [ ] Quality gates passed at commit (not yet verified by reviewer)

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation) — see findings
- [ ] No type gaps or missing edge cases — see findings
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### SHOULD-FIX 1: No SQLite dialect tests for DbExpr in buildUpdate or buildInsert

**Severity:** SHOULD-FIX

The `sqlite-builders.test.ts` file has no tests for `DbExpr` expressions with the SQLite dialect. The `renumberParamsWithDialect()` function was specifically created to handle dialect-aware param translation (replacing `$N` with `?` for SQLite), but this critical path is completely untested with the SQLite dialect.

Since `d.increment(1)` produces a fragment with `$1` from the `sql` tagged template, and SQLite needs `?`, this is the exact scenario where a bug would silently produce wrong SQL. The code looks correct from reading, but without a test this guarantee is fragile.

**Required tests in `sqlite-builders.test.ts`:**
- `d.increment()` in `buildUpdate` with SQLite dialect
- `d.expr()` with params in `buildUpdate` with SQLite dialect
- `d.increment()` in `buildInsert` ON CONFLICT with SQLite dialect

### SHOULD-FIX 2: No type-level tests (.test-d.ts) for DbExpr in $update / $update_input

**Severity:** SHOULD-FIX

The design doc specifies a type flow map and lists specific `.test-d.ts` assertions (direct values work, `DbExpr` works, mixed usage, PK excluded). The existing `table.test-d.ts` has no `DbExpr`-related assertions. The TDD rules require `.test-d.ts` tests for every generic that flows from definition to consumer.

Specifically missing:
- Positive: `d.increment(1)` assignable to `$update.clickCount`
- Positive: `d.expr(col => sql`...`)` assignable to `$update.slug`
- Positive: mixed direct + expr in `$update`
- Positive: `DbExpr` assignable to `$update_input` fields
- Negative: `@ts-expect-error` — `{ increment: 1 }` plain object not assignable to `$update` column (Prisma-style is rejected)

### SHOULD-FIX 3: No crud-level test for autoUpdate + DbExpr interaction

**Severity:** SHOULD-FIX

The `crud.ts` fix (lines 381-385 in `update`, lines 432-436 in `updateMany`, lines 500-504 in `upsert`) changes the autoUpdate injection from unconditional to conditional (`if (!(col in filteredData))`). This is the key behavioral fix in the issue, but it has no dedicated test at the crud layer.

The `crud-unit.test.ts` file has a test for autoUpdate injection (`'injects autoUpdate columns with "now" sentinel'`) but no test verifying that user-provided `DbExpr` values are NOT overwritten. A regression here would silently replace user expressions with `NOW()`.

**Required test:** `update()` with `data: { updatedAt: d.expr((col) => sql`${col} + INTERVAL '1 day'`) }` on a table with `autoUpdate()` on `updatedAt` should NOT inject `'now'` — the SQL should contain the user's expression, not `NOW()`.

### SHOULD-FIX 4: `renumberParamsWithDialect` has no unit tests

**Severity:** SHOULD-FIX

`renumberParamsWithDialect` is a new public export from `tagged.ts`. The `tagged.test.ts` file has no tests for it. While its behavior is exercised indirectly through `buildUpdate`/`buildInsert` tests, those only cover the Postgres dialect (which uses the same `$N` format as the input). The function's raison d'etre is dialect translation, which is untested in isolation.

**Required tests:**
- Postgres dialect: `renumberParamsWithDialect('$1 + $2', 3, pgDialect)` => `'$4 + $5'`
- SQLite dialect: `renumberParamsWithDialect('$1 + $2', 3, sqliteDialect)` => `'? + ?'`
- Zero offset: `renumberParamsWithDialect('$1', 0, pgDialect)` => `'$1'`
- No params: `renumberParamsWithDialect('NOW()', 5, pgDialect)` => `'NOW()'`

### NIT 1: `isDbExpr` type guard uses cast chain

**Severity:** NIT

```typescript
export function isDbExpr(value: unknown): value is DbExpr {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_tag' in value &&
    (value as DbExpr)._tag === 'DbExpr'
  );
}
```

The `'_tag' in value` check already narrows `value` to `object & Record<'_tag', unknown>`. The `(value as DbExpr)._tag` cast is unnecessary — `value._tag === 'DbExpr'` would suffice after the `in` check. Not a correctness issue, just slightly noisier than needed.

### NIT 2: `colRef` constructed inline instead of using `sql.raw()`

**Severity:** NIT

In both `buildUpdate` (line 63) and `buildInsert` (lines 106-110), the column reference `SqlFragment` is constructed manually:

```typescript
const colRef: SqlFragment = { _tag: 'SqlFragment', sql: `"${snakeCol}"`, params: [] };
```

`sql.raw(`"${snakeCol}"`)` would produce the same object and be more idiomatic within the codebase. This is cosmetic — both approaches are functionally identical.

### NIT 3: Design doc mentions `d.multiply()` and `d.divide()` in files changed table

**Severity:** NIT

The design doc's "Files Changed" table says `d.ts` adds "expr(), increment(), arithmetic shortcuts" but the "Review Findings" section confirmed multiply/divide were dropped. The implementation correctly only ships `expr`, `increment`, `decrement`. The doc is slightly stale in the table but the resolution section is accurate.

### OBSERVATION: Security model is sound

The `DbExpr.build()` callback receives a `SqlFragment` and must return a `SqlFragment`. Since `SqlFragment` can only be constructed via the `sql` tagged template (which auto-parameterizes interpolated values) or `sql.raw()` (which is documented as unsafe), the expression system inherits the same injection safety as the rest of the SQL builder layer. User-controlled values are always parameterized. Column names derived from object keys go through `camelToSnake()` and are double-quoted — safe against injection.

### OBSERVATION: Correctness of parameter numbering

Traced through the increment scenario manually:

1. `d.increment(1)` creates `DbExpr` with `build: (col) => sql`${col} + ${n}``
2. `buildUpdate` creates `colRef` as `SqlFragment { sql: '"click_count"', params: [] }`
3. `build(colRef)` evaluates the tagged template: `col` is a `SqlFragment` so it's inlined, `n` (1) is parameterized
4. Result: `SqlFragment { sql: '"click_count" + $1', params: [1] }`
5. `renumberParamsWithDialect('"click_count" + $1', 0, pgDialect)` => `'"click_count" + $1'` (offset 0 + counter 1 = $1)
6. `allParams` gets `[1]`, so next param index is 2

For a mixed case (increment + direct value + WHERE):
- SET: `"click_count" = "click_count" + $1` (params: [1])
- SET: `"target" = $2` (params: [1, 'https://...'])
- WHERE: `"id" = $3` (params: [1, 'https://...', 'u1'])

This matches the test expectation at line 179 of `update.test.ts`. Parameter numbering is correct.

### OBSERVATION: Expression check ordering is correct

In `buildUpdate`, `isDbExpr(value)` is checked before `nowSet.has(key) && value === 'now'`. This means if a user provides a `DbExpr` for an autoUpdate column, the expression takes precedence over the `'now'` sentinel. Test at line 184 confirms this. Good.

## Summary

**Verdict: Approved with SHOULD-FIX items**

The implementation is correct, well-structured, and matches the design doc. The security model is sound, parameter numbering is correct, and the API design is clean.

However, there are 4 SHOULD-FIX items that should be addressed before merging:

1. **SQLite dialect tests** for DbExpr in `buildUpdate`/`buildInsert` — the dialect translation path is untested
2. **Type-level tests** (`.test-d.ts`) for `DbExpr` in `$update`/`$update_input` — required by project TDD rules
3. **Crud-level test** for autoUpdate + DbExpr non-overwrite — the key bug fix has no dedicated regression test
4. **Unit tests** for `renumberParamsWithDialect` — new public function with no direct tests

None of these are blockers (the code is correct from manual review), but they represent test gaps that violate the project's 95%+ coverage target and TDD compliance rules. Fix these before proceeding to documentation.

## Resolution

_Pending — awaiting author fixes._
