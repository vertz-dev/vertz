# @vertz/db

Type-safe PostgreSQL ORM with schema-driven migrations and full TypeScript inference.

## Quickstart

```typescript
import { d, createDb, migrateDev } from '@vertz/db';

// 1. Define schema
const users = d.table('users', {
  id: d.uuid().primaryKey().defaultValue('gen_random_uuid()'),
  email: d.email().notNull(),
  name: d.text().notNull(),
});

// 2. Create database client
const db = createDb({
  url: process.env.DATABASE_URL!,
  tables: { users: d.entry(users) },
});

// 3. Run migrations (dev)
await migrateDev({
  queryFn: db.queryFn,
  currentSnapshot: db.snapshot,
  previousSnapshot: null,
  migrationsDir: './migrations',
});

// 4. Query with full type inference
const user = await db.users.create({
  data: { email: 'alice@example.com', name: 'Alice' },
});
// user: { id: string; email: string; name: string; ... }
```

## Installation

```bash
npm install @vertz/db
```

**Prerequisites:**
- PostgreSQL database
- Node.js >= 22

## API Reference

### Schema Builder (`d`)

#### Column Types

```typescript
import { d } from '@vertz/db';

// Text
d.text()                    // TEXT
d.varchar(255)              // VARCHAR(255)
d.email()                   // TEXT with email constraint
d.uuid()                    // UUID

// Numeric
d.integer()                 // INTEGER
d.bigint()                  // BIGINT
d.serial()                  // SERIAL (auto-increment)
d.decimal(10, 2)           // DECIMAL(10, 2)

// Date/Time
d.timestamp()               // TIMESTAMP WITH TIME ZONE
d.date()                   // DATE
d.time()                   // TIME

// Other
d.boolean()                // BOOLEAN
d.jsonb()                  // JSONB
d.jsonb<MyType>({          // JSONB with validator
  validator: (v) => MyTypeSchema.parse(v)
})
d.textArray()              // TEXT[]
d.integerArray()          // INTEGER[]
```

#### Column Modifiers

```typescript
d.text()
  .primaryKey()            // PRIMARY KEY
  .unique()                // UNIQUE constraint
  .notNull()               // NOT NULL constraint
  .defaultValue('default') // DEFAULT value
  .nullable()              // Allows NULL
  .index()                 // Add index
```

#### Tables and Relations

```typescript
const users = d.table('users', {
  id: d.uuid().primaryKey(),
  email: d.email().notNull(),
  name: d.text().notNull(),
});

const posts = d.table('posts', {
  id: d.uuid().primaryKey(),
  title: d.text().notNull(),
  authorId: d.uuid().notNull(),
});

// Relations
const userRelations = {
  posts: d.ref.many(() => posts, 'authorId'),
};

const postRelations = {
  author: d.ref.one(() => users, 'authorId'),
};

// Register with database
d.entry(users, userRelations)
d.entry(posts, postRelations)
```

> **Note:** Relations are defined separately after tables to avoid circular dependencies. Use arrow functions (`() => posts`) to reference tables that may be declared later in the file.

### Database Client (`createDb`)

```typescript
import { d, createDb } from '@vertz/db';

const db = createDb({
  url: 'postgresql://user:pass@localhost:5432/mydb',
  tables: {
    users: d.entry(usersTable, userRelations),
    posts: d.entry(postsTable, postRelations),
  },
  pool: {
    max: 20,
    idleTimeout: 30000,
    connectionTimeout: 5000,
    replicas: ['postgresql://...'],
  },
  casing: 'snake_case', // or 'camelCase'
  log: (msg) => console.log(msg),
});
```

**Returns:** `DatabaseInstance<TTables>`

### Query Methods

All methods available on `db.<tableName>`:

```typescript
// Find one
const user = await db.users.findOne({ where: { id: userId } });
const user = await db.users.findOneOrThrow({ where: { id: userId } });

// Find many
const users = await db.users.findMany({
  where: { email: { like: '%@example.com' } },
  orderBy: { createdAt: 'desc' },
  limit: 10,
  include: { posts: true },
});

// Create
const newUser = await db.users.create({
  data: { email: 'bob@example.com', name: 'Bob' },
});

// Update
const updated = await db.users.update({
  where: { id: userId },
  data: { name: 'Robert' },
});

// Delete
await db.users.delete({ where: { id: userId } });

// Upsert
await db.users.upsert({
  where: { email: 'alice@example.com' },
  create: { email: 'alice@example.com', name: 'Alice' },
  update: { name: 'Alice Updated' },
});

// Aggregation
const count = await db.users.count({ where: { active: true } });
```

### Filter Operators

```typescript
await db.users.findMany({
  where: {
    // Equality
    active: true,
    
    // Comparison
    age: { gt: 18, lte: 65 },
    createdAt: { gte: startDate },
    
    // Pattern matching
    name: { like: '%Smith%' },
    email: { ilike: '%@EXAMPLE.COM%' },
    
    // Set operations
    role: { in: ['admin', 'moderator'] },
    status: { notIn: ['deleted'] },
    
    // Null checks
    deletedAt: { isNull: true },
    
    // Logical
    OR: [{ role: 'admin' }, { active: true }],
    AND: [{ verified: true }, { age: { gt: 18 } }],
    NOT: { status: 'banned' },
  },
});
```

### Migrations

```typescript
import { migrateDev, migrateDeploy, migrateStatus, push } from '@vertz/db';

// Development: generate and apply
await migrateDev({
  queryFn: db.queryFn,
  currentSnapshot: db.snapshot,
  previousSnapshot: loadFromFile(),
  migrationsDir: './migrations',
});

// Production: apply from files
await migrateDeploy({
  queryFn: db.queryFn,
  migrationsDir: './migrations',
});

// Check status
const status = await migrateStatus({
  queryFn: db.queryFn,
  migrationsDir: './migrations',
});

// Push schema (dev only)
await push({
  queryFn: db.queryFn,
  currentSnapshot: db.snapshot,
  previousSnapshot: loadFromFile(),
});
```

### Errors

Vertz uses typed error classes instead of generic exceptions. Each error type maps to a specific database failure, so you can handle them precisely — and `dbErrorToHttpError` converts them to the right HTTP status code automatically.

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

try {
  await db.users.create({ data: { email: 'exists@example.com' } });
} catch (error) {
  if (error instanceof UniqueConstraintError) {
    console.log(`Duplicate: ${error.constraint}`);
  } else if (error instanceof NotFoundError) {
    console.log('Record not found');
  }
  throw error;
}

// Map to HTTP status
const httpError = dbErrorToHttpError(error);
// NotFoundError → 404
// UniqueConstraintError → 409
// ForeignKeyError → 409
// NotNullError → 422
```

### Diagnostic Utilities

When queries fail, raw database errors are cryptic. Diagnostics turn them into actionable messages — identifying the error type, explaining what went wrong, and suggesting a fix. Great for dev-time debugging and for surfacing helpful errors in CLI tools.

```typescript
import { diagnoseError, formatDiagnostic, explainError } from '@vertz/db';

try {
  await db.users.create({ data: { email: null, name: 'Test' } });
} catch (error) {
  const diagnostic = diagnoseError(error.message);
  // DiagnosticResult shape:
  // {
  //   code: 'NOT_NULL_VIOLATION',
  //   explanation: 'Not null constraint violated on column "email"',
  //   table: 'users',
  //   suggestion: 'Ensure the email field is provided and not null'
  // }

  if (diagnostic) {
    console.log(formatDiagnostic(diagnostic));
    // Output:
    // ERROR: Not null constraint violated on column "email"
    // Table: users
    // Suggestion: Ensure the email field is provided and not null
  }

  // Or one-liner
  console.log(explainError(error.message));
}
```

### Tenant Graph

Multi-tenant apps need data isolation — each customer (tenant) should only see their own data. `computeTenantGraph` analyzes your schema's foreign keys to automatically determine which tables belong to which tenant, so you can enforce row-level isolation without manual configuration.

```typescript
import { computeTenantGraph } from '@vertz/db';

const tenantGraph = computeTenantGraph({
  organizations: d.entry(orgsTable),
  posts: d.entry(postsTable),
  users: d.entry(usersTable),
});

console.log(tenantGraph.root);        // 'organizations'
console.log(tenantGraph.scopedTables); // ['posts', 'users']
```

### Domain Codegen

Generate type-safe client code directly from your schema definitions. Instead of hand-writing CRUD operations for each table, `defineDomain` produces typed queries, mutations, and client SDKs automatically — keeping your API layer in sync with your database.

```typescript
import { defineDomain, generateTypes, generateClient } from '@vertz/db';

const domain = defineDomain({
  name: 'User',
  table: 'users',
  columns: {
    id: d.uuid().primaryKey(),
    email: d.email(),
    name: d.text(),
  },
});

const types = generateTypes(domain);
const client = generateClient(domain);
```

### Raw SQL

```typescript
import { sql } from '@vertz/db/sql';

const results = await db.query(
  sql`SELECT * FROM users WHERE email = ${email}`
);
```

## Type Safety Features

- **Schema → Query inference**: Types flow from schema definition to query results
- **Insert type narrowing**: Required vs optional fields based on `notNull()` and `defaultValue()`
- **Select type narrowing**: Only selected fields are in the result type
- **Branded errors**: Compile-time errors for invalid columns, relations, or filters
