# db-001: Column type primitives and chainable builders

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 1: Schema Layer + Type Inference
- **Estimate:** 16 hours
- **Blocked by:** none
- **Blocks:** db-002, db-003, db-004, db-005

## Description

Implement all column type primitives in the `d` namespace and the chainable builder methods. This is the foundation of the schema definition API.

Reference: `plans/db-design.md` Section 1.2

### Column types to implement:
`d.uuid()`, `d.text()`, `d.varchar(n)`, `d.email()`, `d.boolean()`, `d.integer()`, `d.bigint()`, `d.decimal(p, s)`, `d.real()`, `d.doublePrecision()`, `d.serial()`, `d.timestamp()`, `d.date()`, `d.time()`, `d.jsonb<T>()`, `d.textArray()`, `d.integerArray()`, `d.enum(name, values)`

### Chainable builders:
`.primary()`, `.unique()`, `.nullable()`, `.default(value)`, `.sensitive()`, `.hidden()`, `.check(sql)`, `.references(table, column?)`

### `JsonbValidator<T>` interface:
`{ parse(value: unknown): T }` -- generic interface for runtime JSONB validation

## Acceptance Criteria

- [ ] Every column type primitive is implemented and infers the correct TypeScript type
- [ ] Chainable builders modify column metadata correctly
- [ ] `.nullable()` adds `| null` to the inferred type
- [ ] `.default(value)` marks column as having a default in metadata
- [ ] `.sensitive()` and `.hidden()` set visibility metadata
- [ ] `d.jsonb<T>({ validator })` accepts any `{ parse(value: unknown): T }` implementation
- [ ] `d.enum(name, values)` infers union literal type from the values array
- [ ] Type-level test (.test-d.ts): `d.uuid()` -> `string`, `d.boolean()` -> `boolean`, `d.integer()` -> `number`, `d.timestamp()` -> `Date`
- [ ] Type-level test (.test-d.ts): `.nullable()` adds `| null`
- [ ] Type-level test (.test-d.ts): `d.enum('role', ['admin', 'editor'])` -> `'admin' | 'editor'`
- [ ] Type-level test (.test-d.ts): `@ts-expect-error` on using wrong type with column

## Progress

