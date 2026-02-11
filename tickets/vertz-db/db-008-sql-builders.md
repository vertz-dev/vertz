# db-008: SQL statement builders (SELECT, INSERT, UPDATE, DELETE)

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 3: SQL Generator
- **Estimate:** 32 hours
- **Blocked by:** db-007
- **Blocks:** db-009, db-010

## Description

Implement SQL statement generation for all query types with automatic parameter binding and casing conversion.

Reference: `plans/db-implementation.md` Phase 3

### SQL builders:
- **SELECT builder:** column selection, aliasing for casing, table name, LIMIT/OFFSET
- **INSERT builder:** single row, batch insert (multi-row VALUES), RETURNING, ON CONFLICT (for upsert)
- **UPDATE builder:** SET clause from data object, WHERE, RETURNING
- **DELETE builder:** WHERE, RETURNING
- **WHERE builder:** all filter operators -- eq, gt, lt, gte, lte, ne, contains, startsWith, endsWith, in, notIn, isNull, isNotNull, NOT, OR, AND, relation filters (subquery)
- **ORDER BY builder:** column names + direction (asc/desc)
- **Parameter binding:** automatic `$1, $2, ...` parameterization for SQL injection prevention
- **Casing:** automatic camelCase <-> snake_case bidirectional conversion

### PostgreSQL-specific:
- JSONB operators (`->`, `->>`)
- Array operators (`@>`, `<@`, `&&`)
- `COUNT(*) OVER()` window function for findManyAndCount

## Acceptance Criteria

- [ ] SELECT builder generates correct SQL with column selection, WHERE, ORDER BY, LIMIT
- [ ] INSERT builder generates INSERT with RETURNING and parameterized values
- [ ] UPDATE builder generates UPDATE SET ... WHERE ... RETURNING
- [ ] DELETE builder generates DELETE WHERE ... RETURNING
- [ ] WHERE builder handles all filter operators (13+ operators)
- [ ] WHERE builder handles nested OR/AND/NOT logical operators
- [ ] Batch INSERT generates multi-row VALUES clause
- [ ] ON CONFLICT generates upsert SQL
- [ ] Parameter binding prevents SQL injection (all values parameterized)
- [ ] Casing conversion: camelCase TS field names -> snake_case SQL column names
- [ ] Integration test: generated SQL executes correctly against PGlite

## Progress

