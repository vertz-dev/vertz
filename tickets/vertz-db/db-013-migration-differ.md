# db-013: Migration differ + JSON snapshot format

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 5: Migration Differ + Runner
- **Estimate:** 28 hours
- **Blocked by:** db-010
- **Blocks:** db-014, db-015

## Description

Implement the custom migration differ: JSON snapshot format, schema diff algorithm, and rename detection.

Reference: `plans/db-design.md` Section 1.10; `plans/db-implementation.md` Phase 5

### JSON snapshot format:
- Version-stamped (`"version": 1`)
- Tables: columns (type, nullable, default, primary, unique, sensitive, hidden), indexes, foreign keys
- Enums: name -> values
- `_metadata` extensibility field for future RLS/tenant data
- Serialization/deserialization

### Diff algorithm:
- Compare two snapshots and produce a change list
- Change types: table_added, table_removed, column_added, column_removed, column_altered, index_added, index_removed, constraint_added, constraint_removed, enum_added, enum_removed, enum_altered
- Detect column type changes, nullable changes, default changes

### Rename detection:
- Heuristic: match by column type + constraints
- When a column disappears and a new column of the same type appears, suggest rename
- Confidence scoring
- Interactive CLI prompt for confirmation (in db-016)

## Acceptance Criteria

- [ ] Snapshot captures full schema state (tables, columns, indexes, FKs, enums)
- [ ] Snapshot format includes extensibility `_metadata` field
- [ ] Differ detects table additions and removals
- [ ] Differ detects column additions, removals, and alterations
- [ ] Differ detects index additions and removals
- [ ] Differ detects enum additions, removals, and alterations
- [ ] Rename detector suggests column renames with confidence scores
- [ ] Snapshot serializes to and deserializes from JSON correctly
- [ ] Integration test: diff between empty and full schema lists all table additions
- [ ] Integration test: diff between two schema versions detects added column

## Progress

