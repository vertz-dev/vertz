---
'@vertz/db': minor
---

Initial release of @vertz/db — a type-safe PostgreSQL ORM.

- Schema definition with `d.table()`, `d.uuid()`, `d.text()`, and 15+ column types
- Full type inference: `$infer`, `$insert`, `$update`, `$not_sensitive`, `$not_hidden`
- Relations: `d.ref.one()`, `d.ref.many()`, `d.ref.many().through()`
- Complete CRUD API: find, findMany, create, update, upsert, delete, and batch variants
- Aggregation: count, aggregate, groupBy
- SQL generation with parameterized queries and camelCase ↔ snake_case conversion
- Migration system: snapshot diffing, SQL generation, runner with history tracking
- CLI functions: migrateDev, migrateDeploy, push, migrateStatus
- Structured error hierarchy: UniqueConstraintError, ForeignKeyError, NotFoundError, etc.
- Cache-readiness primitives: event bus, query fingerprinting, plugin runner (@experimental)
- Diagnostic module: `@vertz/db/diagnostic` for error explanations
- Tenant metadata: `d.tenant()` and `.shared()` annotations
- 491 tests, 35k type instantiations (under 100k budget)
