# @vertz/db

## 0.2.69

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.69
  - @vertz/schema@0.2.69

## 0.2.68

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.68
  - @vertz/schema@0.2.68

## 0.2.67

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.67
  - @vertz/schema@0.2.67

## 0.2.66

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.66
  - @vertz/schema@0.2.66

## 0.2.65

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.65
  - @vertz/schema@0.2.65

## 0.2.64

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.64
  - @vertz/schema@0.2.64

## 0.2.63

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.63
  - @vertz/schema@0.2.63

## 0.2.62

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.62
  - @vertz/schema@0.2.62

## 0.2.61

### Patch Changes

- Updated dependencies [[`5634207`](https://github.com/vertz-dev/vertz/commit/5634207b611babea33a47d2feeb78bc11617ebc3)]:
  - @vertz/sqlite@0.2.59
  - @vertz/errors@0.2.61
  - @vertz/schema@0.2.61

## 0.2.60

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.60
  - @vertz/schema@0.2.60

## 0.2.59

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.59
  - @vertz/schema@0.2.59

## 0.2.58

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.58
  - @vertz/schema@0.2.58

## 0.2.57

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.57
  - @vertz/schema@0.2.57

## 0.2.56

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.56
  - @vertz/schema@0.2.56

## 0.2.55

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.55
  - @vertz/schema@0.2.55

## 0.2.54

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.54
  - @vertz/schema@0.2.54

## 0.2.53

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.53
  - @vertz/schema@0.2.53

## 0.2.52

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.52
  - @vertz/schema@0.2.52

## 0.2.51

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.51
  - @vertz/schema@0.2.51

## 0.2.50

### Patch Changes

- [#2378](https://github.com/vertz-dev/vertz/pull/2378) [`5ab022d`](https://github.com/vertz-dev/vertz/commit/5ab022d712d2bf297e5ecec9907045b5fe7154ec) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix autoApply generating invalid SQLite DDL for composite primary keys. Now emits a table-level `PRIMARY KEY(col1, col2)` constraint instead of per-column `PRIMARY KEY` on each column.

- Updated dependencies []:
  - @vertz/errors@0.2.50
  - @vertz/schema@0.2.50

## 0.2.49

### Patch Changes

- [#2351](https://github.com/vertz-dev/vertz/pull/2351) [`3eacdf7`](https://github.com/vertz-dev/vertz/commit/3eacdf7281ef3bace92abf0d3eddd06f8cbbf32a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(db): full pgvector support — vector column type and HNSW/IVFFlat index options

- Updated dependencies []:
  - @vertz/errors@0.2.49
  - @vertz/schema@0.2.49

## 0.2.48

### Patch Changes

- [#2314](https://github.com/vertz-dev/vertz/pull/2314) [`9fd72d7`](https://github.com/vertz-dev/vertz/commit/9fd72d7b11e0d4890556d89ef29d1a6e050619b1) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(db): type nested include in IncludeOption

  Nested `include` fields in query options are now validated against the target model's relations when `TModels` is provided to the type system. Invalid nested include keys produce compile-time errors instead of passing silently. Output types (`FindResult`) reflect nested relation data through `IncludeResolve`. Depth cap at 3 typed nesting levels matches the existing runtime cap. Backward compatible — existing code without `TModels` continues to work unchanged.

- [#2292](https://github.com/vertz-dev/vertz/pull/2292) [`5d23ced`](https://github.com/vertz-dev/vertz/commit/5d23ced8c21e9cd6a3224e8baea78fedd86d1e1b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(db): add atomic update expressions — d.expr(), d.increment(), d.decrement()

  Enables atomic column operations in update/upsert without read-modify-write cycles. Supports arbitrary SQL expressions via `d.expr(col => sql`...`)`, with `d.increment(n)` and `d.decrement(n)` as sugar. Works across PostgreSQL and SQLite dialects.

- Updated dependencies []:
  - @vertz/errors@0.2.48
  - @vertz/schema@0.2.48

## 0.2.47

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.47
  - @vertz/schema@0.2.47

## 0.2.46

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.46
  - @vertz/schema@0.2.46

## 0.2.45

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.45
  - @vertz/schema@0.2.45

## 0.2.44

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.44
  - @vertz/schema@0.2.44

## 0.2.43

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.43
  - @vertz/schema@0.2.43

## 0.2.42

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.42
  - @vertz/schema@0.2.42

## 0.2.41

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.41
  - @vertz/schema@0.2.41

## 0.2.40

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.40
  - @vertz/schema@0.2.40

## 0.2.39

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.39
  - @vertz/schema@0.2.39

## 0.2.38

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.38
  - @vertz/schema@0.2.38

## 0.2.37

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.37
  - @vertz/schema@0.2.37

## 0.2.36

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.36
  - @vertz/schema@0.2.36

## 0.2.35

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.35
  - @vertz/schema@0.2.35

## 0.2.34

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.34
  - @vertz/schema@0.2.34

## 0.2.33

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.33
  - @vertz/schema@0.2.33

## 0.2.32

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.32
  - @vertz/schema@0.2.32

## 0.2.31

### Patch Changes

- [#1847](https://github.com/vertz-dev/vertz/pull/1847) [`75ed113`](https://github.com/vertz-dev/vertz/commit/75ed113c54cf7fdf0d928a300f71fadd58e27ebe) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `.hidden()` shorthand on column builders as sugar for `.is('hidden')`

- Updated dependencies []:
  - @vertz/errors@0.2.31
  - @vertz/schema@0.2.31

## 0.2.30

### Patch Changes

- [#1840](https://github.com/vertz-dev/vertz/pull/1840) [`126bff9`](https://github.com/vertz-dev/vertz/commit/126bff96c0b09b5ab954ca7130857fbca165327e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fixed Postgres introspection to include explicitly-created unique indexes in the snapshot. Previously, `NOT ix.indisunique` filtered out all unique indexes. Now only constraint-backed unique indexes are excluded (they are already represented as `column.unique = true`).

- Updated dependencies []:
  - @vertz/errors@0.2.30
  - @vertz/schema@0.2.30

## 0.2.29

### Patch Changes

- [#1780](https://github.com/vertz-dev/vertz/pull/1780) [`a5a3d78`](https://github.com/vertz-dev/vertz/commit/a5a3d7880cb18dc09c10ea061308188c3560e0f6) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove deprecated `d.entry()` helper — use `d.model()` instead

- Updated dependencies []:
  - @vertz/errors@0.2.29
  - @vertz/schema@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.28
  - @vertz/schema@0.2.28

## 0.2.27

### Patch Changes

- [#1768](https://github.com/vertz-dev/vertz/pull/1768) [`73c2d0d`](https://github.com/vertz-dev/vertz/commit/73c2d0db2f9cdab495ade4ee5815e071f8411587) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(db): add composite primary key support to d.table()

  Tables can now define composite primary keys via a table-level `primaryKey` option:

  ```ts
  const tenantMembers = d.table(
    "tenant_members",
    {
      tenantId: d.uuid(),
      userId: d.uuid(),
      role: d.text().default("member"),
    },
    { primaryKey: ["tenantId", "userId"] }
  );
  ```

  - `primaryKey` is type-constrained to valid column names (compile-time error for typos)
  - Composite PK columns are required in `$insert` and `$create_input` (no auto-generation)
  - Composite PK columns are excluded from `$update` and `$update_input`
  - Existing `.primary()` API unchanged (backward compatible)
  - Migration SQL generator already handles composite PKs
  - Differ warns on PK flag changes (no ALTER SQL emitted)
  - Entity CRUD pipeline throws clear error for composite-PK tables (not yet supported)

- [#1763](https://github.com/vertz-dev/vertz/pull/1763) [`aa704de`](https://github.com/vertz-dev/vertz/commit/aa704de973e3f661e297d1a3cd2aef6cabdfd02c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add RLS pipeline: snapshot-based policy diffing, migration integration, structured codegen output, and per-request SET LOCAL scoping for tenant isolation

- Updated dependencies []:
  - @vertz/errors@0.2.27
  - @vertz/schema@0.2.27

## 0.2.26

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.26
  - @vertz/schema@0.2.26

## 0.2.25

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.25
  - @vertz/schema@0.2.25

## 0.2.24

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.24
  - @vertz/schema@0.2.24

## 0.2.23

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.23
  - @vertz/schema@0.2.23

## 0.2.22

### Patch Changes

- [#1509](https://github.com/vertz-dev/vertz/pull/1509) [`59a7f9b`](https://github.com/vertz-dev/vertz/commit/59a7f9bf484c14288b0ca10e0f96c015f3d928bc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(db): support column-level validation constraints (min, max, regex) in schema

  Added `.min()`, `.max()`, and `.regex()` chainable methods to column builders so validation
  constraints can be defined directly on the DB schema. These constraints flow through
  `tableToSchemas()` to `@vertz/schema` validators for automatic API-level validation.

  - `d.text().min(1).max(5).regex(/^[A-Z]+$/)` — string length and pattern constraints
  - `d.integer().min(0).max(100)` — numeric range constraints
  - Type-safe scoping: `.regex()` only available on string columns, `.min()`/`.max()` only on
    string and numeric columns via `StringColumnBuilder` and `NumericColumnBuilder` interfaces
  - Constraints survive chaining with existing builders (`.unique()`, `.nullable()`, etc.)
  - Constraints are application-level only — they do NOT affect migrations or SQL DDL

- Updated dependencies []:
  - @vertz/errors@0.2.22
  - @vertz/schema@0.2.22

## 0.2.21

### Patch Changes

- [#1437](https://github.com/vertz-dev/vertz/pull/1437) [`a897b19`](https://github.com/vertz-dev/vertz/commit/a897b19b36f0851e373f4dce31298c52c11328c7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(db): externalize better-sqlite3 and improve SQLite fallback error messages

  - Externalize `better-sqlite3` from the bundle to prevent hardcoded build-machine paths in the dist (fixes Electrobun and other bundled runtimes)
  - Move `better-sqlite3` to optional `peerDependencies` (same pattern as `postgres`)
  - Extract `resolveLocalSqliteDatabase()` with proper error handling — when both `bun:sqlite` and `better-sqlite3` fail, the error now includes both failure reasons and actionable guidance

- Updated dependencies []:
  - @vertz/errors@0.2.21
  - @vertz/schema@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.20
  - @vertz/schema@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.19
  - @vertz/schema@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.18
  - @vertz/schema@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.17
  - @vertz/schema@0.2.17

## 0.2.16

### Patch Changes

- [#1179](https://github.com/vertz-dev/vertz/pull/1179) [`2f574cc`](https://github.com/vertz-dev/vertz/commit/2f574cce9e941c63503efb2e32ecef7b53951725) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add transaction support to DatabaseClient with full model delegates

  - `db.transaction(async (tx) => { ... })` wraps multiple operations atomically
  - `TransactionClient` provides the same model delegates as `DatabaseClient` (`tx.users.create()`, `tx.tasks.list()`, etc.)
  - PostgreSQL uses `sql.begin()` for connection-scoped transactions
  - SQLite uses `BEGIN`/`COMMIT`/`ROLLBACK` via single-connection queryFn
  - Auth plan store operations (`assignPlan`, `removePlan`, `updateOverrides`) now use transactions for atomicity
  - Failure injection tests verify rollback behavior

- [#1212](https://github.com/vertz-dev/vertz/pull/1212) [`391096b`](https://github.com/vertz-dev/vertz/commit/391096b426e1debb6cee06b336768b0e20abc191) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(db): handle null direct values in where clause as IS NULL

  Previously, passing `null` as a direct value in a where clause (e.g., `{ revokedAt: null }`)
  generated `column = $N` with a null parameter, which in SQL always evaluates to NULL (not TRUE),
  silently breaking the entire WHERE clause. Now correctly generates `column IS NULL`.

  Also reverts DbSessionStore raw SQL workarounds back to ORM-based `get()` calls.

- [#1132](https://github.com/vertz-dev/vertz/pull/1132) [`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat: VertzQL relation queries with where/orderBy/limit support

  Breaking change to EntityRelationsConfig: flat field maps replaced with structured
  RelationConfigObject containing `select`, `allowWhere`, `allowOrderBy`, `maxLimit`.

  - Extended VertzQL include entries to support `where`, `orderBy`, `limit`, nested `include`
  - Recursive include validation with path-prefixed errors and maxLimit clamping
  - Include pass-through from route handler → CRUD pipeline → DB adapter
  - GetOptions added to EntityDbAdapter.get() for include on single-entity fetch
  - Codegen IR and entity schema manifest include allowWhere/allowOrderBy/maxLimit

- Updated dependencies []:
  - @vertz/errors@0.2.16
  - @vertz/schema@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.15
  - @vertz/schema@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.14
  - @vertz/schema@0.2.14

## 0.2.13

### Patch Changes

- [#959](https://github.com/vertz-dev/vertz/pull/959) [`127df59`](https://github.com/vertz-dev/vertz/commit/127df59424102142ac1aee9dfcc31b22c2959343) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Wire auto-migrate into the dev server pipeline. Schema file changes now automatically sync the database during `vertz dev`, with graceful skipping for UI-only projects and destructive change warnings.

- Updated dependencies [[`efda760`](https://github.com/vertz-dev/vertz/commit/efda76032901138dca7a22acd60ad947a4bdf02a), [`3d2799a`](https://github.com/vertz-dev/vertz/commit/3d2799ac4c3e0d8f65d864b4471e205a64db886a), [`7b125db`](https://github.com/vertz-dev/vertz/commit/7b125db968ba9157ce97932b392cb3be7fcc0344)]:
  - @vertz/errors@0.2.13
  - @vertz/schema@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.12
  - @vertz/schema@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.11
  - @vertz/schema@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.8
  - @vertz/schema@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.7
  - @vertz/schema@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.6
  - @vertz/schema@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.5
  - @vertz/schema@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.4

## 0.2.3

### Patch Changes

- Updated dependencies []:
  - @vertz/schema@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [[`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084)]:
  - @vertz/schema@0.2.2

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
