## Code Review: PR #493 (as ben, Tech Lead)

### ✅ Overall
Solid Phase 3 implementation. The architecture is clean and the approach is sound. A few items need attention before merging.

---

### 1. DbDriver Interface — ✅ MINIMAL & CORRECT

The interface is clean and minimal:
- `query<T>(sql, params) → Promise<T[]>`
- `execute(sql, params) → Promise<{ rowsAffected: number }>`
- `close() → Promise<void>`

**Recommendation:** Add JSDoc for the return types to clarify expected shapes. Otherwise, 👍.

---

### 2. Value Conversion — ⚠️ EDGE CASES TO ADDRESS

**`toSqliteValue`** — ✅ Handles core types:
- `true → 1`, `false → 0`, `Date → ISO string`
- Missing: `null` remains `null` (correct), `undefined` is not handled

**`fromSqliteValue`** — ⚠️ **CRITICAL GAP:**
```
export function fromSqliteValue(value: unknown, columnType: string): unknown
```
The `columnType` parameter is problematic:
- **D1 doesn't return column type metadata** in query results
- Callers have no reliable way to know the column type at runtime
- This function will likely never be usable as-is

**Recommended fix:**
- Option A: Remove `fromSqliteValue` from this PR (defer to Phase 4/5 with schema introspection)
- Option B: Have the driver track column types from table definitions and apply conversion internally

---

### 3. createDb Validation — ✅ THOROUGH

```typescript
if (dialect === 'sqlite') {
  if (!options.d1) {
    throw new Error('SQLite dialect requires a D1 binding');
  }
  if (options.url) {
    throw new Error('SQLite dialect uses D1, not a connection URL');
  }
}
```

Clear errors, good coverage. ✅

---

### 4. Dialect Threading — ✅ ALL CRUD PATHS COVERED

All 12 CRUD functions in `crud.ts` accept `dialect` parameter:

| Function | Dialect Passed To |
|----------|-------------------|
| get | buildSelect |
| getOrThrow | buildSelect |
| list | buildSelect |
| listAndCount | buildSelect |
| create | buildInsert |
| createMany | buildInsert |
| createManyAndReturn | buildInsert |
| update | buildUpdate |
| updateMany | buildUpdate |
| upsert | buildInsert |
| deleteOne | buildDelete |
| deleteMany | buildDelete |

Each has `dialect: Dialect = defaultPostgresDialect` default. ✅

---

### 5. Minor Suggestions

1. **Test coverage** — The PR adds 20 new tests (10 + 5 + 5). Consider adding:
   - Integration test for dialect routing (SQLite vs Postgres in same test suite)
   - Edge case: `undefined` in `toSqliteValue`

2. **Export cleanup** — `sqlite-value-converter.ts` exports both converter functions AND the driver. Consider splitting into separate files or at least adding barrel exports.

3. **Missing from PR body** — The SQL builder option interfaces (`SelectOptions`, `InsertOptions`, etc.) should explicitly show the `dialect` property in their JSDoc for visibility.

---

### 📋 Verdict

**Request changes** — The `fromSqliteValue` function needs a plan. Either remove it or implement the column-type tracking in the driver.

Once resolved: **Approved.**

---
*Review by ben (Tech Lead)*
