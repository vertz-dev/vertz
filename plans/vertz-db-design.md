# @vertz/db -- Type-Safe ORM Design

**Stage:** 1 (Design)
**Author:** mike (vertz-tech-lead)
**Date:** 2026-02-09
**Status:** Draft -- Review Decisions Applied
**Reviewers:** josh (DX), PM (product), engineer (feasibility)

---

## Overview

`@vertz/db` is a type-safe ORM with a single `d` namespace for table definitions and column types. It provides an options-bag query API for everyday CRUD with field-level visibility annotations that produce compile-time-enforced derived schemas for data protection.

The ORM targets PostgreSQL exclusively. No codegen step. No binary dependencies. Pure TypeScript inference. If it builds, it runs.

See also: [Drizzle ORM Research](./drizzle-orm-research.md), [Prisma ORM Research](./prisma-orm-research.md), [Schema Design](./vertz-schema-design.md).

---

## Table of Contents

1. [API Surface](#1-api-surface)
   - [Client Setup](#11-client-setup)
   - [Table/Model Definition](#12-tablemodel-definition)
   - [Relations](#13-relations)
   - [Schema Visibility Annotations](#14-schema-visibility-annotations)
   - [Derived Schemas](#15-derived-schemas)
   - [Object-Based Query API (Default)](#16-object-based-query-api-default)
   - [SQL-Like Query API (Escape Hatch)](#17-sql-like-query-api-escape-hatch)
   - [Transactions](#18-transactions)
   - [Type Inference](#19-type-inference)
   - [Migration Workflow](#110-migration-workflow)
2. [Manifesto Alignment](#2-manifesto-alignment)
3. [Non-Goals](#3-non-goals)
4. [Unknowns](#4-unknowns)
5. [POC Results](#5-poc-results)
6. [E2E Acceptance Test](#6-e2e-acceptance-test)

---

## 1. API Surface

### 1.1 Client Setup

The database client wraps a standard `pg` connection. One import, one factory, zero ambient globals.

```typescript
import { createDb } from '@vertz/db';
import { users, posts, comments } from './schema';

// URL-based (simplest)
const db = createDb({
  url: process.env.DATABASE_URL,
  tables: { users, posts, comments },
});

// With explicit pool configuration
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

const db = createDb({
  pool,
  tables: { users, posts, comments },
  casing: 'snake_case', // auto camelCase TS <-> snake_case DB
  log: 'query',         // 'query' | 'error' | 'all' | false
});
```

**Design decisions:**
- `tables` is required and explicit. The client only knows about tables you register. No global schema discovery, no magic imports. This is the metadata registry that powers type inference, derived schemas, and future features (cache, real-time).
- `casing: 'snake_case'` is the default and only supported mode. TypeScript uses `camelCase`; the database uses `snake_case`. This is not configurable per-column -- it is a framework convention. One way to do things.
- The `db` object is the single entry point for all queries. No `prisma.user.findMany()` accessor magic -- you pass the table to the query method: `db.find(users, { ... })`.

**Type signature:**

```typescript
interface DbConfig<T extends Record<string, TableDef>> {
  url?: string;
  pool?: Pool;
  tables: T;
  casing?: 'snake_case'; // only snake_case supported; explicit for clarity
  log?: 'query' | 'error' | 'all' | false;
}

function createDb<T extends Record<string, TableDef>>(
  config: DbConfig<T>,
): Database<T>;
```

---

### 1.2 Table/Model Definition

Tables are defined using a single `d` namespace from `@vertz/db`. The schema definition *is* TypeScript -- no DSL, no codegen, no dependency on `@vertz/schema`.

```typescript
import { d } from '@vertz/db';

export const users = d.table('users', {
  id:        d.uuid().primary(),
  email:     d.email().sensitive(),
  name:      d.text().max(256),
  role:      d.enum(['user', 'admin', 'moderator']).default('user'),
  bio:       d.text().optional(),
  password:  d.text().hidden(),
  loginCount: d.integer().default(0),
  createdAt: d.timestamp().default(d.gen.now()),
  updatedAt: d.timestamp().default(d.gen.now()),
}).index('role');
```

**The `d` namespace:**

```typescript
import { d } from '@vertz/db';

// Table definition
d.table(tableName, shape)       // creates a TableDef from a column shape

// Column types
d.uuid()                        // UUID column
d.text()                        // TEXT (unbounded string)
d.email()                       // TEXT with email validation
d.integer()                     // INTEGER
d.boolean()                     // BOOLEAN
d.timestamp()                   // TIMESTAMPTZ
d.enum(values)                  // PostgreSQL native enum type (inline)
d.jsonb<T>(schema?)             // JSONB with optional typed schema
d.varchar(n)                    // VARCHAR(n)
d.serial()                      // serial / bigserial
d.decimal(precision, scale)     // DECIMAL
d.smallint()                    // SMALLINT
d.bigint()                      // BIGINT
d.real()                        // REAL
d.doublePrecision()             // DOUBLE PRECISION
d.bytea()                       // BYTEA
d.inet()                        // INET
d.cidr()                        // CIDR
d.macaddr()                     // MACADDR
d.tsvector()                    // TSVECTOR
d.tsquery()                     // TSQUERY
d.interval()                    // INTERVAL
d.point()                       // POINT
d.array(innerType)              // PostgreSQL array column

// Database-level defaults (server-side)
d.gen.uuid()                    // gen_random_uuid()
d.gen.now()                     // NOW()
d.gen.autoincrement()           // GENERATED ALWAYS AS IDENTITY
d.gen.cuid()                    // framework-provided CUID generation
d.gen.custom(sql`...`)          // arbitrary SQL default expression

// Relations (see section 1.3)
d.ref.one(targetFn, foreignKey) // one-to-one or many-to-one relation
d.ref.many(targetFn, foreignKey)// one-to-many relation
d.ref.many(targetFn).through(junctionFn) // many-to-many via junction table
```

**Column-level chaining (inline concerns):**

Every column type returns a chainable builder. Database concerns are declared inline on the column, not on the table builder:

```typescript
d.uuid().primary()              // marks as primary key
d.email().unique()              // unique constraint
d.text().optional()             // nullable
d.text().default('hello')       // database default value
d.text().sensitive()            // PII -- excluded from public APIs by default
d.text().hidden()               // secrets -- never leaves data layer
d.text().max(256)               // validation constraint
```

**Why a single `d` namespace?**

The `d` namespace provides a consistent API for defining everything about a table in one place. Column types, constraints, defaults, visibility annotations, and relations all chain from the same `d` entry point. This design has several advantages:

- **Consistent API.** One import, one namespace. `d.text().sensitive()` reads naturally -- the column type and its concerns are co-located in a single expression.
- **Inline concerns.** Instead of declaring a column type in one place and its constraints in another (`.primary('id')`, `.sensitive('email')` on the table builder), everything about a column is visible where the column is defined.
- **No dependency on `@vertz/schema`.** The `d` namespace is self-contained within `@vertz/db`. It uses the same familiar syntax patterns as `@vertz/schema` (chainable builders, `.optional()`, `.default()`) but is an independent package. `@vertz/schema` remains zero-dependency and database-agnostic. `@vertz/db` does not import from it.
- **LLM-friendly.** An LLM reading a table definition sees the complete picture in one block. No need to cross-reference a separate `s` import, no need to look at the table builder chain to find which column is the primary key.

**Table-level builder chaining:**

Table-level concerns that span multiple columns are declared on the table builder:

```typescript
d.table(name, shape)
  .index(column)                  // single-column index
  .index(col1, col2)              // composite index
  .unique(col1, col2)             // composite unique constraint
  .check(name, sql`...`)         // CHECK constraint
  .primary(col1, col2)            // composite primary key (override column-level)
```

Every builder method returns a new `TableDef` with updated type information. The TypeScript type narrows at each step.

**PostgreSQL enums:**

```typescript
export const users = d.table('users', {
  id:   d.uuid().primary(),
  role: d.enum(['user', 'admin', 'moderator']).default('user'),
  // ...
});
```

Enum values are declared inline on the column. The ORM generates a PostgreSQL `CREATE TYPE` for each unique enum in migrations.

**Typed JSONB columns:**

```typescript
const settingsSchema = d.jsonb<{
  theme: 'light' | 'dark';
  notifications: boolean;
  language: string;
}>();

export const users = d.table('users', {
  id:       d.uuid().primary(),
  settings: settingsSchema.default({ theme: 'light', notifications: true, language: 'en' }),
  // ...
});
```

The `d.jsonb<T>()` function takes a TypeScript type parameter and:
1. Uses it for TypeScript type inference (the column type is `T`)
2. Uses it for runtime validation on read/write
3. Stores it as metadata for JSON Schema generation / OpenAPI

**Reusable column patterns:**

```typescript
const timestamps = {
  createdAt: d.timestamp().default(d.gen.now()),
  updatedAt: d.timestamp().default(d.gen.now()),
};

export const users = d.table('users', {
  id:    d.uuid().primary().default(d.gen.uuid()),
  email: d.email().unique().sensitive(),
  ...timestamps,
});

export const posts = d.table('posts', {
  id:    d.uuid().primary().default(d.gen.uuid()),
  title: d.text(),
  ...timestamps,
});
```

---

### 1.3 Relations

Relations are defined inline as fields in the table definition using `d.ref.one()` and `d.ref.many()`. They are co-located with the columns they relate to -- no separate `defineRelations()` call, no `.hasMany()` / `.belongsTo()` vocabulary.

```typescript
import { d } from '@vertz/db';

// --- users.ts ---
export const users = d.table('users', {
  id:      d.uuid().primary(),
  email:   d.email().sensitive(),
  name:    d.text(),
  posts:   d.ref.many(() => posts, 'authorId'),       // Post[]
  profile: d.ref.one(() => profiles, 'userId'),        // Profile | null
});

// --- posts.ts ---
export const posts = d.table('posts', {
  id:       d.uuid().primary(),
  title:    d.text(),
  content:  d.text().optional(),
  authorId: d.uuid(),
  author:   d.ref.one(() => users, 'authorId'),        // User
  comments: d.ref.many(() => comments, 'postId'),      // Comment[]
  tags:     d.ref.many(() => tags).through(() => postTags),  // Tag[]
});

// --- profiles.ts ---
export const profiles = d.table('profiles', {
  id:     d.uuid().primary(),
  bio:    d.text().optional(),
  userId: d.uuid().unique(),   // enforces 1:1 at DB level
  user:   d.ref.one(() => users, 'userId'),            // User
});

// --- comments.ts ---
export const comments = d.table('comments', {
  id:     d.uuid().primary(),
  text:   d.text(),
  postId: d.uuid(),
  post:   d.ref.one(() => posts, 'postId'),            // Post
});

// --- tags.ts ---
export const tags = d.table('tags', {
  id:    d.uuid().primary(),
  name:  d.text().unique(),
  posts: d.ref.many(() => posts).through(() => postTags),  // Post[]
});

// --- post_tags.ts (junction table) ---
export const postTags = d.table('post_tags', {
  postId: d.uuid(),
  tagId:  d.uuid(),
}).primary('postId', 'tagId');
```

**Relation methods:**

```typescript
d.ref.one(targetTableFn, foreignKey)
  // Points to a single related record
  // Result type: TargetRow (non-null when FK is required)
  // Result type: TargetRow | null (when FK is optional or reverse side of 1:1)

d.ref.many(targetTableFn, foreignKey)
  // Points to multiple related records
  // Result type: TargetRow[]

d.ref.many(targetTableFn).through(junctionTableFn)
  // Many-to-many connected through an explicit junction table
  // Result type: TargetRow[]
```

**Why lazy references (`() => table`)?**

Circular dependencies. `users` references `posts` and `posts` references `users`. Lazy evaluation via arrow functions defers resolution until runtime, allowing circular imports to work naturally in both ESM and CJS.

**Why explicit foreign keys instead of inference?**

Explicit over implicit. The developer declares which column is the foreign key. No guessing, no naming conventions, no ambiguity. An LLM can read `d.ref.one(() => users, 'authorId')` and understand the relationship immediately.

**Foreign key constraints in the database:**

Relation declarations automatically generate the corresponding `REFERENCES` constraint in migrations. `d.ref.one(() => users, 'authorId')` on the `posts` table produces:

```sql
ALTER TABLE "posts"
  ADD CONSTRAINT "posts_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id");
```

Cascade behavior can be specified as an option:

```typescript
authorId: d.uuid(),
author:   d.ref.one(() => users, 'authorId', {
  onDelete: 'cascade',
  onUpdate: 'cascade',
}),
```

---

### 1.4 Schema Visibility Annotations

Field-level visibility annotations control where data is exposed. This is a first-class concept, not middleware or application logic. Two annotation tiers are provided, declared inline on columns.

```typescript
export const users = d.table('users', {
  id:           d.uuid().primary(),
  email:        d.email().sensitive(),          // PII -- excluded from public APIs
  name:         d.text().max(256),
  passwordHash: d.text().hidden(),              // secret -- never leaves data layer
  apiKey:       d.text().hidden(),              // secret -- never leaves data layer
  loginCount:   d.integer().default(0),
  createdAt:    d.timestamp().default(d.gen.now()),
});
```

**Two annotation tiers:**

| Annotation    | Meaning | Public API | Admin tools | Logs | Data layer |
|--------------|---------|:---:|:---:|:---:|:---:|
| (default)     | Normal field | Y | Y | Y | Y |
| `.sensitive()`| PII, emails, billing info | - | Y | `[REDACTED]` | Y |
| `.hidden()`   | Passwords, API keys, secrets | - | - | `[REDACTED]` | Y |

- **`.sensitive()`** -- Personally identifiable information, emails, billing details. Excluded from public APIs by default. Can appear in admin tools. Redacted in logs.
- **`.hidden()`** -- Passwords, API keys, internal secrets. Never leaves the data layer. Auto-redacted everywhere. Hidden subsumes sensitive -- a hidden field is inherently sensitive.

**"Not" notation for queries:**

Instead of named visibility presets (`select: 'public'`), the query API uses a `{ not: '...' }` notation that makes the exclusion semantics explicit:

```typescript
// Public API — exclude sensitive (and hidden, since hidden subsumes sensitive)
const publicUsers = await db.find(users, { select: { not: 'sensitive' } });
// => { id, name, loginCount, createdAt }

// Admin dashboard — exclude only hidden
const adminUsers = await db.find(users, { select: { not: 'hidden' } });
// => { id, name, email, loginCount, createdAt }

// Internal data layer — full access (default, no select)
const allUsers = await db.find(users);
// => all fields including passwordHash, apiKey
```

**Compile-time enforcement:**

The `{ not: 'sensitive' }` notation modifies the return type at compile time. Requesting a sensitive field when `not: 'sensitive'` is set produces a compile-time error:

```typescript
const publicUsers = await db.find(users, { select: { not: 'sensitive' } });

// This compiles -- name is a normal field
const name: string = publicUsers[0].name;

// @ts-expect-error -- email is sensitive, excluded by { not: 'sensitive' }
publicUsers[0].email;

// @ts-expect-error -- passwordHash is hidden (subsumes sensitive), always excluded
publicUsers[0].passwordHash;
```

**Auto-redact in logging:**

```typescript
logger.info('User loaded', { user });
// => { id: '...', name: 'Alice', email: '[REDACTED]', passwordHash: '[REDACTED]', ... }
```

- `toLog()` redacts sensitive + hidden by default.
- Hidden fields can NEVER be unredacted (enforced at type level).
- Sensitive fields can be included in audit logs with explicit opt-in.

**On-demand derived schemas:**

Instead of named schema properties on the table, schemas are derived on-demand using `schemaOf()`:

```typescript
import { schemaOf } from '@vertz/db';

const publicUserSchema = schemaOf(users, { not: 'sensitive' });
const adminUserSchema = schemaOf(users, { not: 'hidden' });
```

These are real schema objects usable for validation, serialization, and OpenAPI generation.

---

### 1.5 Derived Schemas

Each table definition automatically produces derived schemas. These are real schema objects that can be used for validation, serialization, and OpenAPI generation.

```typescript
import { users } from './schema';
import { schemaOf } from '@vertz/db';

// On-demand visibility-scoped schemas
const publicSchema = schemaOf(users, { not: 'sensitive' });
// ObjectSchema with only normal fields (no sensitive, no hidden)

const adminSchema = schemaOf(users, { not: 'hidden' });
// ObjectSchema with normal + sensitive fields (no hidden)

// Insert schema -- omits auto-generated fields, makes defaulted fields optional
users.insertSchema
// ObjectSchema<{ email: EmailSchema; name: StringSchema; ... }>
// id, createdAt have defaults -> optional

// Update schema -- all non-PK fields optional (partial)
users.updateSchema
// ObjectSchema<{ email?: EmailSchema; name?: StringSchema; ... }>
```

**Type-level extraction:**

```typescript
type FullUser = typeof users.$infer;
//   { id: string; email: string; name: string; passwordHash: string;
//     apiKey: string; loginCount: number; createdAt: Date }

type PublicUser = typeof users.$not_sensitive;
//   { id: string; name: string; loginCount: number; createdAt: Date }
//   ^^^ no email (sensitive), no passwordHash/apiKey (hidden)

type AdminUser = typeof users.$not_hidden;
//   { id: string; email: string; name: string; loginCount: number; createdAt: Date }
//   ^^^ includes sensitive fields, no passwordHash/apiKey (hidden)
```

**Integration with `@vertz/core` routes:**

```typescript
import { createRouter } from '@vertz/core';
import { users } from './schema';
import { schemaOf } from '@vertz/db';

const publicUserSchema = schemaOf(users, { not: 'sensitive' });

const router = createRouter('/users')
  .get('/', {
    response: { 200: publicUserSchema.array() },
    handler: async ({ db }) => {
      return db.find(users, { select: { not: 'sensitive' } });
    },
  })
  .post('/', {
    body: users.insertSchema,
    response: { 201: publicUserSchema },
    handler: async ({ db, body }) => {
      const user = await db.create(users, { data: body });
      return user;
    },
  });
```

**Integration with framework logger:**

```typescript
import { logger } from '@vertz/core';

// The framework logger automatically redacts sensitive + hidden fields
logger.info('User created', { user });
// Output: { id: "...", name: "Alice", email: "[REDACTED]", passwordHash: "[REDACTED]", ... }
// sensitive fields are "[REDACTED]", hidden fields are "[REDACTED]"
```

---

### 1.6 Object-Based Query API (Default)

This is the primary query API. It uses an options-bag syntax with thenable queries. Every query is type-safe from arguments to return value. The query object implements `PromiseLike` -- `await` just works, no `.execute()` needed (same pattern as Prisma).

**This is the API developers should use for 95% of queries.**

#### Find

```typescript
// Find many -- all users
const allUsers = await db.find(users);
// Type: User[]

// Find with filtering
const admins = await db.find(users, {
  where: { role: 'admin' },
});
// Type: User[]

// Find with complex filters
const results = await db.find(users, {
  where: {
    OR: [
      { email: { endsWith: '@company.com' } },
      { role: 'admin' },
    ],
    createdAt: { gte: '2024-01-01T00:00:00Z' },
  },
  orderBy: { createdAt: 'desc' },
  limit: 20,
  offset: 0,
});

// Find one (returns T | null)
const user = await db.findOne(users, {
  where: { email: 'alice@example.com' },
});
// Type: User | null

// Find one or throw (returns T, throws if not found)
const user = await db.findOneOrThrow(users, {
  where: { id: userId },
});
// Type: User
```

#### Select (field narrowing) + Include (relations) -- combinable

`select` and `include` can be used together. `select` narrows the scalar fields; `include` adds relations on top.

```typescript
// Select specific fields -- return type narrows
const emails = await db.find(users, {
  select: { id: true, email: true },
});
// Type: { id: string; email: string }[]

// Use visibility notation
const publicUsers = await db.find(users, {
  select: { not: 'sensitive' },
});
// Type: (fields without sensitive/hidden)[]

// Select + include combined
const usersWithPosts = await db.find(users, {
  select: { name: true, email: true },
  include: {
    posts: {
      select: { title: true, createdAt: true },
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      limit: 5,
    },
  },
});
// => { name: string; email: string; posts: { title: string; createdAt: Date }[] }[]
```

Include values can be `true` (all fields) or a nested query options object:

```typescript
// Include with true (all fields)
const usersWithPosts = await db.find(users, {
  include: {
    posts: true,
  },
});
// Type: (User & { posts: Post[] })[]

// Include with nested query options
const usersWithRecentPosts = await db.find(users, {
  include: {
    posts: {
      where: { createdAt: { gte: '2024-01-01T00:00:00Z' } },
      orderBy: { createdAt: 'desc' },
      limit: 5,
      include: {
        comments: true,
      },
    },
  },
});
// Type: (User & { posts: (Post & { comments: Comment[] })[] })[]

// Relation count
const usersWithCounts = await db.find(users, {
  include: {
    _count: { posts: true, comments: true },
  },
});
// Type: (User & { _count: { posts: number; comments: number } })[]
```

**Thenable pattern:** The query object implements `PromiseLike`, so `await` triggers execution. No `.execute()` needed. This is the same pattern used by Prisma.

```typescript
// These are equivalent:
const users1 = await db.find(users);
const users2 = await db.find(users).then(r => r);

// You can also chain before awaiting:
const query = db.find(users, { where: { role: 'admin' } });
// query is a PromiseLike -- not yet executed
const result = await query;
// now executed
```

#### Create

```typescript
// Single create
const user = await db.create(users, {
  data: {
    email: 'alice@example.com',
    name: 'Alice',
    passwordHash: hashedPassword,
  },
});
// Type: User (full row, including generated id, timestamps)

// Create with nested relation
const user = await db.create(users, {
  data: {
    email: 'alice@example.com',
    name: 'Alice',
    passwordHash: hashedPassword,
    posts: {
      create: [
        { title: 'My first post', content: 'Hello world' },
      ],
    },
  },
  include: { posts: true },
});
// Type: User & { posts: Post[] }

// Create many
const result = await db.createMany(users, {
  data: [
    { email: 'bob@example.com', name: 'Bob', passwordHash: hash1 },
    { email: 'carol@example.com', name: 'Carol', passwordHash: hash2 },
  ],
});
// Type: { count: number }

// Create many and return
const created = await db.createManyAndReturn(users, {
  data: [
    { email: 'bob@example.com', name: 'Bob', passwordHash: hash1 },
    { email: 'carol@example.com', name: 'Carol', passwordHash: hash2 },
  ],
});
// Type: User[]
```

#### Update

```typescript
// Update one
const updated = await db.update(users, {
  where: { id: userId },
  data: { name: 'Alice Updated' },
});
// Type: User

// Update many
const result = await db.updateMany(users, {
  where: { role: 'user' },
  data: { role: 'admin' },
});
// Type: { count: number }

// Upsert
const user = await db.upsert(users, {
  where: { email: 'alice@example.com' },
  create: { email: 'alice@example.com', name: 'Alice', passwordHash: hashed },
  update: { name: 'Alice' },
});
// Type: User
```

#### Delete

```typescript
// Delete one
const deleted = await db.delete(users, {
  where: { id: userId },
});
// Type: User (the deleted row)

// Delete many
const result = await db.deleteMany(users, {
  where: { createdAt: { lt: '2020-01-01T00:00:00Z' } },
});
// Type: { count: number }
```

#### Aggregations

```typescript
// Count
const count = await db.count(users, {
  where: { role: 'admin' },
});
// Type: number

// Aggregate
const stats = await db.aggregate(users, {
  _avg: { age: true },
  _min: { createdAt: true },
  _max: { createdAt: true },
  _count: { _all: true },
});

// Group by
const grouped = await db.groupBy(users, {
  by: ['role'],
  _count: { _all: true },
  having: {
    _count: { _all: { gt: 10 } },
  },
  orderBy: { _count: { _all: 'desc' } },
});
```

#### Filter Operators

The full set of filter operators available in `where` clauses:

```typescript
where: {
  // Equality (shorthand)
  role: 'admin',                        // equals

  // Comparison
  age: { eq: 25 },
  age: { ne: 25 },
  age: { gt: 18 },
  age: { gte: 18 },
  age: { lt: 65 },
  age: { lte: 65 },

  // String
  name: { contains: 'alice' },
  name: { startsWith: 'A' },
  name: { endsWith: 'son' },
  name: { like: 'A%' },                // SQL LIKE
  name: { ilike: 'a%' },               // case-insensitive LIKE (PG)

  // List
  role: { in: ['admin', 'moderator'] },
  role: { notIn: ['guest'] },

  // Null
  bio: { is: null },
  bio: { isNot: null },

  // Range
  age: { between: [18, 65] },

  // Logical
  AND: [{ role: 'admin' }, { age: { gte: 18 } }],
  OR: [{ role: 'admin' }, { role: 'moderator' }],
  NOT: { role: 'guest' },

  // Relation filters
  posts: { some: { published: true } },
  posts: { every: { published: true } },
  posts: { none: { published: false } },
  profile: { is: { bio: { isNot: null } } },
}
```

#### Cursor-Based Pagination

```typescript
// First page
const firstPage = await db.find(posts, {
  orderBy: { createdAt: 'desc' },
  limit: 20,
});

// Next page using cursor
const nextPage = await db.find(posts, {
  orderBy: { createdAt: 'desc' },
  cursor: { id: lastPostId },
  limit: 20,
});
```

---

### 1.7 SQL-Like Query API (Escape Hatch)

For queries that cannot be expressed with the object API: CTEs, window functions, complex joins, subqueries, recursive queries, custom aggregations, and raw SQL.

**The clear rule:** Use the object API by default. Reach for `db.sql` when:
1. The query requires a SQL feature not supported by the object API (CTEs, window functions, lateral joins, recursive queries, `UNION`, `INTERSECT`, `EXCEPT`)
2. You need to compose query fragments dynamically at a level the object API does not support
3. Performance optimization requires hand-tuned SQL

If you are writing a standard CRUD operation and reaching for `db.sql`, you are using the wrong API. The object API should be your first choice. The SQL API is the "break glass in case of emergency" escape hatch.

#### SQL-Like Query Builder

```typescript
import { eq, and, gt, desc, count, sql } from '@vertz/db';

// SELECT with JOIN
const result = await db.sql
  .select({
    userName: users.columns.name,
    postCount: count(posts.columns.id),
  })
  .from(users)
  .leftJoin(posts, eq(users.columns.id, posts.columns.authorId))
  .groupBy(users.columns.id)
  .having(gt(count(posts.columns.id), 5))
  .orderBy(desc(count(posts.columns.id)))
  .limit(10)
  .execute();
// Type: { userName: string; postCount: number }[]

// CTE (Common Table Expression)
const activeAuthors = db.sql
  .$with('active_authors')
  .as(
    db.sql
      .select({ id: users.columns.id, name: users.columns.name })
      .from(users)
      .where(gt(users.columns.createdAt, sql`NOW() - INTERVAL '30 days'`))
  );

const result = await db.sql
  .with(activeAuthors)
  .select({
    authorName: activeAuthors.name,
    postTitle: posts.columns.title,
  })
  .from(activeAuthors)
  .innerJoin(posts, eq(activeAuthors.id, posts.columns.authorId))
  .execute();

// Window functions
const result = await db.sql
  .select({
    title: posts.columns.title,
    authorId: posts.columns.authorId,
    rank: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${posts.columns.authorId} ORDER BY ${posts.columns.createdAt} DESC)`,
  })
  .from(posts)
  .execute();

// Subquery
const avgPostCount = db.sql
  .select({ avg: sql<number>`AVG(post_count)` })
  .from(
    db.sql
      .select({ postCount: count(posts.columns.id) })
      .from(posts)
      .groupBy(posts.columns.authorId)
      .as('post_counts')
  );
```

#### SQL Insert/Update/Delete

```typescript
// INSERT with SQL builder
await db.sql
  .insert(users)
  .values({ email: 'alice@example.com', name: 'Alice', passwordHash: hashed })
  .onConflict('email')
  .doUpdate({ name: 'Alice Updated' })
  .returning()
  .execute();

// UPDATE with JOIN
await db.sql
  .update(users)
  .set({ role: 'admin' })
  .from(posts)
  .where(
    and(
      eq(users.columns.id, posts.columns.authorId),
      gt(count(posts.columns.id), 100)
    )
  )
  .execute();

// DELETE with CTE
const inactiveUsers = db.sql
  .$with('inactive')
  .as(
    db.sql
      .select({ id: users.columns.id })
      .from(users)
      .where(sql`${users.columns.lastLogin} < NOW() - INTERVAL '1 year'`)
  );

await db.sql
  .with(inactiveUsers)
  .delete(users)
  .where(sql`${users.columns.id} IN (SELECT id FROM inactive)`)
  .execute();
```

#### Raw SQL (Last Resort)

For truly custom queries where even the SQL builder is insufficient:

```typescript
// Tagged template -- parameterized and injection-safe
const result = await db.raw<{ id: string; email: string }>(
  sql`SELECT id, email FROM users WHERE created_at > ${date}`
);
// Type: { id: string; email: string }[]

// The sql template tag handles parameterization:
// sql`... WHERE id = ${userId}`
// Generates: "... WHERE id = $1" with params: [userId]
```

**Note:** `db.raw()` requires an explicit type parameter. There is no untyped query -- even the escape hatch has types.

#### Join Nullability Inference

The SQL builder automatically infers correct nullability based on join type:

```typescript
// LEFT JOIN -- right side nullable
const result = await db.sql
  .select()
  .from(users)
  .leftJoin(profiles, eq(users.columns.id, profiles.columns.userId))
  .execute();
// Type: { users: User; profiles: Profile | null }[]

// INNER JOIN -- both sides non-nullable
const result = await db.sql
  .select()
  .from(users)
  .innerJoin(profiles, eq(users.columns.id, profiles.columns.userId))
  .execute();
// Type: { users: User; profiles: Profile }[]
```

---

### 1.8 Transactions

```typescript
// Interactive transaction (recommended)
const result = await db.transaction(async (tx) => {
  const sender = await tx.update(accounts, {
    where: { id: senderId },
    data: { balance: { decrement: amount } },
  });

  if (sender.balance < 0) {
    throw new Error('Insufficient funds');
    // Transaction automatically rolls back on throw
  }

  const recipient = await tx.update(accounts, {
    where: { id: recipientId },
    data: { balance: { increment: amount } },
  });

  return { sender, recipient };
});

// Transaction with options
await db.transaction(
  async (tx) => {
    // ... operations ...
  },
  {
    isolationLevel: 'serializable',
    timeout: 10_000, // ms
  }
);

// The tx object supports the full object API and SQL API:
await db.transaction(async (tx) => {
  // Object API
  await tx.create(users, { data: { ... } });

  // SQL API
  await tx.sql
    .update(users)
    .set({ role: 'admin' })
    .where(eq(users.columns.id, userId))
    .execute();
});

// Nested transactions (savepoints)
await db.transaction(async (tx) => {
  await tx.create(users, { data: userData });

  await tx.transaction(async (tx2) => {
    // This is a SAVEPOINT, not a new transaction
    await tx2.create(posts, { data: postData });
    // If this throws, only the savepoint is rolled back
  });
});
```

---

### 1.9 Type Inference

Types flow from schema definition through query to result with zero codegen. No generate step -- pure TypeScript inference.

#### Type extraction from tables

```typescript
import type { Infer, InsertType, UpdateType } from '@vertz/db';

// Infer the full row type
type User = typeof users.$infer;
// { id: string; email: string; name: string; passwordHash: string; ... }

// Infer the insert type (auto-generated/defaulted fields become optional)
type NewUser = typeof users.$insert;
// { email: string; name: string; passwordHash: string;
//   id?: string; role?: 'user' | 'admin'; createdAt?: Date; ... }

// Infer the update type (all non-PK fields optional)
type UserUpdate = typeof users.$update;
// { email?: string; name?: string; passwordHash?: string; role?: ...; ... }

// Visibility-scoped types
type PublicUser = typeof users.$not_sensitive;
type AdminUser = typeof users.$not_hidden;
```

#### How types flow through queries

```typescript
// 1. Schema defines types
const users = d.table('users', {
  id:    d.uuid().primary(),
  email: d.email().sensitive(),
  name:  d.text(),
  role:  d.enum(['user', 'admin']).default('user'),
});

// 2. Query narrows return type based on arguments
const result = await db.find(users, {
  select: { id: true, email: true },
});
// TypeScript infers: { id: string; email: string }[]

// 3. Include widens return type with relations
const result = await db.find(users, {
  include: { posts: true },
});
// TypeScript infers: (User & { posts: Post[] })[]

// 4. Select + include combined
const result = await db.find(users, {
  select: { name: true },
  include: { posts: { select: { title: true } } },
});
// TypeScript infers: { name: string; posts: { title: string }[] }[]

// 5. Where clause does NOT narrow the return type -- it filters rows
const result = await db.find(users, {
  where: { role: 'admin' },
});
// TypeScript infers: User[] (same shape, fewer rows at runtime)

// 6. findOne changes cardinality
const result = await db.findOne(users, {
  where: { id: userId },
});
// TypeScript infers: User | null

// 7. findOneOrThrow removes null
const result = await db.findOneOrThrow(users, {
  where: { id: userId },
});
// TypeScript infers: User

// 8. Visibility notation narrows to derived schema types
const result = await db.find(users, {
  select: { not: 'sensitive' },
});
// TypeScript infers: { id: string; name: string; ... }[]
// (no email -- it's sensitive)
```

#### Type-safe function signatures

```typescript
// The insert type makes auto-generated fields optional
async function createUser(data: typeof users.$insert): Promise<typeof users.$infer> {
  return db.create(users, { data });
}

// This compiles
createUser({ email: 'a@b.com', name: 'A', passwordHash: 'x' });

// This fails at compile time: 'email' is required
createUser({ name: 'A', passwordHash: 'x' });
//          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Error: Property 'email' is missing in type '{ name: string; passwordHash: string; }'
```

---

### 1.10 Migration Workflow

Migrations are generated from schema diffs and stored as versioned SQL files. The workflow is inspired by Prisma's `migrate dev` / `migrate deploy` / `db push` but without the shadow database.

#### Commands

```bash
# Development: generate + apply a migration
vertz db migrate dev --name "add-user-roles"
# 1. Reads all table definitions from the project
# 2. Compares against the last migration snapshot
# 3. Generates SQL migration + snapshot
# 4. Applies the migration to the dev database
# 5. No shadow database required

# Production: apply pending migrations
vertz db migrate deploy
# 1. Applies all pending migrations in order
# 2. No interactive prompts -- CI/CD safe
# 3. Records applied migrations in a _vertz_migrations table

# Prototyping: push schema directly (no migration files)
vertz db push
# 1. Diffs current schema against live database
# 2. Applies changes directly
# 3. No migration history -- for local dev only
# WARNING: Do not mix push and migrate in the same database

# Generate migration without applying
vertz db migrate generate --name "add-user-roles"

# Check migration status
vertz db migrate status

# Reset database (destructive)
vertz db reset
# Drops all tables, re-runs all migrations

# Create empty migration (for custom SQL / data migrations)
vertz db migrate create --name "seed-default-roles"
```

#### Migration File Structure

```
db/
  migrations/
    20260209_143027_init/
      migration.sql
      snapshot.json
    20260209_152044_add_user_roles/
      migration.sql
      snapshot.json
  schema/
    users.ts
    posts.ts
    index.ts
```

#### How Diffing Works

1. The CLI reads all `d.table()` definitions registered in the project and builds a JSON snapshot of the current schema state (tables, columns, types, constraints, indexes, relations).
2. It reads the latest `snapshot.json` from the migrations directory.
3. It computes a structural diff between the two snapshots.
4. For ambiguous operations (column rename vs drop+add), the CLI prompts interactively (in dev mode) or fails safely (in deploy mode).
5. The diff is translated to SQL DDL statements and written to `migration.sql`.

#### Example Generated Migration

```sql
-- 20260209_152044_add_user_roles/migration.sql

-- Add role enum type
CREATE TYPE "role" AS ENUM ('user', 'admin', 'moderator');

-- Add role column with default
ALTER TABLE "users"
  ADD COLUMN "role" "role" NOT NULL DEFAULT 'user';

-- Add index on role
CREATE INDEX "users_role_idx" ON "users" ("role");
```

#### Rename Detection

When a column is renamed, the migration tool enters interactive mode:

```
? Column 'first_name' in table 'users' was not found in the new schema.
  Did you rename it to 'name'?
  > Yes, rename 'first_name' to 'name'
    No, drop 'first_name' and create 'name'
```

This generates `ALTER TABLE ... RENAME COLUMN` instead of drop + create, preserving data.

#### Schema Snapshot Format

The snapshot is a JSON representation of the full database schema at a point in time. It contains enough information to reconstruct the schema without reading the TypeScript source files. This makes migration generation deterministic and independent of TypeScript compiler behavior.

```json
{
  "version": 1,
  "tables": {
    "users": {
      "columns": {
        "id": { "type": "uuid", "nullable": false, "default": "gen_random_uuid()" },
        "email": { "type": "text", "nullable": false },
        "role": { "type": "role", "nullable": false, "default": "'user'" }
      },
      "primaryKey": ["id"],
      "indexes": [
        { "name": "users_role_idx", "columns": ["role"] }
      ],
      "uniqueConstraints": [
        { "name": "users_email_key", "columns": ["email"] }
      ],
      "foreignKeys": []
    }
  },
  "enums": {
    "role": ["user", "admin", "moderator"]
  }
}
```

---

## 2. Manifesto Alignment

### Type Safety Wins

The entire ORM is designed around compile-time guarantees. Schema definitions produce types that flow through every query. Visibility annotations produce compile-time-enforced derived types. If you try to access a `.sensitive()` field through a `{ not: 'sensitive' }` query, the TypeScript compiler stops you. No runtime surprises.

### One Way to Do Things

- **One namespace**: `d` from `@vertz/db`. No second import for definitions, no `s` + `d` split.
- **One primary query API**: The object-based options bag handles 95% of use cases. Thenable -- no `.execute()`.
- **One escape hatch**: The SQL builder, with a clear rule for when to use it.
- **One casing convention**: `camelCase` in TypeScript, `snake_case` in PostgreSQL.
- **One migration workflow**: `migrate dev` in development, `migrate deploy` in production.

The SQL escape hatch is the only intentional "two ways to do things." We accept this tradeoff because the alternative -- forcing complex queries through an object API -- leads to worse outcomes (leaky abstractions, unreadable code, performance traps). The clear rule makes it unambiguous.

### Production-Ready by Default

- Visibility annotations (`.sensitive()`, `.hidden()`) enforce data protection from day one.
- Two-tier visibility with `{ not: 'sensitive' }` / `{ not: 'hidden' }` notation makes intent explicit.
- Migration tooling with rename detection prevents accidental data loss.
- Schema-derived insert/update types prevent invalid data from reaching the database.
- The framework logger automatically redacts sensitive + hidden fields -- you do not opt into this, it is the default.

### Explicit over Implicit

- Tables explicitly list their columns, relations, and visibility annotations -- all inline.
- Foreign keys are explicitly declared with `d.ref.one()` / `d.ref.many()`.
- Database defaults are explicitly set inline with `.default(d.gen.uuid())`.
- No auto-discovered schemas, no convention-based file loading, no decorator magic.

### Compile-Time over Runtime

- Visibility is a type-level concern. `{ not: 'sensitive' }` queries literally do not have sensitive fields in their return type.
- Insert schemas make auto-generated fields optional at the type level.
- Select narrowing produces a narrowed return type at compile time.
- The SQL builder infers join nullability from join type.

### If It Builds, It Runs

If your code compiles:
- Your queries reference real columns (not strings -- column references are typed).
- Your where clauses use valid operators for each column type.
- Your create/update payloads have all required fields.
- Your visibility annotations cannot be bypassed in typed contexts.
- Your relations match the declared schema.

### LLM-Native Design

This design makes the LLM's job easier in several concrete ways:

- **Predictable API shape.** Every query follows the same `db.method(table, options)` pattern. No model accessors (`prisma.user.findMany()`), no method-specific imports, no dialect-specific paths. An LLM can generate correct queries by pattern-matching from one example.
- **Single namespace.** One import (`d` from `@vertz/db`) for all table definitions. No decision about whether to use `s` or `d` for a column type. The LLM does not need to map between two import paths.
- **Inline everything.** `d.email().sensitive().unique()` is a single expression. An LLM reading a table definition sees column type, visibility, and constraints in one line. No cross-referencing a builder chain at the bottom of the definition.
- **Explicit relations.** `d.ref.one(() => users, 'authorId')` is self-documenting. An LLM does not need to infer relationship semantics from naming conventions or separate definition files.
- **No codegen step.** An LLM editing schema files does not need to remember to run `prisma generate` after changes. Types flow automatically.
- **One way to do things.** There is no decision fatigue for the LLM. Object API for CRUD, SQL API for complex queries. The rule is explicit and unambiguous.
- **Visibility annotations are declarative.** `.hidden()` and `.sensitive()` read like documentation. The LLM does not need to understand middleware chains or serialization hooks to know that a field is protected.
- **Derived schemas are on-demand.** `schemaOf(users, { not: 'sensitive' })` is explicit. The LLM does not need to remember which named property to use -- the intent is in the code.

### Tradeoffs Accepted

| Decision | What we gain | What we give up |
|----------|-------------|----------------|
| PostgreSQL only | Simpler implementation, deeper PG integration, PG-specific features, PGlite for testing | Multi-database portability |
| No codegen | Zero build step, instant feedback | Potential TS compiler slowdown at scale |
| Two query APIs | Coverage of all SQL features | Slight API surface complexity |
| Inline relations (`d.ref`) | Co-located, self-documenting | Slightly longer table definitions |
| Single `d` namespace | Consistent API, no cross-package dependency | No reuse of `@vertz/schema` in table defs |
| snake_case enforced | Consistency, zero config | Developer choice on naming |
| Two-tier visibility | Simplicity, clear semantics | Less granular than 3+ tiers |

---

## 3. Non-Goals

### Deliberately Out of Scope

1. **Multi-database support.** This ORM is PostgreSQL-only. No MySQL, SQLite, MSSQL, or MongoDB. We will not build a lowest-common-denominator abstraction. PostgreSQL is the vertz recommendation, and we go deep on it. For testing, use PGlite (a lightweight PostgreSQL implementation that runs in-process) -- no SQLite shim layer.

2. **NoSQL / document store.** This is a relational ORM. Typed JSONB columns are supported as a column type, not as a document database abstraction.

3. **Query caching in v1.** The metadata system is designed to enable smart caching (entity type awareness, mutation tracking), but implementing the cache layer is a separate future package (`@vertz/db-cache`).

4. **Real-time subscriptions in v1.** The schema metadata enables future real-time features, but CDC / WebSocket integration is a separate package (`@vertz/db-realtime`).

5. **Visual database browser.** No Prisma Studio equivalent in v1. May be built as a separate tool later.

6. **Schema-level authorization.** Visibility annotations control *what fields exist in a schema*. They do not control *who can query which rows*. Row-level security (RLS) integration is a future enhancement.

7. **Automatic connection pooling service.** We wrap standard `pg` Pool. No managed connection pooling service (Prisma Accelerate equivalent).

8. **Down migrations.** v1 generates forward-only migrations. Rollback is handled by applying a new migration that reverses the change. `vertz db migrate diff` can help generate reversal SQL.

9. **ORM-level soft deletes.** We do not build soft delete into the ORM. If a project needs soft deletes, they add a `deletedAt` column and filter on it. The ORM does not add implicit `WHERE deleted_at IS NULL` to every query.

10. **Implicit many-to-many.** We require explicit junction tables for many-to-many relations via `.through()`. No auto-created junction tables. Explicit over implicit.

---

## 4. Unknowns

### U1: TypeScript Compiler Performance at Scale

**Question:** Can pure TypeScript inference handle 100+ tables without degrading IDE responsiveness and CI type-check speed?

**Risk:** High. Drizzle's approach causes 5000+ type instantiations per schema. With complex generic types for query results, select narrowing, and relation inclusion, this could compound.

**Resolution strategy:**
1. **POC:** Build a stress test with 100 tables, each with 10-15 columns and 3-5 relations. Measure `tsc --noEmit` time and IDE responsiveness.
2. **Mitigation path A:** Optimize type structures aggressively. Use interfaces over mapped types where possible. Flatten conditional types. Apply lessons from Prisma's ArkType collaboration.
3. **Mitigation path B (deferred to v1.1):** Offer optional codegen for large projects (`vertz db generate-types`) that produces `.d.ts` files, similar to Prisma but opt-in. This preserves the default zero-codegen experience while providing a performance escape hatch. **This is explicitly deferred -- not part of v1.**
4. **Mitigation path C:** Constrain type depth. The object API query types should be optimized for the common case (2-3 levels of relation nesting). Deeper nesting degrades to a wider type.

**Decision:** No codegen by default. Pure TypeScript inference is the v1 approach. The escape hatch (optional codegen) is deferred to v1.1 and will only be built if POC results show it is necessary at scale.

**Decision needed before:** Stage 2 (Plan). The POC must validate that approach A is viable or determine that approach B is necessary.

### U2: Migration Engine Implementation

**Question:** Build a custom schema differ, or wrap an existing tool?

**Options:**
- **Custom:** Full control, tight integration with our snapshot format, no dependencies. More engineering effort.
- **Wrap Drizzle Kit:** Drizzle Kit's differ is open source and mature. But it expects Drizzle schema format, so we would need an adapter layer. Tight coupling to Drizzle's internals.
- **Wrap pgdiff/migra:** Existing PG schema diff tools. Operate on live database state, not code-first snapshots. Different paradigm.
- **Adapt Prisma's migration engine:** Now WASM-based, but still tightly coupled to Prisma's schema format.

**Recommendation:** Build custom. The snapshot format is simple (JSON), the diff algorithm is well-understood (compare column sets, detect additions/removals/type changes), and we need tight integration with our table metadata (visibility annotations, relation declarations). Wrapping an existing tool would require more adapter code than building the differ ourselves.

**Decision needed before:** Stage 2 (Plan).

### U3: Visibility Annotations and the Query Pipeline

**Question:** When a developer uses `select: { not: 'sensitive' }`, should the ORM:
(a) Generate SQL that only selects non-sensitive columns (never fetches sensitive data from the DB), or
(b) Fetch all columns and strip sensitive fields in the application layer?

**Tradeoff:**
- Option (a) is more secure -- sensitive data never enters the application memory. But it requires the query builder to be aware of visibility annotations, increasing complexity.
- Option (b) is simpler and allows the full row to be available for business logic before serialization. But sensitive data exists in memory.

**Recommendation:** Option (a) for `select: { not: 'sensitive' }` and `select: { not: 'hidden' }`. When the developer explicitly requests a visibility filter, the generated SQL should only select those columns. This aligns with "compile-time over runtime" -- the developer's intent is clear and the ORM should honor it at the SQL level.

However, when no `select` is specified, the full row is fetched. Visibility enforcement then happens at the serialization boundary (when the response is sent through a route that uses a derived schema).

**Decision needed before:** Stage 2 (Plan).

### U4: Typed JSON Column Validation -- Read vs Write

**Question:** For `d.jsonb<T>()`, when should validation run?
- On write (insert/update): Validate that the data matches the schema before storing. This prevents invalid data from entering the DB.
- On read (select): Validate that data from the DB matches the schema. This catches data that was inserted outside the ORM or from a previous schema version.

**Recommendation:** Validate on write always. Validate on read only in development mode (configurable). Production reads should trust the data and avoid the parsing overhead. If a project needs read validation in production, they can opt in.

**Decision needed before:** Stage 3 (Build).

### U5: How Many Tables Should Be Registered?

**Question:** Should the `createDb({ tables })` call require ALL tables, or can tables be registered incrementally?

**Consideration:** In a large monorepo, different modules may own different tables. Requiring all tables upfront creates a single registration point that knows about everything. Incremental registration is more modular but complicates type inference (the `db` object's type changes after registration).

**Recommendation:** All tables upfront. One `db` instance, one `tables` object. The tables object can be composed from modules:

```typescript
import { userTables } from './modules/users/schema';
import { postTables } from './modules/posts/schema';

const db = createDb({
  url: process.env.DATABASE_URL,
  tables: { ...userTables, ...postTables },
});
```

This keeps type inference simple (one static type) while allowing modular schema organization.

**Decision needed before:** Stage 2 (Plan).

---

## 5. POC Results

No POC has been conducted yet. The following POCs are required before moving to Stage 2 (Plan):

### POC 1: Type Inference Performance

**Goal:** Validate that pure TypeScript inference for the query result types can handle a realistic schema scale (50-100 tables) without unacceptable IDE lag or `tsc` slowdown.

**Methodology:**
1. Create a mock schema with 100 tables, each having 10-15 columns and 2-4 relations.
2. Write 20 representative queries using the proposed object API types (including select narrowing, relation includes, nested includes).
3. Measure `tsc --noEmit` time.
4. Measure VS Code / cursor completions response time.
5. Compare against Drizzle and Prisma on the same schema.

**Success criteria:** `tsc --noEmit` under 5 seconds. Autocomplete latency under 500ms.

### POC 2: Visibility Annotation Type Mechanics

**Goal:** Validate that the two-tier visibility types (`{ not: 'sensitive' }`, `{ not: 'hidden' }`) can be computed at the type level using TypeScript's type system without excessive complexity.

**Methodology:**
1. Implement the `TableDef` type with visibility metadata (`.sensitive()`, `.hidden()`) in type parameters.
2. Implement the mapped types that produce `$not_sensitive` and `$not_hidden`.
3. Validate that field omission works correctly at the type level.
4. Validate that the types compose with query result types (e.g., `select: { not: 'sensitive' }` produces the right type).

**Success criteria:** All visibility permutations produce correct types. Type instantiation count stays reasonable (under 500 per table).

### POC 3: Migration Snapshot Diffing

**Goal:** Validate that a JSON snapshot-based differ can detect all common schema changes (add/remove/rename columns, change types, add/remove indexes, add/remove relations) and generate correct SQL.

**Methodology:**
1. Build a minimal differ that compares two snapshot JSON objects.
2. Test against 15-20 common migration scenarios.
3. Validate generated SQL against a real PostgreSQL instance.

**Success criteria:** All common scenarios produce correct, idempotent SQL. Rename detection prompts work correctly.

---

## 6. E2E Acceptance Test

The following test proves the core feature set works end-to-end:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createDb, d, schemaOf, sql, eq } from '@vertz/db';

// --- Schema Definition ---
const users = d.table('users', {
  id:           d.uuid().primary().default(d.gen.uuid()),
  email:        d.email().sensitive().unique(),
  name:         d.text().max(256),
  passwordHash: d.text().hidden(),
  apiKey:       d.text().hidden(),
  role:         d.enum(['user', 'admin']).default('user'),
  loginCount:   d.integer().default(0),
  createdAt:    d.timestamp().default(d.gen.now()),
  posts:        d.ref.many(() => posts, 'authorId'),
});

const posts = d.table('posts', {
  id:        d.uuid().primary().default(d.gen.uuid()),
  title:     d.text(),
  content:   d.text().optional(),
  published: d.boolean().default(false),
  authorId:  d.uuid(),
  author:    d.ref.one(() => users, 'authorId'),
  createdAt: d.timestamp().default(d.gen.now()),
});

// --- Tests ---
describe('@vertz/db E2E', () => {
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    db = createDb({
      url: process.env.TEST_DATABASE_URL,
      tables: { users, posts },
    });
    // Apply schema to test database
    await db.push();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates a user with auto-generated defaults', async () => {
    const user = await db.create(users, {
      data: {
        email: 'alice@example.com',
        name: 'Alice',
        passwordHash: 'hashed_pw',
        apiKey: 'sk-123',
      },
    });

    expect(user.id).toBeDefined();           // UUID auto-generated
    expect(user.email).toBe('alice@example.com');
    expect(user.role).toBe('user');           // default applied
    expect(user.createdAt).toBeDefined();     // default applied
    expect(user.passwordHash).toBe('hashed_pw');  // full row includes hidden fields
  });

  it('finds users excluding sensitive fields via { not: "sensitive" }', async () => {
    const publicUsers = await db.find(users, { select: { not: 'sensitive' } });

    expect(publicUsers.length).toBeGreaterThan(0);
    expect(publicUsers[0].name).toBeDefined();
    expect(publicUsers[0].loginCount).toBeDefined();
    // TypeScript enforces: publicUsers[0].email would be a compile error (sensitive)
    // TypeScript enforces: publicUsers[0].passwordHash would be a compile error (hidden)
    expect('email' in publicUsers[0]).toBe(false);
    expect('passwordHash' in publicUsers[0]).toBe(false);
    expect('apiKey' in publicUsers[0]).toBe(false);
  });

  it('finds users excluding only hidden fields via { not: "hidden" }', async () => {
    const adminUsers = await db.find(users, { select: { not: 'hidden' } });

    expect(adminUsers.length).toBeGreaterThan(0);
    expect(adminUsers[0].email).toBeDefined();   // sensitive is visible in admin
    expect(adminUsers[0].name).toBeDefined();
    // TypeScript enforces: adminUsers[0].passwordHash would be a compile error (hidden)
    expect('passwordHash' in adminUsers[0]).toBe(false);
    expect('apiKey' in adminUsers[0]).toBe(false);
  });

  it('uses select + include combined', async () => {
    // First create a post for Alice
    const alice = await db.findOneOrThrow(users, {
      where: { email: 'alice@example.com' },
    });

    await db.create(posts, {
      data: { title: 'Test Post', authorId: alice.id },
    });

    const result = await db.find(users, {
      select: { name: true, email: true },
      include: {
        posts: {
          select: { title: true, createdAt: true },
          where: { published: false },
          orderBy: { createdAt: 'desc' },
          limit: 5,
        },
      },
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBeDefined();
    expect(result[0].email).toBeDefined();
    expect(result[0].posts).toBeDefined();
    expect(result[0].posts[0].title).toBeDefined();
  });

  it('creates a user with nested post in a single operation', async () => {
    const user = await db.create(users, {
      data: {
        email: 'bob@example.com',
        name: 'Bob',
        passwordHash: 'hashed_pw2',
        apiKey: 'sk-456',
        posts: {
          create: [
            { title: 'First Post', content: 'Hello world' },
          ],
        },
      },
      include: { posts: true },
    });

    expect(user.posts).toHaveLength(1);
    expect(user.posts[0].title).toBe('First Post');
    expect(user.posts[0].authorId).toBe(user.id);
  });

  it('uses SQL escape hatch for a CTE query', async () => {
    const recentAuthors = db.sql
      .$with('recent_authors')
      .as(
        db.sql
          .select({ id: users.columns.id, name: users.columns.name })
          .from(users)
      );

    const result = await db.sql
      .with(recentAuthors)
      .select({
        authorName: recentAuthors.name,
        postTitle: posts.columns.title,
      })
      .from(recentAuthors)
      .innerJoin(posts, eq(recentAuthors.id, posts.columns.authorId))
      .execute();

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].authorName).toBeDefined();
    expect(result[0].postTitle).toBeDefined();
  });

  it('runs a transaction that rolls back on error', async () => {
    const initialUser = await db.findOneOrThrow(users, {
      where: { email: 'alice@example.com' },
    });

    await expect(
      db.transaction(async (tx) => {
        await tx.update(users, {
          where: { id: initialUser.id },
          data: { name: 'Alice SHOULD NOT PERSIST' },
        });
        throw new Error('Intentional rollback');
      })
    ).rejects.toThrow('Intentional rollback');

    // Verify rollback
    const unchanged = await db.findOneOrThrow(users, {
      where: { id: initialUser.id },
    });
    expect(unchanged.name).toBe('Alice'); // original name preserved
  });

  it('enforces unique constraint at the database level', async () => {
    await expect(
      db.create(users, {
        data: {
          email: 'alice@example.com', // duplicate
          name: 'Alice 2',
          passwordHash: 'pw',
          apiKey: 'key',
        },
      })
    ).rejects.toThrow(); // unique violation
  });

  it('produces correct insert schema (defaults are optional)', () => {
    // Type-level test: insertSchema should make defaulted fields optional
    const insertSchema = users.insertSchema;
    const valid = insertSchema.safeParse({
      email: 'test@example.com',
      name: 'Test',
      passwordHash: 'pw',
      apiKey: 'key',
      // id, role, loginCount, createdAt omitted -- they have defaults
    });
    expect(valid.success).toBe(true);
  });

  it('auto-redacts sensitive + hidden fields in toLog()', () => {
    const user = {
      id: '123',
      email: 'test@example.com',
      name: 'Test',
      passwordHash: 'secret',
      apiKey: 'sk-secret',
      role: 'user',
      loginCount: 5,
      createdAt: new Date(),
    };

    const logged = users.toLog(user);
    expect(logged.name).toBe('Test');
    expect(logged.email).toBe('[REDACTED]');        // sensitive -> redacted
    expect(logged.passwordHash).toBe('[REDACTED]'); // hidden -> redacted
    expect(logged.apiKey).toBe('[REDACTED]');        // hidden -> redacted
  });

  it('derives on-demand schemas with schemaOf()', () => {
    const publicSchema = schemaOf(users, { not: 'sensitive' });
    const adminSchema = schemaOf(users, { not: 'hidden' });

    // Public schema should not have sensitive or hidden fields
    const publicResult = publicSchema.safeParse({
      id: '123',
      name: 'Test',
      role: 'user',
      loginCount: 5,
      createdAt: new Date(),
    });
    expect(publicResult.success).toBe(true);

    // Admin schema should have sensitive fields but not hidden
    const adminResult = adminSchema.safeParse({
      id: '123',
      email: 'test@example.com',
      name: 'Test',
      role: 'user',
      loginCount: 5,
      createdAt: new Date(),
    });
    expect(adminResult.success).toBe(true);
  });

  it('enforces visibility at the type level', async () => {
    const publicUsers = await db.find(users, { select: { not: 'sensitive' } });
    const user = publicUsers[0];

    // These should compile -- normal fields are accessible
    const _name: string = user.name;
    const _loginCount: number = user.loginCount;

    // @ts-expect-error - email is sensitive, excluded by { not: 'sensitive' }
    user.email;

    // @ts-expect-error - passwordHash is hidden, always excluded
    user.passwordHash;

    const adminUsers = await db.find(users, { select: { not: 'hidden' } });
    const adminUser = adminUsers[0];

    // This should compile -- sensitive fields visible in admin
    const _email: string = adminUser.email;

    // @ts-expect-error - passwordHash is hidden, excluded even in admin
    adminUser.passwordHash;
  });

  it('enforces type-safe where clauses', async () => {
    // Valid: role is an enum with 'user' | 'admin'
    await db.find(users, { where: { role: 'admin' } });

    // @ts-expect-error - 'superadmin' is not a valid role value
    await db.find(users, { where: { role: 'superadmin' } });

    // @ts-expect-error - 'nonexistent' is not a column on users
    await db.find(users, { where: { nonexistent: 'value' } });
  });

  it('enforces required fields on create', async () => {
    // @ts-expect-error - email is required but missing
    await db.create(users, {
      data: { name: 'Test', passwordHash: 'pw', apiKey: 'key' },
    });

    // @ts-expect-error - passwordHash is required but missing
    await db.create(users, {
      data: { email: 'test@example.com', name: 'Test', apiKey: 'key' },
    });
  });
});
```

**What this test proves:**
1. Table definition with `d.table()`, inline column concerns (`.primary()`, `.sensitive()`, `.hidden()`, `.default()`), and inline relations (`d.ref.one`/`d.ref.many`) works end-to-end.
2. Auto-generated defaults (UUID, timestamps, enum defaults, integer defaults) are applied by the database.
3. Two-tier visibility with `{ not: 'sensitive' }` and `{ not: 'hidden' }` correctly filters fields from both the result and the TypeScript type.
4. Select + include are combinable in a single query.
5. Nested writes (create user with posts) work in a single operation.
6. The SQL escape hatch (CTE query) produces type-safe results.
7. Transactions roll back on error.
8. Database constraints (unique) are enforced.
9. Derived schemas (`insertSchema`, `schemaOf()`, `toLog()`) correctly reflect defaults and visibility.
10. **Type-level enforcement** via `@ts-expect-error`: accessing sensitive/hidden fields through visibility-filtered queries is a compile error, invalid enum values in where clauses are rejected, and missing required fields on create are caught at compile time.

---

## Appendix A: Package Structure

```
packages/db/
  src/
    index.ts                  # Public API exports
    client/
      database.ts             # createDb(), Database class
      transaction.ts          # Transaction wrapper
    schema/
      table.ts                # d.table(), TableDef
      column-types.ts         # d.uuid(), d.text(), d.email(), etc.
      generators.ts           # d.gen.* (UUID, now, etc.)
      relations.ts            # d.ref.one(), d.ref.many()
      visibility.ts           # .sensitive(), .hidden() column methods
      derived.ts              # schemaOf(), insertSchema, updateSchema
    query/
      object/
        find.ts               # find, findOne, findOneOrThrow
        create.ts             # create, createMany, createManyAndReturn
        update.ts             # update, updateMany, upsert
        delete.ts             # delete, deleteMany
        aggregate.ts          # count, aggregate, groupBy
        filters.ts            # where clause types and builders
      sql/
        select.ts             # SQL select builder
        insert.ts             # SQL insert builder
        update.ts             # SQL update builder
        delete.ts             # SQL delete builder
        operators.ts          # eq, gt, lt, and, or, etc.
        expressions.ts        # sql template tag, count, sum, avg, etc.
        cte.ts                # CTE / WITH support
        join.ts               # Join builders with nullability inference
      raw.ts                  # db.raw() escape hatch
    migration/
      snapshot.ts             # Schema -> JSON snapshot
      differ.ts               # Snapshot diff algorithm
      generator.ts            # Diff -> SQL DDL
      runner.ts               # Apply migrations to database
      cli.ts                  # CLI commands (migrate dev, deploy, push, etc.)
    types/
      inference.ts            # $infer, $insert, $update, $not_sensitive, $not_hidden
      query-result.ts         # Query result type computation
      filters.ts              # Filter operator types
  __tests__/
    unit/
    integration/
    e2e/
```

## Appendix B: Metadata for Future Features

The `TableDef` type and `Database` instance expose rich metadata that enables future framework features without changing the ORM API:

```typescript
// Static metadata (available at import time, no DB connection needed)
users.tableName;          // 'users'
users.columnNames;        // ['id', 'email', 'name', 'passwordHash', ...]
users.primaryKey;         // ['id']
users.relations;          // { posts: { type: 'ref.many', target: () => posts, ... } }
users.visibility;         // { email: 'sensitive', passwordHash: 'hidden', apiKey: 'hidden' }
users.insertSchema;       // Derived ObjectSchema (defaults optional)
users.columns;            // Column reference objects for SQL builder

// Runtime metadata (from the Database instance)
db.tables;                // Map of all registered tables
db.getTable('users');     // Type-safe table lookup
```

**Future feature enablement:**

| Future Feature | Required Metadata | Already Exposed? |
|---|---|---|
| Smart cache expiration | Entity type + PK from mutations | Yes (tableName, primaryKey) |
| Automatic log redaction | Visibility annotations | Yes (visibility, toLog()) |
| Real-time subscriptions | Table name + mutation type | Yes (tableName, plus hook point in mutation methods) |
| Entity-aware UI store | Entity type + PK + fields | Yes (tableName, primaryKey, columnNames) |
| OpenAPI from schema | Schema + visibility | Yes (schemaOf(table, { not: 'sensitive' }).toJSONSchema()) |
| SDK type generation | All derived schemas | Yes ($infer, $not_sensitive, etc.) |

---

*Design doc for @vertz/db. Stage 1 -- review decisions applied (7 finalized decisions from PR #122 review).*
