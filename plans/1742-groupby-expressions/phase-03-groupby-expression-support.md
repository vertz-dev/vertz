# Phase 3: groupBy() Expression Support + Integration Tests

## Context

This is phase 3 of #1742. Phase 1 created expression types and builders. Phase 2 made `GroupByArgs` strongly typed. This phase wires expressions into the actual `groupBy()` SQL generation, updates `orderBy` validation, adds alias collision detection, SQLite dialect guard, and writes integration tests against PGlite.

Design doc: `plans/1742-groupby-expressions.md`

## Tasks

### Task 1: Update groupBy() to handle GroupByExpression in the `by` array

**Files:**
- `packages/db/src/query/aggregate.ts` (modified — update `groupBy` function)
- `packages/db/src/query/__tests__/aggregate.test.ts` (modified — add expression tests)

**What to implement:**

Modify the `groupBy()` function to handle `GroupByExpression` items in the `by` array:

1. **SELECT + GROUP BY generation** (lines 179-188):
   - For string items: existing path (`camelToSnake` + quote)
   - For `GroupByExpression` items: use `expr.sql` in GROUP BY, use `${expr.sql} AS "${expr.alias}"` in SELECT

2. **Alias collision detection**: Before generating SQL, collect all aliases (column names + expression aliases). If duplicates exist, throw with a descriptive error.

3. **Result mapping** (lines 296-303):
   - For string items: existing path (`result[col] = row[col] ?? row[snakeCol]`)
   - For `GroupByExpression` items: `result[expr.alias] = row[expr.alias]`

The function signature stays as `groupBy(queryFn, table, options: GroupByArgs)` — the internal function accepts the untyped version. Type checking happens at the `ModelDelegate` level.

**Acceptance criteria:**
- [ ] `groupBy({ by: [d.fn.date('clickedAt')], _count: true })` produces correct SQL: `SELECT DATE("clicked_at") AS "dateClickedAt", COUNT(*) AS "_count" FROM "clicks" GROUP BY DATE("clicked_at")`
- [ ] `groupBy({ by: ['urlId', d.fn.date('clickedAt')], _count: true })` — mixed columns and expressions work
- [ ] Result rows contain expression alias keys in camelCase (`dateClickedAt`)
- [ ] Result rows contain column keys in camelCase (`urlId`)
- [ ] Duplicate alias detection throws descriptive error
- [ ] All existing groupBy tests still pass (no regression)

---

### Task 2: Update orderBy validation for expression aliases

**Files:**
- `packages/db/src/query/aggregate.ts` (modified — update orderBy section)
- `packages/db/src/query/__tests__/aggregate.test.ts` (modified — add orderBy expression tests)

**What to implement:**

Update the `orderBy` validation block (lines 232-278) to recognize expression aliases:

1. Build `validExprAliases` map from expression items in `by`: `Map<string, string>` mapping `alias → sql` (e.g., `"dateClickedAt" → "DATE(\"clicked_at\")"`)
2. In the orderBy loop, add a check BEFORE the column name fallback:
   ```
   if (col === '_count') { ... }                    // existing
   else if (col.startsWith('_')) { ... }             // existing — agg aliases
   else if (validExprAliases.has(col)) {             // NEW — expression aliases
     orderClauses.push(`${validExprAliases.get(col)} ${safeDir}`);
   }
   else { ... }                                      // existing — column names
   ```
3. Expression aliases in ORDER BY use the expression's SQL directly (not the alias), because PostgreSQL requires the actual expression or position in ORDER BY for computed columns.

**Acceptance criteria:**
- [ ] `orderBy: { dateClickedAt: 'desc' }` with `by: [d.fn.date('clickedAt')]` produces `ORDER BY DATE("clicked_at") DESC`
- [ ] `orderBy: { dateTruncHourClickedAt: 'asc' }` with dateTrunc expression works
- [ ] `orderBy` with mix of expression alias and column name works
- [ ] `orderBy` with mix of expression alias and `_count` works
- [ ] Invalid expression alias (not in `by` array) still goes through column name path (existing behavior)

---

### Task 3: SQLite dialect guard + full integration tests

**Files:**
- `packages/db/src/query/aggregate.ts` (modified — add dialect check)
- `packages/db/src/query/__tests__/aggregate.test.ts` (modified — integration tests)

**What to implement:**

1. **SQLite dialect guard**: At the start of `groupBy()`, if any expression in `by` uses `date_trunc` or `EXTRACT` (check by inspecting `expr.sql`), and the dialect is SQLite, throw:
   ```
   "date_trunc expressions are not supported on SQLite. Use db.query(sql`...`) for dialect-specific SQL."
   ```
   Note: `DATE()` works on both PostgreSQL and SQLite, so no guard needed for `d.fn.date()`.

   Implementation approach: Add an optional `dialect` parameter to the `groupBy()` function (or pass it via a context object). The `ModelDelegate` layer already knows the dialect from the database config.

2. **Full integration tests against PGlite** covering the E2E acceptance test from the design doc:
   - Group by `d.fn.date()` with `_count` and `orderBy`
   - Group by `d.fn.dateTrunc('hour', ...)` with `_count`
   - Group by `d.fn.extract('month', ...)` with `_count`
   - Mix columns and expressions
   - `expr.alias` access pattern
   - Multiple expressions in same `by` array
   - Expressions with aggregation functions (`_avg`, `_sum`)
   - Expressions with `where` clause

**Acceptance criteria:**
- [ ] Integration test: clicks grouped by `DATE(clicked_at)` returns correct dates and counts
- [ ] Integration test: clicks grouped by `date_trunc('hour', clicked_at)` returns correct hourly buckets
- [ ] Integration test: clicks grouped by `EXTRACT(month FROM clicked_at)` returns correct month numbers
- [ ] Integration test: mixed `['urlId', d.fn.date('clickedAt')]` returns both column and expression values
- [ ] Integration test: `orderBy` with expression alias produces correctly ordered results
- [ ] Integration test: expressions with `_sum` / `_avg` aggregation
- [ ] SQLite dialect guard throws descriptive error for `dateTrunc` expressions
- [ ] SQLite dialect guard throws descriptive error for `extract` expressions
- [ ] SQLite dialect guard allows `date` expressions (DATE() works on SQLite)
- [ ] Coverage: 95%+ on `expression.ts` and modified lines in `aggregate.ts`
- [ ] Quality gates pass: `vtz test && vtz run typecheck && vtz run lint`
