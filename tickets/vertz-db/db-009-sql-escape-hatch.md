# db-009: SQL escape hatch (sql tagged template + sql.raw)

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 3: SQL Generator
- **Estimate:** 16 hours
- **Blocked by:** db-008
- **Blocks:** db-010

## Description

Implement the SQL escape hatch: `sql` tagged template literal with automatic parameterization, and `sql.raw()` for trusted dynamic SQL.

Reference: `plans/db-design.md` Section 1.8

### sql tagged template:
- Tagged template that automatically parameterizes interpolated values
- Returns `{ sql: string, params: unknown[] }` with `$1, $2, ...` placeholders
- Composable: sql fragments can be nested inside other sql templates

### sql.raw():
- For trusted dynamic SQL that should NOT be parameterized
- Returns a fragment that is inserted directly into the SQL string
- Must be documented as unsafe -- only for trusted input (column names, table names)

### CTE support:
- sql template supports WITH ... AS (...) common table expressions
- Window functions compose naturally through the tagged template

### db.query<T>():
- Execute raw SQL via `db.query<T>(sql`...`)`
- Returns typed result array

## Acceptance Criteria

- [ ] `sql` tagged template parameterizes interpolated values as `$1, $2, ...`
- [ ] `sql.raw()` inserts raw SQL without parameterization
- [ ] Nested sql templates compose correctly (fragment inside fragment)
- [ ] `db.query<T>()` executes raw SQL and returns typed results
- [ ] CTE syntax works through the tagged template
- [ ] Integration test: sql template with parameterized values executes correctly
- [ ] Integration test: sql.raw() inserts raw SQL correctly
- [ ] Integration test: CTE query executes and returns results

## Progress

