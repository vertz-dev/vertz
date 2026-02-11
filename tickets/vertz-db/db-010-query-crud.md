# db-010: Query builder CRUD methods (find, create, update, delete)

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 4: Query Builder + Relations
- **Estimate:** 24 hours
- **Blocked by:** db-005, db-006, db-008, db-009
- **Blocks:** db-011, db-012

## Description

Implement all CRUD query methods on the `Database` instance with full type safety.

Reference: `plans/db-design.md` Section 1.7

### Find queries:
- `db.find(table, options)` -> `T | null`
- `db.findOneOrThrow(table, options)` -> `T` (throws NotFoundError)
- `db.findMany(table, options)` -> `T[]` with limit/offset + cursor pagination
- `db.findManyAndCount(table, options)` -> `{ data: T[], total: number }`

### Mutation queries:
- `db.create(table, { data })` -> `T` (INSERT + RETURNING)
- `db.createMany(table, { data })` -> `{ count: number }`
- `db.createManyAndReturn(table, { data })` -> `T[]`
- `db.update(table, { where, data })` -> `T` (UPDATE + RETURNING)
- `db.updateMany(table, { where, data })` -> `{ count: number }`
- `db.upsert(table, { where, create, update })` -> `T`
- `db.delete(table, { where })` -> `T` (DELETE + RETURNING)
- `db.deleteMany(table, { where })` -> `{ count: number }`

### Key requirements:
- All methods use the SQL builders from db-008
- Error handling maps PG errors to typed DbError (from db-006)
- Results mapped through casing conversion
- select option narrows return type

## Acceptance Criteria

- [ ] `db.find()` returns typed result or null
- [ ] `db.findOneOrThrow()` throws NotFoundError when no match
- [ ] `db.findMany()` returns array with pagination support
- [ ] `db.findManyAndCount()` returns `{ data, total }` in a single query
- [ ] `db.create()` inserts and returns the created row
- [ ] `db.createMany()` batch inserts and returns `{ count }`
- [ ] `db.createManyAndReturn()` batch inserts and returns all rows
- [ ] `db.update()` updates and returns the updated row
- [ ] `db.upsert()` creates or updates correctly
- [ ] `db.delete()` deletes and returns the deleted row
- [ ] select option narrows the return type at compile time
- [ ] UniqueConstraintError thrown on duplicate key violation
- [ ] ForeignKeyError thrown on invalid FK reference
- [ ] Integration test: full CRUD cycle (create, find, update, delete)

## Progress

