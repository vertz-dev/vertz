# db-012: Aggregation queries (count, aggregate, groupBy)

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 4: Query Builder + Relations
- **Estimate:** 12 hours
- **Blocked by:** db-010
- **Blocks:** db-018

## Description

Implement aggregation query methods: count, aggregate, and groupBy.

Reference: `plans/db-design.md` Section 1.7

### Methods:
- `db.count(table, { where? })` -> `number`
- `db.aggregate(table, { _avg, _sum, _min, _max, _count, where? })` -> typed aggregate result
- `db.groupBy(table, { by, _count?, _avg?, orderBy? })` -> array of grouped results

### Type inference:
- `aggregate` return type is derived from the requested aggregation fields
- `groupBy` return type includes the grouped columns plus any aggregations

## Acceptance Criteria

- [ ] `db.count()` returns correct count as number
- [ ] `db.count()` respects where filter
- [ ] `db.aggregate()` computes _avg, _sum, _min, _max correctly
- [ ] `db.aggregate()` result is typed based on requested aggregations
- [ ] `db.groupBy()` groups by specified columns
- [ ] `db.groupBy()` includes aggregation results per group
- [ ] `db.groupBy()` respects orderBy on aggregation results
- [ ] Integration test: count with filter returns correct number
- [ ] Integration test: aggregate computes averages correctly
- [ ] Integration test: groupBy groups and counts correctly

## Progress

