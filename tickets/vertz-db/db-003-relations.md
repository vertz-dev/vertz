# db-003: Relation definitions (one, many, through)

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 1: Schema Layer + Type Inference
- **Estimate:** 12 hours
- **Blocked by:** db-001, db-002
- **Blocks:** db-005, db-011

## Description

Implement relation definition API: `d.ref.one()`, `d.ref.many()`, and `d.ref.many().through()`.

Reference: `plans/db-design.md` Section 1.4

### Relation types:
- `d.ref.one(() => table, foreignKey)` -- belongsTo (many-to-one)
- `d.ref.many(() => table, foreignKey)` -- hasMany (one-to-many)
- `d.ref.many(() => table).through(() => joinTable, thisKey, thatKey)` -- manyToMany

### Key requirements:
- Lazy references (`() => table`) to avoid circular dependency issues
- Relations carry type information for the target table
- Relations are stored in `TableDef.relations` metadata
- Relation type metadata flows into `FindResult` for typed `include`

## Acceptance Criteria

- [ ] `d.ref.one()` creates a belongsTo relation with correct metadata
- [ ] `d.ref.many()` creates a hasMany relation with correct metadata
- [ ] `d.ref.many().through()` creates a manyToMany relation with correct metadata
- [ ] Lazy references resolve correctly (no circular dependency issues)
- [ ] Relation metadata includes: type ('one' | 'many'), target table, foreign key, through table (if applicable)
- [ ] Type-level test: include with a relation resolves to the correct target type
- [ ] Type-level test: @ts-expect-error on including a non-existent relation name

## Progress

