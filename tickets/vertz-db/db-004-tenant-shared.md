# db-004: d.tenant() and .shared() metadata primitives

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 1: Schema Layer + Type Inference
- **Estimate:** 4 hours
- **Blocked by:** db-001, db-002
- **Blocks:** db-007

## Description

Implement `d.tenant(targetTable)` as a metadata-only column type and `.shared()` as a table annotation. Both are metadata-only in v1 -- no runtime enforcement.

Reference: `plans/db-design.md` Section 1.5, 1.6; roadmap decisions #3, #12, #13

### `d.tenant(targetTable)`:
- Creates a `uuid` foreign key column pointing to `targetTable.id`
- Sets `isTenant: true` metadata on the column
- Runtime behavior in v1: metadata only -- no WHERE injection, no query modification

### `.shared()`:
- Chainable on `d.table()` result
- Sets `isShared: true` metadata on the table
- Suppresses the "missing tenant path" startup notice

## Acceptance Criteria

- [ ] `d.tenant(orgs)` creates a UUID column with FK metadata pointing to target table
- [ ] `d.tenant()` column carries `isTenant: true` in metadata
- [ ] `d.tenant()` column infers as `string` (UUID type)
- [ ] `.shared()` sets `isShared: true` on table metadata
- [ ] `.shared()` is chainable after `d.table()` and returns a valid TableDef
- [ ] Integration test: d.tenant() metadata is accessible from table definition
- [ ] Integration test: .shared() metadata is accessible from table definition

## Progress

