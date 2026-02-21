# Devil's Advocate Review: SQLite Dialect & Database Abstraction

**Reviewer:** Devil's Advocate (subagent)
**Date:** 2026-02-20
**Design Doc:** `plans/sqlite-dialect-design.md`

---

## Verdict: Request Changes

## Summary

The design provides a solid architectural foundation for SQLite/Postgres abstraction, but contains several critical gaps that could cause runtime failures or silent data corruption. The most concerning issues are: (1) missing value conversion infrastructure for the SQLite driver, (2) incomplete migration DDL that will fail on SQLite for common schema changes, and (3) overstated backward compatibility claims that would require widespread code changes.

---

## Concerns

### 1. **Blocking: Value Conversion Layer Has No Implementation Path**

**Severity:** Blocking

The design describes a value conversion layer for SQLite:
```typescript
// On write: true → 1, false → 0, Date → ISO string
// On read: 1 → true, 0 → false, ISO string → Date
```

**Problem:** The `createSqliteDriver` references a `TableRegistry` type that doesn't exist in the current codebase. Without column metadata at runtime, the driver cannot know which columns are boolean vs integer, or timestamp vs text.

**Evidence:**
- Design doc references `tables: TableRegistry` in `SqliteDriverOptions`
- Current `database.ts` exports `CreateDbOptions` with no `tables` field for runtime metadata
- The value conversion logic is described but never implemented

**Recommendation:** Add a `columnTypes` map to `CreateDbOptions` or derive it from the existing `tables` schema definition.

---

### 2. **Blocking: Migration DDL Generates Invalid SQLite for Many Operations**

**Severity:** Blocking

The current `sql-generator.ts` uses PostgreSQL-specific DDL:
- `ALTER TABLE ALTER COLUMN` — Not supported in SQLite
- `ALTER TABLE ADD COLUMN` with NOT NULL without DEFAULT — Fails in SQLite
- `DROP TYPE` — SQLite has no `DROP TYPE`
- `CREATE TYPE ... AS ENUM` — Not supported, needs CHECK constraint
- `RENAME COLUMN` — Not supported in older SQLite versions (pre-3.25)

**Evidence:** Looking at `sql-generator.ts`:
```typescript
case 'column_altered':
  statements.push(
    `ALTER TABLE "${snakeTable}" ALTER COLUMN "${snakeCol}" TYPE ${change.newType};`,
  );
```

**Recommendation:** Implement a SQLite-specific migration path that:
1. Uses `CREATE TABLE new_table AS SELECT` for column alterations
2. Generates inline CHECK constraints for enums
3. Rejects or transforms unsupported operations with clear errors

---

### 3. **Blocking: D1 Driver Missing Optimization for Single-Row Queries**

**Severity:** Blocking

The SQLite driver design uses `stmt.all()` for every query:
```typescript
const result = await stmt.all();
```

**Problem:** D1 provides `stmt.first()` for single-row queries which is more efficient. Every `get()` query inverts to fetching all rows and taking the first.

**Additional issue:** D1's response structure is `{ results: [], success: true, meta: { changes: number, last_row_id: number } }`. The design expects `rowCount` but D1 doesn't provide it directly—you'd need `result.results.length`.

**Recommendation:** Add a query hint or detect single-row queries to use `.first()` instead of `.all()`.

---

### 4. **Important: Backward Compatibility Claim Is Misleading**

**Severity:** Important

The design claims:
> To avoid breaking everything at once, we can default the `dialect` parameter to `PostgresDialect` initially

**Problem:** The current SQL builders (`buildInsert`, `buildUpdate`, etc.) are called internally by the CRUD layer in `crud.ts`. The design doesn't show how the dialect gets passed from `createDb` down to these builders.

**Evidence:**
- Current `buildInsert(options: InsertOptions)` takes no dialect parameter
- The refactor requires either: (a) passing dialect through the entire call stack, or (b) storing dialect in a context/module-level variable
- Any code calling `buildInsert` directly (tests, custom queries) would break

**Recommendation:** Clearly document the migration path and ensure the default dialect pattern is actually implemented in the code.

---

### 5. **Important: CreateDbOptions Interface Change Is Breaking**

**Severity:** Important

The design proposes:
```typescript
export interface CreateDbOptions<TTables extends Record<string, TableEntry>> {
  readonly url?: string;
  // NEW:
  readonly dialect?: 'postgres' | 'sqlite';
  readonly d1?: D1Database;
}
```

**Problem:** Adding new optional properties to an interface is technically backward compatible in TypeScript, BUT:
1. If users pass `dialect: 'sqlite'` without `d1`, the design says it should error
2. The current implementation doesn't have this logic—it will fail at runtime with an unclear error

**Recommendation:** Add validation in `createDb()` that throws a clear error message when `dialect: 'sqlite'` is used without a valid `d1` binding.

---

### 6. **Important: ON CONFLICT Syntax Differences**

**Severity:** Important

The design claims:
> SQLite uses same ON CONFLICT syntax since 3.24

**Partially true, but subtle differences exist:**

1. **PostgreSQL:** `ON CONFLICT (col) DO UPDATE SET col = EXCLUDED.col`
2. **SQLite:** `ON CONFLICT (col) DO UPDATE SET col = excluded.col` (lowercase `excluded`)

**Evidence:** Looking at current `insert.ts`:
```typescript
return `"${snakeCol}" = EXCLUDED."${snakeCol}"`;
```

This uses uppercase `EXCLUDED` which works in PostgreSQL. While SQLite 3.24+ supports `EXCLUDED`, the case sensitivity could be an issue.

**More importantly:** SQLite has `UPSERT` syntax (`INSERT ... ON CONFLICT ...`) which is more explicit. The current implementation uses PostgreSQL's more modern `ON CONFLICT` which is also supported, but testing is needed.

**Recommendation:** Add explicit tests for upsert with both dialects to verify compatibility.

---

### 7. **Minor: Workers Bundle Size Not Addressed**

**Severity:** Minor

Cloudflare Workers have a **1MB bundle size limit**. The design adds a new SQLite dialect but:
- The `postgres` library (porsager/postgres) is still required for Postgres users
- Adding SQLite driver adds more code
- No mention of tree-shaking or optional dependencies

**Recommendation:** Consider documenting the bundle size impact or exploring lighter alternatives for the Workers build.

---

### 8. **Minor: `supportsReturning` Inconsistency**

**Severity:** Minor

The design sets:
```typescript
readonly supportsReturning: boolean;
```

But for SQLite, it says:
```typescript
readonly supportsReturning = true; // SQLite 3.35+ (D1 supports this)
```

**Problem:** This is a runtime flag, but the code doesn't actually check it before generating RETURNING clauses. If someone uses an older SQLite version (not D1), queries would fail silently.

**Recommendation:** Either enforce this at query-build time or document that only D1-supported SQLite versions are supported.

---

### 9. **Minor: No Local SQLite Driver Path**

**Severity:** Minor

The design explicitly defers local SQLite:
> Local SQLite driver (non-D1)? — Defer to v0.2. D1 is the primary target.

**Problem:** This means local development without D1 (e.g., using `better-sqlite3`) won't work. For a "zero-config" local dev story, this is a gap.

**Recommendation:** Document this limitation clearly and consider at least a basic file-based SQLite driver for local dev.

---

## What's Good

1. **Dialect interface is well-designed** — The `mapColumnType`, `param()`, `now()`, and `buildOnConflict` methods correctly abstract the differences between databases.

2. **ID generation is properly handled** — The design correctly notes that UUID/CUID generation happens in the application layer, avoiding database-specific DEFAULT expressions.

3. **Type mapping is accurate** — UUID→TEXT, boolean→INTEGER, timestamp→TEXT for SQLite are all correct.

4. **File structure is clean** — Separating dialect logic into its own module is the right architectural choice.

5. **Test plan is comprehensive** — The 41 test cases cover the critical paths.

6. **Driver rename is thoughtful** — Keeping `PostgresDriver` as a type alias for backward compatibility is the right call.

---

## Additional Notes

- The design mentions `TableRegistry` in the SQLite driver but this type doesn't exist in the current codebase. This needs to be created or derived from existing schema types.
- The `buildOnConflict` method signature passes `paramOffset` which requires careful tracking—ensure this is tested thoroughly with multi-row inserts.
- Consider adding a `dialectName` property to the `DatabaseInstance` so users can introspect which database they're using at runtime.
