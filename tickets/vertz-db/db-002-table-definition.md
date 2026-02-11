# db-002: Table definition and derived types ($infer, $insert, $update)

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 1: Schema Layer + Type Inference
- **Estimate:** 16 hours
- **Blocked by:** db-001
- **Blocks:** db-003, db-004, db-005

## Description

Implement `d.table()` with full type inference and derived type helpers (`$infer`, `$insert`, `$update`).

Reference: `plans/db-design.md` Section 1.2, 1.3

### `d.table(name, columns, options?)`:
- Accepts column definitions from db-001
- Options: `relations` (db-003), `indexes`
- Returns `TableDef<TColumns>` interface with type inference

### Derived types:
- `$infer` -- all columns mapped to their TypeScript types
- `$insert` -- columns with `.default()` become optional, primary key with default is optional
- `$update` -- all columns become `Partial<>`, primary key excluded
- `$not_sensitive` -- excludes `.sensitive()` columns
- `$not_hidden` -- excludes `.hidden()` columns

### Index definitions:
- `d.index(column)` or `d.index([col1, col2])` for composite indexes

## Acceptance Criteria

- [ ] `d.table()` returns a `TableDef` with correctly inferred column types
- [ ] `$infer` includes all columns with correct types
- [ ] `$insert` makes columns with `.default()` optional
- [ ] `$insert` makes columns with `.primary().default()` optional (like auto-generated UUIDs)
- [ ] `$update` makes all columns partial and excludes primary key
- [ ] `$not_sensitive` excludes `.sensitive()` columns
- [ ] `$not_hidden` excludes `.hidden()` columns (and `.sensitive()`)
- [ ] Table carries column metadata (types, constraints, visibility)
- [ ] `d.index()` stores index metadata on the table definition
- [ ] Type-level test (.test-d.ts): $infer has all fields
- [ ] Type-level test (.test-d.ts): $insert makes defaulted fields optional
- [ ] Type-level test (.test-d.ts): @ts-expect-error on $not_sensitive having sensitive field

## Progress

