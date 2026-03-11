# Adversarial Review: VertzQL Relation Queries (#1130)

- **Reviewer:** claude-opus-4-6 (adversarial)
- **Branch:** `feat/vertzql-relation-queries` vs `origin/main`
- **Commits:** fe5c9c32..181ec812 (8 commits)
- **Date:** 2026-03-10

---

## Critical (Must Fix)

### C1. `userWhere` can overwrite the batch FK/PK `IN` clause — silent data leak

**Files:** `packages/db/src/query/relation-loader.ts` lines 271-273, 368-370, 557-559

In all three relation loaders (`loadOneRelation`, `loadManyRelation`, `loadManyToManyRelation`), `userWhere` from the include entry is merged via `Object.assign(batchWhere, userWhere)`. If the user provides a `where` key that matches the internal batch key (the FK or PK column name), `Object.assign` will **overwrite** the `IN` clause:

```ts
// batchWhere = { id: { in: ['uuid1', 'uuid2'] } }
// userWhere  = { id: 'attacker-controlled-uuid' }
Object.assign(batchWhere, userWhere);
// result     = { id: 'attacker-controlled-uuid' }  ← IN clause destroyed
```

This means a crafted `where` clause on an include entry can:
1. Load rows from a different parent entirely (data leak across users/tenants).
2. Bypass the batching logic that scopes relation loading to the primary rows.

**Impact:** Security — potential cross-tenant data access. The `validateVertzQL` allowWhere check only validates field names are in the allowlist; if the FK/PK column is in `allowWhere`, the override succeeds silently.

**Fix direction:** Merge so that the batch clause takes precedence, or use an AND combinator instead of `Object.assign`. For example: `{ AND: [batchWhere, userWhere] }`.

### C2. `GLOBAL_RELATION_ROW_LIMIT` is defined but never enforced

**File:** `packages/db/src/query/relation-loader.ts` line 86

The constant `GLOBAL_RELATION_ROW_LIMIT = 10_000` is exported and documented in the design doc as a safety cap, but **no code path uses it**. The batch queries in `loadManyRelation` and `loadManyToManyRelation` have no `LIMIT` clause — they fetch ALL matching rows. If a parent has 100K child rows, they all get loaded into memory.

The design doc explicitly says: "No single relation batch query returns more than 10K rows regardless of parent count x limit." This is not implemented.

**Impact:** DoS — an attacker can craft includes that load unbounded result sets, causing OOM or extreme latency.

### C3. `DEFAULT_RELATION_LIMIT` is defined but never applied

**File:** `packages/db/src/query/relation-loader.ts` line 83

Similar to C2, `DEFAULT_RELATION_LIMIT = 100` is exported but never used. When no `limit` is specified in the include entry and no `maxLimit` is configured, there is no per-parent limit applied at all. The design doc states: "When client omits `limit`, the `maxLimit` cap still applies." and "When a relation is declared as `true`: the framework applies `DEFAULT_RELATION_LIMIT` (100) as the max". Neither is implemented.

**Impact:** Unbounded relation loading for `include: { comments: true }`.

### C4. Relation `where` column names not validated against hidden fields

**File:** `packages/server/src/entity/vertzql-parser.ts` `validateInclude()` lines 261-281

The `validateInclude` function checks `where` field names against `allowWhere`, but when `allowWhere` contains a hidden column name (e.g., the developer accidentally adds `passwordHash` to `allowWhere`), there is no secondary check against the table's hidden fields. The top-level `validateVertzQL` checks `options.where` against hidden columns, but the relation `where` validation only checks against `allowWhere`.

While this is technically a configuration error, the framework should defend against it — the same hidden-field check that protects top-level `where` should also protect relation `where`.

**Impact:** Potential information leak via filtering on hidden fields if misconfigured.

---

## Should Fix

### S1. `orderBy` direction value not validated at the relation include level

**Files:** `packages/server/src/entity/vertzql-parser.ts` `validateInclude()`, `packages/db/src/sql/select.ts` line 126

The `validateInclude` function validates `orderBy` field **names** against `allowOrderBy`, but does not validate the direction **values**. The TypeScript types say `'asc' | 'desc'`, but at runtime the value comes from untrusted JSON. The `buildSelect` function directly interpolates `dir.toUpperCase()` into the SQL string:

```ts
`"${camelToSnake(col, casingOverrides)}" ${dir.toUpperCase()}`
```

If `dir` is anything other than `'asc'` or `'desc'` (e.g., `'asc; DROP TABLE users --'`), it gets injected directly into the ORDER BY clause. While the column name is quoted, the direction value is NOT parameterized.

Note: This is a pre-existing issue in `buildSelect`, not introduced by this PR. But this PR adds a new untrusted data path (`include.*.orderBy`) that flows into it, making the attack surface larger. The PR should at least validate direction values in `validateInclude`.

**Impact:** SQL injection via crafted orderBy direction values.

### S2. `IncludeOption` type in inference.ts lacks `include` (nested includes) field

**File:** `packages/db/src/schema/inference.ts` lines 162-173

The `IncludeOption<TRelations>` type was extended with `where`, `orderBy`, `limit` but does NOT include a nested `include` field. This means the typed DB client (`db.posts.get({ include: { comments: { include: { author: true } } } })`) will get a type error on nested includes, even though the runtime supports them (depth up to 3).

The runtime `IncludeSpec` in `relation-loader.ts` does have `include?: IncludeSpec`, so there is a type/runtime mismatch.

**Impact:** Type gap — users of the typed DB client cannot use nested includes without type assertions.

### S3. Limit clamping mutates the input object

**File:** `packages/server/src/entity/vertzql-parser.ts` lines 308-311

```ts
if (requested.limit > configObj.maxLimit) {
  requested.limit = configObj.maxLimit;
}
```

The `validateInclude` function **mutates** `requested.limit` on the input `VertzQLIncludeEntry` object. This is a side effect in a validation function. The caller's `options.include` object is modified in place, which is surprising for a function named `validate*`. The test at line 2110 even asserts on this mutation:

```ts
expect((options.include!.comments as Record<string, unknown>).limit).toBe(50);
```

This works, but it couples validation and transformation. If `validateVertzQL` is called twice (e.g., in a retry or middleware chain), the second call sees the already-clamped value.

**Impact:** Surprising side effect, maintenance hazard.

### S4. Nested include validation is incomplete — silently passes through

**File:** `packages/server/src/entity/vertzql-parser.ts` lines 326-346

When a relation has a structured config object (not `true`), nested includes are not validated at all — the code has an explicit comment: "This will be fully wired in Phase 3 when the route handler passes the full entity registry. For now, pass through."

This means a client can send deeply nested includes with arbitrary relation names, `where`, `orderBy`, and `limit` values, and they will pass validation and reach the DB layer unvalidated. The only protection is the depth cap in the relation loader.

Combined with C1 (FK override via userWhere), this is a security concern at deeper nesting levels.

**Impact:** Unvalidated nested includes can probe arbitrary relations and filter on any column.

### S5. `limit` on relation includes not validated for negative values or non-integer

**File:** `packages/server/src/entity/vertzql-parser.ts`

The top-level `limit` from URL params is clamped to `[0, MAX_LIMIT]` (line 89), but the `limit` inside include entries (from the `q=` JSON payload or POST body) undergoes NO numeric validation. A negative `limit` (e.g., `limit: -1`) would be passed through to the relation loader, where the check is `if (userLimit !== undefined && userLimit > 0)` — so it would be skipped. But `NaN`, `Infinity`, or non-integer values could cause unexpected behavior downstream.

The maxLimit clamping also only fires when `requested.limit > configObj.maxLimit`, which is `false` for `NaN > 50`.

**Impact:** Edge case — non-numeric or special float values could bypass limit enforcement.

### S6. M2M relations missing per-parent limit

**File:** `packages/db/src/query/relation-loader.ts` `loadManyToManyRelation` function

The `loadManyRelation` function applies per-parent limit (lines 408-416), but `loadManyToManyRelation` does NOT apply per-parent limit at all. The M2M function skips straight from building `targetLookup` to nested includes without any limit slicing.

If a user specifies `limit: 5` on a M2M relation, it is silently ignored.

**Impact:** Inconsistent behavior — `limit` works on hasMany but not M2M.

### S7. `parseVertzQL` does no structural validation on the decoded `q=` JSON

**File:** `packages/server/src/entity/vertzql-parser.ts` lines 138-139

The `q=` parameter is decoded from base64 and cast directly to `Record<string, true | VertzQLIncludeEntry>`. There is no validation that:
- `include` values are actually `true` or objects (could be numbers, strings, arrays)
- `select` values within include entries are actually `Record<string, true>` (could be `Record<string, 'anything'>`)
- `orderBy` values are actually `'asc' | 'desc'`
- `limit` is actually a number

The TypeScript types provide compile-time safety for SDK users, but the `q=` parameter is an HTTP input boundary. Runtime structural validation is absent.

**Impact:** Type confusion — unexpected value types reach internal functions.

---

## Nitpicks

### N1. Duplicate `VertzQLIncludeEntry` interface definition

**Files:** `packages/server/src/entity/vertzql-parser.ts` line 30, `packages/fetch/src/vertzql.ts` line 2

Both files define structurally identical `VertzQLIncludeEntry` interfaces independently. This violates DRY and could diverge over time. Consider sharing via a common types package or re-exporting.

### N2. `AdapterIncludeEntry` is a third duplicate of the same shape

**File:** `packages/db/src/types/adapter.ts` line 8

`AdapterIncludeEntry` in the adapter types is yet another copy of the same include entry shape. Now there are three identical interfaces across three packages.

### N3. Design doc mentions dev-mode warning for limit clamping — not implemented

**File:** `plans/vertzql-relation-queries.md` line in the Validation Errors section

The design doc says: `[dev] "Limit 200 exceeds maxLimit 50 for relation 'comments'; clamped to 50"`. No dev-mode warning logging is implemented anywhere.

### N4. `depth > 3` comment says "max 3" but allows depth 0, 1, 2, 3 (4 levels)

**File:** `packages/db/src/query/relation-loader.ts` line 124

The check `if (depth > 3)` allows depth values 0, 1, 2, 3, which means 4 levels of include nesting. The doc comment says "max 3" which could be interpreted as 3 levels. The tests verify this is intentional (they test depth 0-3 = 4 levels), but the doc/comment could be clearer about "max depth 3 = 4 levels of nesting."

### N5. SQL injection test in `orderBy` tests in relation-loader.test.ts

**File:** `packages/db/src/query/__tests__/relation-loader.test.ts`

The relation-loader tests insert data using raw SQL with string interpolation:
```ts
await pg.exec(`INSERT INTO comments (...) VALUES ('First', '${post.id}', '${user.id}', ...)`);
```

While this is test-only code using trusted data (UUIDs from the test), it sets a bad example. Parameterized queries would be more consistent with the codebase's security posture.

### N6. Changeset says "patch" but includes breaking change

**File:** `.changeset/vertzql-relation-queries.md`

The changeset body explicitly says "Breaking change to EntityRelationsConfig" but uses `patch` severity for all packages. Per project policy (`policies.md`): "Every changeset = patch — never minor/major unless user explicitly says so." This is consistent with policy, but worth noting the breaking change is documented in the changeset body.

---

## Positive Notes

1. **Comprehensive test coverage at the DB integration level.** The relation-loader tests cover `where`, `orderBy`, `limit`, combined usage, depth increase, conditional load on `one` relations, and query budget exhaustion. These are real PGlite integration tests, not mocks.

2. **Type-level tests are thorough.** The `inference.test-d.ts` additions properly test both positive and negative type assertions for `IncludeOption` with `select`, `where`, `orderBy`, and `limit`.

3. **Breaking change is well-documented.** The migration from flat field maps to `{ select: { ... } }` is clearly explained in the design doc with before/after examples, and all existing tests were updated.

4. **Query budget counter is a good safety mechanism.** The mutable `QueryBudget` object passed through recursive calls is a simple and effective way to cap total queries. The test verifying budget exhaustion is solid.

5. **Validation error messages are clear and actionable.** Messages include the relation path (e.g., `'author.organization'`), the offending field name, and the list of allowed fields. This is DX-friendly.

6. **The `where` builder uses parameterized queries throughout.** Column values in `where` clauses are properly parameterized via `$N` placeholders, which protects against SQL injection on filter values. The vulnerability in S1 is specifically about the `orderBy` direction, not the `where` values.
