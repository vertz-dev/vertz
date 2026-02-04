# Vertz Design Principles

This document explains the reasoning behind Vertz's design decisions. Each principle, decision, and convention traces back to a real problem we encountered — building products, working with LLMs, and watching teams fight their frameworks instead of shipping.

---

# Principles

Foundational and non-negotiable. These shape every decision in the framework.

---

## 0. Type-safe end to end

Every design decision in Vertz traces back to one question: does the type system verify this?

We chose functions over decorators because types flow through function arguments and return values — they don't flow through decorator chains. We chose generics over `as` notation because generics enforce contracts while `as` bypasses them. We chose middleware that returns its contribution instead of mutating state, because a return type is enforceable — a mutation is not.

This isn't type safety for its own sake. It serves two goals:

1. **If your code builds, it works.** No runtime DI resolution failures. No middleware forgetting to provide what it declared. No schema mismatches between handler and OpenAPI docs.

2. **LLMs catch type errors naturally.** LLMs can run code if asked, but they rarely do during code generation. Type errors, on the other hand, are something LLMs naturally catch — they're inline, visible in the same context where code is being written.

OpenAPI is not a plugin in Vertz — it's native and required. Every route with a return value must define a response schema. The compiler enforces this. The result: your API documentation is always in sync with your implementation, because they're derived from the same source of truth.

**This principle is why:**
- We use functions over decorators
- We use generics over `as` notation
- Middleware returns its `Provides` instead of mutating `ctx.state` via `next()`
- Response schemas are required and compiler-enforced
- OpenAPI generation is native, not a plugin

---

## 1. Tests as first-class citizens

Testing is not an afterthought in Vertz — it's designed alongside the framework API. The testing utilities follow the same patterns as production code: builder pattern for composition, typed references for mocks, and schema-driven validation for responses.

Tests should be as easy to write and as easy to read as the application code itself. If writing a test feels like fighting the framework, the framework failed — not the developer.

This is why the test app mirrors the production app composition. If you know how to `.register()` a module in your app, you know how to set one up in a test. If you know how a middleware declares its `Provides` type, you know how to mock it in a test. There's no separate "testing mental model" to learn.

Mocks use actual service and middleware references — not strings:

```tsx
.mock(dbService, { ... })
.mockMiddleware(authMiddleware, { ... })
```

References are refactor-safe — rename a service and your IDE updates every usage. Strings break silently. References also give TypeScript the type information to enforce the mock shape matches the service's public API and the middleware's `Provides` generic.

For LLMs, this means the same patterns that generate application code also generate test code. No context switch, no separate conventions to learn, no second set of mistakes to make.

---

## 2. Compile-time over runtime

We chose functional patterns over decorators because decorators resolve metadata at runtime — TypeScript can't verify that a decorator chain is correct. When DI fails, it fails at runtime, often only when a specific request hits a specific code path.

In Vertz, if your code builds, your dependencies resolve. Module definitions declare their imports as typed references. Services declare their injections. The compiler catches mismatches before you run anything.

This extends to response schemas. If a route handler returns a value, the compiler requires a response schema. This isn't optional — it's enforced. The result: OpenAPI docs can't drift from implementation, because they're the same declaration.

---

## 3. Immutability by default

Both `deps` and `ctx` are frozen. Middleware doesn't mutate `ctx.state` — it returns its contribution, and the framework composes the state from return values.

This prevents two categories of bugs:
1. Shared state mutation between requests (memory leaks, data pollution)
2. Middleware declaring it provides something but never actually setting it

Enforcement is layered: TypeScript's `DeepReadonly<T>` at compile time, `Object.freeze()` at runtime in production, and a Proxy with helpful error messages in development.

---

# Design Decisions

Choices driven by the principles above. These explain why we picked one approach over another.

---

## 4. Optimize for type performance without sacrificing DX

When a configuration object is small and flat, we use a compound (single object) pattern — it's easier to read and the type errors are manageable:

```tsx
vertz.moduleDef({
  name: 'user',
  imports: { env, dbService },
  options: s.object({ ... }),
})
```

When each step involves a different type (e.g., registering different modules with different options), we use the builder pattern. This gives isolated type hints per step — a typo in one `.register()` doesn't produce a bloated error on the entire config:

```tsx
vertz.app({ ... })
  .register(coreModule)
  .register(userModule, { requireEmailVerification: true })
```

The decision between compound and builder is driven by **type error readability**. If a compound config would produce an error message that requires scrolling to understand, we use a builder. If the type surface is small and flat, compound is simpler to read.

---

## 5. Distinct names for distinct concepts

Services receive their dependencies at startup — a static object that never changes. Router handlers receive a request context — a fresh object per request with params, body, state, etc.

Both could be called `ctx`. We rejected that. When two things serve different purposes, they get different names: `deps` for service dependencies, `ctx` for request context. An LLM reading a service file sees `deps.dbService` and immediately knows it's a startup-time dependency. An LLM reading a router sees `ctx.params` and knows it's request data.

Reusing a name for a different concept creates subtle misunderstandings — for humans reviewing code and for LLMs generating it.

---

# Conventions

Strong conventions where types and the compiler don't cover. These keep codebases consistent across teams and LLMs.

---

## 6. Strong conventions where types and build don't cover

Not everything can be enforced by the type system or the compiler. For these areas, Vertz defines strong conventions so that both humans and LLMs produce consistent, predictable code.

### Natural speech naming

Schema and operation names follow how you'd say them in conversation:

```
"I want to bulk create users"     → bulkCreateUsers
"I want to reset the password"    → resetPassword
"I want to set the active status" → setActiveStatus
```

Not the reverse:

```
createBulkUsers   ✗
passwordReset     ✗
activeStatusSet   ✗
```

The pattern is **verb + context + noun**. This matters because LLMs generate names based on the description they're given. If the description says "bulk create users," the natural output is `bulkCreateUsers`. Fighting that order means fighting the LLM's instinct.

### One schema file per endpoint

Each endpoint gets its own schema file in a `schemas/` folder:

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

### Flat modules, not subfolders

Module folders are flat:

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
