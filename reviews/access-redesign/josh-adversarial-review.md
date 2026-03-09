# Josh (DX) Adversarial Review -- Access Redesign

**Reviewer:** josh (Developer Advocate)
**Doc:** `plans/access-redesign.md`
**Date:** 2026-03-09

---

## Blockers

### B1. The full example is doing too much, too soon

The very first code a developer sees is a 195-line `defineAccess()` call with entities, entitlements, plans (four of them), add-ons, limits, overrides, and grandfathering. This violates Vertz Principle #3 ("Can an LLM use this correctly on the first prompt?") and Principle #2 ("One way to do things" -- but the developer has no idea *which* way to start).

A developer building their first SaaS will open this doc, see the full example, and close the tab. The API itself might be well-designed, but the **presentation** actively works against adoption.

**Fix:** The doc needs a progressive disclosure structure:

1. **5-minute quickstart** -- entities + 3 entitlements, no plans, no limits. "Here's RBAC in 10 lines."
2. **Add plans** -- introduce one free plan and one paid plan.
3. **Add limits** -- show one limit with `gates`.
4. **Full example** -- the current 195-line block, positioned as reference.

Without this layering, the doc fails as both a design doc and as future documentation. The API might be simple, but the *perception* is overwhelming.

### B2. `gates` is confusing and the relationship is backwards from how developers think

A developer thinks: "When someone tries to create a prompt, I want to check if they're under their limit." The mental model is **action -> limit check**.

But `gates` is defined on the limit side, pointing at the entitlement:

```ts
prompts: { max: 50, gates: 'prompt:create' },
```

This reads as "the prompts limit gates the prompt:create entitlement." But a developer would expect to write something on the `prompt:create` entitlement saying "this action is limited by the prompts quota."

The word `gates` itself is jargon. It's not a verb developers use. "Block"? "Guard"? "Check"? Even those are better. But the real issue is the direction: limits point at entitlements. Why? If I'm defining `prompt:create`, I want to see *everything* about it in one place -- who has access (roles), what plan is needed (features), AND what limits apply. Right now I have to scan the entire plans section to find which limits gate my entitlement.

**Fix:** Either:
- (a) Add a `limits` key to entitlements: `'prompt:create': { roles: [...], limit: 'prompts' }`, or
- (b) Rename `gates` to something more intuitive like `blocks` or `guards`, AND add a cross-reference section or tooling that lets you look up "what limits apply to this entitlement?"

At minimum, rename `gates`. That word will confuse every junior developer and most LLMs.

### B3. `_per_{entity}` naming convention is fragile and unenforceable at the type level

The convention `prompts_per_brand` relies on string parsing to extract entity scoping. This is exactly the kind of implicit magic the Manifesto warns against ("Explicit over implicit").

Problems:
- What if my entity is `team_lead`? Is `prompts_per_team_lead` parsed as `prompts_per_team` + leftover `_lead`, or `prompts` + `per_team_lead`? The doc doesn't say.
- A developer will write `promptsPerBrand` (camelCase) or `prompts-per-brand` (kebab) and get a confusing error. Or worse, no error -- just broken scoping.
- An LLM will absolutely get this wrong. It's a naming convention, not a type constraint.
- The Manifesto says "If TypeScript says it's good, it runs." A string naming convention can't deliver that.

**Fix:** Use a structured object instead of string parsing:

```ts
limits: {
  prompts: { max: 50, gates: 'prompt:create' },
  prompts_by_brand: { max: 5, gates: 'prompt:create', scope: 'brand' },
}
```

Or even:
```ts
limits: {
  prompts: { max: 50, gates: 'prompt:create', scope: 'tenant' },
  prompts: { max: 5, gates: 'prompt:create', scope: 'brand' },  // per brand
}
```

The `scope` key is explicit, typed, and autocompletable. The string convention is a bug farm.

---

## Should Fix

### S1. Entitlement callback `(r) => ({...})` needs more explanation

The doc shows:

```ts
'task:delete': (r) => ({
  roles: ['assignee'],
  rules: [r.where({ createdBy: r.user.id })],
}),
```

Questions a developer will have:
- What is `r`? The doc says "scoped to entity" but doesn't explain what that means concretely.
- When do I use the callback vs the object form? The doc implies it's "when you need attribute-based rules" but doesn't say that explicitly.
- Can I use `r` to access relationships? Like `r.where({ project: { archived: false } })`?
- What's the type of `r.user`? Is it the full user object or just `{ id: string }`?

A junior developer will stare at this and not know when to reach for it. The decision tree should be explicit: "Use the object form for pure role checks. Use the callback when access depends on the entity's data (e.g., 'only the creator can delete')."

### S2. Plan groups -- the mental model isn't explained, just shown

The doc says:

> `group` -- ties billing variants together. A tenant can only have one plan per group at a time.

Then shows `pro_monthly` and `pro_yearly` both with `group: 'main'`. But:
- Why is the group called `'main'`? Is that a convention? A reserved word?
- When would I have multiple groups? The doc never shows this.
- What happens to add-ons when switching within a group?

A developer will ask: "Do I always need a group? What if I only have one plan?" The answer is probably "yes, always," but the doc leaves it ambiguous.

**Fix:** Show a concrete multi-group example (e.g., `group: 'main'` for base plans + `group: 'ai'` for AI tier plans) OR explicitly state "most apps only need one group called `'main'`."

### S3. Grandfathering default behavior will surprise developers

The doc says:

> Default: **1 billing cycle** (monthly plan -> `'1m'`, yearly -> `'3m'`)

This means that by default, if I change my Pro plan's limits and deploy, existing Pro customers will be **automatically migrated** after one month. That's a business decision the framework is making for me.

Most developers won't read the grandfathering section until they've already deployed a plan change. The first time they learn about this behavior is when a customer complains their limits changed.

**Fix:**
- Make the default `'indefinite'` (safe by default) and require explicit opt-in for auto-migration, OR
- Surface a **loud warning** at deploy time: "Plan `pro_monthly` changed. 47 tenants will be auto-migrated in 30 days. Set `grandfathering.grace` to change this."
- At minimum, the deploy-time behavior should be documented with a big callout.

### S4. Add-ons are visually nested inside `plans` but syntactically broken

In the full example, add-ons appear to be inside the `plans` object:

```ts
plans: {
  free: { ... },
  pro_monthly: { ... },
  // ...
  enterprise: { ... },
},    // <-- plans closes here

  extra_prompts_50: {   // <-- but these are OUTSIDE `plans`?
    addOn: true,
    ...
  },
```

Wait -- looking at the indentation more carefully, there's a `},` after `enterprise` that closes `plans`, but then `extra_prompts_50` is indented as if it's still inside. And then there's a `},` at line 192 that closes... what? This looks like a syntax error in the design doc.

If add-ons are supposed to live inside `plans`, the doc's indentation is misleading. If they're a separate top-level key, the doc should show that. Either way, the current example will confuse developers AND LLMs trying to implement this.

**Fix:** Clarify whether add-ons live inside `plans` or as a separate `addOns` key. I'd recommend a separate `addOns` key for clarity -- mixing base plans and add-ons in the same object with only `addOn: true` as a discriminator is error-prone.

### S5. `max: -1` for unlimited is a code smell

```ts
prompts: { max: -1, gates: 'prompt:create' },
```

`-1` as a magic number for "unlimited" is a C-ism. In a TypeScript-first framework that values explicitness, this should be:

```ts
prompts: { max: Infinity, gates: 'prompt:create' },
// or
prompts: { unlimited: true, gates: 'prompt:create' },
// or
prompts: { gates: 'prompt:create' },  // omit max = unlimited
```

`-1` will cause bugs. Someone will do `if (limit.max > 0)` and accidentally block unlimited plans. An LLM will see `-1` and not know if it means "disabled" or "unlimited" or "error."

### S6. The `can()` resolution flow buries the most important developer concern

The resolution flow section is excellent technically, but from a DX perspective, the developer's #1 question is: **"Why was my user denied?"** The `reasons` array answers this, but the doc doesn't show how to use it in practice.

Show a concrete error-handling example:

```ts
const result = await can('project:export', { entity: project });
if (!result.allowed) {
  switch (result.reason) {
    case 'plan_required':
      return showUpgradePrompt();
    case 'limit_reached':
      return showLimitWarning(result.meta);
    case 'role_required':
      return show403();
  }
}
```

This is what developers will copy-paste. Make it easy to find.

### S7. Too many concepts introduced simultaneously

Count the top-level concepts a developer must learn:

1. `entities` -- with `roles` and `inherits`
2. `entitlements` -- with `roles`, `flags`, `rules`, callback form
3. `plans` -- with `group`, `price`, `features`, `limits`, `grandfathering`
4. `limits` -- with `max`, `per`, `gates`, `overage`, `cap`, `_per_{entity}` convention
5. `add-ons` -- with `addOn: true`, `requires`
6. `overrides` -- with `add` vs `max` modes
7. `defaultPlan`
8. `storage` -- local vs cloud split
9. `billing` -- webhook handler, events, Stripe sync
10. UI components -- `PricingTable`, `PlanManager`, `UsageDashboard`, etc.

That's 10 distinct concept groups. Compare to Clerk (roles + permissions) or WorkOS FGA (types + relations + warrants). Those are 2-3 concepts.

Now, Vertz is doing more than those tools. But the design doc should acknowledge the learning curve and show which concepts are **required** vs **opt-in**. A simple RBAC app needs only #1 and #2. Plans and billing are opt-in. Overrides are advanced. The doc should make this explicit.

### S8. No error message examples

The Manifesto says "If TypeScript says it's good, it runs." But this doc has 12 validation rules and shows zero error messages. When validation rule #7 fails ("Limit keys with `_per_{entity}` suffix must reference a defined entity"), what does the developer see?

```
// Bad:
Error: Invalid limit key

// Good:
defineAccess error: Limit key "prompts_per_brnda" references entity "brnda",
but no entity with that name is defined. Did you mean "brand"?
Defined entities: organization, team, project, brand
```

Error message quality is a DX differentiator. The doc should include example error messages for the most common mistakes, or at minimum state that validation errors will include the offending key, the expected values, and a suggestion.

---

## Nits

### N1. `flags` on entitlements is underexplained

```ts
'project:export': { roles: ['manager'], flags: ['export-v2'] },
```

What is `export-v2`? Where is it defined? Is it a feature flag from a third-party service? A Vertz-internal concept? The doc mentions feature flags in the resolution flow but never shows how they're defined or managed.

### N2. `rules.fva(600)` is opaque

```ts
rules.fva(600),
```

What does `600` mean? Seconds? Milliseconds? The doc says "check MFA freshness" in the resolution flow, but the `fva` function is never explained. This is inside-baseball that will confuse newcomers.

### N3. The `r.where()` vs `rules.all()` interplay is unclear

The composing rules example shows both `r.where()` (inside a callback) and `rules.all()` / `rules.role()` (imported combinators). Can I use `rules.all()` inside a callback? Can I use `r.where()` outside a callback? The doc implies yes but doesn't state it.

### N4. `access.plans.resolve('org-123')` vs `access.plans.migrate('pro_monthly')`

The `resolve` method takes a tenant ID. The `migrate` method takes a plan ID. This asymmetry will trip people up. Consider `access.plans.forTenant('org-123').resolve()` for consistency.

### N5. The cloud/local split section is well-designed but adds cognitive load for the wrong audience

A developer reading a design doc for an access system doesn't need to understand data residency decisions. This section belongs in an architecture doc or ops guide, not in the API design doc. It's good thinking, but it's in the wrong place -- it makes the doc longer without helping a developer use the API.

### N6. The `storage` config is simple, which is good

```ts
storage: {
  local: db,
  cloud: { apiKey: process.env.VERTZ_API_KEY },
},
```

This is clean. But what happens if I omit `cloud`? The doc says everything falls back to local, but this should be the **default** -- don't even mention cloud until the developer needs it. The quickstart should show `storage: { local: db }` only.

### N7. Billing UI components feel premature

The `<PricingTable>`, `<PlanManager>`, `<UsageDashboard>`, `<AddOnStore>`, `<InvoiceHistory>` components are listed with no detail. This is aspirational, not designed. Either flesh them out or move them to a "Future" section. Listing them without detail sets expectations the framework can't yet meet.

---

## Approved

### Entity-centric grouping -- great improvement

The `entities` object with co-located `roles` and `inherits` is a clear win over the scattered `hierarchy` / `roles` / `inheritance` keys. Finding everything about "team" in one place is exactly right.

### `inherits` direction -- child declares what it gets from parent

`'organization:owner': 'lead'` on the `team` entity reads naturally: "An organization owner inherits the lead role in teams." The `entity:role` string format is explicit and greppable. Good.

### Plans declare features, not the other way around

Moving from `'project:export': { plans: ['enterprise'] }` to `enterprise: { features: ['project:export'] }` is the right call. Plans are the business concern; entitlements are the access concern. Keeping them separate with a single direction (plan -> entitlement) is clean.

### `can()` resolution order -- actionability-first

Ordering denial reasons by actionability (upgrade plan > get role > verify identity) is thoughtful DX. This is the kind of detail that makes a developer say "they thought about this."

### Limits as resource counts, not action counts

"If a user creates 10 prompts and deletes 5, the count is 5" -- this is the right semantic model. Action counting leads to weird edge cases (undo/redo, soft delete, etc.). Resource counting matches how businesses actually think about usage.

### Overrides API -- clean and practical

The `add` vs `max` distinction for overrides is intuitive: "give them 200 more" vs "cap them at exactly 1000." This covers the real-world use cases (sales deals, beta testers, outage compensation) without overcomplicating the model.

### Performance strategy -- preload once, evaluate many

The `createContext()` pattern with per-request preloading is well-designed. The query budget table (0 queries for JWT-only checks, 3-4 for batched entity checks) demonstrates genuine thought about production performance.

---

## Summary

The core API design is solid. Entity-centric grouping, plan-to-entitlement direction, resource-based limits, and the `can()` resolution model are all well-reasoned. The technical depth on performance, caching, and grandfathering shows maturity.

The problems are all presentation and naming:
- The doc front-loads complexity instead of building progressively
- `gates`, `_per_{entity}`, and `max: -1` will confuse developers and LLMs
- The add-on placement in the example has a structural issue
- Grandfathering defaults make a business decision the developer didn't ask for
- Error messages are unspecified

Could I write a 5-minute quickstart with this API? Yes -- but only after I strip away 80% of the doc. The API *can* be simple. The doc *makes it* complex. Fix the presentation, fix the three naming issues in blockers, and this is a strong design.

**Verdict:** Conditional approval. Fix blockers B1-B3, address S4-S5, and this ships.
