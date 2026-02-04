# Vertz Design Whys

Every decision in Vertz traces back to the beliefs in our [Manifesto](../MANIFESTO.md). This document answers the questions people naturally ask when looking at our conventions and code.

---

## Why functions instead of decorators?

Types flow through function arguments and return values. They don't flow through decorator chains. TypeScript can't verify that a decorator applied metadata correctly — it can only verify that a function received and returned the right types.

Decorators also resolve at runtime. When DI fails in a decorator-based framework, it fails when a request hits a specific code path — not when you build. Functions let the compiler catch mismatches before anything runs.

For LLMs, function signatures are unambiguous. A decorator's effect depends on order, placement, and runtime behavior that isn't visible in the code. A function's contract is its signature.

---

## Why does middleware return its contribution instead of calling `next()`?

A return type is enforceable. A mutation is not.

When middleware calls `next()` and mutates `ctx.state`, TypeScript can't verify that the middleware actually set what it declared. It might declare `Provides: { user: User }` but forget to set `ctx.state.user` in one code path. That's a runtime bug.

When middleware returns `{ user }`, the return type enforces the contract. If the middleware declares `Provides: { user: User }`, the compiler requires it to return an object with `user: User`. No code path can skip it.

---

## Why `deps` and `ctx` instead of one name for both?

Services receive their dependencies at startup — a static object that never changes. Router handlers receive a request context — a fresh object per request with params, body, state.

Both could be called `ctx`. We rejected that. When two things serve different purposes, they get different names: `deps` for service dependencies, `ctx` for request context.

An LLM reading a service file sees `deps.dbService` and immediately knows it's a startup-time dependency. An LLM reading a router sees `ctx.params` and knows it's request data. Reusing a name for a different concept creates subtle misunderstandings — for humans reviewing code and for LLMs generating it.

---

## Why are both `deps` and `ctx` frozen?

Two categories of bugs:
1. Shared state mutation between requests — memory leaks, data pollution across requests
2. Middleware declaring it provides something but silently not setting it

Enforcement is layered: `DeepReadonly<T>` at compile time, `Object.freeze()` at runtime in production, and a Proxy with helpful error messages in development.

---

## Why generics over `as` notation?

Generics enforce contracts. `as` bypasses them.

`vertz.middleware<Requires, Provides>(handler)` means TypeScript verifies the handler actually satisfies both `Requires` and `Provides`. Using `as` would let you claim any type without the compiler checking it — which defeats the purpose.

---

## Why builder pattern in some places and compound objects in others?

It depends on type error readability.

When a configuration object is small and flat, a compound pattern is simpler to read and the type errors are manageable:

```tsx
vertz.moduleDef({
  name: 'user',
  imports: { env, dbService },
  options: s.object({ ... }),
})
```

When each step involves a different type (registering different modules with different options), a builder gives isolated type hints per step — a typo in one `.register()` doesn't produce a bloated error on the entire config:

```tsx
vertz.app({ ... })
  .register(coreModule)
  .register(userModule, { requireEmailVerification: true })
```

If a compound config would produce an error message that requires scrolling to understand, we use a builder. If the type surface is small and flat, compound is simpler.

---

## Why are response schemas required?

OpenAPI is not a plugin in Vertz — it's native. If a route handler returns a value, the compiler requires a response schema. This isn't optional.

The result: your API documentation is always in sync with your implementation, because they're derived from the same source of truth. Docs can't drift from code when they're the same declaration.

---

## Why mock by reference instead of by string?

```tsx
.mock(dbService, { ... })          // reference
.mock('dbService', { ... })        // string
```

References are refactor-safe — rename a service and your IDE updates every usage. Strings break silently.

References also give TypeScript the type information to enforce the mock shape matches the service's public API and the middleware's `Provides` generic. Strings can't do that.

---

## Why does the test app mirror the production app?

If you know how to `.register()` a module in your app, you know how to set one up in a test. If you know how a middleware declares its `Provides` type, you know how to mock it in a test.

There's no separate "testing mental model" to learn. For LLMs, this means the same patterns that generate application code also generate test code. No context switch, no separate conventions to learn.

---

## Why no `.send()` on the test request builder?

One way to do things. The builder implements `.then()` internally — `await` triggers execution. Adding `.send()` would create two ways to execute a request, and ambiguity is the enemy.

---

## Why natural speech naming?

Schema and operation names follow how you'd say them in conversation:

```
"I want to bulk create users"     → bulkCreateUsers
"I want to reset the password"    → resetPassword
"I want to set the active status" → setActiveStatus
```

Not:

```
createBulkUsers   ✗
passwordReset     ✗
activeStatusSet   ✗
```

The pattern is **verb + context + noun**. LLMs generate names based on the description they're given. If the description says "bulk create users," the natural output is `bulkCreateUsers`. Fighting that order means fighting the LLM's instinct.

---

## Why one schema file per endpoint?

```
schemas/
  create-user.schema.ts
  list-users.schema.ts
  reset-password.schema.ts
```

Not a single file with all schemas, and not inline in the router. Separate files because:
- An LLM generating a new endpoint creates one file — clear scope
- Code review shows exactly what changed per endpoint
- No merge conflicts from multiple people editing the same schema file

---

## Why flat module folders instead of subfolders?

```
modules/
  user/
    user.module-def.ts
    user.module.ts
    user.service.ts
    auth.service.ts
    user.router.ts
    schemas/
      create-user.schema.ts
      list-users.schema.ts
```

No `services/` subfolder. No `routers/` subfolder. The only subfolder is `schemas/` — one file per endpoint.

If a module has enough services or routers that a flat folder feels cluttered, that's a signal the module is doing too much. The answer is a new module, not a subfolder. Modules are the unit of organization in Vertz — subfolders within a module hide complexity that should be addressed by splitting responsibilities.
