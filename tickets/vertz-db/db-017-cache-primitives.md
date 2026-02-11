# db-017: Cache-readiness primitives + plugin runner

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 6: CLI + Cache-Readiness Primitives
- **Estimate:** 8 hours
- **Blocked by:** db-010
- **Blocks:** db-018

## Description

Implement the five cache-readiness primitives and the plugin runner.

Reference: `plans/db-design.md` Section 8, 1.12; `plans/db-implementation.md` Phase 6

### Cache-readiness primitives:
1. **Mutation event bus** (`db.$events`) -- emit `{ type, table, data }` on every create/update/delete
2. **Deterministic query fingerprinting** -- stable hash from query shape (table + operation + where keys + select + include), same shape = same fingerprint regardless of parameter values
3. **Result metadata** -- `$meta: { queryTime, rowCount, fingerprint }` attached to query results
4. **Relation invalidation graph** -- computed at `createDb()` time, maps which tables are connected by relations

### Plugin runner:
- Execute `beforeQuery` / `afterQuery` hooks on registered plugins
- Ordering: first non-undefined `beforeQuery` return wins
- Plugins marked `@experimental`

## Acceptance Criteria

- [ ] Mutation event bus emits events on create, update, delete
- [ ] Event includes type ('create' | 'update' | 'delete'), table name, and data
- [ ] Query fingerprint is deterministic (same shape -> same hash)
- [ ] Query fingerprint ignores parameter values (only shape matters)
- [ ] Result metadata includes queryTime, rowCount, fingerprint
- [ ] Relation invalidation graph maps table connections
- [ ] Plugin `beforeQuery` hook is called before query execution
- [ ] Plugin `afterQuery` hook is called after query execution
- [ ] "First non-undefined return wins" ordering for beforeQuery
- [ ] Integration test: event bus emits on mutation
- [ ] Integration test: fingerprint stability for same query shape

## Progress

