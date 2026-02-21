# @vertz/db

Type-safe database layer with schema-driven migrations, phantom types, and Result-based error handling.

## Installation

```bash
bun add @vertz/db
```

**Prerequisites:**
- PostgreSQL or SQLite database
- Node.js >= 22 or Bun

## Quick Start

```typescript
import { d, createDb, createRegistry } from '@vertz/db';

// 1. Define schema
const todos = d.table('todos', {
  id: d.uuid().primary(),
  title: d.text(),
  completed: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

// 2. Create registry (even with no relations)
const tables = createRegistry({ todos }, () => ({}));

// 3. Create database client
const db = createDb({
  url: process.env.DATABASE_URL!,
  tables,
});

// 4. Query with full type inference and Result-based errors
const result = await db.create('todos', {
  data: { title: 'Buy milk' },
});

if (result.ok) {
  console.log(result.data);
  // { id: string; title: string; completed: boolean; createdAt: Date; updatedAt: Date }
}
```

## Schema Builder (`d`)

### Column Types

```typescript
import { d } from '@vertz/db';

// Text
d.text()                    // TEXT → string
d.varchar(255)              // VARCHAR(255) → string
d.email()                   // TEXT with email format → string

// Identifiers
d.uuid()                    // UUID → string

// Numeric
d.integer()                 // INTEGER → number
d.bigint()                  // BIGINT → bigint
d.serial()                  // SERIAL (auto-increment) → number
d.decimal(10, 2)            // NUMERIC(10,2) → string
d.real()                    // REAL → number
d.doublePrecision()         // DOUBLE PRECISION → number

// Date/Time
d.timestamp()               // TIMESTAMP WITH TIME ZONE → Date
d.date()                    // DATE → string
d.time()                    // TIME → string

// Other
d.boolean()                 // BOOLEAN → boolean
d.jsonb<MyType>()           // JSONB → MyType
d.jsonb<MyType>(schema)     // JSONB with runtime validation
d.textArray()               // TEXT[] → string[]
d.integerArray()            // INTEGER[] → number[]
d.enum('status', ['active', 'inactive'])  // ENUM → 'active' | 'inactive'

// Multi-tenancy
d.tenant(orgsTable)         // UUID FK to tenant root → string
```

### Column Modifiers

Columns are **required by default**. Use modifiers to change behavior:

```typescript
d.text()
  .primary()                // PRIMARY KEY (auto-excludes from inputs)
  .primary({ generate: 'cuid' })  // PRIMARY KEY with ID generation
  .unique()                 // UNIQUE constraint
  .nullable()               // Allows NULL (T | null)
  .default('hello')         // DEFAULT value (makes field optional in inserts)
  .default('now')           // DEFAULT NOW() for timestamps
  .hidden()                 // Excluded from default SELECT queries
  .readOnly()               // Excluded from INSERT/UPDATE inputs
  .sensitive()              // Excluded when select: { not: 'sensitive' }
  .autoUpdate()             // Read-only + auto-updated on every write
  .check('length(name) > 0')  // SQL CHECK constraint
  .references('users')      // FK to users.id
  .references('users', 'email')  // FK to users.email
```

### ID Generation

```typescript
d.uuid().primary()                      // No auto-generation
d.uuid().primary({ generate: 'cuid' }) // CUID2
d.uuid().primary({ generate: 'uuid' }) // UUID v7
d.uuid().primary({ generate: 'nanoid' }) // Nano ID
d.serial().primary()                    // Auto-increment
```

### Tables

```typescript
const users = d.table('users', {
  id: d.uuid().primary({ generate: 'cuid' }),
  email: d.email().unique(),
  name: d.text(),
  bio: d.text().nullable(),
  isActive: d.boolean().default(true),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});
```

### Annotations

Column annotations control visibility and mutability across the stack:

| Annotation | Effect on queries | Effect on inputs | Use case |
|---|---|---|---|
| `.hidden()` | Excluded from default SELECT | N/A | Internal fields (password hashes) |
| `.readOnly()` | Included in responses | Excluded from create/update | Server-managed fields |
| `.autoUpdate()` | Included in responses | Excluded from create/update | `updatedAt` timestamps |
| `.sensitive()` | Excluded with `select: { not: 'sensitive' }` | N/A | Fields to exclude in bulk queries |

### Phantom Types

Every `TableDef` carries phantom type properties for compile-time type inference:

```typescript
const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  passwordHash: d.text().hidden(),
  createdAt: d.timestamp().default('now').readOnly(),
});

type Response = typeof users.$response;
// { id: string; name: string; createdAt: Date }
// (passwordHash excluded — hidden)

type CreateInput = typeof users.$create_input;
// { name: string }
// (id excluded — primary, createdAt excluded — readOnly, passwordHash excluded — hidden)

type UpdateInput = typeof users.$update_input;
// { name?: string }
// (same exclusions, all fields optional)

type Insert = typeof users.$insert;
// { name: string; passwordHash: string; createdAt?: Date }
// (id excluded — has default, createdAt optional — has default)
```

| Phantom type | Description |
|---|---|
| `$response` | API response shape (excludes hidden) |
| `$create_input` | API create input (excludes readOnly + primary) |
| `$update_input` | API update input (same exclusions, all optional) |
| `$insert` | DB insert shape (columns with defaults are optional) |
| `$update` | DB update shape (non-PK columns, all optional) |
| `$infer` | Default SELECT (excludes hidden) |
| `$infer_all` | All columns including hidden |
| `$not_sensitive` | Excludes sensitive + hidden |

### Models

`d.model()` wraps a table with derived runtime schemas for validation:

```typescript
const usersModel = d.model(users);

// usersModel.table      → the table definition
// usersModel.relations   → {} (empty, no relations passed)
// usersModel.schemas.response     → SchemaLike<$response>
// usersModel.schemas.createInput  → SchemaLike<$create_input>
// usersModel.schemas.updateInput  → SchemaLike<$update_input>
```

Models are used by `@vertz/server`'s `entity()` to derive validation and type-safe CRUD.

## Relations

### Registry

```typescript
import { d, createRegistry } from '@vertz/db';

const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
});

const posts = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  authorId: d.uuid(),
});

const comments = d.table('comments', {
  id: d.uuid().primary(),
  body: d.text(),
  postId: d.uuid(),
  authorId: d.uuid(),
});

const tables = createRegistry({ users, posts, comments }, (ref) => ({
  posts: {
    author: ref.posts.one('users', 'authorId'),
    comments: ref.posts.many('comments', 'postId'),
  },
  comments: {
    post: ref.comments.one('posts', 'postId'),
    author: ref.comments.one('users', 'authorId'),
  },
}));
```

### Relation Types

```typescript
// belongsTo — FK lives on source table
ref.posts.one('users', 'authorId');

// hasMany — FK lives on target table
ref.users.many('posts', 'authorId');

// Many-to-many — via join table
ref.students.many('courses').through('enrollments', 'studentId', 'courseId');
```

## Database Client

### Configuration

```typescript
const db = createDb({
  url: 'postgresql://user:pass@localhost:5432/mydb',
  tables,
  dialect: 'postgres',           // 'postgres' (default) or 'sqlite'
  pool: {
    max: 20,
    idleTimeout: 30000,
    connectionTimeout: 5000,
    replicas: ['postgresql://...'],
  },
  casing: 'snake_case',          // column name transformation
  log: (msg) => console.log(msg),
});
```

### Query Methods

All methods return `Promise<Result<T, Error>>` — never throw.

```typescript
// Read
const user = await db.get('users', { where: { id: userId } });
const users = await db.list('users', {
  where: { isActive: true },
  orderBy: { createdAt: 'desc' },
  limit: 10,
  include: { posts: true },
});
const { data, total } = await db.listAndCount('users', { where: { isActive: true } });

// Write
const created = await db.create('users', {
  data: { name: 'Alice', email: 'alice@example.com' },
});
const updated = await db.update('users', {
  where: { id: userId },
  data: { name: 'Bob' },
});
const deleted = await db.delete('users', { where: { id: userId } });

// Upsert
const upserted = await db.upsert('users', {
  where: { email: 'alice@example.com' },
  create: { email: 'alice@example.com', name: 'Alice' },
  update: { name: 'Alice Updated' },
});

// Bulk
await db.createMany('users', { data: [{ name: 'A' }, { name: 'B' }] });
await db.updateMany('users', { where: { isActive: false }, data: { isActive: true } });
await db.deleteMany('users', { where: { isActive: false } });
```

### Result-Based Error Handling

Query methods return `Result<T, ReadError | WriteError>` instead of throwing:

```typescript
import { match, matchErr } from '@vertz/schema';

const result = await db.create('users', {
  data: { email: 'exists@example.com', name: 'Alice' },
});

if (result.ok) {
  console.log('Created:', result.data);
} else {
  console.log('Failed:', result.error);
}

// Pattern matching
match(result, {
  ok: (user) => console.log('Created:', user.name),
  err: (error) => console.log('Error:', error.code),
});
```

### Filter Operators

```typescript
await db.list('users', {
  where: {
    // Equality
    isActive: true,

    // Comparison
    age: { gte: 18, lte: 65 },

    // Pattern matching
    name: { contains: 'Smith' },
    email: { startsWith: 'admin' },

    // Set operations
    role: { in: ['admin', 'moderator'] },
    status: { notIn: ['deleted'] },

    // Null checks
    deletedAt: { isNull: true },

    // Logical
    OR: [{ role: 'admin' }, { isActive: true }],
    AND: [{ verified: true }, { age: { gte: 18 } }],
    NOT: { status: 'banned' },
  },
});
```

### Select & Include

```typescript
// Select specific fields
await db.get('users', {
  where: { id: userId },
  select: { id: true, name: true, email: true },
});

// Exclude by visibility
await db.list('users', {
  select: { not: 'sensitive' },  // excludes sensitive + hidden fields
});

// Include relations
await db.list('posts', {
  include: { author: true, comments: true },
});
```

### Aggregation

```typescript
// Count
const count = await db.count('users', { where: { isActive: true } });

// Aggregate functions
await db.aggregate('orders', {
  where: { status: 'completed' },
  _count: true,
  _sum: { price: true },
  _avg: { amount: true },
  _min: { discount: true },
  _max: { total: true },
});

// Group by
await db.groupBy('orders', {
  by: ['customerId', 'status'],
  _count: true,
  _sum: { total: true },
});
```

## Error Types

```typescript
import {
  NotFoundError,
  UniqueConstraintError,
  ForeignKeyError,
  NotNullError,
  CheckConstraintError,
  ConnectionError,
  dbErrorToHttpError,
} from '@vertz/db';
```

| Error | HTTP Status | When |
|---|---|---|
| `NotFoundError` | 404 | Record not found |
| `UniqueConstraintError` | 409 | Duplicate unique value |
| `ForeignKeyError` | 409 | Referenced record doesn't exist |
| `NotNullError` | 422 | Required field missing |
| `CheckConstraintError` | 422 | CHECK constraint violated |
| `ConnectionError` | 503 | Database unreachable |

```typescript
const httpError = dbErrorToHttpError(error);
// Converts any db error to the appropriate HTTP status
```

## Diagnostics

```typescript
import { diagnoseError, formatDiagnostic, explainError } from '@vertz/db';

const diagnostic = diagnoseError(error.message);
// {
//   code: 'NOT_NULL_VIOLATION',
//   explanation: 'Not null constraint violated on column "email"',
//   table: 'users',
//   suggestion: 'Ensure the email field is provided and not null'
// }

console.log(formatDiagnostic(diagnostic));
console.log(explainError(error.message));
```

## Multi-Tenancy

```typescript
import { d, createRegistry, computeTenantGraph } from '@vertz/db';

const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});

const users = d.table('users', {
  id: d.uuid().primary(),
  email: d.email(),
  orgId: d.tenant(organizations),  // scopes this table to a tenant
});

const tables = createRegistry({ organizations, users }, () => ({}));
const tenantGraph = computeTenantGraph(tables);

tenantGraph.root;            // 'organizations'
tenantGraph.directlyScoped;  // ['users']
```

Tables can be marked as shared (cross-tenant):

```typescript
const settings = d.table('settings', { /* ... */ }).shared();
```

## Dialects

```typescript
import { createDb, defaultPostgresDialect, defaultSqliteDialect } from '@vertz/db';

// PostgreSQL (default)
const pgDb = createDb({ url: 'postgresql://...', tables });

// SQLite
const sqliteDb = createDb({
  tables,
  dialect: 'sqlite',
  d1: d1Database,  // Cloudflare D1 or compatible
});
```

## Migrations

```bash
# Generate and apply migrations (development)
vertz db migrate

# Apply migrations from files (production)
vertz db migrate --deploy

# Check migration status
vertz db migrate --status

# Push schema directly without migration files (dev only)
vertz db push
```

### Programmatic API

```typescript
import { migrateDev, migrateDeploy, migrateStatus, push } from '@vertz/db';

await migrateDev({
  queryFn: db.queryFn,
  currentSnapshot: db.snapshot,
  previousSnapshot: loadFromFile(),
  migrationsDir: './migrations',
});

await migrateDeploy({
  queryFn: db.queryFn,
  migrationsDir: './migrations',
});
```

## Raw SQL

```typescript
import { sql } from '@vertz/db/sql';

const result = await db.query(
  sql`SELECT * FROM users WHERE email = ${email}`
);

// Composition
const where = sql`WHERE active = ${true}`;
const query = sql`SELECT * FROM users ${where}`;

// Raw (unparameterized)
const col = sql.raw('created_at');
```

## License

MIT
