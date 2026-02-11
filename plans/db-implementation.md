# @vertz/db -- Implementation Plan

## Overview

Complete implementation of `@vertz/db`, a thin ORM layer for PostgreSQL with type-safe schema definitions, inferred query types, relations, migrations, metadata-only multi-tenancy markers, and a structured error hierarchy.

This plan covers v1.0 (Phases 1-7), which delivers the minimum viable ORM. v1.1 (RLS, sessions, transactions, tenant enforcement) and v1.2 (advanced features) are scoped in the roadmap but not detailed here -- they will receive their own implementation plans once v1.0 stabilizes.

All code is new. There is no legacy implementation.

See also:
- [DB Design Doc](./db-design.md) -- approved design, API surface, E2E acceptance test
- [DB Roadmap](/app/backstage/roadmaps/vertz-db.md) -- approved roadmap with founder decisions
- [Gap Analysis](/app/backstage/research/explorations/orm-design-gap-analysis.md) -- comprehensive gap analysis
- [Multi-Tenancy Exploration](/app/backstage/research/explorations/orm-multi-tenancy.md) -- `d.tenant()` design
- [RLS Exploration](/app/backstage/research/explorations/orm-rls-as-code.md) -- future RLS design (v1.1+)

---

## Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| PostgreSQL driver | `postgres` (porsager/postgres) | Zero-dep native driver. No ORMs wrapping ORMs. |
| Type inference strategy | Pure TypeScript generics | POC 1 validated at 28.5% of 100k budget. No codegen needed. |
| Table type representation | Interfaces (not type aliases) | Interfaces are lazily evaluated by tsc. Better for large schemas. |
| Visibility type computation | Eager (at table definition time) | `$not_sensitive`, `$not_hidden` pre-computed via mapped types. No runtime cost. |
| Include depth cap | Default 2 levels | Deeper nesting requires explicit opt-in. Prevents type explosion. |
| SQL generation strategy | Separate queries with batching (Phase 3), JOINs as optimization (Phase 4) | Simpler initial implementation. Correctness first, performance second. |
| Casing | camelCase TS <-> snake_case SQL (default) | Configurable. Automatic bidirectional mapping. |
| Error hierarchy | Independent `DbError` (not VertzException) | Founder decision #1. Adapter for `@vertz/core` provided separately. |
| Migration differ | Custom (not wrapping Prisma/Drizzle) | Full control over snapshot format. Extensible for future RLS/tenant metadata. |
| Migration file format | Timestamped SQL files + JSON snapshot | Standard PostgreSQL SQL. Snapshot for deterministic diffing. |
| Test infrastructure | PGlite (in-process PostgreSQL) | No external database needed. Fast. Full PostgreSQL compatibility. |
| Plugin interface | `@experimental` | Founder decision #8. May change in minor versions. |
| Internal validation | `@vertz/schema` (one-way dependency) | `d` API is independent. Internal validators use schema. |
| Build toolchain | Bunup (Bun's bundler + Oxc for `.d.ts`) | Consistent with other @vertz packages. |
| Runtime deps | `postgres` driver + `@vertz/schema` (workspace) | Minimal dependency footprint. |

---

## Package Structure

```
packages/db/
├── package.json
├── tsconfig.json
├── bunup.config.ts
├── src/
│   ├── index.ts                              # Public API: exports d, createDb, sql, errors
│   ├── d.ts                                  # The d namespace (schema definition API)
│   │
│   ├── schema/
│   │   ├── column.ts                         # Column type primitives and builders
│   │   ├── column-types.ts                   # Type definitions for all column types
│   │   ├── table.ts                          # d.table() with type inference
│   │   ├── table-types.ts                    # TableDef, InferColumns, InsertInput, UpdateInput
│   │   ├── visibility.ts                     # $not_sensitive, $not_hidden type computation
│   │   ├── relation.ts                       # d.ref.one(), d.ref.many(), d.ref.many().through()
│   │   ├── relation-types.ts                 # Relation type definitions
│   │   ├── tenant.ts                         # d.tenant() metadata-only column type
│   │   ├── shared.ts                         # .shared() table annotation
│   │   ├── enum.ts                           # d.enum() PostgreSQL enum support
│   │   ├── index-def.ts                      # d.index() table-level index definitions
│   │   └── __tests__/
│   │       ├── column.test.ts
│   │       ├── column.test-d.ts              # Type-level tests for column inference
│   │       ├── table.test.ts
│   │       ├── table.test-d.ts               # Type-level tests for $infer, $insert, $update
│   │       ├── visibility.test.ts
│   │       ├── visibility.test-d.ts          # Type-level tests for $not_sensitive, $not_hidden
│   │       ├── relation.test.ts
│   │       ├── relation.test-d.ts            # Type-level tests for relation types
│   │       ├── tenant.test.ts
│   │       └── shared.test.ts
│   │
│   ├── types/
│   │   ├── index.ts                          # Re-exports all types
│   │   ├── database.ts                       # Database<TTables> type
│   │   ├── query-options.ts                  # FindOptions, CreateOptions, UpdateOptions, etc.
│   │   ├── filter.ts                         # Where filter types (eq, gt, lt, contains, etc.)
│   │   ├── find-result.ts                    # FindResult<Table, Options> with select/include narrowing
│   │   ├── insert-input.ts                   # InsertInput<Table> type
│   │   ├── update-input.ts                   # UpdateInput<Table> type
│   │   ├── order-by.ts                       # OrderBy type constrained to column names
│   │   └── __tests__/
│   │       ├── find-result.test-d.ts         # Type-level tests for FindResult narrowing
│   │       ├── filter.test-d.ts              # Type-level tests for filter types
│   │       └── insert-update.test-d.ts       # Type-level tests for insert/update types
│   │
│   ├── client/
│   │   ├── database.ts                       # createDb() client setup
│   │   ├── pool.ts                           # Connection pool management
│   │   ├── health.ts                         # db.isHealthy() health check
│   │   ├── tenant-graph.ts                   # Tenant graph computation at startup
│   │   └── __tests__/
│   │       ├── database.test.ts
│   │       ├── pool.test.ts
│   │       └── tenant-graph.test.ts
│   │
│   ├── query/
│   │   ├── find.ts                           # find, findMany, findOneOrThrow, findManyAndCount
│   │   ├── create.ts                         # create, createMany, createManyAndReturn
│   │   ├── update.ts                         # update, updateMany, upsert
│   │   ├── delete.ts                         # delete, deleteMany
│   │   ├── aggregate.ts                      # count, aggregate, groupBy
│   │   ├── query-context.ts                  # QueryContext for plugin hooks
│   │   └── __tests__/
│   │       ├── find.test.ts
│   │       ├── create.test.ts
│   │       ├── update.test.ts
│   │       ├── delete.test.ts
│   │       └── aggregate.test.ts
│   │
│   ├── sql/
│   │   ├── generator.ts                      # SQL statement generation from query options
│   │   ├── select-builder.ts                 # SELECT statement builder
│   │   ├── insert-builder.ts                 # INSERT with RETURNING
│   │   ├── update-builder.ts                 # UPDATE with WHERE + RETURNING
│   │   ├── delete-builder.ts                 # DELETE with WHERE + RETURNING
│   │   ├── where-builder.ts                  # WHERE clause from filter operators
│   │   ├── join-builder.ts                   # JOIN generation for includes/relations
│   │   ├── order-builder.ts                  # ORDER BY clause builder
│   │   ├── param-binder.ts                   # Parameter binding and SQL injection prevention
│   │   ├── casing.ts                         # camelCase <-> snake_case conversion
│   │   ├── escape-hatch.ts                   # sql tagged template + sql.raw()
│   │   └── __tests__/
│   │       ├── select-builder.test.ts
│   │       ├── insert-builder.test.ts
│   │       ├── update-builder.test.ts
│   │       ├── delete-builder.test.ts
│   │       ├── where-builder.test.ts
│   │       ├── join-builder.test.ts
│   │       ├── param-binder.test.ts
│   │       ├── casing.test.ts
│   │       └── escape-hatch.test.ts
│   │
│   ├── errors/
│   │   ├── index.ts                          # Re-exports all error classes
│   │   ├── db-error.ts                       # Abstract DbError base class
│   │   ├── constraint-errors.ts              # UniqueConstraintError, ForeignKeyError, NotNullError, CheckConstraintError
│   │   ├── query-errors.ts                   # NotFoundError
│   │   ├── connection-errors.ts              # ConnectionError, ConnectionPoolExhaustedError
│   │   ├── pg-error-parser.ts                # PostgreSQL error code -> DbError mapping
│   │   ├── core-adapter.ts                   # dbErrorToHttpError() for @vertz/core
│   │   └── __tests__/
│   │       ├── db-error.test.ts
│   │       ├── constraint-errors.test.ts
│   │       ├── pg-error-parser.test.ts
│   │       └── core-adapter.test.ts
│   │
│   ├── migration/
│   │   ├── snapshot.ts                       # JSON snapshot format for schema state
│   │   ├── differ.ts                         # Schema diff algorithm
│   │   ├── rename-detector.ts                # Column/table rename detection heuristics
│   │   ├── sql-generator.ts                  # Migration SQL generation from diff
│   │   ├── runner.ts                         # Apply migrations to database
│   │   ├── history.ts                        # Migration history tracking table
│   │   ├── file-manager.ts                   # Timestamped SQL file management
│   │   └── __tests__/
│   │       ├── snapshot.test.ts
│   │       ├── differ.test.ts
│   │       ├── rename-detector.test.ts
│   │       ├── sql-generator.test.ts
│   │       ├── runner.test.ts
│   │       └── file-manager.test.ts
│   │
│   ├── cli/
│   │   ├── migrate-dev.ts                    # vertz db migrate dev
│   │   ├── migrate-deploy.ts                 # vertz db migrate deploy
│   │   ├── push.ts                           # vertz db push
│   │   ├── status.ts                         # vertz db migrate status
│   │   └── __tests__/
│   │       ├── migrate-dev.test.ts
│   │       └── push.test.ts
│   │
│   ├── plugin/
│   │   ├── plugin-types.ts                   # DbPlugin interface (@experimental)
│   │   ├── plugin-runner.ts                  # Execute plugin hooks
│   │   ├── event-bus.ts                      # Mutation event bus (cache-readiness 7.1)
│   │   ├── fingerprint.ts                    # Query fingerprinting (cache-readiness 7.2)
│   │   └── __tests__/
│   │       ├── plugin-runner.test.ts
│   │       ├── event-bus.test.ts
│   │       └── fingerprint.test.ts
│   │
│   └── testing/
│       ├── pglite-setup.ts                   # PGlite test infrastructure
│       └── test-helpers.ts                   # Common test utilities
```

---

## Dependency Map

```
v1.0 -- Thin ORM Layer
=============================

Phase 1: Schema Layer + Type Inference   <-- START HERE (no dependencies)
  |
  |--> Phase 2: Error Hierarchy + Connection (needs Phase 1 schema types)
  |      |
  |      '--> Phase 3: SQL Generator (needs Phase 2 connection)
  |             |
  |             '--> Phase 4: Query Builder + Relations (needs Phase 3 SQL gen)
  |                    |
  |                    '--> Phase 5: Migration Differ + Runner (needs Phase 4 for testing)
  |                           |
  |                           '--> Phase 6: CLI + Cache-Readiness (needs Phase 5)
  |                                  |
  |                                  '--> Phase 7: Integration Tests + Polish (needs all)
  |
  '--> Phase 2 can start immediately after Phase 1
```

**Parallelization:** Phases are mostly sequential due to dependencies. However, within each phase, TDD cycles can parallelize across files (e.g., different error classes in Phase 2, different SQL builders in Phase 3).

**Total estimate:** ~296 hours (matches roadmap estimate of ~262h for v1.0 tasks + ~34h for test infrastructure and polish).

---

## Phase 1: Schema Layer + Type Inference

**What it implements:** The `d` namespace (column types, table definitions, visibility annotations, relations, tenant metadata, shared annotation), all derived types (`$infer`, `$insert`, `$update`, `$not_sensitive`, `$not_hidden`), and the type inference engine (`FindResult`, `InsertInput`, `UpdateInput`, filter types, orderBy types).

**Blocked by:** Nothing -- this is the starting phase.
**Can parallel:** Nothing -- all other phases depend on the schema types.
**Assigned to:** ben
**Estimate:** 72 hours

### Files created:
- `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/bunup.config.ts`
- `packages/db/src/index.ts`
- `packages/db/src/d.ts`
- All files under `packages/db/src/schema/`
- All files under `packages/db/src/types/`

### What to implement:

**Column type primitives:**
- `d.uuid()`, `d.text()`, `d.varchar(n)`, `d.email()`, `d.boolean()`, `d.integer()`, `d.bigint()`, `d.decimal(p, s)`, `d.real()`, `d.doublePrecision()`, `d.serial()`, `d.timestamp()`, `d.date()`, `d.time()`, `d.jsonb<T>()`, `d.textArray()`, `d.integerArray()`, `d.enum(name, values)`
- Chainable builders: `.primary()`, `.unique()`, `.nullable()`, `.default(value)`, `.sensitive()`, `.hidden()`, `.check(sql)`, `.references(table, column?)`
- `JsonbValidator<T>` interface: `{ parse(value: unknown): T }`

**Table definition:**
- `d.table(name, columns, options?)` with full type inference
- Options: `relations`, `indexes`
- `.shared()` chained annotation

**Relations:**
- `d.ref.one(() => table, foreignKey)` -- belongsTo
- `d.ref.many(() => table, foreignKey)` -- hasMany
- `d.ref.many(() => table).through(() => joinTable, thisKey, thatKey)` -- manyToMany

**Tenant metadata:**
- `d.tenant(targetTable)` -- creates UUID FK + `isTenant` metadata
- `d.index(columns)` -- table-level index definition

**Type inference layer:**
- `InferColumns<TColumns>` -- column definitions -> TypeScript types
- `InsertInput<TColumns>` -- columns with defaults become optional, hidden excluded
- `UpdateInput<TColumns>` -- all columns partial, PK excluded
- `ExcludeByVisibility<TColumns, 'sensitive'>` -- exclude sensitive columns
- `ExcludeByVisibility<TColumns, 'hidden'>` -- exclude hidden columns
- `FindResult<Table, Options>` with select narrowing and include resolution
- `FilterType<TColumns>` -- where filter types with all operators
- `OrderByType<TColumns>` -- constrained to column names

**Integration test acceptance criteria:**

```typescript
// IT-1-1: Column type inference maps correctly
test('d.uuid() infers string type', () => {
  const col = d.uuid();
  type T = typeof col.$type;
  // Type test: T should be string
  const _: T = 'test';
});

// IT-1-2: Table $infer produces correct type
test('table.$infer includes all columns with correct types', () => {
  const users = d.table('users', {
    id: d.uuid().primary(),
    email: d.email().sensitive(),
    name: d.text(),
    active: d.boolean().default(true),
  });
  type User = typeof users.$infer;
  // Positive: all fields present with correct types
  const u: User = { id: 'uuid', email: 'a@b.com', name: 'Alice', active: true };
});

// IT-1-3: $insert makes columns with defaults optional
test('$insert makes defaulted columns optional', () => {
  const users = d.table('users', {
    id: d.uuid().primary(),
    name: d.text(),
    active: d.boolean().default(true),
  });
  type Insert = typeof users.$insert;
  // active should be optional (has default)
  const valid: Insert = { name: 'Alice' };
});

// IT-1-4: $not_sensitive excludes .sensitive() columns
test('$not_sensitive excludes sensitive fields', () => {
  const users = d.table('users', {
    id: d.uuid().primary(),
    email: d.email().sensitive(),
    name: d.text(),
  });
  type Public = typeof users.$not_sensitive;
  // @ts-expect-error -- email should not exist on $not_sensitive
  const _: Public = { id: 'uuid', email: 'test', name: 'Alice' };
});

// IT-1-5: d.tenant() creates column with isTenant metadata
test('d.tenant() carries tenant metadata', () => {
  const orgs = d.table('orgs', { id: d.uuid().primary(), name: d.text() });
  const users = d.table('users', {
    id: d.uuid().primary(),
    orgId: d.tenant(orgs),
  });
  expect(users.columns.orgId._meta.isTenant).toBe(true);
});

// IT-1-6: .shared() annotation is reflected in table metadata
test('.shared() marks table metadata', () => {
  const flags = d.table('flags', { id: d.uuid().primary() }).shared();
  expect(flags._meta.isShared).toBe(true);
});

// IT-1-7: FindResult narrows type based on select option
// (Type-level test in .test-d.ts)

// IT-1-8: FindResult includes relation types based on include option
// (Type-level test in .test-d.ts)

// IT-1-9: Relation definitions carry correct type metadata
test('d.ref.one() stores relation metadata', () => {
  const users = d.table('users', { id: d.uuid().primary(), name: d.text() });
  const posts = d.table('posts', {
    id: d.uuid().primary(),
    authorId: d.uuid(),
  }, {
    relations: { author: d.ref.one(() => users, 'authorId') },
  });
  expect(posts.relations.author.type).toBe('one');
  expect(posts.relations.author.foreignKey).toBe('authorId');
});
```

**Type flow verification (.test-d.ts):**

```typescript
// TF-1-1: d.uuid() -> string
// TF-1-2: d.boolean() -> boolean
// TF-1-3: d.integer() -> number
// TF-1-4: d.timestamp() -> Date
// TF-1-5: d.enum(name, ['a', 'b']) -> 'a' | 'b'
// TF-1-6: .nullable() adds | null
// TF-1-7: .default() makes field optional in $insert
// TF-1-8: .sensitive() excludes from $not_sensitive
// TF-1-9: .hidden() excludes from $not_sensitive AND $not_hidden
// TF-1-10: FindResult with select narrows to Pick<>
// TF-1-11: FindResult with include adds relation type
// TF-1-12: Where filter type constrains value types to match column types
// TF-1-13: OrderBy type constrains keys to column names
// TF-1-14: @ts-expect-error on wrong column name in where
// TF-1-15: @ts-expect-error on wrong type in filter value
```

---

## Phase 2: Error Hierarchy + Connection Management

**What it implements:** The `DbError` hierarchy, PostgreSQL error code parser, `@vertz/core` adapter, connection pool lifecycle, health checks, and the `createDb()` client factory.

**Blocked by:** Phase 1 (schema types needed for Database<TTables>)
**Assigned to:** ben
**Estimate:** 20 hours

### Files created:
- All files under `packages/db/src/errors/`
- All files under `packages/db/src/client/`
- `packages/db/src/testing/pglite-setup.ts`
- `packages/db/src/testing/test-helpers.ts`

### What to implement:

**Error hierarchy:**
- Abstract `DbError` base class with `code`, `name`, `query`, `table`, `toJSON()`
- `UniqueConstraintError` with `column`, `value`
- `ForeignKeyError` with `constraint`, `detail`
- `NotNullError` with `column`
- `CheckConstraintError` with `constraint`
- `NotFoundError`
- `ConnectionError`
- `ConnectionPoolExhaustedError`
- PostgreSQL error code parser (~80 lines, maps PG error codes like `23505` -> `UniqueConstraintError`)
- Human-readable error message formatting with table/column/constraint names
- `dbErrorToHttpError()` adapter for `@vertz/core`

**Connection management:**
- `createDb()` client factory with URL + pool config + table registry
- Connection pool (wrapping `postgres` driver pool)
- `db.close()` graceful shutdown
- `db.isHealthy()` health check (`SELECT 1`)
- Connection error recovery

**Tenant graph computation:**
- Compute tenant graph at `createDb()` time from `d.tenant()` metadata
- Expose as `db.$tenantGraph` (`{ root, directlyScoped, indirectlyScoped, shared }`)
- Log startup notices for tables without tenant paths

**Test infrastructure:**
- PGlite test setup and teardown helpers

**Integration test acceptance criteria:**

```typescript
// IT-2-1: PostgreSQL error codes map to typed DbError subclasses
test('PG 23505 maps to UniqueConstraintError', () => {
  const pgError = { code: '23505', detail: 'Key (email)=(a@b.com) already exists.', table: 'users' };
  const dbError = parsePgError(pgError);
  expect(dbError).toBeInstanceOf(UniqueConstraintError);
  expect((dbError as UniqueConstraintError).column).toBe('email');
});

// IT-2-2: createDb() initializes connection pool and computes tenant graph
test('createDb connects and computes tenant graph', async () => {
  const db = createDb({ url: testUrl, tables: { orgs, users }, log: false });
  expect(await db.isHealthy()).toBe(true);
  expect(db.$tenantGraph.root).toBe('orgs');
  await db.close();
});

// IT-2-3: DbError.toJSON() produces structured output
test('DbError serializes to JSON', () => {
  const err = new UniqueConstraintError({ table: 'users', column: 'email', value: 'a@b.com' });
  const json = err.toJSON();
  expect(json.code).toBe('UNIQUE_VIOLATION');
  expect(json.table).toBe('users');
});

// IT-2-4: dbErrorToHttpError maps correctly
test('UniqueConstraintError maps to 409 Conflict', () => {
  const dbErr = new UniqueConstraintError({ table: 'users', column: 'email', value: 'a@b.com' });
  const httpErr = dbErrorToHttpError(dbErr);
  expect(httpErr.statusCode).toBe(409);
});

// IT-2-5: db.close() drains pool gracefully
test('db.close() resolves after pool drain', async () => {
  const db = createDb({ url: testUrl, tables: {}, log: false });
  await db.close();
  expect(await db.isHealthy()).toBe(false);
});
```

---

## Phase 3: SQL Generator

**What it implements:** SQL statement generation for all query types -- SELECT, INSERT, UPDATE, DELETE, WHERE clause building, parameter binding, casing conversion, and the SQL escape hatch.

**Blocked by:** Phase 2 (connection pool needed for execution tests)
**Assigned to:** ben
**Estimate:** 48 hours

### Files created:
- All files under `packages/db/src/sql/`

### What to implement:

**SQL builders:**
- SELECT builder: column selection, aliasing for casing, RETURNING
- INSERT builder: single row, batch insert, RETURNING, conflict resolution (for upsert)
- UPDATE builder: SET clause from data, WHERE filter, RETURNING
- DELETE builder: WHERE filter, RETURNING
- WHERE builder: all filter operators (eq, gt, lt, gte, lte, contains, startsWith, endsWith, in, notIn, isNull, isNotNull, NOT, OR, AND)
- ORDER BY builder: column names + direction
- Parameter binding: automatic parameterization (`$1`, `$2`, ...) for SQL injection prevention
- Casing: automatic camelCase <-> snake_case conversion

**SQL escape hatch:**
- `sql` tagged template literal with automatic parameterization
- `sql.raw()` for trusted dynamic SQL (NOT parameterized)

**Subquery support:**
- Relation filters (e.g., `{ author: { active: true } }` -> subquery)

**PostgreSQL-specific syntax:**
- JSONB operators (`->`, `->>`, `@>`, `?`)
- Array operators (`@>`, `<@`, `&&`)
- `COUNT(*) OVER()` for findManyAndCount

**Integration test acceptance criteria:**

```typescript
// IT-3-1: SELECT builder generates correct SQL with params
test('select builder generates parameterized SQL', () => {
  const result = buildSelect('users', {
    where: { active: true, role: 'admin' },
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
    limit: 10,
  });
  expect(result.sql).toBe(
    'SELECT "id", "name" FROM "users" WHERE "active" = $1 AND "role" = $2 ORDER BY "created_at" DESC LIMIT $3'
  );
  expect(result.params).toEqual([true, 'admin', 10]);
});

// IT-3-2: INSERT builder generates RETURNING clause
test('insert builder generates INSERT with RETURNING', () => {
  const result = buildInsert('users', { email: 'a@b.com', name: 'Alice' });
  expect(result.sql).toContain('INSERT INTO "users"');
  expect(result.sql).toContain('RETURNING *');
  expect(result.params).toContain('a@b.com');
});

// IT-3-3: WHERE builder handles all filter operators
test('where builder handles nested operators', () => {
  const result = buildWhere({
    views: { gt: 100 },
    title: { contains: 'vertz' },
    status: { in: ['published', 'draft'] },
    OR: [{ authorId: 'u1' }, { authorId: 'u2' }],
  });
  expect(result.sql).toContain('"views" > $');
  expect(result.sql).toContain('"title" LIKE $');
  expect(result.sql).toContain('"status" IN ($');
  expect(result.sql).toContain('OR');
});

// IT-3-4: sql tagged template parameterizes values
test('sql template parameterizes interpolated values', () => {
  const term = 'hello';
  const result = sql`SELECT * FROM posts WHERE title = ${term}`;
  expect(result.sql).toBe('SELECT * FROM posts WHERE title = $1');
  expect(result.params).toEqual(['hello']);
});

// IT-3-5: sql.raw() does NOT parameterize
test('sql.raw() inserts raw SQL', () => {
  const cols = sql.raw('id, name');
  const result = sql`SELECT ${cols} FROM users`;
  expect(result.sql).toBe('SELECT id, name FROM users');
});

// IT-3-6: Casing converts camelCase to snake_case
test('casing converts field names', () => {
  expect(toSnakeCase('organizationId')).toBe('organization_id');
  expect(toCamelCase('organization_id')).toBe('organizationId');
});

// IT-3-7: Batch insert generates multi-row VALUES
test('batch insert generates multi-row INSERT', () => {
  const result = buildBatchInsert('users', [
    { email: 'a@b.com', name: 'A' },
    { email: 'c@d.com', name: 'C' },
  ]);
  expect(result.sql).toContain('VALUES ($1, $2), ($3, $4)');
});
```

---

## Phase 4: Query Builder + Relations

**What it implements:** The full query API -- find, findMany, findOneOrThrow, findManyAndCount, create, createMany, createManyAndReturn, update, updateMany, upsert, delete, deleteMany, count, aggregate, groupBy. Plus relation loading (includes) with typed results.

**Blocked by:** Phase 3 (SQL generator needed)
**Assigned to:** ben
**Estimate:** 56 hours

### Files created:
- All files under `packages/db/src/query/`

### What to implement:

**Find queries:**
- `db.find(table, options)` -- returns `T | null`
- `db.findOneOrThrow(table, options)` -- returns `T`, throws `NotFoundError`
- `db.findMany(table, options)` -- returns `T[]` with pagination (limit/offset + cursor)
- `db.findManyAndCount(table, options)` -- returns `{ data: T[], total: number }` using `COUNT(*) OVER()`

**Mutation queries:**
- `db.create(table, { data })` -- INSERT + RETURNING
- `db.createMany(table, { data })` -- batch INSERT, returns `{ count }`
- `db.createManyAndReturn(table, { data })` -- batch INSERT + RETURNING
- `db.update(table, { where, data })` -- UPDATE + RETURNING
- `db.updateMany(table, { where, data })` -- batch UPDATE, returns `{ count }`
- `db.upsert(table, { where, create, update })` -- INSERT ON CONFLICT
- `db.delete(table, { where })` -- DELETE + RETURNING
- `db.deleteMany(table, { where })` -- batch DELETE, returns `{ count }`

**Aggregation:**
- `db.count(table, { where? })` -- COUNT query
- `db.aggregate(table, { _avg, _sum, _min, _max, _count, where? })`
- `db.groupBy(table, { by, _count?, _avg?, orderBy? })`

**Relation loading:**
- `include: { relation: true }` -- load full relation
- `include: { relation: { select: ... } }` -- load with field narrowing
- Nested includes (depth-2 cap by default)
- Strategy: separate queries with batching (N+1 prevention via IN queries)

**Plugin hooks:**
- Call `beforeQuery` / `afterQuery` on registered plugins

**Integration test acceptance criteria:**

```typescript
// IT-4-1: db.create inserts a row and returns it with correct types
test('db.create returns inserted row', async () => {
  const org = await db.create(orgs, {
    data: { id: crypto.randomUUID(), name: 'Acme', slug: 'acme' },
  });
  expect(org.name).toBe('Acme');
  expect(typeof org.id).toBe('string');
});

// IT-4-2: db.find returns null when not found
test('db.find returns null for missing row', async () => {
  const result = await db.find(orgs, { where: { id: 'nonexistent' } });
  expect(result).toBeNull();
});

// IT-4-3: db.findOneOrThrow throws NotFoundError
test('findOneOrThrow throws NotFoundError', async () => {
  expect(async () => {
    await db.findOneOrThrow(orgs, { where: { id: 'nonexistent' } });
  }).toThrow(NotFoundError);
});

// IT-4-4: db.findMany with include loads relations
test('findMany with include loads author relation', async () => {
  const results = await db.findMany(posts, {
    include: { author: true },
  });
  expect(results[0].author).toBeDefined();
  expect(results[0].author.name).toBe('Alice');
});

// IT-4-5: db.findManyAndCount returns data + total
test('findManyAndCount returns paginated data with count', async () => {
  const { data, total } = await db.findManyAndCount(posts, { limit: 5 });
  expect(total).toBeGreaterThanOrEqual(data.length);
  expect(data.length).toBeLessThanOrEqual(5);
});

// IT-4-6: db.update modifies and returns updated row
test('db.update returns updated row', async () => {
  const updated = await db.update(posts, {
    where: { id: postId },
    data: { title: 'New Title' },
  });
  expect(updated.title).toBe('New Title');
});

// IT-4-7: db.upsert creates or updates
test('db.upsert creates when not exists', async () => {
  const result = await db.upsert(orgs, {
    where: { slug: 'new-org' },
    create: { id: crypto.randomUUID(), name: 'New Org', slug: 'new-org' },
    update: { name: 'Updated Org' },
  });
  expect(result.slug).toBe('new-org');
});

// IT-4-8: db.createManyAndReturn returns all created rows
test('createManyAndReturn returns inserted rows', async () => {
  const results = await db.createManyAndReturn(orgs, {
    data: [
      { id: crypto.randomUUID(), name: 'Org A', slug: 'org-a' },
      { id: crypto.randomUUID(), name: 'Org B', slug: 'org-b' },
    ],
  });
  expect(results).toHaveLength(2);
  expect(results[0].name).toBe('Org A');
});

// IT-4-9: Filter operators work correctly in queries
test('filter operators produce correct results', async () => {
  const results = await db.findMany(posts, {
    where: { views: { gte: 0 }, status: { in: ['published', 'draft'] } },
  });
  expect(results.length).toBeGreaterThan(0);
});

// IT-4-10: db.count returns correct count
test('db.count returns number', async () => {
  const count = await db.count(posts, { where: { status: 'published' } });
  expect(typeof count).toBe('number');
});
```

---

## Phase 5: Migration Differ + Runner

**What it implements:** The custom migration differ, JSON snapshot format, SQL migration generation, rename detection, migration runner, migration history table, and file management.

**Blocked by:** Phase 4 (query builder needed for migration history queries)
**Assigned to:** ben
**Estimate:** 64 hours

### Files created:
- All files under `packages/db/src/migration/`

### What to implement:

**Snapshot format:**
- JSON schema snapshot capturing tables, columns (type, nullable, default, primary, unique, sensitive, hidden), indexes, foreign keys, enums, and `_metadata` extensibility field
- Snapshot versioning (`"version": 1`)
- Snapshot serialization/deserialization

**Schema differ:**
- Diff algorithm: compare two snapshots and produce a list of changes
- Change types: table added/removed, column added/removed/altered, index added/removed, constraint added/removed, enum added/removed/altered
- Rename detection: heuristic matching by column type + constraints, interactive prompt for confirmation
- Foreign key diff with CASCADE/SET NULL/NO ACTION options

**SQL generation:**
- Generate SQL from diff changes: `CREATE TABLE`, `ALTER TABLE ADD/DROP/ALTER COLUMN`, `CREATE/DROP INDEX`, `ALTER TABLE ADD/DROP CONSTRAINT`, `CREATE TYPE`/`ALTER TYPE`
- Rollback SQL generation (forward-only, but produce reversal for reference)

**Migration runner:**
- Create `_vertz_migrations` history table
- Apply pending migrations in order
- Record applied migration with timestamp
- Dry-run mode (show SQL without executing)

**File management:**
- Timestamped SQL files: `NNNN_description.sql`
- Snapshot update after each migration
- Lock file for migration tracking

**Integration test acceptance criteria:**

```typescript
// IT-5-1: Differ detects new table
test('differ detects added table', () => {
  const before = { version: 1, tables: {}, enums: {} };
  const after = snapshot(schema);
  const diff = computeDiff(before, after);
  expect(diff.changes).toContainEqual(expect.objectContaining({ type: 'table_added' }));
});

// IT-5-2: Differ detects added column
test('differ detects added column', () => {
  const before = snapshot(schemaV1);
  const after = snapshot(schemaV2WithBio);
  const diff = computeDiff(before, after);
  expect(diff.changes).toContainEqual(
    expect.objectContaining({ type: 'column_added', table: 'users', column: 'bio' })
  );
});

// IT-5-3: SQL generator produces valid CREATE TABLE
test('generates CREATE TABLE SQL', () => {
  const sql = generateMigrationSql([{ type: 'table_added', table: 'users', definition: usersDef }]);
  expect(sql).toContain('CREATE TABLE "users"');
  expect(sql).toContain('"id" uuid PRIMARY KEY');
});

// IT-5-4: Migration runner creates history table and applies migrations
test('runner applies migration and records in history', async () => {
  await runner.apply(db, migrationSql);
  const history = await db.query(sql`SELECT * FROM _vertz_migrations`);
  expect(history.length).toBeGreaterThan(0);
});

// IT-5-5: Rename detector identifies column rename
test('rename detector suggests rename', () => {
  const before = { columns: { authorId: { type: 'uuid' } } };
  const after = { columns: { writerId: { type: 'uuid' } } };
  const suggestions = detectRenames(before, after);
  expect(suggestions).toContainEqual({ from: 'authorId', to: 'writerId', confidence: expect.any(Number) });
});

// IT-5-6: Full migration round-trip: schema -> snapshot -> diff -> SQL -> apply
test('full migration round-trip', async () => {
  const snap = createSnapshot(schema);
  const diff = computeDiff(emptySnapshot, snap);
  const migSql = generateMigrationSql(diff.changes);
  await runner.apply(db, migSql);
  // Verify tables exist
  const result = await db.query(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  expect(result.map(r => r.table_name)).toContain('users');
});
```

---

## Phase 6: CLI + Cache-Readiness Primitives

**What it implements:** CLI commands for migration workflows (`vertz db migrate dev`, `vertz db migrate deploy`, `vertz db push`, `vertz db migrate status`), mutation event bus, query fingerprinting, and plugin runner.

**Blocked by:** Phase 5 (migration differ + runner needed)
**Assigned to:** ben (CLI), ava (plugin system)
**Estimate:** 24 hours

### Files created:
- All files under `packages/db/src/cli/`
- All files under `packages/db/src/plugin/`

### What to implement:

**CLI commands:**
- `vertz db migrate dev --name <name>` -- generate snapshot, diff, generate SQL, write migration file, apply
- `vertz db migrate deploy` -- apply all pending migrations
- `vertz db push` -- push schema directly to database (no migration file)
- `vertz db migrate status` -- show pending/applied migrations
- Interactive rename confirmation prompt during `migrate dev`

**Cache-readiness primitives:**
- Mutation event bus (`db.$events`) -- emits `{ type, table, data }` on every mutation
- Deterministic query fingerprinting -- stable hash from query shape (table + operation + where keys + select + include)
- Result metadata: `{ queryTime, rowCount, fingerprint }` attached to results via `$meta`
- Plugin runner: execute `beforeQuery` / `afterQuery` hooks, "first non-undefined return wins" ordering

**Integration test acceptance criteria:**

```typescript
// IT-6-1: Mutation event bus emits events on create/update/delete
test('event bus emits mutation events', async () => {
  const events: any[] = [];
  db.$events.on('mutation', (e) => events.push(e));
  await db.create(orgs, { data: { id: crypto.randomUUID(), name: 'Test', slug: 'test' } });
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe('create');
  expect(events[0].table).toBe('organizations');
});

// IT-6-2: Query fingerprinting produces stable hashes
test('same query shape produces same fingerprint', () => {
  const fp1 = fingerprint({ table: 'posts', operation: 'findMany', where: { status: 'x' } });
  const fp2 = fingerprint({ table: 'posts', operation: 'findMany', where: { status: 'y' } });
  expect(fp1).toBe(fp2); // Same shape, different values
});

// IT-6-3: Plugin beforeQuery hook is invoked
test('plugin beforeQuery hook runs', async () => {
  let called = false;
  const plugin: DbPlugin = {
    name: 'test',
    beforeQuery: (ctx) => { called = true; return undefined; },
  };
  const db = createDb({ url: testUrl, tables: {}, plugins: [plugin], log: false });
  await db.findMany(orgs, {});
  expect(called).toBe(true);
  await db.close();
});

// IT-6-4: CLI migrate dev generates migration file
test('migrate dev creates SQL file', async () => {
  // Programmatic test simulating CLI behavior
  const result = await migrateDev(db, schema, { name: 'initial' });
  expect(result.migrationFile).toMatch(/\d+_initial\.sql/);
});
```

---

## Phase 7: Integration Tests + Type Error Quality + Polish

**What it implements:** The full E2E acceptance test from the design doc, type error quality improvements (branded types, diagnostic export), comprehensive integration tests across all features, and final polish.

**Blocked by:** All previous phases
**Assigned to:** ben
**Estimate:** 32 hours (16h tests, 16h type error quality)

### Files created:
- `packages/db/src/__tests__/e2e.test.ts` -- full E2E test from design doc
- `packages/db/src/__tests__/type-errors.test-d.ts` -- type error quality tests
- `packages/db/src/diagnostic/index.ts` -- `@vertz/db/diagnostic` export

### What to implement:

**E2E acceptance test:**
- The complete test from Section 7 of the design doc
- Exercises: schema definition, type inference, CRUD queries, relations with includes, filter operators, visibility filters, findManyAndCount, error handling (UniqueConstraintError, ForeignKeyError, NotFoundError), SQL escape hatch, tenant graph computation

**Type error quality (founder decision #7):**
- Branded types for human-readable TypeScript error messages
- Error message types that surface table name and column name in compiler output
- `@vertz/db/diagnostic` export for explaining common type errors
- Structured runtime errors with actionable messages

**Performance validation:**
- Run `tsc --extendedDiagnostics` with the full schema (100 tables if needed)
- Confirm type instantiations remain under 100k budget
- Query generation time benchmarks

**Integration test acceptance criteria:**

```typescript
// IT-7-1: Full E2E test passes (design doc Section 7)
// This is the complete test from the design doc -- the ultimate acceptance criterion

// IT-7-2: Type errors produce readable messages
// (Validated via .test-d.ts with @ts-expect-error on invalid usage)

// IT-7-3: tsc --extendedDiagnostics stays under 100k instantiations
// (Validated in CI via script)

// IT-7-4: All DbError subclasses have table + column in error message
test('error messages include context', () => {
  const err = new UniqueConstraintError({ table: 'users', column: 'email', value: 'a@b.com' });
  expect(err.message).toContain('users');
  expect(err.message).toContain('email');
});
```

---

## Milestone Summary

| Phase | What Ships | Estimate | Milestone |
|-------|-----------|----------|-----------|
| Phase 1: Schema + Types | `d` namespace, all column types, relations, tenant/shared metadata, full type inference | 72h | - [x] d.table(), d.column() primitives |
| | | | - [x] Visibility annotations |
| | | | - [x] Relations (one, many, through) |
| | | | - [x] d.tenant() + .shared() metadata |
| | | | - [x] Type inference ($infer, $insert, $update) |
| | | | - [x] FindResult type narrowing |
| Phase 2: Errors + Connection | DbError hierarchy, PG error parser, connection pool, createDb(), tenant graph | 20h | - [x] Error hierarchy |
| | | | - [x] PG error code parser |
| | | | - [x] Connection pool + health check |
| | | | - [x] Tenant graph computation |
| Phase 3: SQL Generator | All SQL builders, parameter binding, casing, escape hatch | 48h | - [x] SELECT/INSERT/UPDATE/DELETE builders |
| | | | - [x] WHERE clause with all operators |
| | | | - [x] sql tagged template + sql.raw() |
| Phase 4: Query Builder | Full CRUD API, aggregations, relation loading, plugin hooks | 56h | - [x] find, findMany, findOneOrThrow |
| | | | - [x] create, createMany, createManyAndReturn |
| | | | - [x] update, upsert, delete |
| | | | - [x] count, aggregate, groupBy |
| | | | - [x] Relation includes |
| | 5: Migrations | Differ, snapshot, SQL generation, runner, rename detection | 64h | - [x] JSON snapshot format |
| | | | - [x] Diff algorithm |
| | | | - [x] Migration SQL generation |
| | | | - [x] Runner + history table |
| Phase 6: CLI + Primitives | Migration CLI, event bus, fingerprinting, plugin runner | 24h | - [x] vertz db migrate dev/deploy/push |
| | | | - [x] Mutation event bus |
| | | | - [x] Query fingerprinting |
| Phase 7: E2E + Polish | Full E2E test, type error quality, performance validation | 32h | - [x] E2E acceptance test passing |
| | | | - [x] Type error quality |
| | | | - [x] Performance under budget |
| **Total** | | **316h** | |
