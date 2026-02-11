# db-005: Type inference engine (FindResult, InsertInput, UpdateInput, filters)

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 1: Schema Layer + Type Inference
- **Estimate:** 24 hours
- **Blocked by:** db-001, db-002, db-003
- **Blocks:** db-010, db-011

## Description

Implement the type inference layer that powers all query type safety: `FindResult`, `InsertInput`, `UpdateInput`, filter types, and orderBy types.

Reference: `plans/db-design.md` Section 6 (Type Flow Map); roadmap C12 (type optimization constraints)

### Type inference targets:
- `FindResult<Table, Options>` with select narrowing and include resolution
- `SelectNarrow<TColumns, TSelect>` -- narrows result to selected fields
- `IncludeResolve<TRelations, TInclude>` -- resolves relation includes (depth-2 cap)
- `FilterType<TColumns>` -- typed where filters with all operators (eq, gt, lt, contains, in, etc.)
- `OrderByType<TColumns>` -- constrained to column names with `'asc' | 'desc'`
- `Database<TTables>` type that carries the full table registry

### Optimization constraints (from POC 1 / Ben's review):
- Use interfaces over type aliases for TableDef
- Avoid `infer` keyword in hot paths
- Pre-compute visibility types eagerly at table definition time
- Cap default include depth at 2
- Use branded types for table identity

### `select: { not }` mutual exclusivity:
- `{ not: 'sensitive' }` and explicit field selection are mutually exclusive at the type level

## Acceptance Criteria

- [ ] `FindResult<Table, { select: { id: true, name: true } }>` narrows to `Pick<T, 'id' | 'name'>`
- [ ] `FindResult<Table, { include: { author: true } }>` adds `{ author: User }` to result
- [ ] `FindResult<Table, { include: { author: { select: { name: true } } } }>` narrows included relation
- [ ] `FindResult<Table, { select: { not: 'sensitive' } }>` excludes sensitive columns
- [ ] `FilterType` constrains filter values to match column types (string column -> string filter value)
- [ ] `OrderByType` constrains keys to column names only
- [ ] `InsertInput` makes defaulted columns optional
- [ ] `UpdateInput` makes all columns partial, excludes PK
- [ ] Include depth capped at 2 by default
- [ ] `select: { not: 'sensitive', id: true }` produces a type error
- [ ] Type-level test (.test-d.ts): all 15 type flow paths from design doc Section 6.2
- [ ] Type-level test: @ts-expect-error on wrong column name in where
- [ ] Type-level test: @ts-expect-error on wrong type in filter value
- [ ] Type-level test: @ts-expect-error on combining `not` with explicit select

## Progress

