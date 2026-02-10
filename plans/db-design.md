# @vertz/db -- API Design Plan

> A thin ORM layer for PostgreSQL. Type-safe schema definitions, inferred query types, relations, migrations, and metadata-only multi-tenancy markers. No RLS, no policies, no transactions in v1.

**North star:** Define your schema once. Types flow everywhere. If it builds, the query is valid.

---

## 1. API Surface

### 1.1 Client Setup -- `createDb()`

```typescript
import { createDb } from '@vertz/db';
import { organizations, users, posts, comments } from './schema';

const db = createDb({
  url: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
    idleTimeout: 30_000,
  },
  tables: { organizations, users, posts, comments },
  casing: 'snake_case',  // TS camelCase <-> SQL snake_case (default)
  log: 'query',          // 'query' | 'error' | 'all' | false
  plugins: [],           // @experimental -- plugin interface may change
});
```

**Type signature:**

```typescript
function createDb<TTables extends Record<string, TableDef>>(config: {
  url: string;
  pool?: { min?: number; max?: number; idleTimeout?: number };
  tables: TTables;
  casing?: 'snake_case' | 'camelCase';
  log?: 'query' | 'error' | 'all' | false;
  plugins?: DbPlugin[];
}): Database<TTables>;
```

The `Database<TTables>` type carries the full table registry. All query methods are typed against this registry.

### 1.2 Schema Definition -- `d` Namespace

```typescript
import { d } from '@vertz/db';

// Column type primitives
export const organizations = d.table('organizations', {
  id:        d.uuid().primary(),
  name:      d.text().unique(),
  slug:      d.text().unique(),
  plan:      d.enum('org_plan', ['free', 'pro', 'enterprise']).default('free'),
  settings:  d.jsonb<OrgSettings>(),
  createdAt: d.timestamp().default('now'),
  updatedAt: d.timestamp().default('now'),
});

export const users = d.table('users', {
  id:             d.uuid().primary(),
  organizationId: d.tenant(organizations),  // metadata-only in v1 -- marks column as tenant discriminator
  email:          d.email().unique().sensitive(),
  passwordHash:   d.text().hidden(),
  name:           d.text(),
  role:           d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  bio:            d.text().nullable(),
  active:         d.boolean().default(true),
  createdAt:      d.timestamp().default('now'),
  updatedAt:      d.timestamp().default('now'),
});

export const posts = d.table('posts', {
  id:        d.uuid().primary(),
  authorId:  d.uuid(),
  title:     d.text(),
  content:   d.text(),
  status:    d.enum('post_status', ['draft', 'published', 'archived']).default('draft'),
  tags:      d.textArray(),
  metadata:  d.jsonb<PostMetadata>({ validator: postMetadataSchema }),
  views:     d.integer().default(0),
  createdAt: d.timestamp().default('now'),
  updatedAt: d.timestamp().default('now'),
}, {
  relations: {
    author: d.ref.one(() => users, 'authorId'),
  },
  indexes: [
    d.index('status'),
    d.index(['authorId', 'createdAt']),
  ],
});

export const comments = d.table('comments', {
  id:        d.uuid().primary(),
  postId:    d.uuid(),
  authorId:  d.uuid(),
  body:      d.text(),
  createdAt: d.timestamp().default('now'),
}, {
  relations: {
    post:   d.ref.one(() => posts, 'postId'),
    author: d.ref.one(() => users, 'authorId'),
  },
});

// Shared table -- intentionally cross-tenant (no tenant column, no warning)
export const featureFlags = d.table('feature_flags', {
  id:      d.uuid().primary(),
  name:    d.text().unique(),
  enabled: d.boolean().default(false),
}).shared();
```

**Full column type primitives:**

| Method | PostgreSQL Type | TypeScript Type |
|--------|----------------|-----------------|
| `d.uuid()` | `uuid` | `string` |
| `d.text()` | `text` | `string` |
| `d.varchar(n)` | `varchar(n)` | `string` |
| `d.email()` | `text` (with format hint) | `string` |
| `d.boolean()` | `boolean` | `boolean` |
| `d.integer()` | `integer` | `number` |
| `d.bigint()` | `bigint` | `bigint` |
| `d.decimal(p, s)` | `decimal(p, s)` | `string` (precision-safe) |
| `d.real()` | `real` | `number` |
| `d.doublePrecision()` | `double precision` | `number` |
| `d.serial()` | `serial` | `number` |
| `d.timestamp()` | `timestamp with time zone` | `Date` |
| `d.date()` | `date` | `string` |
| `d.time()` | `time` | `string` |
| `d.jsonb<T>(opts?)` | `jsonb` | `T` |
| `d.textArray()` | `text[]` | `string[]` |
| `d.integerArray()` | `integer[]` | `number[]` |
| `d.enum(name, values)` | `CREATE TYPE name AS ENUM (...)` | union literal type |
| `d.tenant(targetTable)` | `uuid` FK (metadata-only in v1) | `string` |

**Chainable column builders:**

| Method | Effect |
|--------|--------|
| `.primary()` | `PRIMARY KEY` |
| `.unique()` | `UNIQUE` constraint |
| `.nullable()` | Column is optional (default: `NOT NULL`) |
| `.default(value)` | `DEFAULT value` (`'now'` for timestamps means `now()`) |
| `.sensitive()` | Excluded from `$not_sensitive` type |
| `.hidden()` | Excluded from both `$not_sensitive` and `$not_hidden` types |
| `.check(sql)` | `CHECK` constraint |
| `.references(table, column?)` | `FOREIGN KEY` (auto-infers `.id` if column omitted) |

**`d.jsonb<T>()` with runtime validation:**

The `JsonbValidator<T>` generic interface allows any validation library:

```typescript
interface JsonbValidator<T> {
  parse(value: unknown): T;
}

// Works with @vertz/schema, Zod, ArkType, or any library with .parse()
d.jsonb<PostMetadata>({ validator: postMetadataSchema })
```

The `d` API is independent of `@vertz/schema`. Internally, `@vertz/db` depends on `@vertz/schema` for its own runtime validators, but the public column API does not require or re-export it. The dependency is one-way: `@vertz/db` -> `@vertz/schema`.

**`select: { not }` and explicit select are mutually exclusive:**

```typescript
// Valid -- visibility filter only
db.find(users, { select: { not: 'sensitive' } });

// Valid -- explicit fields only
db.find(users, { select: { id: true, name: true } });

// Type error -- cannot combine `not` with explicit fields
db.find(users, { select: { not: 'sensitive', id: true } });
```

### 1.3 Visibility Annotations

Two-tier visibility model for column sensitivity:

```typescript
const users = d.table('users', {
  id:           d.uuid().primary(),
  email:        d.email().sensitive(),    // PII -- excluded from $not_sensitive
  passwordHash: d.text().hidden(),        // Secret -- excluded from both $not_sensitive and $not_hidden
  name:         d.text(),                 // Normal -- included everywhere
});
```

Derived type helpers:

```typescript
type User         = typeof users.$infer;           // { id, email, passwordHash, name }
type UserPublic   = typeof users.$not_sensitive;    // { id, name }
type UserSafe     = typeof users.$not_hidden;       // { id, email, name }
type UserInsert   = typeof users.$insert;           // { email, name } (no id -- has default, no passwordHash -- hidden in insert context)
type UserUpdate   = typeof users.$update;           // Partial<{ email, name, passwordHash }>
```

### 1.4 Relations

```typescript
import { d } from '@vertz/db';

// belongsTo (many-to-one)
export const posts = d.table('posts', {
  id:       d.uuid().primary(),
  authorId: d.uuid(),
  title:    d.text(),
}, {
  relations: {
    author: d.ref.one(() => users, 'authorId'),
  },
});

// hasMany (one-to-many) -- declared on the "one" side
export const users = d.table('users', {
  id:   d.uuid().primary(),
  name: d.text(),
}, {
  relations: {
    posts: d.ref.many(() => posts, 'authorId'),
  },
});

// manyToMany (via explicit join table)
export const postTags = d.table('post_tags', {
  postId: d.uuid(),
  tagId:  d.uuid(),
}, {
  relations: {
    post: d.ref.one(() => posts, 'postId'),
    tag:  d.ref.one(() => tags, 'tagId'),
  },
});

export const tags = d.table('tags', {
  id:   d.uuid().primary(),
  name: d.text().unique(),
}, {
  relations: {
    posts: d.ref.many(() => posts).through(() => postTags, 'tagId', 'postId'),
  },
});
```

Lazy references (`() => table`) avoid circular dependency issues in TypeScript module resolution.

### 1.5 `d.tenant()` -- Metadata-Only Column Type (v1)

`d.tenant(targetTable)` does two things:
1. Creates a `uuid` foreign key column pointing to `targetTable.id`
2. Marks this column with `isTenant: true` metadata

In v1, this is metadata only. The ORM collects the metadata at `createDb()` time but takes no runtime action. The tenant graph is computed (which tables are directly vs. indirectly tenant-scoped) and exposed as `db.$tenantGraph` for introspection.

**Startup notice:** At `createDb()` time, the ORM logs a notice for tables without tenant paths and not marked `.shared()`:

```
[@vertz/db] Notice: Table "audit_logs" has no tenant path and is not marked as .shared().
If this table is intentionally cross-tenant, add .shared() to suppress this notice.
```

This is honest documentation -- the startup notice tells the developer what `d.tenant()` does and does not do in v1. `tenantPlugin()` runtime enforcement ships in v1.1.

### 1.6 `.shared()` -- Table Annotation (v1)

```typescript
export const featureFlags = d.table('feature_flags', {
  id:      d.uuid().primary(),
  name:    d.text().unique(),
  enabled: d.boolean().default(false),
}).shared();
```

Metadata-only in v1. Marks a table as intentionally cross-tenant, suppressing the "missing tenant path" startup notice.

### 1.7 Query Builder

All queries are typed against the registered table definitions. The result types are inferred from the query options.

**Find queries:**

```typescript
// Find one by filter
const user = await db.find(users, {
  where: { email: 'alice@example.com' },
});
// Type: User | null

// Find one or throw
const user = await db.findOneOrThrow(users, {
  where: { id: userId },
});
// Type: User (throws NotFoundError if missing)

// Find many with options
const results = await db.findMany(users, {
  where: { active: true },
  select: { id: true, name: true, email: true },
  orderBy: { createdAt: 'desc' },
  limit: 20,
  offset: 0,
});
// Type: Pick<User, 'id' | 'name' | 'email'>[]

// Find many with includes
const postsWithAuthor = await db.findMany(posts, {
  where: { status: 'published' },
  include: {
    author: true,
  },
  orderBy: { createdAt: 'desc' },
});
// Type: (Post & { author: User })[]

// Combined select + include
const postsWithAuthorName = await db.findMany(posts, {
  select: { title: true, status: true },
  include: {
    author: { select: { name: true } },
  },
});
// Type: (Pick<Post, 'title' | 'status'> & { author: Pick<User, 'name'> })[]

// Cursor-based pagination
const page = await db.findMany(posts, {
  where: { status: 'published' },
  cursor: { id: lastPostId },
  take: 20,
  orderBy: { createdAt: 'desc' },
});

// findManyAndCount -- combined count + results
const { data, total } = await db.findManyAndCount(posts, {
  where: { status: 'published' },
  limit: 20,
  offset: 0,
});
// Type: { data: Post[]; total: number }
```

**Filter operators:**

```typescript
const results = await db.findMany(posts, {
  where: {
    // Equality
    status: 'published',
    authorId: userId,

    // Comparison
    views: { gt: 100 },
    createdAt: { gte: startDate, lt: endDate },

    // String operators
    title: { contains: 'vertz' },
    slug: { startsWith: 'getting-' },

    // List operators
    status: { in: ['published', 'draft'] },
    id: { notIn: excludedIds },

    // Null checks
    bio: { isNull: false },

    // Logical operators
    OR: [
      { status: 'published' },
      { authorId: currentUserId },
    ],
    NOT: { status: 'archived' },

    // Relation filters
    author: { active: true },
  },
});
```

**Mutation queries:**

```typescript
// Create
const user = await db.create(users, {
  data: {
    email: 'alice@example.com',
    name: 'Alice',
    organizationId: orgId,
  },
});
// Type: User

// Create many (batch insert)
const created = await db.createMany(users, {
  data: [
    { email: 'alice@example.com', name: 'Alice', organizationId: orgId },
    { email: 'bob@example.com', name: 'Bob', organizationId: orgId },
  ],
});
// Type: { count: number }

// Create many and return (separate method -- founder decision #5)
const createdUsers = await db.createManyAndReturn(users, {
  data: [
    { email: 'alice@example.com', name: 'Alice', organizationId: orgId },
    { email: 'bob@example.com', name: 'Bob', organizationId: orgId },
  ],
});
// Type: User[]

// Update
const updated = await db.update(users, {
  where: { id: userId },
  data: { name: 'Alice Smith' },
});
// Type: User

// Update many
const result = await db.updateMany(users, {
  where: { active: false },
  data: { role: 'viewer' },
});
// Type: { count: number }

// Upsert
const user = await db.upsert(users, {
  where: { email: 'alice@example.com' },
  create: { email: 'alice@example.com', name: 'Alice', organizationId: orgId },
  update: { name: 'Alice' },
});
// Type: User

// Delete
const deleted = await db.delete(users, {
  where: { id: userId },
});
// Type: User

// Delete many
const result = await db.deleteMany(users, {
  where: { active: false },
});
// Type: { count: number }

// Count
const count = await db.count(users, {
  where: { active: true },
});
// Type: number

// Aggregate
const stats = await db.aggregate(posts, {
  _avg: { views: true },
  _sum: { views: true },
  _count: true,
  where: { status: 'published' },
});
// Type: { _avg: { views: number | null }; _sum: { views: number }; _count: number }

// Group by
const groups = await db.groupBy(posts, {
  by: ['status'],
  _count: true,
  _avg: { views: true },
  orderBy: { _count: 'desc' },
});
// Type: { status: PostStatus; _count: number; _avg: { views: number | null } }[]
```

### 1.8 SQL Escape Hatch

For queries that cannot be expressed through the query builder:

```typescript
import { sql } from '@vertz/db';

// Tagged template literal with type-safe parameters
const results = await db.query<{ id: string; title: string; rank: number }>(
  sql`SELECT id, title, ts_rank(search_vector, query) AS rank
      FROM posts, to_tsquery('english', ${searchTerm}) query
      WHERE search_vector @@ query
      ORDER BY rank DESC
      LIMIT ${limit}`
);

// CTEs (Common Table Expressions)
const topAuthors = await db.query<{ authorId: string; postCount: number }>(
  sql`WITH post_counts AS (
    SELECT author_id, COUNT(*) AS post_count
    FROM posts
    WHERE status = 'published'
    GROUP BY author_id
  )
  SELECT author_id, post_count
  FROM post_counts
  WHERE post_count > ${minPosts}
  ORDER BY post_count DESC`
);

// Raw SQL escape (for truly dynamic queries)
const columns = sql.raw('id, name, email');
const result = await db.query(sql`SELECT ${columns} FROM users`);
```

The `sql` tagged template automatically parameterizes values (prevents SQL injection). `sql.raw()` is the escape hatch for trusted dynamic SQL -- it is NOT parameterized and must be used with caution.

### 1.9 Error Hierarchy

Independent `DbError` hierarchy (founder decision #1). Not a subclass of `@vertz/core` `VertzException`.

```typescript
abstract class DbError extends Error {
  abstract readonly code: string;
  readonly query?: string;
  readonly table?: string;

  toJSON(): { error: string; code: string; message: string; table?: string };
}

// Constraint violations
class UniqueConstraintError extends DbError {
  readonly code = 'UNIQUE_VIOLATION';
  readonly column: string;
  readonly value: unknown;
}

class ForeignKeyError extends DbError {
  readonly code = 'FOREIGN_KEY_VIOLATION';
  readonly constraint: string;
  readonly detail: string;
}

class NotNullError extends DbError {
  readonly code = 'NOT_NULL_VIOLATION';
  readonly column: string;
}

class CheckConstraintError extends DbError {
  readonly code = 'CHECK_VIOLATION';
  readonly constraint: string;
}

// Query errors
class NotFoundError extends DbError {
  readonly code = 'NOT_FOUND';
}

// Connection errors
class ConnectionError extends DbError {
  readonly code = 'CONNECTION_ERROR';
}

class ConnectionPoolExhaustedError extends DbError {
  readonly code = 'POOL_EXHAUSTED';
}
```

**Adapter for `@vertz/core`:**

```typescript
import { dbErrorToHttpError } from '@vertz/db/core-adapter';

// Maps DbError -> VertzException (when used inside @vertz/core)
// UniqueConstraintError -> ConflictException (409)
// NotFoundError -> NotFoundException (404)
// ConnectionError -> ServiceUnavailableException (503)
```

PostgreSQL error code parser (~80 lines) maps native PG error codes to typed `DbError` subclasses. Human-readable error messages include the table name, column name, and constraint name so developers can act on them immediately.

**`TransactionError` is deferred to v1.1** with transaction support.

### 1.10 Migration Workflow

```bash
# Development: generate and apply migration
vertz db migrate dev --name add-user-bio

# Production: apply pending migrations
vertz db migrate deploy

# Push schema directly (dev shortcut, no migration file)
vertz db push

# Check migration status
vertz db migrate status
```

**Migration differ:**

Custom diff engine (not wrapping Prisma or Drizzle). Compares a JSON schema snapshot against the current schema definitions.

```
migrations/
├── 0001_initial.sql
├── 0002_add_user_bio.sql
├── _snapshot.json         # Current schema state
└── _lock.json             # Migration history
```

The snapshot format stores tables, columns, indexes, unique constraints, foreign keys, enums, and extensibility fields for future metadata (policies, tenant info, materialized views):

```json
{
  "version": 1,
  "tables": {
    "users": {
      "columns": {
        "id": { "type": "uuid", "primary": true, "nullable": false },
        "email": { "type": "text", "unique": true, "nullable": false, "sensitive": true }
      },
      "indexes": [...],
      "foreignKeys": [...],
      "_metadata": {}
    }
  },
  "enums": {
    "user_role": ["admin", "editor", "viewer"]
  }
}
```

**Rename detection:** The differ detects column and table renames by comparing column type + constraints and prompts for confirmation during `migrate dev`.

**Diff operations:** Add/remove/alter tables, columns, indexes, constraints. Enum type diff. FK diff with cascade options. Rollback SQL generation (forward-only, but generates reversal SQL for reference).

### 1.11 Connection Management

```typescript
const db = createDb({
  url: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
    idleTimeout: 30_000,
  },
  // ...
});

// Graceful shutdown
await db.close();

// Health check
const healthy = await db.isHealthy();
```

Connection pool configuration: min/max connections, idle timeout. Graceful shutdown drains the pool. Health check runs a simple query (`SELECT 1`). Connection error recovery with automatic reconnection.

### 1.12 Plugin Interface (@experimental)

```typescript
interface DbPlugin {
  name: string;
  beforeQuery?(context: QueryContext): QueryContext | undefined;
  afterQuery?(context: QueryContext, result: unknown): unknown;
}
```

Marked `@experimental` (founder decision #8) -- the plugin interface may change in minor versions. Plugin ordering: first non-undefined `beforeQuery` return wins (founder decision #10, from Ben's feasibility review).

---

## 2. Manifesto Alignment

### Type Safety Wins

`@vertz/db` makes TypeScript the single source of truth for the database schema. Column definitions carry full type information through to query results. `FindResult<Table, Options>` narrows the return type based on `select`, `include`, and visibility filters. `InsertInput<Table>` and `UpdateInput<Table>` compute correct input types from column defaults and nullability. If a query compiles, the SQL it generates is valid.

The type system catches: wrong column names in `where`/`select`/`orderBy`, type mismatches in filter values, missing required fields in `create`, invalid relation names in `include`, and combining incompatible `select` options.

### One Way to Do Things

There is one way to define a table (`d.table()`), one way to define a column (the `d` namespace), one way to query (`db.find/create/update/delete`), and one way to migrate (`vertz db migrate`). No alternative API patterns, no builder vs. object syntax debate, no code-first vs. schema-first choice. The `d` namespace IS the schema. The schema IS the types. The types drive the queries.

### Production-Ready by Default

Error handling is structured from day one -- typed `DbError` hierarchy with table/column/constraint metadata. Connection pooling is built in. Migration diffing and deployment are first-class CLI commands. Health checks are included. Type error quality is prioritized (founder decision #7).

### Explicit over Implicit

`d.tenant()` in v1 is metadata-only and the framework is honest about it. A startup notice tells developers what it does and does not do. No hidden query modifications, no invisible WHERE clauses. The visibility system (`.sensitive()`, `.hidden()`) is explicit opt-in, and derived types (`$not_sensitive`, `$not_hidden`) make the filtering visible at the type level.

### Compile-time over Runtime

Schema definitions are TypeScript. Type inference is pure TypeScript generics (validated by POC 1 at 28.5% of budget). No codegen step between schema and types. The compiler, not runtime, catches invalid queries, wrong field names, and type mismatches.

### Predictability over Convenience

The query API uses explicit options objects, not method chaining with hidden state. `createMany` returns `{ count }` and `createManyAndReturn` returns the rows -- separate methods with separate return types (founder decision #5). `findManyAndCount` is a dedicated method, not a hidden dual-query behind `findMany`. Filter operators use object syntax (`{ gt: 100 }`) with clear semantics, not overloaded comparison operators.

### My LLM Nailed It on the First Try

The `d` namespace is highly discoverable -- `d.` followed by autocomplete shows every column type. The query API mirrors the schema structure -- if you know the table columns, you know the query fields. Error messages are actionable and LLM-friendly -- they include table names, column names, and constraint names.

---

## 3. Non-Goals (v1)

1. **RLS / Policies / Sessions** -- Deferred to v1.1. `d.session()`, `d.policy()`, `d.allow()`, `d.deny()` have approved syntax but no v1 implementation.
2. **Transactions** -- Deferred to v1.1. `db.transaction(async (tx) => { ... })` is designed but not shipped.
3. **`db.bypass` / `db.forSession()`** -- Deferred to v1.1. RLS bypass and session scoping require the RLS infrastructure.
4. **`tenantPlugin()` runtime enforcement** -- Deferred to v1.1. v1 ships `d.tenant()` as metadata only.
5. **`@vertz/auth`** -- Entirely separate package. Hierarchical roles, ReBAC, billing/entitlements are out of scope for `@vertz/db`.
6. **Multi-database / NoSQL** -- PostgreSQL only. This is a deliberate constraint, not a gap.
7. **Caching layer** -- v1 ships cache-readiness primitives (mutation event bus, query fingerprinting) but no built-in cache. Caching is a consumer concern.
8. **Real-time subscriptions** -- `db.subscribe()` is a v2 concept.
9. **Visual migration browser** -- CLI-only for v1.
10. **Implicit many-to-many** -- Explicit join tables required. No Prisma-style implicit M:M.
11. **Down migrations** -- Forward-only. The differ generates reversal SQL for reference but does not support automated rollback.
12. **Programmatic migration API** -- Committed to v1.1 (founder decision #9). v1 is CLI-only.
13. **Partial/conditional indexes** -- Deferred to v1.1 per Ben's judgment. The SQL escape hatch covers v1 use cases. Design: `.index(col, { where: sql\`...\` })`.
14. **Read replicas** -- `createDb({ primary, replicas })` is a v1.1+ feature.
15. **Soft deletes** -- Not a framework concern. Developers can implement with a `deletedAt` column and a filter.
16. **Connection pooling service** -- v1 includes a built-in pool. External poolers (PgBouncer) are supported but not managed.

---

## 4. Unknowns

### U1: Type inference at scale -- RESOLVED

**Question:** Does pure TypeScript inference stay under 100,000 type instantiations for 100 tables + 20 queries?

**Resolution:** POC 1 (PR #138, closed) validated the approach at **28,500 instantiations (28.5% of budget)**. Pure inference is viable. No codegen needed.

**Impact on design:** Proceed with pure TypeScript inference. Apply Ben's optimization constraints: interfaces over type aliases for `TableDef`, avoid `infer` in hot paths, pre-compute visibility types eagerly, cap default include depth at 2.

### U2: Internal `@vertz/schema` dependency model

**Question:** Does `@vertz/db` depend on `@vertz/schema` as a runtime dependency, or duplicate validation logic?

**Current position:** Internal dependency. The `d` API is independent (developers do not import `@vertz/schema`), but `@vertz/db` uses `@vertz/schema` internally for runtime validators (e.g., email format validation on `d.email()`). The dependency is one-way and internal.

**Status:** Accepted as a design constraint. Will validate during Phase 1 implementation.

### U3: PGlite compatibility

**Question:** Does PGlite support all features needed for the test suite (schema creation, indexes, enums, foreign keys)?

**Status:** Low risk. PGlite supports standard PostgreSQL DDL. Will validate during test infrastructure setup (Phase 1).

### U4: Migration rename detection accuracy

**Question:** How accurately can the differ detect column renames vs. add+remove?

**Status:** Medium risk. The differ will use column type + constraints as heuristics and prompt for confirmation. False positives are addressed by the interactive CLI prompt during `migrate dev`. Will validate during migration differ implementation (Phase 5).

### U5: `findManyAndCount` query efficiency

**Question:** Is a single query (`SELECT *, COUNT(*) OVER()`) more efficient than two separate queries for `findManyAndCount`?

**Status:** Low risk. The window function approach is well-established. ~50 lines of implementation (founder decision #6). Will benchmark during query builder implementation.

---

## 5. POC Results

### POC 1: Type Inference at Scale -- VALIDATED

**Ref:** PR #138 (closed), 28.5% of 100k budget.

**Question:** Can pure TypeScript inference handle 100 tables with 20 queries and stay under 100,000 type instantiations?

**What was tried:**
- Generated 100 table definitions with realistic column distributions
- Implemented `Database<TTables>` type
- Implemented `FindResult` with select narrowing
- Implemented `FindResult` with visibility filtering (`$not_sensitive`, `$not_hidden`)
- Implemented `FindResult` with nested include (depth 2)
- Added `$insert` and `$update` type construction
- Ran `tsc --extendedDiagnostics`

**Results:**
- **28,500 type instantiations** (28.5% of 100k budget)
- Well within budget. v1 proceeds with pure inference.

**Optimization constraints from Ben's review (applied to design):**
- Use interfaces over type aliases for `TableDef` (interfaces are lazily evaluated)
- Avoid `infer` keyword in hot paths (use mapped types instead)
- Pre-compute visibility types eagerly at table definition time
- Cap default include depth at 2 (explicit opt-in for deeper nesting)
- Use branded types for table identity (prevents accidental cross-table type mixing)

---

## 6. Type Flow Map

### 6.1 Schema Definition to Query Types

```
d.table(name, columns)
  -> TableDef<TColumns>
    -> $infer: InferColumns<TColumns>
    -> $insert: InsertInput<TColumns>
    -> $update: UpdateInput<TColumns>
    -> $not_sensitive: ExcludeByVisibility<TColumns, 'sensitive'>
    -> $not_hidden: ExcludeByVisibility<TColumns, 'hidden'>

createDb({ tables: TTables })
  -> Database<TTables>
    -> db.find(table, { select?, include?, where? })
      -> FindResult<TableDef, { select, include }>
        -> SelectNarrow<TColumns, TSelect>
        -> IncludeResolve<TRelations, TInclude, depth=2>
    -> db.create(table, { data })
      -> validates against InsertInput<TColumns>
      -> returns InferColumns<TColumns>
    -> db.update(table, { where, data })
      -> validates against UpdateInput<TColumns>
      -> returns InferColumns<TColumns>
```

### 6.2 Generic Type Flow Paths

Each path below becomes a mandatory `.test-d.ts` acceptance criterion:

1. **Column type -> inferred TS type:** `d.uuid()` -> `string`, `d.boolean()` -> `boolean`, etc.
2. **Column modifiers -> type narrowing:** `.nullable()` -> `T | null`, `.default(v)` -> optional in `$insert`
3. **Table columns -> `$infer`:** All columns mapped to their TS types
4. **Table columns -> `$insert`:** Columns with `.default()` become optional, `.hidden()` excluded
5. **Table columns -> `$update`:** All columns become `Partial<>`, primary key excluded
6. **Visibility -> `$not_sensitive`:** `.sensitive()` columns excluded from result type
7. **Visibility -> `$not_hidden`:** `.hidden()` columns excluded from result type
8. **`select` option -> result narrowing:** `{ select: { id: true, name: true } }` -> `Pick<T, 'id' | 'name'>`
9. **`include` option -> relation embedding:** `{ include: { author: true } }` -> `T & { author: User }`
10. **`include` with nested select:** `{ include: { author: { select: { name: true } } } }` -> `T & { author: Pick<User, 'name'> }`
11. **`where` filter type safety:** Filter values typed against column types
12. **`orderBy` type safety:** Keys constrained to column names, values to `'asc' | 'desc'`
13. **`InsertInput` data validation:** `db.create(users, { data: ... })` rejects missing required fields at compile time
14. **`UpdateInput` partial data:** `db.update(users, { data: ... })` accepts partial fields

---

## 7. E2E Acceptance Test

The following test validates the entire ORM works end-to-end. It exercises schema definition, type inference, queries, relations, mutations, filters, error handling, and migrations.

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createDb, d, sql } from '@vertz/db';
import {
  DbError,
  UniqueConstraintError,
  NotFoundError,
  ForeignKeyError,
} from '@vertz/db/errors';

// -- Schema Definition --

const organizations = d.table('organizations', {
  id:   d.uuid().primary(),
  name: d.text().unique(),
  slug: d.text().unique(),
});

const users = d.table('users', {
  id:             d.uuid().primary(),
  organizationId: d.tenant(organizations),
  email:          d.email().unique().sensitive(),
  passwordHash:   d.text().hidden(),
  name:           d.text(),
  active:         d.boolean().default(true),
  createdAt:      d.timestamp().default('now'),
});

const posts = d.table('posts', {
  id:        d.uuid().primary(),
  authorId:  d.uuid(),
  title:     d.text(),
  content:   d.text(),
  status:    d.enum('post_status', ['draft', 'published', 'archived']).default('draft'),
  views:     d.integer().default(0),
  createdAt: d.timestamp().default('now'),
}, {
  relations: {
    author: d.ref.one(() => users, 'authorId'),
  },
});

const comments = d.table('comments', {
  id:        d.uuid().primary(),
  postId:    d.uuid(),
  authorId:  d.uuid(),
  body:      d.text(),
  createdAt: d.timestamp().default('now'),
}, {
  relations: {
    post:   d.ref.one(() => posts, 'postId'),
    author: d.ref.one(() => users, 'authorId'),
  },
});

const featureFlags = d.table('feature_flags', {
  id:      d.uuid().primary(),
  name:    d.text().unique(),
  enabled: d.boolean().default(false),
}).shared();

// -- Type Inference Assertions --

type UserInfer = typeof users.$infer;
type UserPublic = typeof users.$not_sensitive;
type UserInsert = typeof users.$insert;
type UserUpdate = typeof users.$update;

// Positive type tests
const _typeTest1: UserInfer = {
  id: 'uuid', organizationId: 'uuid', email: 'e@x.com',
  passwordHash: 'hash', name: 'Alice', active: true, createdAt: new Date(),
};

// @ts-expect-error -- email is excluded from $not_sensitive
const _typeTest2: UserPublic = { id: 'uuid', email: 'e@x.com', name: 'Alice' };

// @ts-expect-error -- id is required on $infer but has a default, so optional on $insert
const _typeTest3: UserInsert = { email: 'e@x.com', name: 'Alice', organizationId: 'uuid', id: undefined };

// -- Database Tests --

describe('@vertz/db E2E', () => {
  let db: ReturnType<typeof createDb>;
  let orgId: string;
  let userId: string;
  let postId: string;

  beforeAll(async () => {
    db = createDb({
      url: process.env.TEST_DATABASE_URL!,
      tables: { organizations, users, posts, comments, featureFlags },
      log: false,
    });
    // Push schema (test setup)
    await db.$push();
  });

  afterAll(async () => {
    await db.close();
  });

  it('creates an organization', async () => {
    const org = await db.create(organizations, {
      data: { id: crypto.randomUUID(), name: 'Acme Corp', slug: 'acme' },
    });
    orgId = org.id;
    expect(org.name).toBe('Acme Corp');
  });

  it('creates a user', async () => {
    const user = await db.create(users, {
      data: {
        id: crypto.randomUUID(),
        organizationId: orgId,
        email: 'alice@acme.com',
        passwordHash: '$2b$10$...',
        name: 'Alice',
      },
    });
    userId = user.id;
    expect(user.name).toBe('Alice');
    expect(user.active).toBe(true); // default
  });

  it('rejects duplicate email (UniqueConstraintError)', async () => {
    try {
      await db.create(users, {
        data: {
          id: crypto.randomUUID(),
          organizationId: orgId,
          email: 'alice@acme.com', // duplicate
          passwordHash: '$2b$10$...',
          name: 'Alice Duplicate',
        },
      });
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UniqueConstraintError);
      expect((err as UniqueConstraintError).column).toBe('email');
    }
  });

  it('creates a post with relation', async () => {
    const post = await db.create(posts, {
      data: {
        id: crypto.randomUUID(),
        authorId: userId,
        title: 'Getting Started with Vertz',
        content: 'Vertz is a type-safe framework...',
        status: 'published',
      },
    });
    postId = post.id;
    expect(post.status).toBe('published');
  });

  it('finds posts with author include', async () => {
    const result = await db.findMany(posts, {
      where: { status: 'published' },
      include: { author: true },
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].author.name).toBe('Alice');
  });

  it('finds with select narrowing', async () => {
    const result = await db.findMany(posts, {
      select: { title: true, status: true },
    });
    expect(result[0]).toHaveProperty('title');
    expect(result[0]).toHaveProperty('status');
    // @ts-expect-error -- content is not selected
    result[0].content;
  });

  it('finds with visibility filter', async () => {
    const result = await db.findMany(users, {
      select: { not: 'sensitive' },
    });
    // @ts-expect-error -- email is sensitive, excluded
    result[0].email;
    expect(result[0]).toHaveProperty('name');
  });

  it('updates a post', async () => {
    const updated = await db.update(posts, {
      where: { id: postId },
      data: { title: 'Updated Title' },
    });
    expect(updated.title).toBe('Updated Title');
  });

  it('uses filter operators', async () => {
    const result = await db.findMany(posts, {
      where: {
        views: { gte: 0 },
        status: { in: ['published', 'draft'] },
        title: { contains: 'Vertz' },
      },
    });
    expect(result.length).toBeGreaterThan(0);
  });

  it('uses findManyAndCount', async () => {
    const { data, total } = await db.findManyAndCount(posts, {
      where: { status: 'published' },
      limit: 10,
    });
    expect(total).toBeGreaterThan(0);
    expect(data.length).toBeLessThanOrEqual(10);
  });

  it('throws NotFoundError on findOneOrThrow', async () => {
    try {
      await db.findOneOrThrow(posts, {
        where: { id: '00000000-0000-0000-0000-000000000000' },
      });
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
    }
  });

  it('rejects invalid FK (ForeignKeyError)', async () => {
    try {
      await db.create(posts, {
        data: {
          id: crypto.randomUUID(),
          authorId: '00000000-0000-0000-0000-000000000000', // non-existent user
          title: 'Orphan Post',
          content: 'This should fail.',
        },
      });
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ForeignKeyError);
    }
  });

  it('uses SQL escape hatch', async () => {
    const result = await db.query<{ count: number }>(
      sql`SELECT COUNT(*)::integer AS count FROM posts WHERE status = ${'published'}`
    );
    expect(result[0].count).toBeGreaterThan(0);
  });

  it('deletes a comment by relation filter', async () => {
    const comment = await db.create(comments, {
      data: {
        id: crypto.randomUUID(),
        postId,
        authorId: userId,
        body: 'Great post!',
      },
    });
    const deleted = await db.delete(comments, {
      where: { id: comment.id },
    });
    expect(deleted.id).toBe(comment.id);
  });

  it('tenant graph is computed at startup', () => {
    const graph = db.$tenantGraph;
    expect(graph.directlyScoped).toContain('users');
    expect(graph.indirectlyScoped).toContain('posts');
    expect(graph.shared).toContain('feature_flags');
    expect(graph.root).toBe('organizations');
  });
});
```

---

## 8. Cache-Readiness Primitives

Five primitives that make future caching possible without committing to a cache strategy in v1:

### 8.1 Mutation Event Bus

Every mutation (create, update, delete) emits an event on `db.$events`:

```typescript
db.$events.on('mutation', (event) => {
  // { type: 'create' | 'update' | 'delete', table: string, data: unknown }
});
```

### 8.2 Deterministic Query Fingerprinting

Every query generates a stable fingerprint from its shape (table + operation + where structure + select + include). Same logical query -> same fingerprint, regardless of parameter values.

### 8.3 Result Metadata Carrier

Query results carry metadata: `{ data, $meta: { queryTime, rowCount, fingerprint } }`.

### 8.4 Plugin/Middleware Slot

The `DbPlugin` interface (Section 1.12) provides `beforeQuery` and `afterQuery` hooks for external cache integration.

### 8.5 Relation Invalidation Graph

At `createDb()` time, the ORM computes which tables are connected by relations. When a mutation fires on table A, consumers can determine which cached queries on table B might be affected.

---

## Design Review Notes

### Josh (DX Review)

**API intuitiveness:** The `d` namespace is highly discoverable. `d.table()`, `d.uuid()`, `d.text()` -- developers will feel at home immediately. The query API mirrors Prisma's object syntax which developers already know, with the improvement of combined `select` + `include`.

**Naming:** `createManyAndReturn` is slightly verbose but clear. The alternative `createMany({ returning: true })` overloads the return type, which hurts type inference. The separate method is the right call.

**Examples clarity:** The examples are concrete and compilable. The E2E test doubles as a usage guide. The filter operators section is particularly well-structured.

**Concern -- error DX:** Error messages must be actionable. Include table name, column name, and constraint name in every error. Consider a `@vertz/db/diagnostic` export for explaining common type errors (e.g., "Expected type 'string' but got 'number' for column 'users.email'"). First impressions matter (founder decision #7).

**Concern -- migration UX:** `migrate dev` vs `migrate deploy` vs `push` is three commands for migrations. Clear CLI help text is critical. Consider `vertz db init` for first-time setup (create schema directory, generate db.ts template, detect DATABASE_URL).

**Verdict:** The API is intuitive, the examples are clear, and the naming is consistent. Ship it.

### Ben (Feasibility Review)

**Type system viability:** POC 1 at 28.5% of budget confirms the approach. The optimization constraints (interfaces over type aliases, no `infer` in hot path, pre-computed visibility types, depth-2 include cap) are captured in the design.

**`JsonbValidator<T>` interface:** The generic `{ parse(value: unknown): T }` interface correctly decouples runtime validation from any specific schema library.

**`select: { not }` mutual exclusivity:** Properly specified as a type-level constraint. Implementation is straightforward with conditional types.

**Plugin ordering:** "First non-undefined `beforeQuery` return wins" is clear and simple. Good enough for v1.

**Internal `@vertz/schema` dependency:** One-way dependency is clean. The `d` API surface does not leak `@vertz/schema` types.

**Hidden complexity -- SQL generation:** The SQL generator for nested `include` with depth-2 JOINs is the most complex part. Recommend starting with separate queries (N+1 with batching) and optimizing to JOINs in a later phase.

**Hidden complexity -- migration rename detection:** Rename detection is inherently heuristic. The interactive prompt during `migrate dev` is the right escape valve.

**Verdict:** Buildable as designed. The POC results give confidence. Recommend phasing SQL generation (separate queries first, JOINs later).

### PM (Scope Review)

**Roadmap alignment:** The v1 scope matches the approved roadmap exactly. All 15 v1.0 tasks from the roadmap are represented. Non-goals are clear and match the founder's decisions.

**Scope concerns:** None. The explicit "metadata-only" framing for `d.tenant()` and `.shared()` with honest startup notices is the right approach. Better to ship honest metadata than fake runtime enforcement.

**Risk:** The migration differ is a large piece of work (~40 hours estimated). It's the critical path for the developer experience. Recommend prioritizing it early.

**Verdict:** Scope is correct. Matches roadmap and founder decisions. No scope creep detected.
