# Phase 1: Fix SQLite rowCount for write-without-RETURNING (#2890)

- **Author:** claude (fix branch)
- **Reviewer:** claude (adversarial review)
- **Commits:** 454a5e78c
- **Date:** 2026-04-21

## Changes

- `packages/db/src/client/database.ts` (modified) — two new helpers (`stripLeadingSqlComments`, `stripSqlStringLiterals`), exported `isWriteWithoutReturning`, routing in both SQLite queryFn wrappers (D1 + local-file).
- `packages/db/src/client/__tests__/sqlite-rowcount.test.ts` (new) — regression tests.
- `packages/db/src/query/__tests__/crud-jsonb-validator-writes.test.ts` (modified) — replaces the old workaround comment with a real assertion that `res.data.count === 100`.

## CI Status

- [x] `vtz test packages/db` passes locally (1725 passed, 1 skipped).
- [x] New test file — all 10 cases pass, including helper unit tests, local `:memory:` integration, and a D1 mock verifying `.run()` is invoked instead of `.all()`.

## Review Checklist

- [x] Delivers what #2890 asks for — `createMany` / `updateMany` / `deleteMany` surface accurate `count` on SQLite (local + D1).
- [x] Postgres path untouched (verified — only the two SQLite branches in `createDb` gained routing, Postgres branch returns `driver.queryFn<T>` as before).
- [x] TDD compliance — the fast-path test in `crud-jsonb-validator-writes.test.ts` was previously a workaround; it is now flipped to assert `count` directly. Positive regression coverage for the issue is present.
- [x] `createManyAndReturn` still works — explicit test at line 116 proves the RETURNING path is unchanged.
- [x] No type gaps — exported helper has a narrow `(sql: string) => boolean` signature.

## Findings

### Blockers

_None._ The fix is correct for every SQL statement the ORM itself generates. All 1725 db tests pass, the issue repro from #2890 passes, and Postgres routing is untouched.

### Should-fix

**F1 — False-negative on trailing / mid-statement comments containing the word `RETURNING`.**

`stripLeadingSqlComments` only consumes comments at the very start of the statement. After it returns, non-leading comments (trailing `-- ...` or mid-statement `/* ... */`) remain in the string. `stripSqlStringLiterals` then strips string literals but leaves comments alone. The final `\bRETURNING\b` regex matches the word inside the comment, so the statement is classified as "has RETURNING" → dispatched through `query()` → `rowCount` collapses back to `0`.

Reproduced (verified with a local Node script against the extracted helpers):

| SQL | Expected | Actual |
|-----|----------|--------|
| `INSERT INTO t VALUES (1) -- RETURNING is fake` | `true` (write-without-RETURNING) | **`false`** |
| `UPDATE t SET a = 1 /* RETURNING x */` | `true` | **`false`** |

The ORM itself never generates SQL with trailing comments, so this does not affect `db.users.createMany()` etc. But `db.query(sql\`...\`)` is a public surface, and a user who passes a statement with a trailing comment gets the original #2890 bug back. The fix is inexpensive — strip ALL comments (not just leading), or run `stripSqlStringLiterals` before a comment-stripping pass that handles `--` / `/* */` anywhere.

**F2 — `REPLACE INTO` (SQLite-only write verb) is not recognised.**

`isWriteWithoutReturning` only tests `INSERT `, `UPDATE `, `DELETE `, `TRUNCATE `. SQLite also supports `REPLACE INTO` (equivalent to `INSERT OR REPLACE`). The ORM does not generate `REPLACE INTO`, but a user passing `db.query(sql\`REPLACE INTO ...\`)` hits the original bug. Add `REPLACE ` to the prefix list and a unit test. TRUNCATE is a no-op on SQLite anyway; `REPLACE` is a real SQLite verb that probably matters more.

**F3 — No transaction coverage for the new routing.**

The SQLite fallback `transaction()` path routes `BEGIN` / `COMMIT` / `ROLLBACK` + inner statements through the same queryFn wrapper. `BEGIN`/`COMMIT`/`ROLLBACK` fall through to `query()` (`stmt.all()`), which is what they did before the fix — so transactions almost certainly still work. But the new test file doesn't prove it: the existing `transaction.test.ts` uses a custom `_queryFn` stub that bypasses this code entirely. A `db.transaction(async (tx) => { await tx.plain.createMany(...); await tx.plain.updateMany(...); })` test on `:memory:` asserting both the per-call `count` and the final persisted state would close this gap and defend against future refactors.

**F4 — No test for writable CTEs.**

The docstring on `isWriteWithoutReturning` makes an explicit claim about writable CTEs:

> Writable CTEs (`WITH ... INSERT/UPDATE/DELETE`) are NOT classified as write-without-RETURNING by this helper, because their outer wrapper is a SELECT that must still go through `query()` to surface rows.

There is no test that locks in this behaviour. A one-line unit test against the helper (`expect(isWriteWithoutReturning('WITH cte AS (INSERT INTO t VALUES (1) RETURNING id) SELECT * FROM cte')).toBe(false)`) plus a negative case without inner RETURNING would be enough to catch a future regression that mistakenly starts classifying CTEs by their inner verb.

### Nits

**N1 — Test description is slightly off.**

The block-comment assertion in `isWriteWithoutReturning helper` uses:
```ts
expect(isWriteWithoutReturning('/* block comment */ UPDATE t SET a = 1 RETURNING id')).toBe(false);
```

This exercises the happy path (`RETURNING` really is present), not the edge case that was concerning — namely, a block comment containing the word RETURNING wrapping a write that doesn't actually have RETURNING. It's a fine test, just doesn't defend against F1.

**N2 — `stripSqlStringLiterals` doesn't handle backtick identifiers.**

SQLite accepts backtick-quoted identifiers for MySQL compatibility. Exotic edge; no behaviour change needed given that the helper operates at word boundaries and `RETURNING` inside a backtick-quoted identifier is extraordinarily unlikely. Note for posterity only.

**N3 — Duplication with `isReadQuery`'s own comment-stripping.**

`isReadQuery` (lines 52-110) has its own inlined comment-stripping loop that is structurally identical to `stripLeadingSqlComments`. A future pass could extract a single shared helper; low priority, purely stylistic.

## Resolution

All four should-fix findings addressed in follow-up commit:

- **F1** — Replaced the two-pass helper pair (`stripLeadingSqlComments` + `stripSqlStringLiterals`) with a single-pass `stripSqlCommentsAndStrings` state machine that blanks out line comments, block comments, and string literals anywhere in the statement while preserving column positions. Added 3 unit tests covering trailing `--` comments and mid-statement `/* ... */` comments.
- **F2** — Added `REPLACE ` to the write-verb prefix list and a unit test for `REPLACE INTO ...` (with and without RETURNING).
- **F3** — Added a `db.transaction(tx => { createMany + updateMany })` integration test on `:memory:` asserting per-call `count` and final persisted state.
- **F4** — Added three unit tests for writable CTEs (`WITH ... INSERT/DELETE RETURNING`) verifying the helper returns `false` so the outer SELECT still routes through `query()`.

Nits (N1–N3) left for follow-up as originally classified.

All 1750 db tests pass, typecheck clean, formatting clean.
