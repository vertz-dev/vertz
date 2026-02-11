# db-006: Typed error hierarchy + PostgreSQL error parser

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 2: Error Hierarchy + Connection Management
- **Estimate:** 12 hours
- **Blocked by:** db-002
- **Blocks:** db-007, db-010

## Description

Implement the independent `DbError` hierarchy with structured metadata, the PostgreSQL error code parser, and the `@vertz/core` adapter.

Reference: `plans/db-design.md` Section 1.9; roadmap C2, decision #1

### Error classes:
- Abstract `DbError` base with `code`, `name`, `query`, `table`, `toJSON()`
- `UniqueConstraintError` (23505) with `column`, `value`
- `ForeignKeyError` (23503) with `constraint`, `detail`
- `NotNullError` (23502) with `column`
- `CheckConstraintError` (23514) with `constraint`
- `NotFoundError`
- `ConnectionError`
- `ConnectionPoolExhaustedError`

### PostgreSQL error code parser (~80 lines):
- Maps PG error codes to typed `DbError` subclasses
- Extracts column name, constraint name, and detail from PG error messages
- Human-readable error message formatting

### `@vertz/core` adapter:
- `dbErrorToHttpError()` maps DbError -> VertzException
- UniqueConstraintError -> 409 Conflict
- NotFoundError -> 404 Not Found
- ConnectionError -> 503 Service Unavailable

## Acceptance Criteria

- [ ] All DbError subclasses extend DbError abstract base
- [ ] `toJSON()` produces `{ error, code, message, table?, column? }`
- [ ] PG error code 23505 maps to UniqueConstraintError with extracted column name
- [ ] PG error code 23503 maps to ForeignKeyError with extracted constraint name
- [ ] PG error code 23502 maps to NotNullError with extracted column name
- [ ] Error messages include table name and column name (actionable)
- [ ] `dbErrorToHttpError()` maps all error types to correct HTTP status codes
- [ ] Integration test: PG error parsing extracts structured metadata

## Progress

