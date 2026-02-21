# Devil's Advocate Review: SQLite Dialect & Database Abstraction (v2)

**Reviewer:** Devil's Advocate (subagent)
**Date:** 2026-02-20
**Design Doc:** `plans/sqlite-dialect-design.md`

---

## Verdict: Approve with Changes

## Summary

The v3 design addresses all three blocking concerns from the v1 review with concrete solutions. The value conversion layer now has a clear implementation path using TableRegistry, migration DDL is properly scoped, and the D1 driver correctly distinguishes reads (.all()) from writes (.run()). However, the SQL builders (`where.ts`, `insert.ts`) still use hardcoded `$N` placeholders in the actual code—these need to be refactored per the design before implementation can proceed.

---

## Previous Concerns Status

| Concern | Status |
|---------|--------|
| 1. Value Conversion Layer missing TableRegistry type | ✅ Addressed — `sqlite-value-converter.ts` uses `tables: TableRegistry` from createDb() |
| 2. Migration DDL gaps | ✅ Addressed — Explicitly scoped to CREATE TABLE only for v0.1, ALTER deferred |
| 3. D1 driver using .all() for everything | ✅ Addressed — Uses `.all()` for reads, `.run()` for writes |

---

## New Concerns

### 1. **Critical: SQL Builders Still Use Hardcoded `$N` Placeholders**

**Severity:** Critical

The design doc describes refactoring `where.ts` and `insert.ts` to accept a `dialect` parameter, but the **actual current code** still has hardcoded placeholders:

```typescript
// where.ts line ~118
clauses.push(`${columnRef} = $${idx + 1}`);

// insert.ts line ~55
placeholders.push(`$${allParams.length}`);
```

**Problem:** The design is correct, but the code hasn't been updated. The review should confirm the refactor happens before implementation.

**Recommendation:** Ensure Phase 1 explicitly updates `where.ts`, `insert.ts`, `select.ts`, `update.ts`, `delete.ts` to use `dialect.param()` before testing.

---

### 2. **Important: `buildWhere()` Signature Missing `dialect` Parameter**

**Severity:** Important

The design doc shows:
```typescript
export function buildWhere(
  filter: WhereFilter | undefined,
  paramOffset = 0,
  overrides?: CasingOverrides,
  dialect: Dialect = defaultPostgresDialect,  // < dialect param
): WhereResult { ... }
```

But the current `where.ts` only accepts three parameters:
```typescript
export function buildWhere(
  filter: WhereFilter | undefined,
  paramOffset = 0,
  overrides?: CasingOverrides,
): WhereResult { ... }
```

**Problem:** The dialect parameter must be added to the function signature AND threaded through `buildFilterClauses` and `buildOperatorCondition`.

**Recommendation:** Add the dialect parameter as the 4th argument with default `defaultPostgresDialect`.

---

### 3. **Important: JSONB Path Operator Detection Is Fragile**

**Severity:** Important

The design doc proposes checking for JSONB operators via:
```typescript
if (key.includes('->')) {
  if (!dialect.supportsJsonbPath) {
    throw new Error(...);
  }
}
```

**Problem:** This check happens inside `resolveColumnRef()` in the current code. The logic needs to be aware of the dialect to throw at the right moment. The current implementation doesn't have this check.

**Recommendation:** Ensure `resolveColumnRef` receives `dialect` as a parameter to gate JSONB path syntax.

---

### 4. **Important: Array Operators Not Guarded**

**Severity:** Important

The current `where.ts` generates array operators directly:
```typescript
// line ~139-147
if (operators.arrayContains !== undefined) {
  clauses.push(`${columnRef} @> $${idx + 1}`);
  params.push(operators.arrayContains);
  idx++;
}
```

**Problem:** No dialect check before generating `@>`, `<@`, `&&`. SQLite will receive invalid SQL.

**Recommendation:** Add `if (!dialect.supportsArrayOps) throw new Error(...)` before each array operator in `buildOperatorCondition`.

---

### 5. **Important: INSERT `NOW()` Not Dialect-Aware**

**Severity:** Important

Current `insert.ts` line ~47:
```typescript
if (nowSet.has(key) && value === 'now') {
  placeholders.push('NOW()');
}
```

**Problem:** Should use `dialect.now()` instead of hardcoded `NOW()`.

**Recommendation:** Pass `dialect` to the VALUES building loop and use `dialect.now()`.

---

### 6. **Minor: `createDb()` Doesn't Support SQLite Yet**

**Severity:** Minor

The current `database.ts` only accepts `url: string` for Postgres connections. The design doc describes adding:
```typescript
readonly dialect?: 'postgres' | 'sqlite';
readonly d1?: D1Database;
```

**Problem:** This change is significant and affects the public API. Must be implemented in Phase 3.

**Recommendation:** Document the migration path clearly—existing users don't need to change anything unless they want SQLite.

---

### 7. **Minor: ON CONFLICT Uses Uppercase EXCLUDED**

**Severity:** Minor

Current `insert.ts` line ~77:
```typescript
return `"${snakeCol}" = EXCLUDED."${snakeCol}"`;
```

**Problem:** While SQLite 3.24+ supports `EXCLUDED`, the design doc correctly notes potential case sensitivity issues. Testing should verify this works on D1.

**Recommendation:** Add test case for upsert on SQLite to verify `EXCLUDED` works.

---

### 8. **Minor: Value Converter Uses String `'param'` for Lookup**

**Severity:** Minor

In `sqlite-value-converter.ts` (design):
```typescript
const convertedParams = params.map((p, i) => converter.toDb('param', p));
```

**Problem:** Using literal `'param'` as the column name won't work with the `lookupType` function which expects actual column names.

**Recommendation:** The converter should be applied per-column, not generically. The driver should map each param to its column name during conversion.

---

## What's Good

1. **Comprehensive dialect interface** — `param()`, `now()`, `mapColumnType()`, feature flags all correctly abstract differences
2. **Feature guards for unsupported operations** — Array and JSONB operators now throw clear errors on SQLite
3. **Value conversion layer properly scoped** — Uses existing `tables` parameter from `createDb()`
4. **Migration scope appropriately limited** — CREATE TABLE only for v0.1 is honest about SQLite limitations
5. **D1 driver correctly uses .run() for writes** — The v1 concern about .all() for everything is resolved
6. **Test plan is thorough** — 46 tests covering dialect, builders, value conversion, driver, and createDb
7. **Backward compatibility strategy** — Default dialect parameter ensures existing code works unchanged
8. **Clear implementation phases** — 5 phases with reasonable estimates

---

## Recommendations

1. **Update SQL builder files first** — Before implementing the driver, refactor `where.ts`, `insert.ts`, etc. to accept `dialect` parameter
2. **Add dialect to buildOperatorCondition** — Thread dialect through the entire call chain
3. **Test JSONB path on D1** — Verify the error message is clear when JSONB syntax is used on SQLite
4. **Document the createDb() change** — This is a minor breaking change for TypeScript (new optional fields) but not runtime breaking
