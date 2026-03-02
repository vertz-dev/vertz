# @vertz/db

## 0.2.1

### Patch Changes

- [`023f1fc`](https://github.com/vertz-dev/vertz/commit/023f1fc4c6c8a121edf448bcd11421a3add7b9d2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Entity-Driven Architecture (EDA) v0.1.0 — schema and model layer.

  - Added `.readOnly()` and `.autoUpdate()` column annotations with `isReadOnly`/`isAutoUpdate` metadata
  - Added `$response`, `$create_input`, `$update_input` phantom types on `TableDef`
  - Added `d.model(table, relations?)` returning `ModelDef` with derived schemas
  - Each schema has a `parse()` method compatible with `SchemaLike` duck type
  - Runtime CRUD strips readOnly fields and auto-sets autoUpdate timestamps

- [#808](https://github.com/vertz-dev/vertz/pull/808) [`e4c15ac`](https://github.com/vertz-dev/vertz/commit/e4c15ac37ec290bbde34bf27bfeae08287db0808) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove legacy domain codegen (defineDomain, generateTypes, generateClient) and domain-gen CLI command. This dead pre-EDA code is superseded by the domain() grouping primitive.

- Updated dependencies [[`9dc2134`](https://github.com/vertz-dev/vertz/commit/9dc21349e18b35d2f254c12160c27ac89acd7f0a), [`c19527e`](https://github.com/vertz-dev/vertz/commit/c19527e815fde35bdeefad9d00ceafa35eae1b0a)]:
  - @vertz/errors@0.1.1
  - @vertz/schema@0.2.1

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

- [#291](https://github.com/vertz-dev/vertz/pull/291) [`2ec4dd3`](https://github.com/vertz-dev/vertz/commit/2ec4dd3be1ac13f74015e977a699cd59fd7291bc) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - fix(db): address 5 postgres driver issues

  - #203: Add 5s timeout to `isHealthy()` via `Promise.race` to prevent hangs
  - #204: Document timestamp coercion false-positive risk in JSDoc
  - #205: Route `db.query()` through `executeQuery` for consistent error mapping
  - #206: Set default `idle_timeout` to 30s for connection pool
  - #207: Improve postgres integration test isolation with per-test setup/teardown

- [#202](https://github.com/vertz-dev/vertz/pull/202) [`f3b132a`](https://github.com/vertz-dev/vertz/commit/f3b132af4f6ff39e967d4ca3d33f7e6ee12eff84) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Wire up real PostgreSQL driver using porsager/postgres.

  - `createDb({ url })` now creates a real postgres connection pool when `_queryFn` is not provided
  - Connection pool config from `PoolConfig` (max, idleTimeout, connectionTimeout) is passed through
  - `close()` properly shuts down the connection pool
  - `isHealthy()` performs a real `SELECT 1` health check
  - Timestamps from PostgreSQL are properly converted to `Date` objects
  - postgres.js errors are mapped to the existing DbError hierarchy (UniqueConstraintError, ForeignKeyError, etc.)
  - The `_queryFn` escape hatch still works for PGlite-based testing
  - Fix: relation loader correctly handles multiple includes with the same value (e.g., `{ author: true, comments: true }`)

- Updated dependencies [[`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8), [`6443339`](https://github.com/vertz-dev/vertz/commit/64433394142ddff76d8021b25259c9c901d62b1e), [`3407afd`](https://github.com/vertz-dev/vertz/commit/3407afdf543481cd559e550454144d16e6a26e06)]:
  - @vertz/schema@0.2.0
