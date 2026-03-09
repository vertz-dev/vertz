# Adversarial Review: Access Redesign

**Reviewer:** ben (Core Engineer)
**Focus:** Type system design, compile-time guarantees, generic flow, type holes
**Date:** 2026-03-09

---

## Blockers

### B1. The `'entity:role'` inherits keys are stringly-typed with no compile-time validation path

The design shows:

```ts
inherits: {
  'organization:owner': 'lead',
  'organization:admin': 'editor',
  'organization:member': 'viewer',
},
```

This is `Record<string, string>` at the type level. There is no mechanism described in the design to make this a compile-time error:

```ts
inherits: {
  'organization:nonexistent': 'lead',   // should be TS error, won't be
  'typo:owner': 'lead',                 // should be TS error, won't be
},
```

The current implementation already uses `Record<string, Record<string, string>>` for inheritance. The redesign moves the same stringly-typed problem into a different shape but doesn't solve it.

**The core issue:** To type `inherits` keys, you need a template literal type like `` `${OtherEntity}:${RolesOfOtherEntity}` `` where `OtherEntity` and `RolesOfOtherEntity` are derived from *other entries in the same object literal*. TypeScript cannot do intra-object cross-key inference -- entity `team`'s `inherits` type depends on entity `organization`'s `roles`, but both are being defined in the same object literal passed to `defineAccess()`. There is no way to type the `inherits` keys as a function of sibling entities' roles without either:

1. A builder pattern (`defineAccess().entity('organization', ...).entity('team', ...)`) where each `.entity()` call narrows the accumulated type
2. A two-pass approach where entities are defined first, then inheritance is defined separately (which is what the current API already does)
3. Runtime-only validation (which is what will actually happen)

**The design must acknowledge this is runtime-only validation and document why that's acceptable.** Claiming `r.where()` is type-safe while `inherits` is not creates an inconsistent story. If the claim is "runtime validation catches it," that's fine, but the design should say so explicitly and include it in the validation rules section.

**Severity:** Blocker because the design implies compile-time safety ("type-checked against task columns") but doesn't distinguish which parts are compile-time vs runtime-only. Implementors will waste cycles trying to make `inherits` keys compile-time safe before realizing it's impossible in the proposed shape.

### B2. The entitlement callback `(r) => ({...})` -- `r` cannot be scoped to entity columns without a model registry link

The design claims:

```ts
'task:delete': (r) => ({
  roles: ['assignee'],
  rules: [r.where({ createdBy: r.user.id })],
}),
```

> `r` is typed to the entity's model -- `r.where()` only accepts that entity's columns.

This requires `defineAccess()` to know the column types of `task`. But `defineAccess()` currently takes no model/schema parameter. The design says "Hierarchy -- inferred from DB schema" but doesn't show how entity models are connected to `defineAccess()`.

For `r.where({ createdBy: ... })` to type-check `createdBy` against task's columns, the type signature needs something like:

```ts
function defineAccess<TModels extends Record<string, ModelEntry>>(
  config: AccessConfig<TModels>,
  models: TModels,
): ...
```

Or:

```ts
entities: {
  task: {
    model: taskTable,  // links to the @vertz/db table definition
    roles: ['assignee', 'viewer'],
    ...
  },
},
```

Neither is shown. Without this link, `r.where()` must fall back to `Record<string, unknown>` -- exactly what `WhereRule` is today. The claimed type safety is impossible.

**Additionally:** Even with a model link, the entitlement key `'task:delete'` must be parsed at the type level to extract `'task'` and look up the corresponding model. Template literal type inference (`K extends `${infer Entity}:${infer Action}`` `) works, but the callback parameter `r` must be typed per-key, which means the `entitlements` object needs a mapped type where each key gets its own callback signature. This is achievable but non-trivial and must be explicitly designed:

```ts
type EntitlementsDef<TEntities> = {
  [K in string]: K extends `${infer E}:${string}`
    ? E extends keyof TEntities
      ? EntitlementValue<TEntities[E]['model']> // callback gets typed r
      : EntitlementValue<never>                 // unknown entity
    : EntitlementValue<never>;
};
```

This mapped type approach works but requires the entitlement keys to be string literals (not widened to `string`). The design must show this type flow.

**Severity:** Blocker. The headline DX claim -- "r.where() only accepts that entity's columns" -- has no implementation path described. This is the kind of thing that looks great in a design doc but collapses when you try to implement it.

### B3. Entitlement `roles` array is not constrained to the entity's roles at compile time

The design says:

```ts
// VALID -- 'viewer', 'contributor', 'manager' are all project roles
'project:view': { roles: ['viewer', 'contributor', 'manager'] },

// INVALID -- 'owner' is an organization role, not a project role
'project:view': { roles: ['owner', 'manager'] },
```

Same problem as B1. The `roles` array in an entitlement needs to be constrained to the roles defined for the entity prefix of the entitlement key. This requires:

1. Parsing the entitlement key (`'project:view'` -> entity `'project'`)
2. Looking up `entities.project.roles` from the same config object
3. Constraining the `roles` array to that union

This is the same intra-object cross-key inference problem. It IS solvable with the mapped type approach from B2 (the entity's roles can be threaded through the same generic), but it adds another dimension to the type complexity.

Without this, `roles: ['owner', 'manager']` compiles fine and is only caught at runtime. The design must document whether this is compile-time or runtime and, if compile-time, show the type flow.

**Severity:** Blocker. Same reasoning as B1 -- the design claims type safety but doesn't show how it's achieved.

### B4. Plans `features` and `limits.gates` reference entitlement keys -- no type flow shown

```ts
plans: {
  free: {
    features: ['project:view', 'project:edit', 'task:view', 'task:edit'],
    limits: {
      prompts: { max: 50, gates: 'prompt:create' },
    },
  },
},
```

`features` must be constrained to defined entitlement keys. `gates` must be constrained to defined entitlement keys. These require the plan type to be generic over the set of entitlement keys:

```ts
type PlanDef<TEntitlementKeys extends string> = {
  features: TEntitlementKeys[];
  limits?: Record<string, { max: number; gates: TEntitlementKeys; ... }>;
};
```

This is achievable if `defineAccess()` infers `TEntitlementKeys` from the `entitlements` key. But the design doesn't show this generic threading. The type parameter needs to flow from `entitlements` keys -> `plans.*.features` -> `plans.*.limits.*.gates`. This is a concrete type flow path that must be documented.

**Severity:** Blocker. Without this, a typo in `features: ['proejct:view']` silently compiles and fails at runtime.

---

## Should Fix

### S1. `_per_{entity}` limit naming convention is impossible to type-check at compile time

```ts
limits: {
  prompts: { max: 50, gates: 'prompt:create' },
  prompts_per_brand: { max: 5, gates: 'prompt:create' },
}
```

The design says "The `_per_{entity}` suffix must reference a defined entity." For this to be compile-time:

```ts
type LimitKey<TEntities extends string> =
  | string                                        // bare key
  | `${string}_per_${TEntities}`;                 // scoped key
```

This is technically possible with template literal types, but `string | \`${string}_per_${...}\`` simplifies to just `string` -- it's vacuously satisfied. You'd need a conditional mapped type or a branded type to actually reject `prompts_per_nonexistent`.

**Recommendation:** Accept that limit key validation is runtime-only. Document it as such. OR change the API to make the scope explicit:

```ts
limits: {
  prompts: { max: 50, gates: 'prompt:create', scope: 'tenant' },
  prompts: { max: 5, gates: 'prompt:create', scope: 'brand' },
}
```

But this changes the API shape. The naming convention is DX-friendly but type-hostile.

### S2. Override API `add` vs `max` -- mutual exclusivity not obviously typed

```ts
await access.overrides.set('org-123', {
  limits: { prompts: { add: 200 } },
});
await access.overrides.set('org-123', {
  limits: { prompts: { max: 1000 } },
});
```

The design says "`max` takes precedence over `add` if both are set." This implies both can be set simultaneously. But the semantics are confusing -- if `max` replaces the total, `add` is meaningless. The type should enforce mutual exclusivity:

```ts
type LimitOverride =
  | { add: number; max?: never }
  | { max: number; add?: never };
```

The current `LimitOverride` in `plan-store.ts` only has `max: number`. The redesign adds `add` but doesn't show the discriminated union. This will cause bugs where someone sets `{ add: 200, max: 1000 }` and expects additive behavior but gets replacement.

### S3. `defaultPlan` type should be constrained to plan keys

```ts
defaultPlan: 'free',
```

This should be `defaultPlan: keyof typeof plans` at the type level. Achievable if `defineAccess()` is generic over the plan keys. Not shown.

### S4. Plan `group` creates an implicit constraint that isn't typed

The design says "A tenant can only have one plan per group at a time." This is a runtime constraint, not a type constraint. Fine, but the related validation -- "Add-ons must NOT have a `group`" -- should be enforced structurally:

```ts
type BasePlan = { group: string; addOn?: never; ... };
type AddOnPlan = { addOn: true; group?: never; ... };
type PlanDef = BasePlan | AddOnPlan;
```

The design conflates base plans and add-ons in the same `plans` object. The type system should discriminate them. Without this, someone writes `{ addOn: true, group: 'main' }` and it compiles fine.

### S5. The `r.user` object in entitlement callbacks is underspecified

```ts
'task:delete': (r) => ({
  roles: ['assignee'],
  rules: [r.where({ createdBy: r.user.id })],
}),
```

`r.user` has `.id` -- what else? The design doesn't specify the shape. Is it the full `AuthUser` type? A subset? If it includes fields beyond `.id` and `.tenantId` (which are already in `UserMarker`), those need to be typed.

Currently, `UserMarker` only has `.id` and `.tenantId`. The callback form doesn't add to this -- it just moves the same `rules.user` into the callback scope. The design should be explicit: `r.user` is the same `UserMarker` object, not the full user.

### S6. Entitlement callback return type includes `rules` but the object form doesn't

Object form:
```ts
'project:view': { roles: ['viewer', 'contributor', 'manager'] },
```

Callback form:
```ts
'task:delete': (r) => ({
  roles: ['assignee'],
  rules: [r.where({ createdBy: r.user.id })],
}),
```

But the design also shows an object form WITH rules:

```ts
'task:edit': {
  roles: ['assignee'],
  rules: [
    rules.all(rules.role('viewer'), isTaskCreator),
    rules.all(rules.role('assignee'), rules.fva(600)),
  ],
},
```

So there are THREE forms: object without rules, object with rules, and callback. The callback is described as "the single approach for attribute rules" but the example above shows `rules` in an object form too. This is contradictory. Either:
- The callback is the ONLY way to get `rules` (then the object-with-rules example is wrong)
- Both forms support `rules` (then the callback only adds `r.where()` scoping)

Clarify which it is. If both forms support `rules`, the callback's only advantage is `r.where()` scoping -- which per B2 doesn't work without a model link anyway.

### S7. `canBatch()` return type uses entity ID as key -- what if entities don't have an `id` field?

```ts
const results = await ctx.canBatch('task:edit', tasks);
// Map<string, AccessCheckResult> -- keyed by entity ID
```

The entity type must have an `id` property for this to work. The design doesn't constrain the entity type. If `tasks` is `Task[]`, the framework needs `task.id` to build the Map key. This is a type constraint that should be explicit:

```ts
canBatch<T extends { id: string }>(entitlement: string, entities: T[]): Promise<Map<string, AccessCheckResult>>;
```

### S8. No type flow map section in the design doc

Per the project's design doc requirements (`.claude/rules/design-and-planning.md`), every design doc must include a **Type Flow Map** section that traces every generic from definition to consumer. This is absent. Given the complexity of the type threading required (entity names -> roles -> entitlement keys -> plan features -> limit gates -> callback `r` typing), this section is critical.

---

## Nits

### N1. The `price.interval` includes `'one_off'` which is unconventional

Most billing systems use `'once'` or `'lifetime'`. `'one_off'` is fine but verify it aligns with Stripe's terminology (Stripe uses `type: 'one_time'` not `'one_off'`). Minor inconsistency that could cause confusion in the Stripe sync adapter.

### N2. Plan `title` and `description` duplicate Stripe Product metadata

If plans sync to Stripe, the title/description will exist in both places. The design says Vertz is source of truth, which is fine. But consider whether title/description should be optional in `defineAccess()` (with Stripe pulling from its own metadata as fallback). This avoids forcing developers to hardcode marketing copy in their access config.

### N3. The `grandfathering.grace` uses string duration format inconsistently

The design shows `'12m'` for 12 months, `'1m'` for 1 month, `'3m'` for 3 months. Elsewhere in the codebase, durations use formats like `'24h'`, `'7d'`, `'60s'`. Is `'12m'` 12 minutes or 12 months? The `SessionConfig.ttl` uses `'60s'` and `'7d'`. Need to clarify: is `'m'` minutes or months? Consider `'12mo'` for months to avoid ambiguity.

### N4. The `overage.per` field name clashes with the limit's `per` field

```ts
observations: {
  max: 10_000,
  per: 'month',
  gates: 'observation:create',
  overage: { amount: 0.01, per: 1 },   // per 1 unit
},
```

`per: 'month'` (time window) vs `overage.per: 1` (units per charge). Different semantics, same field name. Consider `overage.perUnit: 1` or `overage.unitSize: 1` to disambiguate.

### N5. The design references `'prompt:create'` and `'observation:create'` entitlements but doesn't define them in `entities`

The full example shows `organization`, `team`, `project`, `task` as entities. But `limits.gates` references `'prompt:create'` and `'observation:create'` -- neither `prompt` nor `observation` appears in the `entities` config. This means either:
- There are unlisted entities (incomplete example)
- `gates` can reference entitlements for entities not in the `entities` config

Clarify. If entities can be omitted (no roles, no inheritance), do they still need an entry?

---

## Approved

### A1. Entity-centric grouping is a clear improvement

Moving from scattered `hierarchy`/`roles`/`inheritance` to a single `entities` object is objectively better for readability. Each entity is self-contained. Good call.

### A2. Plans referencing entitlements (not the reverse) is the right direction

The current design has entitlements referencing plans (`plans: ['enterprise']`), which creates bidirectional coupling. Plans -> features is unidirectional. Clean.

### A3. Add-ons as `addOn: true` in the same namespace is simple

Rather than a separate `addOns` top-level key, add-ons are just plans with a flag. This keeps the config flat and avoids a parallel hierarchy. The `requires` compatibility field is well-thought-out.

### A4. Override API with `add` vs `max` semantics is useful

The distinction between "give them more on top" and "set a hard cap" covers the real business scenarios. The precedence rule (`max` wins over `add`) is reasonable, though it needs mutual exclusivity typing (see S2).

### A5. Per-request preloading with `createContext()` is the right performance architecture

Preloading static layers once per request and batching dynamic layers is the correct pattern. The query budget analysis (3-4 queries for 50 entities) is realistic and well-reasoned.

### A6. Wallet counts never cached is the right default

Limit consumption is a hot write path. Caching it would create stale-read bugs that are extremely hard to debug ("why did it let me create 51 prompts?"). Always-fresh is correct even at the cost of a query per check.

### A7. The `can()` resolution order is well-reasoned

Ordering by actionability (plan_required before role_required before limit_reached) gives the developer the most useful first denial reason. The fail-fast strategy for `can()` vs all-layers for `check()` is the right split.

---

## Summary

The design has strong DX instincts and makes the right architectural calls on performance, caching, and resolution order. However, it makes several type safety claims (callback `r` scoped to entity columns, entitlement roles constrained to entity roles, `inherits` keys validated) without showing how those claims are achievable in TypeScript's type system. The four blockers all share a common theme: **the design promises compile-time safety that requires intra-object cross-key generic inference, but doesn't show the type flow.** Some of these are achievable with careful mapped types and template literals; others (like `inherits` keys referencing sibling entities) may be fundamentally impossible in the proposed API shape.

Before implementation, the design needs:
1. A Type Flow Map showing which validations are compile-time vs runtime-only
2. An explicit decision on whether `r.where()` type safety requires a model link (and if so, how models connect to `defineAccess()`)
3. Prototype type signatures for the `defineAccess()` generic to prove the entitlement key -> plan features -> limit gates flow works
