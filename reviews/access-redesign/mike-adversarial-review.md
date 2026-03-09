# Adversarial Review: Access Redesign

**Reviewer:** mike (Tech Lead)
**Date:** 2026-03-09
**Artifact:** `plans/access-redesign.md`

---

## Blockers

### B1. `canAndConsume()` is NOT atomic and the doc knows it but hand-waves it

The doc states:

> "the wallet `consume()` is atomic (compare-and-swap), but the access check before it is not"

This is accurately described but dangerously under-sized. The current `canAndConsume()` in `access-context.ts` runs `checkLayers1to4()` (which does async DB queries for roles, plan lookups, etc.) and THEN calls `walletStore.consume()`. Between those two operations:

- A role could be revoked.
- A plan could be downgraded.
- A feature flag could be toggled off.

The wallet consume succeeds, but the user should no longer have access. This is not just a "last 2 credits" race -- it is a correctness bug where you consume from a wallet for a user who lacks permission.

The doc says "the wallet store handles the race -- excess consumers fail at the atomic step, not at the check step." This only handles the wallet contention race, NOT the authorization race.

**Required fix:** At minimum, acknowledge this as a known limitation with a documented mitigation strategy. Options: (a) re-check layers 1-4 after consume and unconsume on failure, (b) accept the window as "good enough" and document it explicitly as a consistency tradeoff, (c) design a single-round-trip atomic operation for the most common cases (role+limit in one query). Whatever the choice, it needs to be a conscious, documented decision -- not a hand-wave.

### B2. Config hashing for plan versioning is under-specified and fragile

The doc says:

> "the system hashes each plan's config (features + limits + price). If the hash differs from the stored current version, a new version is created."

This has several problems:

1. **Hash algorithm not specified.** Different algorithms, different hashes, different versions on different deploys.

2. **Serialization order not specified.** `JSON.stringify({ a: 1, b: 2 })` and `JSON.stringify({ b: 2, a: 1 })` produce different strings. If you hash JSON, you need canonical serialization. The doc doesn't mention this.

3. **Semantic equivalence is not structural equivalence.** The doc says `title`/`description` changes don't trigger new versions -- so those fields must be excluded before hashing. What about adding a new field to the plan config in a future version of the framework? That field would change the hash even though nothing business-relevant changed. The hashing strategy must be explicitly scoped to versioned fields.

4. **Deploy ordering.** If two deploys happen in quick succession with different configs, the version numbering depends on deploy order. Rollback to a previous config creates a "new" version (same config, new version number). Is version 5 the same as version 3? The doc doesn't address rollback scenarios.

5. **Hash collisions.** Practically nil with SHA-256, but the doc should name the algorithm. If someone uses a fast hash (e.g., xxhash), collisions become non-trivial with many versions.

**Required fix:** Specify: (a) hash algorithm, (b) canonical serialization strategy, (c) which fields are included, (d) rollback behavior (deduplicate by hash? or create new version?).

### B3. The design is too large for a single implementation -- no phasing

This doc covers:

- Entity-centric `defineAccess()` restructuring
- Entitlement callback syntax with typed `r` parameter
- Plans with groups, billing variants, add-ons
- Plan versioning and grandfathering with migration API
- Wallet redesign (lifetime limits, `_per_{entity}` scoping, overage billing)
- Stripe sync (push model)
- Webhook handling (pull model)
- Overrides system
- Add-on compatibility checks
- Tenant billing portal (UI components)
- Local DB vs cloud split
- Limit overage billing with caps

This is easily 6-10 phases of work. The reactive invalidation plan (`plans/reactive-invalidation.md`) was 5 sub-phases for just flags + WebSocket events. This redesign touches EVERY store, EVERY layer of the `can()` resolution, the JWT encoding, the client access set, the billing integration, and the UI.

**Required fix:** Break this into a phased implementation plan with clear boundaries. Phase 1 should be the entity-centric `defineAccess()` restructuring alone -- that is the breaking API change that everything else depends on. Plans, billing, overrides, and UI components should be separate phases. Each phase needs its own acceptance criteria per the project's rules.

### B4. Inheritance direction change is a silent semantic inversion

Current implementation in `define-access.ts`:

```ts
inheritance: Record<string, Record<string, string>> // parent type -> { parentRole: childRole }
```

Proposed design:

```ts
team: {
  inherits: { 'organization:owner': 'lead' }  // child declares what it inherits FROM parent
}
```

This inverts the direction of inheritance declaration. The current code in `role-assignment-store.ts` walks the hierarchy top-down:

```ts
for (let i = sourceIdx; i < targetIdx; i++) {
  const currentType = hierarchy[i];
  const inheritanceMap = accessDef.inheritance[currentType];
  // ...
}
```

The new format maps `'parent:role' -> childRole` on the child, but the resolution algorithm walks parent-to-child. This means the runtime must invert the map or change the walk direction.

The doc doesn't discuss migration of the resolution algorithm, nor does it flag this as a risk area. Getting this wrong silently grants or denies access incorrectly.

**Required fix:** Document the resolution algorithm change explicitly. Show the before/after of the inheritance walk. Add a validation step that detects circular inheritance chains (which become possible with the new format since children reference parents -- a cycle where A inherits from B which inherits from A is harder to detect without explicit hierarchy ordering).

---

## Should Fix

### S1. Cloud wallet + local roles = split-brain during cloud outage

The doc classifies wallet counts as "Cloud" and role assignments as "Local DB." The `can()` resolution needs BOTH:

```
can('prompt:create')
  |- Roles       -> local
  |- Limits      -> cloud (wallet API -- single HTTP call, <50ms with edge)
```

During a cloud outage, the limit check fails. What happens?

- **Fail-open:** Users bypass limits. For paid features, this means free usage.
- **Fail-closed:** All limit-gated features are denied. Users on paid plans can't use features they're paying for.

The doc doesn't specify the failure mode. This is a critical business decision. Most SaaS products fail-open with a short grace period and reconcile later. The doc needs to specify the default and make it configurable.

Additionally, "single HTTP call, <50ms with edge" is optimistic. Edge caching for wallet queries (which the doc lists as "open -- to define later") is the only way this is fast. Without edge caching, wallet queries from non-edge regions will be 100-300ms, which is unacceptable for every `can()` call in a request.

**Recommendation:** Specify the failure mode. Add a `cloud.failMode: 'open' | 'closed'` config. Consider a local fallback cache for wallet state with a short TTL (e.g., 5 seconds) so that brief outages don't affect users.

### S2. `_per_{entity}` naming convention is fragile

The limit key `prompts_per_brand` encodes the scoping entity in the key name via string convention. This means:

- Renaming an entity requires renaming all limit keys.
- Typos in the entity suffix are silent failures (the limit just doesn't scope correctly).
- The validation rule (rule 7: "suffix must reference a defined entity") requires string parsing at config validation time.

A structured format would be safer:

```ts
limits: {
  prompts: { max: 50, scope: 'tenant', gates: 'prompt:create' },
  prompts_per_brand: { max: 5, scope: 'brand', gates: 'prompt:create' },
}
```

Or even:

```ts
limits: {
  prompts: { max: 50, gates: 'prompt:create' },
  prompts: { max: 5, per: 'brand', gates: 'prompt:create' }, // scoped variant
}
```

**Recommendation:** Use a `scope` or `per` field on the limit definition instead of encoding it in the key name. This is type-safe, refactor-friendly, and avoids string parsing. The current `per` field is used for time windows -- consider renaming it to `window` and using `scope` for entity scoping.

### S3. Hierarchy inferred from DB schema is under-specified

The doc says:

> "The entity hierarchy is NOT defined in `defineAccess()`. It comes from the database schema/models."

But the current implementation DOES use an explicit `hierarchy: string[]` in `defineAccess()`. The resolution algorithm in `role-assignment-store.ts` uses `hierarchy.indexOf()` to determine parent-child relationships and walk the inheritance chain.

If hierarchy is removed from `defineAccess()`, how does the resolution algorithm know the ordering? Options:

- Topological sort from `inherits` declarations (possible, but needs cycle detection).
- Infer from the closure table (requires DB queries at config time).
- Still require hierarchy somewhere, just not in `defineAccess()`.

The doc doesn't specify. This is load-bearing -- the inheritance resolution algorithm depends on knowing the order.

**Recommendation:** Either keep an explicit ordering (derived from `inherits` declarations via topological sort), or document how the resolution algorithm works without it.

### S4. Overrides `add` vs `max` interaction is ambiguous with add-ons

The resolution formula is:

```
Effective limits = plan.limits + addons.limits + overrides.limits
```

With an override `{ add: 200 }`, is the addition applied to:
- `plan.limits` (before add-ons)?
- `plan.limits + addons.limits` (after add-ons)?

And with `{ max: 1000 }`:
- Does it cap the total (plan + add-ons + override.add)?
- Does it replace everything?

The doc says "`max` takes precedence over `add` if both are set" -- but this is about both being set on the SAME override. What about `add` on override + plan limit + add-on limit? The precedence chain is:

1. Plan base limit: 100
2. Add-on: +50 = 150
3. Override `add: 200` = 350? or 300?
4. Override `max: 1000` = 1000 (replaces all)

**Recommendation:** Write the formula explicitly with concrete numbers for each combination. Define the resolution as pseudocode.

### S5. Grandfathering auto-migration has no rollback story

The doc describes `access.plans.migrate('pro_monthly')` which "migrates all tenants past their grace period." What if the migration is wrong?

- A bug in the new plan version removes a critical feature.
- Tenants are migrated and lose access to something they're paying for.
- There's no `access.plans.rollback()` or `access.plans.revertMigration()`.

The `schedule()` API allows scheduling future migrations, but there's no cancel API either.

**Recommendation:** Add `access.plans.cancelSchedule()` and either a revert mechanism or an explicit warning that migration is irreversible. At minimum, the `plan:migrated` event should include the old version so developers can manually fix issues.

### S6. Stripe sync as push-only is incomplete

The doc says:

> "This is a push operation, not a webhook listener. The framework pushes config to Stripe, not the other way around. Stripe is the payment processor; Vertz is the source of truth for access."

But then the Webhook Handling section describes:

> `subscription.created` -> Assign plan to tenant

This is contradictory. If Vertz is the source of truth, why is Stripe telling Vertz to assign a plan? The actual flow is:

1. Developer defines plans in code (Vertz is source of truth for PLAN DEFINITIONS).
2. `syncToStripe()` pushes plan definitions to Stripe (push).
3. User purchases a plan on Stripe (user action).
4. Stripe webhook tells Vertz which plan the user bought (pull).
5. Vertz assigns the plan to the tenant (state update).

So Vertz is source of truth for plan definitions, but Stripe is source of truth for subscription state (who bought what). The doc conflates these two.

**Recommendation:** Clarify the source-of-truth distinction: Vertz owns plan definitions, Stripe owns subscription/payment state. The webhook handler reconciles Stripe's subscription state into Vertz's plan assignments. This is standard, but the doc's framing is confusing.

### S7. Missing: what happens when `r.where()` references columns not available at check time

The callback entitlements use:

```ts
'task:delete': (r) => ({
  roles: ['assignee'],
  rules: [r.where({ createdBy: r.user.id })],
}),
```

This implies the entity data (with `createdBy` column) must be available when `can()` is called. The doc says attribute rules are "resolved at the application layer, not compiled to database-level RLS." But:

- What if the entity is passed as just `{ type: 'task', id: '123' }` without the full data?
- Does the framework load the entity? Or does the developer pass the full entity?
- If the developer passes the full entity, how is the type of the entity linked to the schema?

The current `ResourceRef` is just `{ type: string; id: string }` -- it has no data fields. The `r.where()` needs actual column values to evaluate.

**Recommendation:** Specify how entity data flows into the attribute rule evaluation. Does `can()` accept a full entity object? Is it `can('task:delete', { entity: taskRecord })`? The API surface shows `can('task:edit', { entity: task })` but doesn't define what `task` is or how it's typed.

---

## Nits

### N1. DenialReason ordering changed between current code and design

Current `access-context.ts`:

```ts
const DENIAL_ORDER: DenialReason[] = [
  'plan_required',
  'role_required',
  'limit_reached',
  'flag_disabled',
  'hierarchy_denied',
  'step_up_required',
  'not_authenticated',
];
```

Design doc evaluation order:

```
1. Authentication
2. Feature flags
3. Plan features
4. Limits
5. Roles
6. Attribute rules
7. Step-up auth
```

The evaluation order and the denial ordering are different. The current code evaluates cheapest-first but orders denials by "actionability." The design changes evaluation order but doesn't mention whether denial ordering also changes. This matters for client UI -- `result.reason` is the first denial, so its meaning depends on ordering.

### N2. `quarter` billing interval appears in the design but not in the current `BillingPeriod` type

The design specifies `'month' | 'quarter' | 'year' | 'one_off'` for `price.interval`. The current `BillingPeriod` type is `'month' | 'day' | 'hour'`. The design seems to be mixing two different concepts: billing interval (when you pay) and limit window (when limits reset). The design acknowledges this ("billing period and limit window are independent") but the type naming is ambiguous.

### N3. Add-on definition is syntactically outside the `plans` block in the example

In the full example, add-ons appear at the same level as `plans`:

```ts
extra_prompts_50: {
  title: 'Extra 50 Prompts',
  addOn: true,
  ...
},
```

But the closing brace of `plans` appears to include them (line 192 `}`). This looks like a formatting error in the doc -- are add-ons inside `plans: { ... }` or siblings? The "Add-ons" section says "Add-ons are plans with `addOn: true`" which implies they're in the `plans` block. Clarify.

### N4. `r.user.id` in entitlement callback -- where does `user` come from?

The callback `(r) => ({ rules: [r.where({ createdBy: r.user.id })] })` has `r.user.id`. Is `r` resolved at `can()` call time with the current user context? If so, the callback is not pure config -- it's a factory that creates rules per-invocation. This is fine, but it means the callback return is per-check, not per-config. Worth clarifying.

### N5. Pricing table UI component assumes single active plan per group

`<PricingTable access={access} />` assumes the plan model is simple enough for a standard pricing table. But with add-ons, overrides, grandfathered versions, and multiple groups, the UI complexity is much higher than a standard "pick a plan" table. Consider whether this component is viable in the first implementation or if it should be deferred.

---

## Approved

### A1. Entity-centric restructuring is the right call

Moving from scattered `hierarchy`/`roles`/`inheritance` to self-contained `entities` is clearly better for DX. Each entity is readable in isolation. This aligns well with Principle 2 ("one way to do things") and Principle 3 ("AI agents are first-class users") -- an LLM reading a single entity block understands the full picture.

### A2. Plans referencing entitlements (not the other way around) is correct

The inversion from `'project:export': { plans: ['enterprise'] }` to `enterprise: { features: ['project:export'] }` is the right direction. Entitlements define WHO and WHEN. Plans define WHAT. This separation of concerns is clean.

### A3. Per-request preload strategy is sound

The "preload once, evaluate many" pattern for `createContext()` is the right architecture. The query budget analysis (0 queries for JWT-hit, 3-4 for batch) is realistic and well-analyzed. The tiered caching strategy (in-memory for flags, per-request for roles, never-cache for wallet) correctly matches the data characteristics.

### A4. Limits measuring resources (not actions) is the right model

"If a user creates 10 prompts and deletes 5, the count is 5" -- this is the correct semantic for SaaS limits. Combined with the wallet pattern, this avoids the common mistake of counting API calls instead of business objects.

### A5. Add-on model is well-designed

The additive model (features = union, limits = sum) with base plan + stackable add-ons covers the common SaaS billing patterns. The `requires` compatibility check prevents invalid combinations.

### A6. The `can()` 7-layer resolution is well-ordered

Evaluating authentication first, then flags, then plan, then limits, then roles, then attributes, then step-up is correct for fail-fast. The ordering by actionability for denial reasons ("upgrade your plan" before "you need the editor role") is good UX thinking.

### A7. Local DB for hot path, cloud for high-volume is the right split

Role assignments, closure table, plan assignments in local DB; wallet counts, billing events, audit logs in cloud. This keeps `can()` fast (local queries) while offloading write-heavy data. The SQLite longevity argument is valid.

---

## Summary

The design is ambitious and directionally correct. The entity-centric restructuring, plan model, and performance strategy are well-thought-out. However, the scope is too large for a single design (B3), the config hashing for versioning needs specification (B2), the atomicity gap in `canAndConsume()` needs conscious resolution (B1), and the inheritance direction change needs explicit algorithm documentation (B4).

The cloud/local split needs failure mode specification (S1), the `_per_{entity}` naming convention is fragile (S2), and the Stripe sync narrative is contradictory (S6).

**Estimated implementation effort:** 8-12 weeks for a single engineer, assuming phased delivery. The entity restructuring alone (B4) touches every store, every test, and every consumer. That should be Phase 1. Plans/billing should be Phase 2. Stripe/webhooks Phase 3. UI components Phase 4+.

**Risk rating:** Medium-high. The migration from the current `defineAccess()` to the new format is a full rewrite of the access layer. Every existing test will break. The surface area is large enough that subtle bugs in inheritance resolution or limit calculation could silently grant or deny access incorrectly.
