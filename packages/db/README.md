# @vertz/db

Type-safe database layer for Vertz with schema-driven migrations, powerful query building, and full type inference from schema to query results.

## Features

- **Type-safe schema builder** — Define tables, columns, relations with full TypeScript inference
- **Automatic migrations** — Generate SQL migrations from schema changes
- **Query builder with relations** — Type-safe CRUD with `include` for nested data loading
- **Multi-tenant support** — Built-in tenant isolation with `d.tenant()` columns
- **Connection pooling** — PostgreSQL connection pool with configurable limits
- **Comprehensive error handling** — Parse and transform Postgres errors with helpful diagnostics
- **Plugin system** — Extend behavior with lifecycle hooks
- **Zero runtime overhead** — Types are erased at build time

## Installation

```bash
npm install @vertz/db
```

**Prerequisites:**
- PostgreSQL database
- Node.js >= 22

## Quick Start

### 1. Define Your Schema

```typescript
import { d } from '@vertz/db';

// Define tables
const users = d.table('users', {
  id: d.uuid().primaryKey().defaultValue('gen_random_uuid()'),
  email: d.email().unique().notNull(),
  name: d.text().notNull(),
  createdAt: d.timestamp().defaultValue('now()').notNull(),
});

const posts = d.table('posts', {
  id: d.uuid().primaryKey().defaultValue('gen_random_uuid()'),
  title: d.text().notNull(),
  content: d.text().notNull(),
  authorId: d.uuid().notNull(),
  published: d.boolean().defaultValue('false').notNull(),
  createdAt: d.timestamp().defaultValue('now()').notNull(),
});

// Define relations
const userRelations = {
  posts: d.ref.many(() => posts, 'authorId'),
};

const postRelations = {
  author: d.ref.one(() => users, 'authorId'),
};

// Create registry
const db = createDb({
  url: process.env.DATABASE_URL!,
  tables: {
    users: d.entry(users, userRelations),
    posts: d.entry(posts, postRelations),
  },
});
```

### 2. Run Migrations

```typescript
import { migrateDev } from '@vertz/db';

// Development: auto-generate and apply migrations
await migrateDev({
  queryFn: db.queryFn,
  currentSnapshot: db.snapshot,
  previousSnapshot: loadPreviousSnapshot(), // From file
  migrationsDir: './migrations',
});

// Production: apply migrations from files
import { migrateDeploy } from '@vertz/db';

await migrateDeploy({
  queryFn: db.queryFn,
  migrationsDir: './migrations',
});
```

### 3. Query Your Data

```typescript
// Create a user
const user = await db.users.create({
  data: {
    email: 'alice@example.com',
    name: 'Alice',
  },
});

// Find users with posts included
const usersWithPosts = await db.users.findMany({
  where: { published: true },
  include: { posts: true },
  orderBy: { createdAt: 'desc' },
  limit: 10,
});

// Type-safe: usersWithPosts[0].posts is Post[]

// Update a post
await db.posts.update({
  where: { id: postId },
  data: { published: true },
});

// Delete old posts
await db.posts.deleteMany({
  where: {
    createdAt: { lt: new Date('2024-01-01') },
  },
});
```

## API Reference

### Schema Builder (`d`)

The `d` object provides all schema building functions.

#### Column Types

```typescript
// Text types
d.text()           // TEXT
d.varchar(255)     // VARCHAR(255)
d.email()          // TEXT with email format constraint
d.uuid()           // UUID

// Numeric types
d.integer()        // INTEGER
d.bigint()         // BIGINT
d.serial()         // SERIAL (auto-incrementing integer)
d.decimal(10, 2)   // DECIMAL(10, 2)
d.real()           // REAL
d.doublePrecision() // DOUBLE PRECISION

// Date/time types
d.timestamp()      // TIMESTAMP WITH TIME ZONE
d.date()           // DATE
d.time()           // TIME

// Boolean
d.boolean()        // BOOLEAN

// JSON
d.jsonb()          // JSONB
d.jsonb<MyType>({  // JSONB with validation
  validator: (v) => MyTypeSchema.parse(v)
})

// Arrays
d.textArray()      // TEXT[]
d.integerArray()   // INTEGER[]

// Enums
d.enum('status', ['draft', 'published', 'archived'])

// Multi-tenant column
d.tenant(organizationTable) // UUID with tenant FK
```

#### Column Modifiers

```typescript
d.text()
  .primaryKey()               // Add to PRIMARY KEY
  .unique()                   // Add UNIQUE constraint
  .notNull()                  // Add NOT NULL constraint
  .defaultValue('default')    // Set default value
  .index()                    // Add index on this column
```

#### Defining Tables

```typescript
const users = d.table('users', {
  id: d.uuid().primaryKey(),
  email: d.email().unique().notNull(),
  name: d.text().notNull(),
}, {
  indexes: [
    d.index(['email', 'name']), // Composite index
  ],
});
```

#### Defining Relations

```typescript
// One-to-many
const userRelations = {
  posts: d.ref.many(() => posts, 'authorId'),
};

// Many-to-one
const postRelations = {
  author: d.ref.one(() => users, 'authorId'),
};

// Many-to-many (through join table)
const postTags = d.table('post_tags', {
  postId: d.uuid().notNull(),
  tagId: d.uuid().notNull(),
});

const postRelations = {
  tags: d.ref.many(() => tags).through(() => postTags, 'postId', 'tagId'),
};
```

### Database Client

#### `createDb(options)`

Create a database client instance.

```typescript
import { createDb, d } from '@vertz/db';

const db = createDb({
  url: 'postgresql://user:pass@localhost:5432/mydb',
  tables: {
    users: d.entry(usersTable, userRelations),
    posts: d.entry(postsTable, postRelations),
  },
  pool: {
    max: 20,                  // Max connections (default: 10)
    idleTimeout: 30000,       // Idle timeout ms (default: 30000)
    connectionTimeout: 5000,  // Connection timeout ms (default: 10000)
    healthCheckTimeout: 5000,  // Health check timeout ms (default: 5000)
    replicas: [               // Read replica URLs for query routing
      'postgresql://user:pass@localhost:5433/mydb',
      'postgresql://user:pass@localhost:5434/mydb',
    ],
  },
  casing: 'snake_case',       // or 'camelCase' (default: 'snake_case')
  log: (msg) => console.log(msg), // Optional logger
});
```

**Returns:** `DatabaseInstance<TTables>` with typed table accessors.

#### Query Methods

All query methods are available on `db.<tableName>`:

##### `findOne(options)`

Find a single record (returns `null` if not found).

```typescript
const user = await db.users.findOne({
  where: { email: 'alice@example.com' },
  select: { id: true, name: true }, // Optional: select specific columns
  include: { posts: true },          // Optional: include relations
});

// Type: { id: string; name: string; posts: Post[] } | null
```

##### `findOneOrThrow(options)`

Find a single record or throw `NotFoundError`.

```typescript
const user = await db.users.findOneOrThrow({
  where: { id: userId },
});
```

##### `findMany(options)`

Find multiple records.

```typescript
const posts = await db.posts.findMany({
  where: {
    published: true,
    authorId: userId,
  },
  orderBy: { createdAt: 'desc' },
  limit: 10,
  offset: 0,
  include: { author: true },
});
```

**Cursor-based pagination:**

```typescript
const posts = await db.posts.findMany({
  where: { published: true },
  orderBy: { createdAt: 'desc' },
  cursor: { id: lastPostId }, // Start after this record
  take: 10,
});
```

##### `findManyAndCount(options)`

Find records and get total count (useful for pagination).

```typescript
const { rows, count } = await db.posts.findManyAndCount({
  where: { published: true },
  limit: 10,
  offset: 0,
});

console.log(`Showing ${rows.length} of ${count} posts`);
```

##### `create(options)`

Insert a single record.

```typescript
const user = await db.users.create({
  data: {
    email: 'bob@example.com',
    name: 'Bob',
  },
  select: { id: true, email: true }, // Optional: customize returned fields
});
```

##### `createMany(options)`

Insert multiple records (no return value).

```typescript
await db.posts.createMany({
  data: [
    { title: 'Post 1', content: 'Content 1', authorId: userId },
    { title: 'Post 2', content: 'Content 2', authorId: userId },
  ],
});
```

##### `createManyAndReturn(options)`

Insert multiple records and return them.

```typescript
const posts = await db.posts.createManyAndReturn({
  data: [
    { title: 'Post 1', content: 'Content 1', authorId: userId },
    { title: 'Post 2', content: 'Content 2', authorId: userId },
  ],
  select: { id: true, title: true },
});
```

##### `update(options)`

Update a single record.

```typescript
const updatedPost = await db.posts.update({
  where: { id: postId },
  data: { published: true, updatedAt: new Date() },
  select: { id: true, published: true },
});
```

##### `updateMany(options)`

Update multiple records (returns count).

```typescript
const { count } = await db.posts.updateMany({
  where: { authorId: userId },
  data: { published: false },
});

console.log(`Updated ${count} posts`);
```

##### `upsert(options)`

Insert or update (based on unique constraint).

```typescript
const user = await db.users.upsert({
  where: { email: 'alice@example.com' },
  create: {
    email: 'alice@example.com',
    name: 'Alice',
  },
  update: {
    name: 'Alice Updated',
  },
});
```

##### `delete(options)`

Delete a single record.

```typescript
const deleted = await db.users.delete({
  where: { id: userId },
  select: { id: true, email: true },
});
```

##### `deleteMany(options)`

Delete multiple records (returns count).

```typescript
const { count } = await db.posts.deleteMany({
  where: {
    createdAt: { lt: new Date('2024-01-01') },
  },
});

console.log(`Deleted ${count} old posts`);
```

#### Filter Operators

Use operators in `where` clauses:

```typescript
await db.posts.findMany({
  where: {
    // Equality
    published: true,
    
    // Comparison
    views: { gt: 100 },           // greater than
    createdAt: { gte: startDate }, // greater than or equal
    likes: { lt: 50 },            // less than
    rating: { lte: 3 },           // less than or equal
    
    // Pattern matching
    title: { like: '%tutorial%' },
    email: { ilike: '%@EXAMPLE.COM%' }, // case-insensitive
    
    // Set operations
    status: { in: ['draft', 'published'] },
    category: { notIn: ['spam', 'deleted'] },
    
    // Null checks
    deletedAt: { isNull: true },
    publishedAt: { isNotNull: true },
    
    // Logical operators
    OR: [
      { authorId: user1Id },
      { authorId: user2Id },
    ],
    AND: [
      { published: true },
      { views: { gt: 100 } },
    ],
    NOT: { status: 'archived' },
  },
});
```

#### Aggregation

```typescript
// Count
const count = await db.posts.count({
  where: { published: true },
});

// Sum
const totalViews = await db.posts.sum('views', {
  where: { authorId: userId },
});

// Average
const avgRating = await db.posts.avg('rating', {
  where: { published: true },
});

// Min/Max
const oldestPost = await db.posts.min('createdAt');
const newestPost = await db.posts.max('createdAt');
```

#### Raw SQL Queries

For complex queries, use the raw query function:

```typescript
import { sql } from '@vertz/db/sql';

const results = await db.query<{ count: number }>(
  sql`
    SELECT COUNT(*) as count
    FROM posts
    WHERE published = ${true}
      AND author_id = ${userId}
  `
);

console.log(results.rows[0].count);
```

**Security note:** Always use `sql` tagged template for user input to prevent SQL injection.

#### Timestamp Coercion

> ⚠️ **Important:** The PostgreSQL driver automatically coerces string values that match ISO 8601 timestamp patterns into JavaScript `Date` objects. This applies to all columns, not just declared timestamp columns.

If you store timestamp-formatted strings in plain `text` columns (e.g., `"2024-01-15T10:30:00Z"`), they will be silently converted to `Date` objects when returned from queries.

This behavior uses a heuristic regex (`/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/`) to detect timestamp-like strings. Future versions may add column-type-aware coercion to eliminate false positives.

### Migrations

#### `migrateDev(options)`

Development workflow: generate and apply migrations.

```typescript
import { migrateDev } from '@vertz/db';

const result = await migrateDev({
  queryFn: db.queryFn,
  currentSnapshot: db.snapshot,
  previousSnapshot: loadPreviousSnapshot(), // Load from file
  migrationsDir: './migrations',
});

console.log(`Applied migration: ${result.migrationName}`);
console.log(`SQL:\n${result.sql}`);

// Save current snapshot for next time
fs.writeFileSync(
  './schema-snapshot.json',
  JSON.stringify(db.snapshot, null, 2)
);
```

#### `migrateDeploy(options)`

Production: apply pending migrations from files.

```typescript
import { migrateDeploy } from '@vertz/db';

const result = await migrateDeploy({
  queryFn: db.queryFn,
  migrationsDir: './migrations',
});

console.log(`Applied ${result.appliedCount} migrations`);
```

#### `migrateStatus(options)`

Check migration status.

```typescript
import { migrateStatus } from '@vertz/db';

const status = await migrateStatus({
  queryFn: db.queryFn,
  migrationsDir: './migrations',
});

for (const migration of status.migrations) {
  console.log(`${migration.name}: ${migration.applied ? '✓' : '✗'}`);
}
```

#### `push(options)`

Push schema changes directly without creating migration files (development only).

```typescript
import { push } from '@vertz/db';

const result = await push({
  queryFn: db.queryFn,
  currentSnapshot: db.snapshot,
  previousSnapshot: loadPreviousSnapshot(),
});

console.log(`Pushed changes to: ${result.tablesAffected.join(', ')}`);
```

### Error Handling

`@vertz/db` provides typed error classes for common database errors:

```typescript
import {
  NotFoundError,
  UniqueConstraintError,
  ForeignKeyError,
  NotNullError,
  CheckConstraintError,
  ConnectionError,
  DbError,
} from '@vertz/db';

try {
  await db.users.create({
    data: { email: 'duplicate@example.com', name: 'Test' },
  });
} catch (error) {
  if (error instanceof UniqueConstraintError) {
    console.error(`Unique constraint violated on: ${error.constraint}`);
    console.error(`Table: ${error.table}, Column: ${error.column}`);
  } else if (error instanceof ForeignKeyError) {
    console.error(`Foreign key violation: ${error.constraint}`);
  } else if (error instanceof NotNullError) {
    console.error(`Not null constraint on: ${error.column}`);
  }
  throw error;
}
```

#### Diagnostic Utilities

Get helpful error explanations:

```typescript
import { diagnoseError, formatDiagnostic } from '@vertz/db';

try {
  await db.users.create({ data: { email: null, name: 'Test' } });
} catch (error) {
  const diagnostic = diagnoseError(error);
  if (diagnostic) {
    console.error(formatDiagnostic(diagnostic));
    // Output:
    // ERROR: Not null constraint violated on column "email"
    // Table: users
    // Suggestion: Ensure the email field is provided and not null
  }
}
```

#### HTTP Error Mapping

Convert database errors to HTTP status codes:

```typescript
import { dbErrorToHttpError } from '@vertz/db';

try {
  await db.users.findOneOrThrow({ where: { id: userId } });
} catch (error) {
  const httpError = dbErrorToHttpError(error);
  return new Response(JSON.stringify(httpError), {
    status: httpError.status,
  });
}

// NotFoundError → 404
// UniqueConstraintError → 409 Conflict
// ForeignKeyError → 409 Conflict
// CheckConstraintError → 422 Unprocessable Entity
// NotNullError → 422 Unprocessable Entity
```

### Multi-Tenant Support

Built-in support for tenant isolation:

```typescript
// Define organization table
const organizations = d.table('organizations', {
  id: d.uuid().primaryKey(),
  name: d.text().notNull(),
});

// Add tenant column to scoped tables
const posts = d.table('posts', {
  id: d.uuid().primaryKey(),
  organizationId: d.tenant(organizations), // Automatic FK to organizations.id
  title: d.text().notNull(),
  content: d.text().notNull(),
});

// Compute tenant graph (for automatic scoping)
import { computeTenantGraph } from '@vertz/db';

const tenantGraph = computeTenantGraph({
  users: d.entry(users),
  organizations: d.entry(organizations),
  posts: d.entry(posts), // Will be marked as tenant-scoped
});

console.log(tenantGraph.scopedTables); // ['posts']
```

### Plugin System

Extend `@vertz/db` with custom behavior:

```typescript
import type { DbPlugin } from '@vertz/db/plugin';

const auditLogPlugin: DbPlugin = {
  name: 'audit-log',
  
  hooks: {
    beforeCreate: async (tableName, data) => {
      console.log(`Creating ${tableName}:`, data);
    },
    
    afterCreate: async (tableName, result) => {
      await logToAuditTable(tableName, 'create', result);
    },
    
    beforeUpdate: async (tableName, where, data) => {
      console.log(`Updating ${tableName}:`, { where, data });
    },
    
    afterDelete: async (tableName, result) => {
      await logToAuditTable(tableName, 'delete', result);
    },
  },
};

const db = createDb({
  url: process.env.DATABASE_URL!,
  tables: { /* ... */ },
  plugins: [auditLogPlugin],
});
```

## Type Safety Features

### Schema to Query Type Flow

Types flow automatically from schema definition to query results:

```typescript
// 1. Define schema
const users = d.table('users', {
  id: d.uuid(),
  email: d.email(),
  name: d.text(),
  age: d.integer().nullable(), // Optional field
});

// 2. Query with full inference
const user = await db.users.findOne({
  where: { email: 'test@example.com' },
  select: { id: true, name: true },
});

// 3. Type is inferred: { id: string; name: string } | null

// 4. With relations
const userWithPosts = await db.users.findOne({
  where: { id: userId },
  include: { posts: true },
});

// 5. Type is inferred: { id: string; email: string; name: string; age: number | null; posts: Post[] } | null
```

### Insert Type Inference

Insert types respect `notNull()`, `defaultValue()`, and `nullable()`:

```typescript
const users = d.table('users', {
  id: d.uuid().primaryKey().defaultValue('gen_random_uuid()'), // Auto-generated
  email: d.email().notNull(),  // Required
  name: d.text().notNull(),    // Required
  bio: d.text().nullable(),    // Optional
  createdAt: d.timestamp().defaultValue('now()'), // Auto-generated
});

// Type inference for insert:
await db.users.create({
  data: {
    // id: NOT required (has default)
    email: 'test@example.com', // REQUIRED
    name: 'Test User',         // REQUIRED
    bio: null,                 // OPTIONAL (can be null or omitted)
    // createdAt: NOT required (has default)
  },
});
```

### Select Type Narrowing

Select only specific columns with full type safety:

```typescript
const user = await db.users.findOne({
  where: { id: userId },
  select: {
    id: true,
    email: true,
    // name intentionally omitted
  },
});

// Type: { id: string; email: string } | null
// user.name ← TypeScript error: Property 'name' does not exist
```

### Branded Error Types

Compile-time errors for invalid queries:

```typescript
// ❌ TypeScript error: Invalid column
await db.users.findMany({
  where: { invalidColumn: 'value' }, // Error: 'invalidColumn' does not exist on User
});

// ❌ TypeScript error: Invalid relation
await db.users.findOne({
  include: { invalidRelation: true }, // Error: 'invalidRelation' is not a valid relation
});

// ❌ TypeScript error: Invalid filter operator
await db.posts.findMany({
  where: { title: { invalidOp: 'value' } }, // Error: 'invalidOp' is not a valid operator
});
```

## Integration with @vertz/schema

Use `@vertz/schema` for additional validation on JSONB columns:

```typescript
import { d } from '@vertz/db';
import { s } from '@vertz/schema';

// Define a schema for JSONB data
const MetadataSchema = s.object({
  tags: s.array(s.string()),
  priority: s.enum(['low', 'medium', 'high']),
  dueDate: s.string().datetime().nullable(),
});

// Use the schema as a JSONB validator
const tasks = d.table('tasks', {
  id: d.uuid().primaryKey(),
  title: d.text().notNull(),
  metadata: d.jsonb<typeof MetadataSchema._output>({
    validator: (value) => MetadataSchema.parse(value),
  }),
});

// Insert with validated JSONB
await db.tasks.create({
  data: {
    title: 'Complete documentation',
    metadata: {
      tags: ['docs', 'p0'],
      priority: 'high',
      dueDate: '2024-12-31T23:59:59Z',
    },
  },
});

// Query returns typed JSONB
const task = await db.tasks.findOne({ where: { id: taskId } });
// task.metadata is typed as { tags: string[]; priority: 'low' | 'medium' | 'high'; dueDate: string | null }
```

## Best Practices

1. **Use migrations in production** — Never use `push()` in production; always use `migrateDeploy()`
2. **Store schema snapshots** — Commit `schema-snapshot.json` to version control
3. **Leverage type inference** — Let TypeScript infer types; avoid manual type annotations
4. **Use relations wisely** — `include` loads related data, but use `select` to avoid over-fetching
5. **Prefer `findOneOrThrow`** — More explicit than null checks for required data
6. **Use connection pooling** — Configure `pool.max` based on your load
7. **Handle specific errors** — Catch `UniqueConstraintError`, `ForeignKeyError`, etc. for better UX
8. **Use `sql` template for raw queries** — Prevents SQL injection
9. **Test migrations locally** — Run `migrateDev` locally before deploying

## Casing Strategy

By default, `@vertz/db` uses `snake_case` for database column names (PostgreSQL convention):

```typescript
const users = d.table('users', {
  firstName: d.text(), // Stored as "first_name" in database
  lastName: d.text(),  // Stored as "last_name"
});

// Use camelCase in queries:
await db.users.create({
  data: { firstName: 'Alice', lastName: 'Smith' },
});

// Automatically converted to snake_case in SQL
```

To use `camelCase` in the database:

```typescript
const db = createDb({
  url: process.env.DATABASE_URL!,
  tables: { /* ... */ },
  casing: 'camelCase',
});
```

## License

MIT
