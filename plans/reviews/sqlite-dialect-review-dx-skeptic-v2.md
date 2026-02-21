# DX Skeptic Review: SQLite Dialect Design v3

**Reviewer:** DX Skeptic (subagent)
**Date:** 2026-02-20

---

## Verdict

**Approve with Changes**

The v3 design addresses the boolean/timestamp conversion concern with an explicit value converter layer, but the local SQLite driver gap remains. A few new concerns emerged around implementation complexity.

---

## Summary

The dialect abstraction is well-designed and the Value Conversion Layer (Section 10) properly addresses the previous boolean/timestamp conversion concern. The feature guards for Postgres-specific operators in `where.ts` are a strong addition. However, the lack of a local SQLite driver for development remains a DX gap, and the implementation scope is non-trivial.

---

## Previous Concerns Status

| Concern | Status |
|---------|--------|
| Boolean/timestamp conversion implicit | ✅ **Addressed** — Explicit `sqlite-value-converter.ts` with `toDb`/`fromDb` functions |
| `dialect` option not in current `createDb()` | ✅ **Addressed** — Design specifies `dialect?: 'postgres' \| 'sqlite'` option |
| No local SQLite driver | ❌ **Not addressed** — Still deferred to v0.2 |
| Tables registry hidden dependency | ✅ **Addressed** — Design clarifies tables is already required |
| `supportsReturning` runtime verification | ⚠️ **Partially addressed** — D1 is known to support 3.35+, but no explicit version check in driver |
| PostgresDriver rename breaking imports | ✅ **Addressed** — Type alias for backward compat |

---

## New Concerns

1. **[Important] Local SQLite driver still deferred to v0.2 — contradicts "local development without Postgres" goal**
   - The design still targets D1 as the only SQLite option for v0.1
   - Developers without Cloudflare setup cannot test SQLite queries locally
   - This forces teams to either use Wrangler+D1 locally or maintain a Postgres instance
   - **Suggestion:** At minimum, document a `better-sqlite3` or `sql.js` shim in the migration guide, or provide a lightweight adapter interface that could be swapped

2. **[Important] Implementation scope is significant — 5 phases across multiple files**
   - The refactor touches: `where.ts`, `insert.ts`, `select.ts`, `update.ts`, `delete.ts`, `sql-generator.ts`, `database.ts`
   - All builders need a `dialect` parameter threaded through
   - Risk of regression if all existing callers aren't updated
   - **Suggestion:** Phase 1 (dialect interface + Postgres extraction) should be strictly a refactor with zero functional changes — existing tests must pass unchanged

3. **[Minor] Feature guards add runtime errors where Postgres queries would just work**
   - Array operators (`@>`, `<@`, `&&`) and JSONB paths (`->`, `->>`) throw on SQLite
   - This is correct behavior, but could frustrate developers migrating from Postgres
   - **Suggestion:** Ensure error messages are actionable — already done in the design ("Use a different filter strategy or switch to Postgres")

4. **[Minor] No explicit SQLite version check for RETURNING support**
   - D1 supports SQLite 3.35+, but local `sqlite3` CLI or older versions may not
   - The driver silently assumes RETURNING works
   - **Suggestion:** Add a comment in `sqlite-driver.ts` noting the minimum version requirement (3.35+)

5. **[Minor] The `dialect` parameter is optional but recommended — could lead to confusion**
   - Default is `PostgresDialect`, so queries "just work" without specifying dialect
   - But mixing dialects (e.g., default Postgres dialect with SQLite driver) would produce wrong SQL
   - **Suggestion:** In `createDb()`, validate that the dialect matches the driver type, or warn if dialect is unspecified with a D1 binding

---

## What's Good

- **Explicit Value Conversion Layer:** The `createValueConverter(tables)` approach with `toDb`/`fromDb` is transparent and testable. Developers can see exactly when conversion happens.

- **Feature guards with clear errors:** The design adds explicit checks for array operators and JSONB paths on SQLite, throwing descriptive errors instead of generating invalid SQL. This is a major improvement over silent failures.

- **Clean dialect interface:** The `Dialect` interface remains minimal and focused: `param()`, `now()`, `mapColumnType()`, and feature flags. This keeps the refactor surgical.

- **Backward compatibility preserved:** All SQL builders default to `PostgresDialect`, so existing code works without changes. The new parameter is always last and optional.

- **createDb() validation:** The error messages for missing `d1` with SQLite dialect or conflicting `url` + `dialect` options are clear and actionable.

- **Migration generator SQLite support:** The design handles CREATE TABLE for SQLite with proper type mapping and enum CHECK constraints.

- **Test plan is comprehensive:** 46 tests covering dialect unit tests, SQL builder regression, value converter, D1 driver, and integration — good coverage.

---

## Recommendation

Approve with the expectation that:
1. Phase 1 is strictly a refactor (no functional changes) to minimize regression risk
2. The local SQLite driver gap is documented with a workaround for v0.1
3. The implementation follows the phased approach with test milestones

The design is solid. The main remaining gap (local SQLite driver) is a known trade-off to ship D1 support faster.
