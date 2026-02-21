# SQLite Dialect Implementation Spec - Tech Lead Review

**Verdict:** Request Changes

---

## Summary

The spec is well-structured and mostly accurate. It correctly identifies all `$${idx}` occurrences in the SQL builders and provides clear before/after code transformations. However, there are **blocking issues** around dialect propagation in the CRUD layer that would cause implementation to fail or produce incorrect behavior.

---

## Blocking Issues

### 1. CRUD Layer Missing Dialect Propagation (CRITICAL)

**Location:** `packages/db/src/query/crud.ts`

**Problem:** The spec adds dialect parameters to SQL builders (`buildSelect`, `buildInsert`, etc.) with default values, so existing calls work without changes. However, when SQLite is used, the crud.ts functions need to pass the correct dialect to these builders — otherwise they always use PostgresDialect.

**Current state:** `crud.ts` calls SQL builders without passing dialect:
```typescript
const result = buildInsert({
  table: table._name,
  data: filteredData,
  returning: returningColumns,
  nowColumns,
});
```

**What's missing:** The spec doesn't describe how `createDb()` (Phase 3) passes the dialect to CRUD functions, or how CRUD functions pass it to SQL builders.

**Impact:** When an implementing agent adds SQLite support in Phase 3, the CRUD layer will still use PostgresDialect (via the default), producing incorrect SQL (`$1` instead of `?`).

**Recommended fix:** Add a section in Phase 3 specifying that:
- `createDb()` stores the dialect in the returned instance
- CRUD functions accept `dialect` as a parameter (or read from context)
- CRUD functions pass dialect to all SQL builders

---

### 2. database.ts createDb() Changes Not Detailed

**Location:** `packages/db/src/client/database.ts`

**Problem:** Phase 3 describes creating SQLite driver and updating `createDb()` to support dialect selection, but the spec doesn't show the actual code changes needed in `database.ts`.

**What's described:**
- Create `sqlite-driver.ts`
- Create `sqlite-value-converter.ts`  
- Update `createDb()` to support dialect selection

**What's missing:** The spec doesn't show:
- How `createDb()` accepts a `dialect` option
- How the driver is selected based on dialect
- How value converter is integrated

**Impact:** An implementing agent would need to make significant architectural decisions without guidance.

---

## Important Issues

### 3. Index.ts Exports Not Specified

**Location:** `packages/db/src/index.ts`

**Problem:** The spec lists `index.ts` in modified files but doesn't detail what exports to add.

**Missing exports:**
- `Dialect`, `PostgresDialect`, `SqliteDialect` types/classes
- `defaultPostgresDialect`, `defaultSqliteDialect` instances
- `DbDriver` interface

---

### 4. Feature Guards Incomplete for JSONB Path

**Location:** `packages/db/src/sql/where.ts`

**Problem:** The spec adds feature guards for array operators and mentions JSONB path guards, but the implementation detail for `resolveColumnRef()` passing `dialect` is vague.

**Current code:** `resolveColumnRef()` doesn't accept dialect parameter:
```typescript
function resolveColumnRef(key: string, overrides?: CasingOverrides): string
```

**Spec says:** Add dialect parameter (Change 2 in Phase 2.3)

**Verification:** This change IS in the spec (lines ~1840-1850), but the spec shows adding `dialect` as an optional parameter with a runtime check inside the function. This is correct.

---

## Minor Issues

### 5. Missing Test: JSONB Path on Postgres

The spec tests that JSONB path throws on SQLite, but doesn't test that it WORKS on Postgres. The regression tests should include:
```typescript
it('supports JSONB path operators on Postgres', () => {
  const result = buildWhere(
    { 'metadata->role': { eq: 'admin' } },
    0,
    undefined,
    defaultPostgresDialect,
  );
  expect(result.sql).toBe('"metadata"->>\'role\' = $1');
});
```

### 6. No Explicit RETURNING Test for SQLite

The spec states SQLite supports RETURNING (3.35+), but there's no test verifying it works. The existing regression tests use `returning: '*'` but don't verify the clause appears in SQLite output.

### 7. Test Count Discrepancy

The spec says 83 tests total, but let me verify:
- Phase 1: 25 (postgres dialect) + 9 (regression) = 34
- Phase 2: 15 (sqlite dialect) + 9 (builders/guards) = 24
- **Total: 58 tests**

The spec mentions 83 but only shows 58. Either the count is wrong or there are additional tests not shown in the excerpt I reviewed.

---

## What's Solid

### ✓ Accurate Code Transformations

The spec correctly identifies ALL `$${idx}` occurrences:

**where.ts** (12 occurrences in `buildOperatorCondition` + 1 in direct value):
- `eq`, `ne`, `gt`, `gte`, `lt`, `lte` → `dialect.param(idx + 1)`
- `contains`, `startsWith`, `endsWith` → `dialect.param(idx + 1)`
- `in`, `notIn` → `dialect.param(idx + 1 + i)`
- `arrayContains`, `arrayContainedBy`, `arrayOverlaps` → `dialect.param(idx + 1)`
- Direct value → `dialect.param(idx + 1)`

**insert.ts**:
- VALUES placeholders: `dialect.param(allParams.length)`
- ON CONFLICT update values: `dialect.param(allParams.length)`

**select.ts**:
- Cursor WHERE: `dialect.param(allParams.length)`
- Composite cursor: `dialect.param(allParams.length)`
- LIMIT: `dialect.param(allParams.length)`
- OFFSET: `dialect.param(allParams.length)`

**update.ts**:
- NOW() → `dialect.now()`
- SET params: `dialect.param(allParams.length)`

**delete.ts**: No param placeholders (uses buildWhere)

### ✓ Function Names, Not Line Numbers

The spec references functions by name throughout:
- `buildWhere`, `buildOperatorCondition`, `resolveColumnRef`
- `buildInsert`, `buildSelect`, `buildUpdate`, `buildDelete`
- `createPostgresDriver`, `createSqliteDriver`

### ✓ Good Default Behavior

Adding `dialect: Dialect = defaultPostgresDialect` ensures backward compatibility — existing code continues to work without changes.

### ✓ Feature Guards Design

The error messages for unsupported operations are clear and actionable:
```typescript
throw new Error(
  'Array operators (arrayContains, arrayContainedBy, arrayOverlaps) are not supported on SQLite. ' +
    'Use a different filter strategy or switch to Postgres.',
);
```

### ✓ Test Coverage

The test structure is solid:
- Unit tests for each dialect
- Regression tests ensuring Postgres produces identical SQL
- Builder tests for SQLite
- Feature guard tests

---

## Recommendations

1. **Add Phase 3 detail for crud.ts**: Specify how dialect propagates from `createDb()` through CRUD functions to SQL builders.

2. **Add createDb() implementation details**: Show how the dialect option is accepted and stored.

3. **Fix test count**: Clarify if there are 58 or 83 tests.

4. **Add JSONB path test for Postgres**: Ensure the feature works, not just that it throws on SQLite.

5. **Document index.ts exports**: List exactly what needs to be exported.
