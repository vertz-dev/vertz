# Entity Access Rules Convention

## Rule: Use `rules.*` descriptors, not functions

Entity access rules MUST use the declarative `rules.*` builders from `@vertz/auth/rules`. Do NOT use raw callback functions.

```ts
import { rules } from '@vertz/auth/rules';

// WRONG — opaque function, can't be inspected or serialized
access: {
  list: (ctx) => ctx.authenticated(),
  update: (ctx, row) => row.createdBy === ctx.userId,
}

// RIGHT — declarative descriptor, inspectable, serializable
access: {
  list: rules.authenticated(),
  update: rules.all(
    rules.entitlement('task:update'),
    rules.where({ createdBy: rules.user.id }),
  ),
}
```

## Why

1. **Inspectable** — descriptors are plain objects with a `type` discriminant. The framework can analyze, compose, and serialize them.
2. **Serializable for the UI** — the client needs entitlement info to show/hide UI elements. Functions can't be sent to the client; descriptors can.
3. **Mappable to DB-level policies** — declarative `where` conditions can potentially compile to Postgres RLS. Functions are opaque to the query planner.
4. **Composable** — `rules.all()`, `rules.any()` compose rules without nesting callbacks.
5. **Consistent with `defineAccess()`** — the access redesign uses entitlements everywhere. Entity access should use the same primitive.

## Available Builders

```ts
rules.public                          // No auth required
rules.authenticated()                 // User must be logged in
rules.role('admin', 'owner')          // User has one of these roles (OR)
rules.entitlement('task:update')      // User has this entitlement (resolved via defineAccess)
rules.where({ createdBy: rules.user.id })  // Row-level condition
rules.all(rule1, rule2)               // All must pass (AND)
rules.any(rule1, rule2)               // Any must pass (OR)
rules.fva(600)                        // MFA verified within 600 seconds
```

## User Markers

Use `rules.user.*` for dynamic values resolved at evaluation time:

```ts
rules.where({ createdBy: rules.user.id })       // row.createdBy === ctx.userId
rules.where({ tenantId: rules.user.tenantId })   // row.tenantId === ctx.tenantId
```

## Prefer Entitlements Over Roles

```ts
// WRONG — role check in entity access
access: {
  delete: rules.role('admin'),
}

// RIGHT — entitlement check (roles are resolved via defineAccess)
access: {
  delete: rules.entitlement('task:delete'),
}
```

Roles are an organizational concept mapped in `defineAccess()`. Entity access rules should check entitlements, which decouple the "what can you do" from "what role are you."

## Tenant Scoping

Entities with a `tenantId` field are tenant-scoped by default. The framework automatically adds `rules.where({ tenantId: rules.user.tenantId })` to all operations.

Opt out explicitly:
```ts
entity('system-template', {
  tenantScoped: false, // cross-tenant entity
  // ...
});
```

## Key Files

- Rule builders: `packages/server/src/auth/rules.ts`
- Access redesign: `plans/access-redesign.md`
- Entity types: `packages/server/src/entity/types.ts`
