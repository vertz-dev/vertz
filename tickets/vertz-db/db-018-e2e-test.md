# db-018: Full E2E acceptance test

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 7: Integration Tests + Polish
- **Estimate:** 16 hours
- **Blocked by:** db-010, db-011, db-012, db-016, db-017
- **Blocks:** none

## Description

Implement the complete E2E acceptance test from the design doc (Section 7). This is the ultimate success criterion for v1.0.

Reference: `plans/db-design.md` Section 7

### Test coverage:
- Schema definition (organizations, users, posts, comments, featureFlags)
- Type inference assertions ($infer, $not_sensitive, $insert with @ts-expect-error)
- CRUD operations (create, find, findMany, update, delete)
- Relation includes (findMany with author include)
- Select narrowing (compile-time type safety)
- Visibility filter (select: { not: 'sensitive' })
- Filter operators (gte, in, contains)
- findManyAndCount
- Error handling (UniqueConstraintError, ForeignKeyError, NotFoundError)
- SQL escape hatch (sql tagged template)
- Tenant graph computation

### Performance validation:
- Run `tsc --extendedDiagnostics` with the test schema
- Confirm type instantiations remain under 100k budget

## Acceptance Criteria

- [ ] Complete E2E test from design doc Section 7 passes
- [ ] All type inference assertions correct (positive and negative tests)
- [ ] CRUD cycle works end-to-end
- [ ] Relation includes load correct data
- [ ] Select narrowing enforced at compile time
- [ ] Visibility filter excludes sensitive columns
- [ ] All filter operators produce correct query results
- [ ] findManyAndCount returns correct count + data
- [ ] UniqueConstraintError, ForeignKeyError, NotFoundError thrown correctly
- [ ] SQL escape hatch executes and returns typed results
- [ ] Tenant graph computed correctly at startup
- [ ] `tsc --extendedDiagnostics` stays under 100k instantiations

## Progress

