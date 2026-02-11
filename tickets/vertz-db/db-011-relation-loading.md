# db-011: Relation loading (include with typed results)

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 4: Query Builder + Relations
- **Estimate:** 20 hours
- **Blocked by:** db-003, db-005, db-010
- **Blocks:** db-012

## Description

Implement relation loading via the `include` option on find queries, with full type inference for included relations.

Reference: `plans/db-design.md` Section 1.7; `plans/db-implementation.md` Phase 4

### Include behavior:
- `include: { relation: true }` -- load full relation (all columns)
- `include: { relation: { select: { ... } } }` -- load with field narrowing
- Nested includes up to depth 2 (default cap)
- belongsTo: single object (or null)
- hasMany: array of objects
- manyToMany: array of objects (via join table)

### Loading strategy (v1):
- Separate queries with batching (N+1 prevention via IN queries)
- For each included relation, execute a single query with `WHERE id IN (...)` for all parent rows
- Map results back to parent rows by foreign key

### Type inference:
- `FindResult<Table, { include: { author: true } }>` adds `{ author: User }` to result type
- `FindResult<Table, { include: { author: { select: { name: true } } } }>` narrows included type
- Type error on including non-existent relation name

## Acceptance Criteria

- [ ] `include: { author: true }` loads belongsTo relation and attaches to result
- [ ] `include: { posts: true }` loads hasMany relation as array
- [ ] `include: { tags: true }` loads manyToMany relation via join table
- [ ] Nested select on include narrows the included type
- [ ] Batched loading prevents N+1 (single IN query per relation)
- [ ] Depth-2 nested includes work: `include: { posts: { include: { comments: true } } }`
- [ ] Type-level test: include adds correct relation type to result
- [ ] Type-level test: @ts-expect-error on non-existent relation name
- [ ] Integration test: findMany with include loads correct related data

## Progress

