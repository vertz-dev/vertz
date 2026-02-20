# Position Paper: The LLM-Native Developer Experience

## The Ideal Developer Flow

Everything starts with a schema. Not a config file, not a decorator — just TypeScript:

```typescript
// schema.ts
import { schema, string, number, timestamp } from '@vertz/schema';

export const UserSchema = schema({
  id: string().uuid().primaryKey(),
  email: string().email(),
  name: string().min(1),
  createdAt: timestamp().defaultNow(),
});
```

From this single definition, everything else flows:

```typescript
// database.ts
import { table } from '@vertz/db';

export const Users = table(UserSchema); // Full Drizzle/Prisma integration built-in

// API - no ceremony needed
import { route, json } from '@vertz/server';

export const usersRouter = route({
  GET: {
    '/users': async () => json(await Users.findMany()),
    '/users/:id': async ({ params }) => json(await Users.findById(params.id)),
  },
  POST: {
    '/users': async ({ body }) => json(await Users.create(body)),
  },
});
```

```tsx
// UI - full type inference, no ceremony
import { useQuery, useMutation } from '@vertz/ui';

function UserList() {
  const { data: users } = useQuery('/api/users');
  const createUser = useMutation('POST', '/api/users');

  return (
    <ul>
      {users?.map(user => (
        <li key={user.id}>{user.name} — {user.email}</li>
      ))}
    </ul>
  );
}
```

**Result:** Every layer infers from the same schema. Change the schema once, TypeScript ripples the fix through database → API → UI.

## Key Principles

**1. Explicit over implicit**
No hidden conventions. No `getServerSideProps` magic. No "just know to add `@Middleware()`" patterns. The code says what it does.

**2. Type-driven, not config-driven**
Configs lie to you. Types don't. When `UserSchema` changes, every type that depends on it breaks visibly — at compile time, not runtime.

**3. One source of truth**
The schema is the database schema, the API contract, the UI types, and the validation rules — all simultaneously. There's no "sync your schema to three places" step.

**4. No decorator hallucination**
Decorators are the #1 thing LLMs get wrong. Vertz uses plain functions: `string()`, `schema({})`, `table()`. Predictable.

**5. Convention from composition**
Compose `route({ GET: {...} })` for REST, or a different pattern for GraphQL. Explicit, not hidden.

## Why This Beats tRPC + Drizzle + Next.js

tRPC's inference depends on runtime behavior. An LLM can't "see" the full API without running code. Vertz's `route()` is static — the entire surface is visible to the type checker.

Drizzle is excellent but standalone. You still need to wire it to your API. That's where LLMs struggle. Vertz bakes the wire in.

Next.js adds Pages vs App Router confusion, server component implicit flow, and "use client" boundaries that trip up LLMs. Vertz: request → handler → response. Simple.

## Anti-Patterns

- **`@Entity()` decorators** — LLMs guess field names and relations wrong.
- **Hidden inference** — tRPC's `inferQueryOutputs` needs deep TypeScript knowledge. LLMs fallback to `any`.
- **`getServerSideProps` vs `getStaticProps`** — subtly different. LLMs pick wrong.
- **`use client` boundaries** — invisible, cascading.
- **Convention routing** — file-system routing requires knowing the convention.
- **Global middleware** — mutates `req`. Impossible to trace.

## Conclusion

The best DX is one where an LLM can read the first 50 lines of a file and correctly predict the next 500. Vertz achieves this through: single-source schema, explicit composition, and type-driven contracts. No magic. No guessing. Just code.

If it confuses an LLM, it confuses a junior developer. Design for the AI first — everyone benefits.
