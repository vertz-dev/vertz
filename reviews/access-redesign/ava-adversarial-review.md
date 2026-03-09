# Adversarial Review: Access Redesign

**Reviewer:** ava (DX & Quality Engineer)
**Document:** `plans/access-redesign.md`
**Date:** 2026-03-09

---

## Blockers

### B1. No migration plan from current `defineAccess()` API

The current API uses `hierarchy`, `roles`, `inheritance` as top-level keys. The redesign replaces all three with a single `entities` object. Every existing test file I reviewed (`define-access.test.ts`, `access-context.test.ts`, `access-set.test.ts`, `entity-access.test.ts`, all integration tests in `packages/integration-tests/`) uses the old shape. There are **40+ test files** in `packages/server/src/auth/__tests__/` and **28+ integration test files** that construct `defineAccess()` calls with the old shape.

The design doc says nothing about:
- Whether both shapes are accepted during transition (overloaded signature)
- Whether it is a hard break (rewrite everything at once)
- Whether there is a codemod or automated migration

This is a blocker because without a migration strategy, the implementation PR will either break all existing tests (if the old shape is removed) or create a confusing dual-API (if both are kept). The design doc should explicitly state: "The old shape is removed. All tests are rewritten as part of the implementation." Or: "The old shape is accepted and internally transformed to the new shape, with a deprecation warning."

### B2. Entitlement roles validation against entity scope is underspecified

Validation rule #4 says: "Entitlement roles must all exist in the referenced entity's `roles` list." The design doc gives the example:

```ts
// INVALID -- 'owner' is an organization role, not a project role
'project:view': { roles: ['owner', 'manager'] },
```

But the current implementation has **no such validation**. The current `defineAccess()` does not validate that entitlement roles match the entity prefix. Looking at the current tests (`define-access.test.ts`), the entitlements `'project:create': { roles: ['admin', 'owner'] }` reference `admin` and `owner`, which are Organization roles, not Project roles. This is used throughout the test suite and integration tests (`auth-plans-wallet.test.ts` line 48, `access-set.test.ts` line 23).

This means either:
- (a) The validation rule is wrong and the design needs to accommodate cross-entity role references in entitlements, OR
- (b) The validation rule is correct, and the entire existing test suite + the examples in the design doc itself are wrong

The design doc's own full example has `'organization:create-team': { roles: ['admin', 'owner'] }` which IS valid (org entity, org roles). But the existing tests have `'project:create': { roles: ['admin', 'owner'] }` which would be INVALID under the new validation (admin/owner are org roles, not project roles).

This contradiction must be resolved before implementation. If rule #4 is enforced, it changes the semantics of how entitlements work and invalidates existing patterns.

### B3. `inherits` direction change breaks mental model without clear error guidance

The current API defines inheritance on the **parent** (`Organization: { owner: 'lead', admin: 'editor' }` means "org owner inherits team lead"). The redesign defines inheritance on the **child** (`team: { inherits: { 'organization:owner': 'lead' } }`). Same data, opposite direction.

The design doc shows the "before vs after" table, but doesn't address:
- What error message does a developer get if they accidentally use the old direction? (e.g., defining `inherits` on the parent entity, which would be syntactically valid but semantically wrong)
- How do you validate that the entity referenced in `inherits` keys is actually a parent/ancestor, not a sibling or child?

Without directional validation, a developer could write `organization: { inherits: { 'team:lead': 'owner' } }` (child inheriting UP to parent), which is semantically nonsensical but syntactically valid. The design doc's validation rules (#1, #2) only check that the entity and role exist -- not that the inheritance direction is correct.

### B4. Hierarchy inference from DB schema is unspecified

The design doc says "Hierarchy order -- inferred from DB schema" and "The entity hierarchy is NOT defined in `defineAccess()`. It comes from the database schema/models (table relationships)."

But there is zero specification of HOW this inference happens:
- What DB schema metadata is read?
- What if the DB schema has multiple valid hierarchy orderings? (e.g., a `project` belongs to both `organization` and `team`)
- What if the DB schema doesn't exist yet (test environment, in-memory stores)?
- How does the closure store know the hierarchy order without an explicit hierarchy array?

The current implementation uses `hierarchy: ['Organization', 'Team', 'Project', 'Task']` to define the order. The closure store's `addResource` uses `parentType`/`parentId` which implicitly defines parent-child relationships, but the inheritance resolution in `getEffectiveRole` uses `accessDef.hierarchy` to determine which entities are above which.

If the hierarchy array is removed from `defineAccess()`, the inheritance resolution code has no way to know the order. The design doc must specify how the hierarchy is determined from the entities config or from the DB schema.

### B5. Limit `gates` field is new and breaks existing limit shape

The current `LimitDef` type is `{ per: BillingPeriod; max: number }`. The redesign adds a `gates` field: `{ max: 50, gates: 'prompt:create' }`. But the design doc also shows limits without `per` (lifetime caps): `{ max: 50, gates: 'prompt:create' }`.

Two breaking changes here:
1. `gates` is a new required field (current code doesn't have it)
2. `per` becomes optional (current code requires it via `BillingPeriod` type)

The current tests all use the old limit shape (e.g., `'project:create': { per: 'month', max: 5 }`). The new shape (`prompts: { max: 50, gates: 'prompt:create' }`) uses a **named limit key** (`prompts`) that is different from the entitlement key (`prompt:create`). This is a fundamental change in how limits are keyed.

Currently, limits are keyed by entitlement name. In the redesign, limits have arbitrary names with a `gates` field pointing to the entitlement. This means:
- The wallet store key changes from entitlement name to limit name
- Multiple limits can gate the same entitlement (e.g., `prompts` and `prompts_per_brand` both gate `prompt:create`)
- The `canAndConsume()` API needs to know which limit to consume against

None of this is specified in the design doc.

---

## Should Fix

### S1. Validation rules are missing several important cases

The 12 validation rules listed are not exhaustive. Missing cases:

1. **Duplicate roles within an entity** -- `organization: { roles: ['admin', 'admin', 'member'] }`. Should this be an error or silently deduplicated?

2. **Empty roles array on an entity** -- `team: { roles: [] }`. Is an entity with no roles valid?

3. **Self-referencing inheritance** -- `team: { inherits: { 'team:lead': 'viewer' } }`. An entity inheriting from itself.

4. **Circular inheritance** -- `team: { inherits: { 'project:manager': 'lead' } }` combined with `project: { inherits: { 'team:lead': 'manager' } }`. The system would loop.

5. **Entitlement with empty roles AND callback** -- What happens when `roles: []` is combined with a callback `(r) => ({ roles: [], rules: [...] })`? The callback returns roles too -- are they merged?

6. **Multiple limits gating the same entitlement** -- `prompts: { max: 50, gates: 'prompt:create' }` AND `prompts_per_brand: { max: 5, gates: 'prompt:create' }`. Both gate `prompt:create`. Are ALL limits checked? ANY? What's the failure mode?

7. **Add-on with `features` referencing an entitlement that no base plan includes** -- The add-on unlocks `project:export`, but no base plan lists it in `features`. Is this valid? The add-on compatibility section says add-ons can "unlock entitlements the base plan doesn't include," which suggests yes. But validation rule #11 says "Add-on limit keys must match limit keys defined in at least one base plan." There's no analogous rule for features.

8. **`defaultPlan` referencing an add-on** -- `defaultPlan: 'extra_prompts_50'`. What happens?

9. **Plan with `addOn: true` AND a `group`** -- Rule #12 says add-ons must NOT have a group. But the full example has add-ons defined at the same level as base plans (inside the `plans` object). How does validation distinguish them from plans that happen to not have a group set?

10. **Limit `max: 0`** -- Is this valid? It means "zero capacity" which is effectively "feature disabled." Different from `max: -1` (unlimited). Should be explicitly documented.

### S2. Override edge cases are unspecified

The override API has several undocumented edge cases:

1. **Override a limit that doesn't exist in the plan** -- `overrides.set('org-123', { limits: { nonexistent_limit: { add: 100 } } })`. The limit name doesn't match any limit defined in any plan. Should this silently succeed, throw, or warn?

2. **Override with negative `add`** -- `limits: { prompts: { add: -50 } }`. Is this valid? It would reduce the effective limit below the plan's base.

3. **Override with `max: -1`** (unlimited) -- Combined with an add-on that also adds limits. Is `max: -1` treated as "override to unlimited" regardless of add-ons?

4. **Override `max: 0`** -- The doc shows "Throttle abusive tenant" with `max: 0`. This makes sense. But what about `max: -50`? Negative max?

5. **Both `add` and `max` set** -- The doc says "`max` takes precedence over `add` if both are set." But are both stored? If I later remove only the `max` override, does the `add` take effect? Or does `remove` remove both?

6. **Feature override for an entitlement that doesn't exist** -- `overrides.set('org-123', { features: ['nonexistent:action'] })`. Should validate against defined entitlements.

### S3. Grandfathering system testability

The design doc describes a sophisticated versioning and grandfathering system but doesn't address how to test it:

1. **How do you simulate "deploy with different config" in a test?** The versioning is triggered by config hash changes on startup/deploy. In a test, you'd need to call `defineAccess()` with different configs and simulate the startup detection. There's no API for this.

2. **How do you test grace period expiration?** The `grace_approaching` and `grace_expiring` events fire at specific times (30 days before, 7 days before). In tests, you need time travel. The current test patterns use `new Date('2026-01-01')` for fixed dates. Is there a `clock` parameter or `now` injection for the migration system?

3. **How do you test `migrate()` for a specific tenant?** The API shows `access.plans.migrate('pro_monthly', { tenantId: 'org-123' })`. But `access` is the return value of `defineAccess()`, which currently returns `AccessDefinition` (a frozen config object). Where does the `access.plans.migrate()` method live? The return type needs to change, or this is a separate API surface.

4. **Version hash determinism** -- "the system hashes each plan's config." What hash algorithm? Is it deterministic across deployments? If the hash uses JSON.stringify, object key ordering could affect it (though V8 preserves insertion order). This needs a test.

### S4. Cloud/local split has no local testing story

The design doc says wallet counts live in the cloud, but "without cloud, everything falls back to local DB." For developers who don't have a cloud API key:

1. How do they run the full test suite locally? The `InMemoryWalletStore` exists, but it doesn't simulate the cloud latency or failure modes.
2. How do they test overage billing? The overage system requires a payment processor adapter, and without one, "overage config is a validation error." Does this mean you can't even define overage limits in tests?
3. How do they test plan versioning and grandfathering? These live in the cloud. If they fall back to local DB, is the local implementation feature-complete?

The design should specify: "All cloud features have InMemory implementations for testing. The cloud adapter is only used in production."

### S5. Performance claim "3-4 queries for batch of 50" needs verification criteria

The doc claims: "For 50 tasks in the same project: 3-4 total DB queries instead of 250+."

This is a strong claim. How do we verify it?

1. The `canBatch()` API doesn't exist yet. No tests verify the batch behavior.
2. The claim depends on the preload strategy ("load all resource->ancestor mappings in one closure table query"). But `InMemoryClosureStore.getAncestors()` is called per-entity. There's no batch variant.
3. The wallet query claim ("ONE wallet query per limit key per tenant") depends on a batch wallet API that doesn't exist.

The design doc should either:
- Include a benchmark specification (input size, expected query count, how to measure)
- Or mark this as a non-binding aspiration and add benchmarks as a post-implementation phase

### S6. Callback entitlement `r` context type safety is hand-waved

The design shows:

```ts
'task:delete': (r) => ({
  roles: ['assignee'],
  rules: [r.where({ createdBy: r.user.id })],
}),
```

And claims "`r` is typed to the entity's model -- `r.where()` only accepts that entity's columns."

But there's no specification of:
- How does `defineAccess()` know the entity's model/columns? It only has `roles` and `inherits`.
- Where is the model type information provided? Is it a generic parameter? Is it inferred from a separate schema definition?
- The current `rules.where()` accepts `Record<string, unknown>` -- there's no column validation.

Without a concrete type-level specification (including `.test-d.ts` examples), this is vaporware. The existing `rules.test.ts` shows `rules.where({ archived: false })` and `rules.where({ createdBy: rules.user.id })` -- both accept arbitrary keys.

### S7. `canBatch()` vs `canAll()` naming confusion

The existing API has `canAll()` (line 75 of `access-context.test.ts`). The redesign introduces `canBatch()`. Are these the same? Different? Does `canAll()` get removed? The design doc mentions `canAll()` in the performance section ("The current `canAll()` is a sequential loop") but then introduces `canBatch()` as the replacement.

The design doc should explicitly state: "`canAll()` is replaced by `canBatch()`" or "`canBatch()` is an addition alongside `canAll()`."

### S8. Add-on `one_off` price interval semantics with limits

The design shows:

```ts
extra_prompts_50: {
  addOn: true,
  price: { amount: 10, interval: 'one_off' },
  limits: { prompts: { max: 50, gates: 'prompt:create' } },
},
```

A one-off add-on with a limit of 50 prompts. Questions:
1. When are the 50 prompts consumed? Immediately on purchase? Or does the tenant get +50 to their current period's wallet?
2. If the tenant's base plan has `per: 'month'` on prompts, does the one-off +50 reset monthly too? Or is it a lifetime +50?
3. Can a tenant purchase the same one-off add-on multiple times? (2 purchases = +100 prompts?)
4. What happens when the base plan changes (upgrade/downgrade)? Does the one-off add-on's limit persist?

These semantics are critical for the implementation and must be specified.

---

## Nits

### N1. Entitlement callback vs object inconsistency in types

The design shows two entitlement formats: object `{ roles: [...] }` and callback `(r) => ({ roles: [...], rules: [...] })`. But the current `EntitlementDef` type is only the object shape. The new type needs to be a union: `EntitlementDef | ((r: RuleContext) => EntitlementDef)`. This is implied but not stated.

### N2. `price.interval` includes `'quarter'` but `BillingPeriod` type doesn't

The design doc says `price.interval` can be `'month' | 'quarter' | 'year' | 'one_off'`. But the current `BillingPeriod` type is `'month' | 'day' | 'hour'`. These are different enums for different purposes (price interval vs limit window), but the naming overlap could confuse developers.

### N3. The `_per_{entity}` convention for limit scoping needs validation

Validation rule #7 says "Limit keys with `_per_{entity}` suffix must reference a defined entity." But the parsing logic isn't specified. What if a limit is named `prompts_per_team_lead`? The `_per_` convention would parse `team_lead` as the entity, which doesn't exist. The parser needs to try the longest matching entity suffix, or require exact matches.

### N4. Missing `group` field in free plan example

The full example shows `free` plan without a `group` field, but `pro_monthly`, `pro_yearly`, and `enterprise` all have `group: 'main'`. If `group` is required for base plans (rule #12 says "Add-ons must NOT have a `group`", implying base plans must?), then `free` is missing it. If `group` is optional for base plans, what does a plan without a group mean? Can a tenant have multiple groupless plans?

### N5. Event names inconsistency

The grandfathering events use `:` separator (`plan:version_created`, `plan:grace_approaching`), while the billing events use different patterns (`subscription:created`, `payment:failed`, `billing:payment_failed`). The `billing:payment_failed` and `payment:failed` appear to be the same event with different names in different sections.

---

## Approved

### A1. Entity-centric grouping is a clear improvement

The current API spreading entity info across `hierarchy`, `roles`, and `inheritance` is genuinely hard to read. The new `entities` object with self-contained `roles` and `inherits` per entity is significantly more scannable. Good design decision.

### A2. Plans referencing entitlements (not vice versa) is correct

Moving from `entitlement -> plans` to `plans -> entitlements (features)` is the right direction. It keeps entitlements clean (who + when) and plans separate (what you get). This matches how developers think about pricing tiers.

### A3. Resolution order is well-specified

The 7-layer `can()` evaluation order with fail-fast semantics is clear and actionable. The ordering by actionability (plan before role before attribute) makes the first denial reason useful for UI messaging.

### A4. Existing test infrastructure is solid

The `InMemory*Store` pattern (closure, role assignment, plan, wallet, flag) provides a comprehensive test harness. The existing test patterns in `access-context.test.ts` and `auth-plans-wallet.test.ts` are thorough and follow good TDD practices. The redesign can build on this foundation.

### A5. Add-on model is clean

The distinction between base plans (one per group) and add-ons (stackable, additive) is well-designed. The additive semantics for features (union) and limits (sum) are intuitive.

### A6. Override API is pragmatic

The `add` vs `max` distinction for limit overrides covers the real-world use cases well (strategic partner, compensation, throttling). The resolution order (plan + addons + overrides) is clear.

### A7. Client/server layer split table is excellent

The table showing which `can()` layers run on client vs server is exactly the kind of developer documentation that prevents confusion. It makes the advisory nature of client-side checks explicit.
