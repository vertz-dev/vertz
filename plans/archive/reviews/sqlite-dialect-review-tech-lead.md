# SQLite Dialect Design Review — Tech Lead Assessment

**Reviewer:** ben (Tech Lead)
**Date:** 2026-02-20
**Status:** Request Changes

---

## Verdict

**Request Changes**

---

## Summary

The design correctly identifies the need for dialect abstraction and proposes a reasonable phased approach. However, there are two **blocking gaps**: (1) the WHERE clause builder uses hardcoded `$N` placeholders not covered by the refactor scope, and (2) Postgres-specific array operators and JSONB path syntax will silently fail on SQLite. Additionally, the design doesn't explain how the `Dialect` instance flows from `createDb` through the SQL builders—a critical implementation detail.

---

## Concerns

### 1. WHERE clause builder uses hardcoded `$` placeholders (Blocking)

**Severity:** Blocking

The `where.ts` file contains numerous hardcoded parameter references:
```typescript
clauses.push(`${columnRef} = $${idx + 1}`);
clauses.push(`${columnRef} IN (${placeholders.join(', ')})`);
```

These need to use `dialect.param()` but aren't mentioned in the "SQL Builder Refactor" section (Section 8). Every SELECT, UPDATE, DELETE with WHERE clauses will generate invalid SQL on SQLite.

**Fix:** Add `where.ts` to the SQL builder refactor list and ensure `buildWhere` accepts a dialect parameter.

---

### 2. Postgres-specific array and JSONB operators won't work on SQLite (Blocking)

**Severity:** Blocking

The WHERE builder supports Postgres array operators (`@>`, `<@`, `&&`) and JSONB path syntax (`->>`, `->`):
```typescript
if (operators.arrayContains !== undefined) {
  clauses.push(`${columnRef} @> $${idx + 1}`);
}
```

SQLite doesn't support these operators. There's no dialect-aware feature detection or fallback.

**Fix:** Add a `supportsArrayOperators` property to the Dialect interface, or remove these operators from SQLite usage. Consider documenting this limitation or throwing a clear error when these operators are used with SQLite.

---

### 3. Dialect flow through the call chain is undefined (Blocking)

**Severity:** Blocking

The design shows SQL builders accepting a `Dialect` parameter, but doesn't explain:
- How `createDb()` stores and passes the dialect
- How `crud.ts` functions receive the dialect
- How this propagates through to `buildInsert`, `buildSelect`, etc.

Currently in `crud.ts`:
```typescript
const result = buildInsert({ table: table._name, data: filteredData, ... });
```

This would need to become:
```typescript
const result = buildInsert({ table: table._name, data: filteredData, ... }, dialect);
```

The design mentions "Entity Integration" but doesn't detail the implementation path from `createDb` → CRUD → SQL builders.

**Fix:** Add a section explaining the call chain or add a `dialect: Dialect` field to the `CreateDbOptions` and show how it flows through.

---

### 4. Migration generator doesn't handle SQLite-specific column constraints (Important)

**Severity:** Important

For enums, the design correctly notes SQLite uses CHECK constraints instead of `CREATE TYPE`. However, the current `generateMigrationSql` in `sql-generator.ts` generates:
```typescript
statements.push(`CREATE TYPE "${enumSnakeName}" AS ENUM (${valuesStr});`);
```

This needs to be dialect-aware. Additionally, SQLite doesn't support:
- `ALTER TABLE ADD COLUMN` with `NOT NULL` and no DEFAULT (requires SQLite 3.20+ with `DROP COLUMN`)
- Foreign key constraints in all contexts
- Some index types

**Fix:** Ensure Section 11's dialect-aware DDL covers all the differences in the existing `generateMigrationSql` function, not just enums.

---

### 5. Driver rename requires careful backward compatibility (Important)

**Severity:** Important

The design proposes renaming `PostgresDriver` → `DbDriver` with a type alias. Currently in `database.ts`:
```typescript
let driver: PostgresDriver | null = null;
```

If this rename happens, all internal usages need updating. The type alias approach is sound:
```typescript
export type PostgresDriver = DbDriver;
```

**Fix:** Ensure the implementation plan includes updating all internal type references in the same PR, or clarify the alias is exported and used everywhere.

---

### 6. D1 driver return type mismatch potential (Important)

**Severity:** Important

The D1 driver uses `.all()`:
```typescript
const result = await stmt.all();
```

For INSERT/UPDATE/DELETE, D1's `.run()` returns `D1Result` which includes `success`, `changes`, and `last_rowid`—not `rows`. Using `.all()` may work for SELECT but returns nothing useful for writes.

**Fix:** Distinguish between read queries (`.all()`) and write queries (`.run()`) in the SQLite driver, or document that RETURNING is required for all writes.

---

### 7. Boolean conversion relies on column metadata (Minor)

**Severity:** Minor

The design says "value conversion happens in the SQLite driver using column metadata." D1 doesn't provide column metadata in query results. You'll need to pass the table schema to the driver for type inference.

**Fix:** Ensure the `SqliteDriverOptions` includes the full table definitions, not just `tables: TableRegistry`.

---

### 8. Missing `buildOnConflict` signature detail (Minor)

**Severity:** Minor

The interface shows:
```typescript
buildOnConflict(conflictColumns: string[], updateColumns: string[], params: { ... }): { sql: string; params: unknown[] };
```

But the implementation details are sparse. SQLite's ON CONFLICT is similar but not identical to Postgres (e.g., constraint naming, UPSERT vs ON CONFLICT DO UPDATE).

**Fix:** Verify SQLite's UPSERT syntax (`INSERT ... ON CONFLICT ... DO UPDATE SET`) works identically, or document any differences.

---

## What's Good

### Dialect Interface Design
The `Dialect` interface is well-structured and covers the essential differences:
- `param()` for placeholder syntax ($1 vs ?)
- `now()` for timestamp functions
- `mapColumnType()` for migrations
- `supportsReturning` for feature detection
- `generateEnumDDL()` for type differences

### Phased Approach
Phases 1–5 are logical and allow regression testing at each step. Starting with the interface and Postgres extraction (Phase 1) before adding SQLite is correct.

### Backward Compatibility Strategy
Defaulting to `PostgresDialect` in the SQL builders:
```typescript
export function buildInsert(options: InsertOptions, dialect: Dialect = new PostgresDialect()): InsertResult
```
This ensures existing tests pass without modification during Phase 1.

### ID Generation Hand-off
Correctly noting that ID generation is handled at the framework level (via `.primary({ generate: 'uuid' })`) and doesn't need database-level defaults. This avoids the SQLite `AUTOINCREMENT` vs Postgres `SERIAL` complexity.

### Type Mapping Overview
The SQLite type mappings in `mapColumnType()` are accurate:
- UUID → TEXT
- Boolean → INTEGER
- Timestamp → TEXT
- JSON → TEXT

These align with SQLite's type affinity rules.

---

## Summary of Required Changes

1. **Add `where.ts` to the SQL builder refactor** — use `dialect.param()` instead of `$N`
2. **Handle array/JSONB operators for SQLite** — add feature detection or document limitation
3. **Document the dialect propagation path** — show how createDb → CRUD → SQL builders works
4. **Update migration generator** — ensure full SQLite compatibility beyond just enums
5. **Fix D1 driver write handling** — use `.run()` for writes or document RETURNING requirement

---

## Recommendation

Approve with changes after addressing concerns #1, #2, and #3 (the blocking items). These represent fundamental correctness issues that will cause silent failures at runtime if not addressed.
