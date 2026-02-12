# @vertz/db

## 0.2.0

### Minor Changes

- [#160](https://github.com/vertz-dev/vertz/pull/160) [`db53497`](https://github.com/vertz-dev/vertz/commit/db534979df714d51227a34b4d5b80960e34ec33c) Thanks [@vertz-tech-lead](https://github.com/apps/vertz-tech-lead)! - Initial release of @vertz/db — a type-safe PostgreSQL ORM.

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

### Patch Changes

- [#200](https://github.com/vertz-dev/vertz/pull/200) [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Published types now correctly preserve generic type parameters in `.d.ts` files. Switched DTS bundler to use `inferTypes` mode, preventing potential erasure of generics to `Record<string, unknown>` or `unknown` in the emitted declarations.

- [#202](https://github.com/vertz-dev/vertz/pull/202) [`f3b132a`](https://github.com/vertz-dev/vertz/commit/f3b132af4f6ff39e967d4ca3d33f7e6ee12eff84) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Wire up real PostgreSQL driver using porsager/postgres.

  - `createDb({ url })` now creates a real postgres connection pool when `_queryFn` is not provided
  - Connection pool config from `PoolConfig` (max, idleTimeout, connectionTimeout) is passed through
  - `close()` properly shuts down the connection pool
  - `isHealthy()` performs a real `SELECT 1` health check
  - Timestamps from PostgreSQL are properly converted to `Date` objects
  - postgres.js errors are mapped to the existing DbError hierarchy (UniqueConstraintError, ForeignKeyError, etc.)
  - The `_queryFn` escape hatch still works for PGlite-based testing
  - Fix: relation loader correctly handles multiple includes with the same value (e.g., `{ author: true, comments: true }`)
