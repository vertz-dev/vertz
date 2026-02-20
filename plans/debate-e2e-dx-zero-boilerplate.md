# Zero Boilerplate: The Vertz Developer Experience

**Position: Convention over Configuration**

## The Ideal Developer Flow

One file. Twenty lines. A working CRUD app with full-stack type safety.

```typescript
// 1. Define your schema — the only source of truth
import { schema } from '@vertz/schema';

const User = schema.table('users', {
  id: schema.uuid().primaryKey(),
  email: schema.string().unique().notNull(),
  name: schema.string().optional(),
  createdAt: schema.timestamp().defaultNow(),
});

// 2. Database table? Already done. Migrations? Automatic.
export type User = schema.infer<typeof User>;

// 3. REST API? Exposed automatically
export const users = schema.router(User);

// 4. In your UI — full type safety, zero glue code
import { useQuery } from '@vertz/ui-server';

function UserList() {
  const users = useQuery(users.list); // typed ✨
  return users.map(u => <div>{u.email}</div>);
}
```

**That's it.** No Prisma schema, no Drizzle config, no API routes, no Zod validation, no type munging. The schema is your database, your API contract, and your UI types.

## Key Principles

### 1. Schema as Single Source of Truth
Define once. The `@vertz/schema` package infers everything: database columns, API request/response types, UI hooks. One line of schema = twelve lines of boilerplate eliminated.

### 2. Convention Over Configuration
We default to RESTful conventions. `/users` for the collection, `GET/POST/PUT/DELETE` for methods. Override only when needed.

### 3. Zero-Copy Type Propagation
Types flow from schema → database → API → UI without manual re-declaration. Change a column in schema, and your UI breaks at compile time—before you deploy.

### 4. The Framework Infers
- Pagination? Inferred from cursor.
- Validation? Inferred from schema constraints (`notNull`, `unique`, `uuid()`).
- Relationships? Inferred from foreign keys.

## Why This Beats tRPC + Drizzle + Next.js

| Concern | tRPC + Drizzle + Next.js | Vertz |
|---------|--------------------------|-------|
| Files to create | 6+ (schema, migration, router, API route, hook, component) | 1 |
| Type duplication | Manual `z.input` → `drizzle.table` → React Query generic | None |
| Learning curve | 3 libraries, 4 configs, countless edge cases | 1 package |
| LLM-friendliness | "Write me a tRPC router for this Drizzle schema" | "Create a user table" |

The honest truth: **most apps are CRUD**. 80% of web development is forms over tables. Vertz optimizes for the common case because "configurable" is a trap—you end up configuring the same thing 100 times.

## Risks and Tradeoffs

### ⚠️ Less Flexibility
Power users lose some control. If you need a custom database adapter or non-REST API, you'll hit walls. We're trading "you can do anything" for "you can do common things instantly."

### ⚠️ Debugging Magic
When inference works, it's magical. When it breaks, it's cryptic. Stack traces may point to generated code you didn't write.

### ⚠️ Migration Pain
Changing the schema changes everything. A column rename ripples through API and UI. This is a feature (compile-time safety), but it's a learning curve.

### ⚠️ Novelty Risk
Teams know tRPC + Drizzle. They can Google errors. Vertz is new territory—fewer Stack Overflow answers, more reliance on the framework docs.

---

**The Bottom Line**: Most developers don't want to wire libraries together. They want to build features. Vertz's zero-boilerplate DX removes the assembly line so you can ship.
