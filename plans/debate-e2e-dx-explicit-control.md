# Position Paper: The Case for Explicit Control in Vertz

**The "Explicit Control" DX — Well-Designed LEGO Bricks, Not Magic**

---

## 1. The Ideal Developer Flow

Here's what explicit, composable end-to-end looks like:

### Define a Schema

```typescript
// schema/users.ts
import { vertz } from '@vertz/schema';

export const UserSchema = vertz.table('users', {
  id: vertz.uuid().primaryKey(),
  email: vertz.string().unique().notNull(),
  name: vertz.string().optional(),
  createdAt: vertz.timestamp().defaultNow(),
});
```

### Get a Database Table

```typescript
// db/users.ts
import { drizzle } from '@vertz/db';
import { UserSchema } from '../schema/users';

export const users = drizzle.table(UserSchema);

// Direct SQL access when you need it
export const findByEmail = users.query.where('email', '=', '$1');
```

### Expose a REST API

```typescript
// server/routes/users.ts
import { vertz } from '@vertz/server';
import { users } from '../db/users';

export const usersRouter = vertz.router({
  list: vertz.endpoint({
    method: 'GET',
    path: '/users',
    handler: async () => {
      return users.select().all();
    },
  }),
  
  create: vertz.endpoint({
    method: 'POST',
    path: '/users',
    input: vertz.zod(UserSchema.omit('id', 'createdAt')),
    handler: async ({ input }) => {
      return users.insert(input).returning();
    },
  }),
});
```

### Query Data in the UI

```typescript
// ui/users/page.tsx
import { vertz } from '@vertz/ui';
import { usersRouter } from '../server/routes/users';

export default function UsersPage() {
  const { data, isLoading } = vertz.useQuery(usersRouter.list);
  
  return (
    <ul>
      {data?.map(user => (
        <li key={user.id}>{user.email}</li>
      ))}
    </ul>
  );
}
```

**End-to-end type safety?** Yes — the `usersRouter` types flow into the UI hook automatically.

---

## 2. Key Principles

**Every layer works standalone.** `@vertz/db` doesn't require `@vertz/server`. `@vertz/ui` works with any backend. You can swap pieces without rewriting everything.

**Explicit over implicit.** No runtime code generation. No "magic" decorators. Your schema is your source of truth — it's just a TypeScript object, inspectable and debuggable.

**Composability as a feature.** Each package does one thing well. Stack them as needed. Use raw SQL when ORMs slow you down. Use fetch instead of the UI hooks when appropriate.

**Type safety without black boxes.** Types are generated from your schema at build time, not inferred from runtime introspection. You see exactly what you're getting.

---

## 3. Why This Beats tRPC + Drizzle + Next.js

| Aspect | tRPC + Drizzle + Next.js | Vertz Explicit |
|--------|--------------------------|----------------|
| Setup complexity | 3+ config files, glue code | One schema import |
| Type coverage | Excellent, but inferred | Direct, no middleman |
| Debugging | Router → serializer → network → client | Follow the code |
| Standalone use | Tied to React/Next.js | Any layer works alone |
| Learning curve | Learn 3 ecosystems | One consistent model |

With tRPC, your types travel through a router, serializer, HTTP layer, and client — many places to break. With vertz, you define schema → it flows. Simple.

---

## 4. Risks and Tradeoffs

**More boilerplate.** You'll write more lines than with Rails or Blitz. That's intentional. Explicit beats magical when debugging at 2 AM.

**No auto-migrations.** You'll run `vertz db push` or write migrations manually. Magic schema inference sounds great until you lose data.

**Fewer conventions.** Vertz won't guess your routing structure. You decide — which is freedom for experts but friction for beginners.

**Ecosystem lock-in.** While layers are standalone, mixing vertz packages with external libs (Prisma + vertz UI) requires adapters. Choose your boundaries.

---

## Conclusion

Vertz should be the framework that respects your intelligence. We give you powerful, type-safe primitives and let you compose them. That's not as flashy as magic — but it scales when your startup becomes a company.

*Explicit > Implicit. Composable > Magical. Predictable > Convenient.*
