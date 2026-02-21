# @vertz/db -- API Design Plan

> A thin ORM layer for PostgreSQL. Type-safe schema definitions, inferred query types, relations, migrations, and metadata-only multi-tenancy markers. No RLS, no policies, no transactions in v1.

**North star:** Define your schema once. Types flow everywhere. If it builds, the query is valid.

---

## 1. API Surface

### 1.1 Client Setup -- `createDb()`

```typescript
import { createDb } from '@vertz/db';
import { organizations, users, posts, postRelations, comments, commentRelations } from './schema';

const db = createDb({
  url: process.env.DATABASE_URL!,  // non-null assertion -- use vertz.env() for type-safe access
  pool: {
    max: 10,
    idleTimeout: 30_000,
    connectionTimeout: 10_000,     // [v1 deviation] replaces `min`; added connectionTimeout
  },
  tables: {
    organizations: { table: organizations, relations: {} },
    users:         { table: users, relations: {} },
    posts:         { table: posts, relations: postRelations },
    comments:      { table: comments, relations: commentRelations },
  },
  casing: 'snake_case',  // TS camelCase <-> SQL snake_case (default)
  log: (message: string) => console.log(message),  // [v1 deviation] function, not union enum
  // plugins: [],  // [v1 deviation] plugin interface exists but is NOT wired into createDb() in v1
});
```

**Type signature:**

```typescript
// [v1 deviation] Each table entry is a { table, relations } wrapper (TableEntry pattern)
type TableEntry = { table: TableDef; relations: Record<string, RelationDef> };

function createDb<TTables extends Record<string, TableEntry>>(config: {
  url: string;
  pool?: { max?: number; idleTimeout?: number; connectionTimeout?: number };  // [v1 deviation] no `min`, added `connectionTimeout`
  tables: TTables;
  casing?: 'snake_case' | 'camelCase';
  log?: (message: string) => void;  // [v1 deviation] function callback, not enum
  // plugins is NOT wired in v1 -- plugin infra exists but not connected to query execution
}): DatabaseInstance<TTables>;  // [v1 deviation] return type is DatabaseInstance, not Database
```

The `DatabaseInstance<TTables>` type carries the full table registry. All query methods are typed against this registry.

**Note on `url` type:** `process.env.DATABASE_URL` is `string | undefined` in strict TypeScript, but `url` requires `string`. Use the non-null assertion (`!`) or, in a full vertz app, use `vertz.env()` for type-safe environment access:

```typescript
import { vertz } from '@vertz/core';

const env = vertz.env({ DATABASE_URL: 'string' });
const db = createDb({ url: env.DATABASE_URL, ... });
```

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
| `d.email()` | `text` (with format metadata) | `string` |
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
| `.sensitive()` | Excluded from `$not_sensitive` type (read visibility only -- does NOT affect writes) |
| `.hidden()` | Excluded from both `$not_sensitive` and `$not_hidden` types (read visibility only -- does NOT affect writes) |
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

**`d.email()` and typed column methods -- runtime behavior:**

`d.email()` is **metadata-only** at the database level (maps to PostgreSQL `text`). It does NOT perform runtime email validation on insert. The "format metadata" is exposed on the column definition for introspection (e.g., migration tools, documentation generators, or future form generation) but has no runtime effect on `db.create()` or `db.update()`.

If you need runtime email validation on insert, use the `JsonbValidator` pattern with a validator, or validate in your application layer before calling `db.create()`. The same applies to `d.uuid()` -- PostgreSQL enforces the UUID format at the database level, but `@vertz/db` does not add a runtime check on top.

**Rationale:** Runtime validation on every insert/update adds overhead and conflates concerns. The database layer should handle persistence; validation belongs in the application or schema layer. Developers who use `@vertz/schema` alongside `@vertz/db` get validation at the API boundary, before data reaches the ORM.

**`select: { not }` and explicit select are mutually exclusive:**

```typescript
// Valid -- visibility filter only
db.findOne('users', { select: { not: 'sensitive' } });

// Valid -- explicit fields only
db.findOne('users', { select: { id: true, name: true } });

// Type error -- cannot combine `not` with explicit fields
db.findOne('users', { select: { not: 'sensitive', id: true } });
```

**Mutual exclusivity type enforcement** (Ben's fix -- uses `never`-keyed branches):

```typescript
type SelectOption<TColumns> =
  | { not: 'sensitive' | 'hidden'; [K in keyof TColumns]?: never }  // visibility filter -- explicit keys forbidden
  | { [K in keyof TColumns]?: true; not?: never }                   // explicit pick -- `not` forbidden

// The `never` on the opposing key is what enforces true mutual exclusivity.
// Without it, TypeScript's excess property checking on union types would
// silently accept the illegal combination { not: 'sensitive', id: true }.
```

This must be validated with a `.test-d.ts` proving the rejection works.

### 1.3 Visibility Annotations

Two-tier visibility model for column sensitivity. **Visibility is a read-side concept only -- it controls what columns appear in query results. It does NOT affect write operations (`$insert`, `$update`).** This separation ensures columns like `passwordHash` (which must be written on insert but never returned in queries) work correctly.

```typescript
const users = d.table('users', {
  id:           d.uuid().primary(),
  email:        d.email().sensitive(),    // PII -- excluded from $not_sensitive reads
  passwordHash: d.text().hidden(),        // Secret -- excluded from both $not_sensitive and $not_hidden reads
  name:         d.text(),                 // Normal -- included everywhere
});
```

Derived type helpers:

```typescript
// Read types -- visibility affects these
type User         = typeof users.$infer;           // { id, email, name } (default SELECT -- hidden columns excluded)
type UserFull     = typeof users.$infer_all;        // { id, email, passwordHash, name } (all columns, explicit opt-in)
type UserPublic   = typeof users.$not_sensitive;    // { id, name }
type UserSafe     = typeof users.$not_hidden;       // { id, email, name }

// Write types -- visibility does NOT affect these
type UserInsert   = typeof users.$insert;           // { email, name, passwordHash, organizationId } (no id -- has default; ALL writable columns included)
type UserUpdate   = typeof users.$update;           // Partial<{ email, name, passwordHash, organizationId }>
```

**Key design rule:** `.hidden()` means "excluded from SELECT by default." `.sensitive()` means "excluded from `$not_sensitive` type." **Neither annotation affects write operations.** `$insert` includes all columns that do not have defaults (plus optional columns that do). `$update` makes all non-primary-key columns optional. Both include `.hidden()` and `.sensitive()` columns because you must be able to write to any column.

### 1.4 Relations

> **[v1 deviation] Separate-registry pattern:** The original design defined relations inline as a third argument to `d.table()`. The actual implementation uses a **separate relation registry** pattern where relations are standalone objects combined in `TableEntry` wrappers passed to `createDb()`. This avoids circular dependencies between table definitions (e.g., `users` referencing `posts` and `posts` referencing `users`).

```typescript
import { d } from '@vertz/db';

// ---- Step 1: Define table schemas (NO inline relations) ----

export const users = d.table('users', {
  id:   d.uuid().primary(),
  name: d.text(),
});

export const posts = d.table('posts', {
  id:       d.uuid().primary(),
  authorId: d.uuid(),
  title:    d.text(),
});

export const postTags = d.table('post_tags', {
  postId: d.uuid(),
  tagId:  d.uuid(),
});

export const tags = d.table('tags', {
  id:   d.uuid().primary(),
  name: d.text().unique(),
});

// ---- Step 2: Define relations as standalone objects ----

// belongsTo (many-to-one)
export const postRelations = {
  author: d.ref.one(() => users, 'authorId'),
};

// hasMany (one-to-many) -- declared on the "one" side
export const userRelations = {
  posts: d.ref.many(() => posts, 'authorId'),
};

// manyToMany (via explicit join table)
export const postTagRelations = {
  post: d.ref.one(() => posts, 'postId'),
  tag:  d.ref.one(() => tags, 'tagId'),
};

export const tagRelations = {
  posts: d.ref.many(() => posts).through(() => postTags, 'tagId', 'postId'),
};

// ---- Step 3: Combine in createDb() via TableEntry wrappers ----

const db = createDb({
  url: process.env.DATABASE_URL!,
  tables: {
    users:    { table: users, relations: userRelations },
    posts:    { table: posts, relations: postRelations },
    postTags: { table: postTags, relations: postTagRelations },
    tags:     { table: tags, relations: tagRelations },
  },
});
```

Lazy references (`() => table`) avoid circular dependency issues in TypeScript module resolution. The separate-registry pattern further eliminates circular dependencies that arose with the inline `d.table()` third-argument approach.

> **NOTE:** The inline `d.table(name, columns, { relations: {...} })` approach shown in other sections (1.2, etc.) reflects the original design but is **NOT how the implementation works**. The third argument to `d.table()` is not used for relations in v1. Relations are always defined separately and passed via `TableEntry` wrappers.

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

**SQL injection prevention:** All query builder methods use parameterized queries internally. Filter values, data payloads, and any user-provided input are always passed as bound parameters (`$1`, `$2`, ...) -- never interpolated into SQL strings. This is not opt-in; it is the default and only behavior. The `sql` tagged template (Section 1.8) also parameterizes all interpolated values. Only `sql.raw()` bypasses parameterization and must be used exclusively with trusted input.

**Find queries:**

The single-row method is `findOne` (returns `T | null`). The multi-row method is `findMany` (returns `T[]`). The pair `findOne`/`findMany` is explicit and unambiguous.

```typescript
// [v1 deviation] All query methods take a string table name (registry key), not a TableDef reference

// Find one by filter -- returns single row or null
const user = await db.findOne('users', {
  where: { email: 'alice@example.com' },
});
// Type: User | null

// Find one or throw -- returns single row, throws NotFoundError if missing
const user = await db.findOneOrThrow('users', {
  where: { id: userId },
});
// Type: User (throws NotFoundError if missing)

// Find many with options
const results = await db.findMany('users', {
  where: { active: true },
  select: { id: true, name: true, email: true },
  orderBy: { createdAt: 'desc' },
  limit: 20,
  offset: 0,
});
// Type: Pick<User, 'id' | 'name' | 'email'>[]

// Find many with includes
const postsWithAuthor = await db.findMany('posts', {
  where: { status: 'published' },
  include: {
    author: true,
  },
  orderBy: { createdAt: 'desc' },
});
// Type: (Post & { author: User })[]

// Combined select + include
const postsWithAuthorName = await db.findMany('posts', {
  select: { title: true, status: true },
  include: {
    author: { select: { name: true } },
  },
});
// Type: (Pick<Post, 'title' | 'status'> & { author: Pick<User, 'name'> })[]

// Cursor-based pagination
// [v1 deviation] NOT IMPLEMENTED in v1 -- cursor pagination is deferred
// const page = await db.findMany('posts', {
//   where: { status: 'published' },
//   cursor: { id: lastPostId },
//   take: 20,
//   orderBy: { createdAt: 'desc' },
// });

// findManyAndCount -- combined count + results
const { data, total } = await db.findManyAndCount('posts', {
  where: { status: 'published' },
  limit: 20,
  offset: 0,
});
// Type: { data: Post[]; total: number }
```

**Filter operators:**

```typescript
const results = await db.findMany('posts', {
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

    // [v1 deviation] OR/NOT logical operators are NOT IMPLEMENTED in v1
    // OR: [
    //   { status: 'published' },
    //   { authorId: currentUserId },
    // ],
    // NOT: { status: 'archived' },

    // [v1 deviation] Relation filters are NOT IMPLEMENTED in v1
    // author: { active: true },
  },
});
```

**Mutation queries:**

```typescript
// [v1 deviation] All mutation methods take string table names, not TableDef references

// Create
const user = await db.create('users', {
  data: {
    email: 'alice@example.com',
    name: 'Alice',
    organizationId: orgId,
  },
});
// Type: User

// Create many (batch insert)
const created = await db.createMany('users', {
  data: [
    { email: 'alice@example.com', name: 'Alice', organizationId: orgId },
    { email: 'bob@example.com', name: 'Bob', organizationId: orgId },
  ],
});
// Type: { count: number }

// Create many and return (separate method -- founder decision #5)
const createdUsers = await db.createManyAndReturn('users', {
  data: [
    { email: 'alice@example.com', name: 'Alice', organizationId: orgId },
    { email: 'bob@example.com', name: 'Bob', organizationId: orgId },
  ],
});
// Type: User[]

// Update -- throws NotFoundError if where clause matches zero rows
const updated = await db.update('users', {
  where: { id: userId },
  data: { name: 'Alice Smith' },
});
// Type: User (never null -- throws if no match)

// Update many -- returns count, never throws for zero matches
const result = await db.updateMany('users', {
  where: { active: false },
  data: { role: 'viewer' },
});
// Type: { count: number } (count may be 0)

// Upsert -- always returns a row (creates if not found)
const user = await db.upsert('users', {
  where: { email: 'alice@example.com' },
  create: { email: 'alice@example.com', name: 'Alice', organizationId: orgId },
  update: { name: 'Alice' },
});
// Type: User

// Delete -- throws NotFoundError if where clause matches zero rows
const deleted = await db.delete('users', {
  where: { id: userId },
});
// Type: User (never null -- throws if no match)

// Delete many -- returns count, never throws for zero matches
const result = await db.deleteMany('users', {
  where: { active: false },
});
// Type: { count: number } (count may be 0)

// Count
const count = await db.count('users', {
  where: { active: true },
});
// Type: number

// Aggregate
const stats = await db.aggregate('posts', {
  _avg: { views: true },
  _sum: { views: true },
  _count: true,
  where: { status: 'published' },
});
// Type: { _avg: { views: number | null }; _sum: { views: number }; _count: number }

// Group by
const groups = await db.groupBy('posts', {
  by: ['status'],
  _count: true,
  _avg: { views: true },
  orderBy: { _count: 'desc' },
});
// Type: { status: PostStatus; _count: number; _avg: { views: number | null } }[]
```

**Zero-match behavior for mutations:**

| Method | Zero matches | Return type |
|--------|-------------|-------------|
| `findOne` | Returns `null` | `T \| null` |
| `findOneOrThrow` | Throws `NotFoundError` | `T` |
| `findMany` | Returns `[]` | `T[]` |
| `update` | Throws `NotFoundError` | `T` |
| `updateMany` | Returns `{ count: 0 }` | `{ count: number }` |
| `delete` | Throws `NotFoundError` | `T` |
| `deleteMany` | Returns `{ count: 0 }` | `{ count: number }` |

The pattern: single-row mutations (`update`, `delete`) throw `NotFoundError` when no rows match. Multi-row mutations (`updateMany`, `deleteMany`) return a count that may be zero. This is consistent with `findOne` (returns null) vs. `findOneOrThrow` (throws).

### 1.8 SQL Escape Hatch

For queries that cannot be expressed through the query builder:

```typescript
import { sql } from '@vertz/db';

// [v1 deviation] db.query() returns QueryResult<T> with .rows and .rowCount, not T[]

// Tagged template literal with type-safe parameters
const result = await db.query<{ id: string; title: string; rank: number }>(
  sql`SELECT id, title, ts_rank(search_vector, query) AS rank
      FROM posts, to_tsquery('english', ${searchTerm}) query
      WHERE search_vector @@ query
      ORDER BY rank DESC
      LIMIT ${limit}`
);
// result.rows[0].rank  -- access via .rows
// result.rowCount       -- number of rows returned

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
// topAuthors.rows[0].postCount  -- access via .rows

// Raw SQL escape (for truly dynamic queries)
const columns = sql.raw('id, name, email');
const result2 = await db.query(sql`SELECT ${columns} FROM users`);
// result2.rows  -- the row array
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

// Constraint violations -- [v1 deviation] error codes use PG numeric codes, not semantic strings
class UniqueConstraintError extends DbError {
  readonly code = '23505';  // [v1 deviation] was 'UNIQUE_VIOLATION'
  readonly column: string;
  readonly value: unknown;
}

class ForeignKeyError extends DbError {
  readonly code = '23503';  // [v1 deviation] was 'FOREIGN_KEY_VIOLATION'
  readonly constraint: string;
  readonly detail: string;
}

class NotNullError extends DbError {
  readonly code = '23502';  // [v1 deviation] was 'NOT_NULL_VIOLATION'
  readonly column: string;
}

class CheckConstraintError extends DbError {
  readonly code = '23514';  // [v1 deviation] was 'CHECK_VIOLATION'
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

// [v1 deviation] ConnectionPoolExhaustedError extends ConnectionError, not DbError directly
class ConnectionPoolExhaustedError extends ConnectionError {
  readonly code = 'POOL_EXHAUSTED';
}
```

**Adapter for `@vertz/core`:**

```typescript
import { dbErrorToHttpError } from '@vertz/db';  // [v1 deviation] single barrel export, was '@vertz/db/core-adapter'

// Maps DbError -> VertzException (when used inside @vertz/core)
// UniqueConstraintError -> ConflictException (409)
// NotFoundError -> NotFoundException (404)
// ConnectionError -> ServiceUnavailableException (503)
```

**Exhaustiveness guarantee** (Ben's requirement -- prevents silent breakage when new `DbError` subclasses are added):

```typescript
// Every DbError code must be mapped. If a new subclass is added without
// updating this map, the type system catches it at compile time.
type DbErrorCode = DbError['code'];

type DbErrorToHttpMap = {
  '23505': 409;   // [v1 deviation] PG numeric codes
  '23503': 422;
  '23502': 422;
  '23514': 422;
  NOT_FOUND: 404;
  CONNECTION_ERROR: 503;
  POOL_EXHAUSTED: 503;
};

// Assert exhaustiveness: keyof DbErrorToHttpMap must cover all DbError codes
type Assert<T extends U, U> = T;
type _Exhaustive = Assert<DbErrorCode, keyof DbErrorToHttpMap>;

// When v1.1 adds TransactionError with code 'TRANSACTION_ERROR',
// _Exhaustive will fail because 'TRANSACTION_ERROR' is not in DbErrorToHttpMap.
// This forces the adapter to be updated before it compiles.
```

PostgreSQL error code parser (~80 lines) maps native PG error codes to typed `DbError` subclasses. Human-readable error messages include the table name, column name, and constraint name so developers can act on them immediately.

**`TransactionError` is deferred to v1.1** with transaction support.

### 1.10 Getting Started -- `vertz db init`

> **[v1 deviation] `vertz db init` is NOT IMPLEMENTED in v1.** The scaffolding command described below is designed but deferred. Developers must manually create the schema files and `createDb()` boilerplate for now.

First-time setup for developers new to `@vertz/db`:

```bash
# Initialize database schema directory and boilerplate
vertz db init
```

`vertz db init` scaffolds the following:

```
db/
├── schema.ts    # Starter schema with one example table
└── index.ts     # createDb() boilerplate with table imports
```

**What `vertz db init` does:**

1. Creates `db/` directory (or configurable path)
2. Generates `db/schema.ts` with a commented example table (`users` with id, email, name, createdAt)
3. Generates `db/index.ts` with `createDb()` boilerplate importing the example schema
4. Detects `DATABASE_URL` in environment -- warns if missing, suggests `.env` setup
5. Prints next steps: "Edit `db/schema.ts`, then run `vertz db push` to apply"

This is the zero-to-working-ORM-in-5-minutes path. Without it, developers must manually create the directory structure and know the file conventions.

### 1.11 Migration Workflow

```bash
# Development: generate and apply migration
vertz db migrate dev --name add-user-bio

# Production: apply pending migrations
vertz db migrate deploy

# Push schema directly (dev shortcut, no migration file)
vertz db push

# Check migration status
vertz db migrate status

# Dry-run mode: preview generated SQL without applying
vertz db migrate dev --name add-user-bio --dry-run
```

**Dry-run mode:** `--dry-run` generates the migration SQL file and prints it to stdout, but does NOT apply it to the database. Useful for reviewing generated SQL before committing, or for CI pipelines that need to verify migration correctness without a live database.

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

### 1.12 Connection Management

```typescript
const db = createDb({
  url: process.env.DATABASE_URL!,
  pool: {
    max: 10,
    idleTimeout: 30_000,
    connectionTimeout: 10_000,  // [v1 deviation] replaces `min`; added connectionTimeout
  },
  // ...
});

// Graceful shutdown
await db.close();

// Health check
const healthy = await db.isHealthy();
```

Connection pool configuration: max connections, idle timeout, connection timeout. `min` is not supported in v1 (dropped as unused). Graceful shutdown drains the pool. Health check runs a simple query (`SELECT 1`). Connection error recovery with automatic reconnection.

### 1.13 Plugin Interface (@experimental)

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

There is one way to define a table (`d.table()`), one way to define a column (the `d` namespace), one way to query (`db.findOne/findMany/create/update/delete`), and one way to migrate (`vertz db migrate`). No alternative API patterns, no builder vs. object syntax debate, no code-first vs. schema-first choice. The `d` namespace IS the schema. The schema IS the types. The types drive the queries.

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
7. **Caching layer** -- No built-in cache in v1. ~~Cache-readiness primitives (mutation event bus, query fingerprinting, result metadata, relation invalidation graph) are deferred to v1.1.~~ **[v1 deviation]** Event bus (`createEventBus`) and query fingerprinting (`fingerprint`) shipped in v1. Result metadata and relation invalidation graph remain deferred. Caching is a consumer concern. See Section 8 for details.
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

### U6: `d.ref.many().through()` type inference at depth 2 -- UNVALIDATED

**Question:** Does through-table resolution for many-to-many relations stay within the type budget when used with nested includes?

**Background:** POC 1 validated `d.ref.one()` and `d.ref.many()` (direct relations) at 28.5% of budget. It did NOT test `d.ref.many().through()` which introduces a third generic parameter into `IncludeResolve` -- the through-table lookup adds an extra indirection layer. At depth 2 (e.g., `Tag -> posts (via postTags) -> author`), the type system resolves 3 table lookups and 2 JOIN type resolutions.

**Risk:** Medium. The extra generic parameter could push instantiation counts higher than the POC measured. The through-table FK column resolution (`from`/`to` column mapping) adds complexity that was not benchmarked.

**Decision:** Through-table includes are **capped at depth 1** until validated. You can include the many-to-many relation itself (`include: { posts: true }` on tags), but nested includes on the target table through a through-table are NOT supported in v1 (`include: { posts: { include: { author: true } } }` via a through-table is depth 2 and deferred).

**Follow-up:** A targeted POC may be needed during Phase implementation to validate through-table type inference at depth 2. If it stays within budget, the cap can be lifted. If not, the depth-1 cap remains as a documented limitation.

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

createDb({ tables: TTables })  // TTables = Record<string, TableEntry>
  -> DatabaseInstance<TTables>  // [v1 deviation] was Database<TTables>
    -> db.findOne('tableName', { select?, include?, where? })  // [v1 deviation] string key, not TableDef
      -> FindResult<TableDef, { select, include }>
        -> SelectNarrow<TColumns, TSelect>
        -> IncludeResolve<TRelations, TInclude, depth=2>
    -> db.create('tableName', { data })
      -> validates against InsertInput<TColumns>
      -> returns InferColumns<TColumns>
    -> db.update('tableName', { where, data })
      -> validates against UpdateInput<TColumns>
      -> returns InferColumns<TColumns>
```

### 6.2 Generic Type Flow Paths

Each path below becomes a mandatory `.test-d.ts` acceptance criterion:

1. **Column type -> inferred TS type:** `d.uuid()` -> `string`, `d.boolean()` -> `boolean`, etc.
2. **Column modifiers -> type narrowing:** `.nullable()` -> `T | null`, `.default(v)` -> optional in `$insert`
3. **Table columns -> `$infer`:** All columns mapped to their TS types
4. **Table columns -> `$insert`:** Columns with `.default()` become optional. `.hidden()` and `.sensitive()` columns are INCLUDED (visibility is read-only, does not affect writes)
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
15. **`SelectOption` mutual exclusivity:** `{ not: 'sensitive', id: true }` is rejected at compile time (never-keyed branches)

### 6.3 Type Error Quality Strategy

Type error quality is a v1.0 requirement (founder decision #7). The type system must produce errors that are actionable for both developers and LLMs. Drizzle's unreadable 50-line generic expansion errors are the anti-pattern to avoid.

**Strategy: Branded error message types**

When the compiler rejects invalid input, the error message should include a human-readable string, not a raw generic expansion. This is achieved using branded "error message" types as type-level assertions:

```typescript
// Instead of: Type '{ titel: true }' is not assignable to type '{ id?: true; authorId?: true; ... }'
// The developer sees:
type InvalidSelectKey<K extends string, Table extends string> =
  `ERROR: Column '${K}' does not exist on table '${Table}'.`;

// Applied in SelectOption:
type ValidateSelect<TColumns, TSelect> = {
  [K in keyof TSelect]: K extends keyof TColumns
    ? true
    : InvalidSelectKey<K & string, 'posts'>;
};
```

**Example of good vs. bad error:**

Bad (raw generic expansion):
```
Type '{ titel: true }' is not assignable to type
  'SelectNarrow<{ id: ColumnDef<"uuid", string, ...>; authorId: ColumnDef<"uuid", string, ...>;
  title: ColumnDef<"text", string, ...>; content: ColumnDef<"text", string, ...>; status:
  ColumnDef<"enum", "draft" | "published" | "archived", ...>; ... }, { titel: true }>'.
```

Good (branded error message):
```
Type 'true' is not assignable to type
  'ERROR: Column 'titel' does not exist on table 'posts'.'
```

**Implementation requirements:**
- Every `select`, `include`, `where`, and `orderBy` option must produce branded errors for invalid keys
- Nested `include` errors must identify the relation and the invalid key (e.g., `"ERROR: Column 'naem' does not exist on relation 'author' (table 'users')"`)
- `$insert` and `$update` errors for missing required fields must name the field
- All branded error types must be validated with `.test-d.ts` tests proving the error messages are readable

---

## 7. E2E Acceptance Test

The following test validates the entire ORM works end-to-end. It exercises schema definition, type inference, queries, relations, mutations, filters, error handling, and migrations.

```typescript
// [v1 deviation] Updated to reflect actual implementation patterns:
// - TableEntry wrappers with separate relations
// - String table names in query methods
// - QueryResult<T> return from db.query()
// - Imports from '@vertz/db' (single barrel, no subpath exports)

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createDb, d, sql, push } from '@vertz/db';
import {
  DbError,
  UniqueConstraintError,
  NotFoundError,
  ForeignKeyError,
} from '@vertz/db';  // [v1 deviation] was '@vertz/db/errors'

// -- Schema Definition (tables defined without inline relations) --

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
});

const comments = d.table('comments', {
  id:        d.uuid().primary(),
  postId:    d.uuid(),
  authorId:  d.uuid(),
  body:      d.text(),
  createdAt: d.timestamp().default('now'),
});

const featureFlags = d.table('feature_flags', {
  id:      d.uuid().primary(),
  name:    d.text().unique(),
  enabled: d.boolean().default(false),
}).shared();

// -- Relations (separate-registry pattern) --

const postRelations = {
  author: d.ref.one(() => users, 'authorId'),
};

const commentRelations = {
  post:   d.ref.one(() => posts, 'postId'),
  author: d.ref.one(() => users, 'authorId'),
};

// -- Type Inference Assertions --

type UserInfer = typeof users.$infer;          // default SELECT: excludes .hidden()
type UserFull = typeof users.$infer_all;       // all columns including hidden
type UserPublic = typeof users.$not_sensitive;  // excludes .sensitive() + .hidden()
type UserInsert = typeof users.$insert;         // write type: includes ALL columns, .default() optional
type UserUpdate = typeof users.$update;

// Positive type test -- $infer excludes hidden columns (passwordHash)
const _typeTest1: UserInfer = {
  id: 'uuid', organizationId: 'uuid', email: 'e@x.com',
  name: 'Alice', active: true, createdAt: new Date(),
};

// @ts-expect-error -- passwordHash is .hidden(), not present on $infer
const _typeTest1b: UserInfer = {
  id: 'uuid', organizationId: 'uuid', email: 'e@x.com',
  passwordHash: 'hash', name: 'Alice', active: true, createdAt: new Date(),
};

// @ts-expect-error -- email is .sensitive(), excess property on $not_sensitive
const _typeTest2: UserPublic = { id: 'uuid', email: 'e@x.com', name: 'Alice' };

// Positive type test -- $insert includes hidden columns (passwordHash is writable)
const _typeTest3: UserInsert = {
  email: 'e@x.com', name: 'Alice', organizationId: 'uuid',
  passwordHash: 'hash',
  // id, active, createdAt are optional (have defaults)
};

// @ts-expect-error -- name is required on $insert (no default), cannot be omitted
const _typeTest4: UserInsert = { email: 'e@x.com', organizationId: 'uuid', passwordHash: 'hash' };

// -- Database Tests --

describe('@vertz/db E2E', () => {
  let db: ReturnType<typeof createDb>;
  let orgId: string;
  let userId: string;
  let postId: string;

  beforeAll(async () => {
    db = createDb({
      url: process.env.TEST_DATABASE_URL!,
      tables: {
        organizations: { table: organizations, relations: {} },
        users:         { table: users, relations: {} },
        posts:         { table: posts, relations: postRelations },
        comments:      { table: comments, relations: commentRelations },
        featureFlags:  { table: featureFlags, relations: {} },
      },
      log: (msg: string) => {}, // silent for tests
    });
    // Push schema (test setup) -- [v1 deviation] push() is a standalone function, not db.$push()
    await push(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('creates an organization', async () => {
    const org = await db.create('organizations', {
      data: { id: crypto.randomUUID(), name: 'Acme Corp', slug: 'acme' },
    });
    orgId = org.id;
    expect(org.name).toBe('Acme Corp');
  });

  it('creates a user', async () => {
    const user = await db.create('users', {
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
      await db.create('users', {
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
    const post = await db.create('posts', {
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
    const result = await db.findMany('posts', {
      where: { status: 'published' },
      include: { author: true },
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].author.name).toBe('Alice');
  });

  it('finds with select narrowing', async () => {
    const result = await db.findMany('posts', {
      select: { title: true, status: true },
    });
    expect(result[0]).toHaveProperty('title');
    expect(result[0]).toHaveProperty('status');
    // @ts-expect-error -- content is not selected
    result[0].content;
  });

  it('finds with visibility filter', async () => {
    const result = await db.findMany('users', {
      select: { not: 'sensitive' },
    });
    // @ts-expect-error -- email is sensitive, excluded
    result[0].email;
    expect(result[0]).toHaveProperty('name');
  });

  it('updates a post', async () => {
    const updated = await db.update('posts', {
      where: { id: postId },
      data: { title: 'Updated Title' },
    });
    expect(updated.title).toBe('Updated Title');
  });

  it('uses filter operators', async () => {
    const result = await db.findMany('posts', {
      where: {
        views: { gte: 0 },
        status: { in: ['published', 'draft'] },
        title: { contains: 'Vertz' },
      },
    });
    expect(result.length).toBeGreaterThan(0);
  });

  it('uses findManyAndCount', async () => {
    const { data, total } = await db.findManyAndCount('posts', {
      where: { status: 'published' },
      limit: 10,
    });
    expect(total).toBeGreaterThan(0);
    expect(data.length).toBeLessThanOrEqual(10);
  });

  it('throws NotFoundError on findOneOrThrow', async () => {
    try {
      await db.findOneOrThrow('posts', {
        where: { id: '00000000-0000-0000-0000-000000000000' },
      });
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
    }
  });

  it('rejects invalid FK (ForeignKeyError)', async () => {
    try {
      await db.create('posts', {
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
    // [v1 deviation] db.query() returns QueryResult<T> with .rows and .rowCount
    const result = await db.query<{ count: number }>(
      sql`SELECT COUNT(*)::integer AS count FROM posts WHERE status = ${'published'}`
    );
    expect(result.rows[0].count).toBeGreaterThan(0);
  });

  it('deletes a comment', async () => {
    const comment = await db.create('comments', {
      data: {
        id: crypto.randomUUID(),
        postId,
        authorId: userId,
        body: 'Great post!',
      },
    });
    const deleted = await db.delete('comments', {
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

## 8. Cache-Readiness Primitives -- ~~v1.1 Preview (Not In Scope for v1.0)~~

> **[v1 deviation] The event bus and query fingerprinting shipped in v1, contrary to the original plan.** `createEventBus`, `fingerprint`, and `createPluginRunner` are all exported from `@vertz/db` in v1.0. The original note that "these primitives are NOT part of the v1.0 deliverable" is no longer accurate. The remaining primitives (result metadata carrier, relation invalidation graph) are still deferred.

Five primitives that make future caching possible without committing to a cache strategy:

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

---

## 9. Design Deviations (v1.0 Implementation vs. Design Doc)

This section documents all deviations between the original design and the actual v1.0 implementation, discovered during adversarial API diff review.

### Breaking Changes

| # | Change | Design Doc | Implementation | Reason |
|---|--------|-----------|----------------|--------|
| 1 | Table registry shape | `createDb({ tables: { users, posts } })` with flat `TableDef` values | `createDb({ tables: { users: { table, relations } } })` with `TableEntry` wrappers | Separate relations from table defs to avoid circular dependencies between co-referencing tables |
| 2 | Relations definition | Inline in `d.table()` 3rd argument `{ relations: {...} }` | Separate objects combined in `TableEntry` wrappers | Circular dependency between tables (e.g., users <-> posts) prevented the inline approach |
| 3 | Query method arguments | `db.findOne(users, {...})` passing `TableDef` reference | `db.findOne('users', {...})` passing string registry key | String keys enable type-safe lookup from the `TableEntry` registry without importing table defs everywhere |
| 4 | `log` option type | `'query' \| 'error' \| 'all' \| false` (enum) | `(message: string) => void` (callback function) | More flexible; consumers control formatting and routing without opinionated log levels |
| 5 | Return type of `createDb()` | `Database<TTables>` | `DatabaseInstance<TTables>` | Separates type inference interfaces from the runtime instance interface |
| 6 | `db.query()` return type | `T[]` (raw array) | `QueryResult<T>` with `.rows` and `.rowCount` | Returns query metadata alongside rows; consistent with pg driver patterns |
| 7 | Error codes | Semantic strings: `'UNIQUE_VIOLATION'`, `'FOREIGN_KEY_VIOLATION'`, etc. | PG numeric codes: `'23505'`, `'23503'`, `'23502'`, `'23514'` | Direct PG codes avoid lossy semantic mapping; developers can reference PG docs directly |
| 8 | Pool config | `{ min, max, idleTimeout }` | `{ max, idleTimeout, connectionTimeout }` | `min` was unused in practice; `connectionTimeout` added for connection acquisition deadline |
| 9 | `ConnectionPoolExhaustedError` | Extends `DbError` directly | Extends `ConnectionError` (which extends `DbError`) | Pool exhaustion is a connection problem; the inheritance hierarchy reflects this |
| 10 | `db.$push()` | Instance method on `db` | Standalone `push()` function imported from `@vertz/db` | CLI functions are standalone utilities, not tied to the database instance |
| 11 | Import paths | Subpath exports: `@vertz/db/errors`, `@vertz/db/core-adapter` | Single barrel export: everything from `@vertz/db` | Simpler consumer DX; single import source |
| 12 | `plugins` on `createDb()` | `plugins?: DbPlugin[]` parameter accepted | Not wired in v1 | Plugin infrastructure exists but is not connected to query execution pipeline |

### Deferred Features (designed but not in v1)

| Feature | Design Doc Section | Status |
|---------|-------------------|--------|
| Cursor-based pagination (`cursor`, `take`) | 1.7 | Not implemented |
| `OR` / `NOT` logical filter operators | 1.7 | Not implemented |
| Relation filters in `where` clause (`author: { active: true }`) | 1.7 | Not implemented |
| `vertz db init` CLI scaffolding | 1.10 | Not implemented |
| Compile-time error code exhaustiveness check | 1.9 | Not validated (PG numeric codes complicate the type-level map) |

### Additions (not in original design)

| Addition | Description |
|----------|-------------|
| Cache-readiness shipped early | `createEventBus`, `fingerprint`, `createPluginRunner` all exported in v1 (original plan deferred to v1.1) |
| Diagnostic module | `diagnoseError`, `explainError`, `formatDiagnostic` for actionable error explanations |
| Branded error types | `InvalidColumn`, `InvalidFilterType`, `ValidateKeys`, `StrictKeys` for type-level error messages |
| Low-level SQL builders | `buildSelect`, `buildInsert`, `buildUpdate`, `buildDelete` exported for advanced use cases |
| Tenant graph computation | `computeTenantGraph` exported as a standalone utility |
| PG error parsing | `parsePgError` exported for manual error handling |
| Row mapping utilities | `mapRow`/`mapRows`, `camelToSnake`/`snakeToCamel` exported |
| Aggregate extensions | `_min`/`_max` operators on aggregates; `limit`/`offset` on `groupBy` |
