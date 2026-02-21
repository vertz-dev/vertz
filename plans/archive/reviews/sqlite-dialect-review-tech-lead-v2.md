# SQLite Dialect Design Review — Tech Lead Assessment v2

**Reviewer:** ben (Tech Lead)
**Date:** 2026-02-20
**Status:** Approve

---

## Verdict

**Approve**

---

## Summary

The v3 design comprehensively addresses all blocking concerns from the v1 review. The WHERE builder is now explicitly in scope with `dialect.param()` usage, the dialect propagation path is clearly documented, and Postgres-specific operators now have feature-flag guards that throw descriptive errors on SQLite. The implementation gaps noted in the code are expected—the design correctly identifies what needs to change.

---

## Previous Concerns Status

| Concern | Status |
|---------|--------|
| 1. WHERE builder uses hardcoded `$` placeholders | ✅ Addressed — Section 8 explicitly covers `where.ts` refactor with `dialect.param(idx + 1)` |
| 2. Postgres array/JSONB operators unaddressed | ✅ Addressed — `supportsArrayOps` and `supportsJsonbPath` flags added; Section 8 shows error-throwing guards |
| 3. Dialect propagation path undefined | ✅ Addressed — Section 6 provides detailed call chain: `createDb → db instance → crud.ts → buildX(dialect)` |
| 4. Migration generator SQLite constraints | ✅ Addressed — Section 14 covers CREATE TABLE, INDEX, DROP TABLE; ALTER deferred |
| 5. Driver rename backward compatibility | ✅ Addressed — Section 13 shows alias approach |
| 6. D1 driver return type mismatch | ✅ Addressed — Section 11 shows `.all()` for reads, `.run()` for writes |
| 7. Boolean conversion relies on column metadata | ✅ Addressed — Section 10 shows `createValueConverter(tables)` using table registry |
| 8. Missing buildOnConflict signature detail | ✅ Addressed — Section 8 confirms SQLite UPSERT syntax works identically |

---

## New Concerns

### 1. WHERE builder implementation doesn't match design intent (Important)

**Severity:** Important

The current `where.ts` implementation uses hardcoded `$${idx + 1}` throughout:
```typescript
clauses.push(`${columnRef} = $${idx + 1}`);
clauses.push(`${columnRef} IN (${placeholders.join(', ')})`);
```

The design correctly identifies this needs refactoring, but the design doc doesn't explicitly show the refactored code for `buildOperatorCondition` and `buildFilterCluses` to use `dialect.param()`. Consider adding a code example showing the exact change.

**Recommendation:** Add a concrete code snippet showing `dialect.param(idx + 1)` replacing `$${idx + 1}` in the WHERE builder section.

---

### 2. JSONB path detection in resolveColumnRef uses Postgres syntax (Important)

**Severity:** Important

The current `resolveColumnRef` function detects JSONB paths via `key.includes('->')` and always generates Postgres syntax:
```typescript
return `${column}->>'${escapeSingleQuotes(jsonPath[0])}'`;
```

SQLite uses `json_extract()` instead. The design shows error-throwing guards, which is correct, but it would be better to also document that users should avoid using JSONB path syntax in filters when targeting SQLite.

**Recommendation:** Add a note in Section 8 or the Non-Goals clarifying that JSONB column paths (`metadata->key`) are a Postgres-only pattern.

---

### 3. crud.ts doesn't show dialect passing (Minor)

**Severity:** Minor

Section 6 describes the propagation path conceptually, but the code examples show `crud.ts` receiving `dialect` as a parameter. However, the current `crud.ts` implementation doesn't have this parameter, and the design doesn't show the exact function signature changes needed.

The design says:
```typescript
export async function create<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: CreateArgs,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T> { ... }
```

This is clear enough, but consider adding a "Before/After" snippet for one CRUD function to make it concrete.

---

### 4. buildWhere paramOffset behavior with SQLite (Minor)

**Severity:** Minor

The `buildWhere` function has a `paramOffset` parameter. When called from `buildUpdate`, it passes `allParams.length` as the offset:
```typescript
const whereResult = buildWhere(options.where, allParams.length);
```

This pattern needs to work with SQLite's `?` placeholders. Since SQLite uses positional `?` without numbers, the offset calculation should work identically—but it would be worth explicitly noting in Section 8 that the offset logic is dialect-agnostic because it's just a number, not a placeholder format.

---

## What's Good

### Comprehensive Dialect Interface
The `Dialect` interface is well-designed with clear separation of concerns:
- `param()` — parameter placeholder abstraction
- `now()` — timestamp function abstraction  
- `mapColumnType()` — type mapping for migrations
- Feature flags (`supportsReturning`, `supportsArrayOps`, `supportsJsonbPath`) — explicit capability detection

### Clear Propagation Architecture
Section 6's diagram and explanation of the dialect flow is excellent. The pattern of storing dialect on `DbInstance` and threading it through CRUD to SQL builders is intuitive and matches how the existing `queryFn` works.

### Smart Feature Guards
Rather than silently generating invalid SQL, the design opts for explicit error throwing when Postgres-specific operators are used on SQLite. This fails fast with actionable messages—much better than debugging generated SQL issues.

### Thorough Test Plan
The 46-test plan covers unit, regression, integration, and edge cases. Key tests I appreciate:
- Array operators on SQLite → throws (test #24)
- JSONB path on SQLite → throws (test #25)
- Backward compatibility tests (#15-18) ensure Postgres remains stable

### Phased Implementation
The 5-phase approach with clear boundaries allows parallel work and regression testing at each step. The estimate of ~5 days (2-3 with parallelization) seems reasonable.

### Value Converter Design
Section 10's `createValueConverter(tables)` pattern is clean—it uses the existing table registry to infer column types and handles boolean (0/1) and timestamp (ISO string) conversions bidirectionally.

---

## Recommendation

**Approve** the design. The v3 iteration successfully addresses all blocking concerns from v1. The remaining concerns (listed above) are minor improvements to documentation clarity, not fundamental design issues.

The design is ready for implementation. Teams should:
1. Start with Phase 1 (Dialect interface + PostgresDialect extraction)
2. Verify all existing tests pass before moving to Phase 2
3. Pay special attention to the WHERE builder refactor—it touches the most code paths
