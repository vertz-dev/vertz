# db-019: Type error quality + diagnostic export

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 7: Integration Tests + Polish
- **Estimate:** 16 hours
- **Blocked by:** db-005, db-010
- **Blocks:** none

## Description

Implement type error quality improvements: branded types for human-readable error messages, the `@vertz/db/diagnostic` export, and structured runtime error messages.

Reference: `plans/db-design.md` Section 1.9; roadmap C19, decision #7

### Branded types for error messages:
- When a developer passes the wrong type to a query, the TypeScript error should include the table name and expected type
- Example: "Expected type 'string' for column 'users.email', got 'number'"
- Branded types on column references to carry context

### `@vertz/db/diagnostic` export:
- Utility for explaining common type errors
- Helps LLMs and developers understand what went wrong
- Maps error codes to human-readable explanations

### Runtime error quality:
- All DbError messages include table name, column name, and constraint name
- Error messages are actionable (tell the developer what to fix)
- LLM-friendly formatting (structured, searchable)

## Acceptance Criteria

- [ ] Type errors include context about which table/column is involved
- [ ] Branded types prevent accidental cross-table type mixing
- [ ] `@vertz/db/diagnostic` export exists with explanations for common errors
- [ ] All runtime DbError messages include table name
- [ ] Constraint violation errors include the constraint name and violating value
- [ ] Error messages are actionable (not just "constraint violated" but "email 'a@b.com' already exists in users")
- [ ] Type-level test: branded types prevent mixing columns from different tables
- [ ] Integration test: error messages contain table and column context

## Progress

