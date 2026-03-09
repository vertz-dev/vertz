# Adversarial Review — Access Redesign (nora)

**Focus:** API surface quality, client-side DX, billing UI feasibility, naming, error UX.

---

## Blockers

### B1. Entitlement roles are not type-checked against their entity's role list

The doc says:

```ts
// INVALID — 'owner' is an organization role, not a project role
'project:view': { roles: ['owner', 'manager'] },
```

But the TypeScript signature as described has `roles: string[]`. The design claims the entity prefix scopes the roles, but nothing in the API surface section shows how the type system enforces this. If `defineAccess()` accepts a flat `entitlements` object with `entity:action` string keys, the compiler has no way to narrow the `roles` array to only roles defined on that entity — not without either:

1. A conditional mapped type that parses the string prefix and looks it up in `entities`, or
2. A builder pattern (`access.entity('project').entitlement('view', { roles: [...] })`) where TypeScript can carry the generic through.

Option 1 is complex template-literal type gymnastics that rarely survives real-world usage (error messages are unreadable, autocompletion breaks). Option 2 changes the API shape entirely.

**This is a blocker because:** If the roles are not type-checked at definition time, a developer can typo a role name or use a role from the wrong entity and will only discover it at runtime (or never, if the typo happens to be a valid role on another entity). The doc lists this as a key selling point ("INVALID — TS error") but doesn't demonstrate how the type flow actually works.

**Ask:** Add a Type Flow Map section showing how a generic flows from `entities.project.roles` to `entitlements['project:view'].roles`. If it requires template literal types, show the actual conditional type. If it doesn't work in TypeScript, redesign the entitlements key format (e.g., nested `entitlements: { project: { view: { roles: [...] } } }`) so the type system can enforce it naturally.

### B2. `_per_{entity}` naming convention for limit scoping is fragile and untyped

Limit keys like `prompts_per_brand` encode scoping via string convention. The doc says:

> The `_per_{entity}` suffix must reference a defined entity.

But this is purely a runtime validation rule. TypeScript cannot enforce that `prompts_per_brand` references a valid entity name `brand` from the `entities` object — the limit key is just a string. This means:

- No autocomplete for the entity part
- Typos (`prompts_per_bran`) silently pass the type checker
- Renaming an entity doesn't flag broken limit keys

**Alternative:** Make scoping explicit:

```ts
limits: {
  prompts: { max: 50, gates: 'prompt:create' },
  prompts_per_brand: { max: 5, gates: 'prompt:create', scope: 'brand' },
}
```

With `scope` as a typed field constrained to `keyof entities`, you get autocompletion and compile-time safety. The `_per_` convention can still exist as a cosmetic naming recommendation, but the actual scoping comes from the typed `scope` field.

### B3. The add-ons section has a syntax error — `plans` and `addOns` are mixed in the same object

In the full example (lines 164-192), add-ons (`extra_prompts_50`, `export_addon`, `extra_seats_10`) appear to be inside the `plans` object but with `addOn: true`. However, the indentation and the closing brace on line 192 suggest they're a sibling of `plans` (the `plans` object closes implicitly before them). But there's no `addOns:` key introducing them.

Looking more carefully:

```ts
  plans: {
    // ... free, pro_monthly, pro_yearly, enterprise ...
  },

  // ── Add-ons ──
    extra_prompts_50: {        // <-- This is indented but has no parent key
```

The extra indentation and missing wrapping key means this code won't compile. Are add-ons inside `plans`? Or is there a separate `addOns` top-level key? This matters for the type system — if they share the `plans` key, the discriminant is `addOn: true`, which makes the plans type a union and complicates iteration (every loop over plans must filter add-ons). If they're separate, the API is cleaner but the example is wrong.

**Ask:** Clarify the structure and fix the example. I recommend separate top-level keys (`plans` and `addOns`) because mixing them forces awkward `plan.addOn ? ... : ...` branching everywhere. Separate keys also let TypeScript give different shapes (add-ons don't need `group`, base plans don't need `addOn: true`).

### B4. Client-side `can()` silently drops limit and attribute-rule information — developers will build UIs that lie

The doc acknowledges that client-side `can()` cannot evaluate limits or attribute rules. But it doesn't specify what `reason` the client gets for an entitlement that is ONLY denied by a limit.

Current `AccessSet` from the server includes pre-computed `AccessCheckData` per entitlement. If the server computes `allowed: false, reason: 'limit_reached'` and embeds it in the JWT access set, the client `can()` will show the correct reason. But if the server computes `allowed: true` (because limits haven't been hit yet), and then the user creates one more resource hitting the limit, the client still shows `allowed: true` until the next access set refresh.

The design says WebSocket `access:limit_updated` events handle this, but the existing `handleAccessEvent` code (line 101-111 in `access-event-handler.ts`) only handles the case where `remaining <= 0`. What about the overage billing case from the redesign, where `can()` should return `true` but with `meta.limit.overage: true`? The existing handler has no concept of overage.

**This is a blocker because:** The design doc introduces overage billing but doesn't update the client-side event handling contract. A developer who implements `<UsageDashboard>` will have no client-side signal for "you're in overage." The `ClientAccessEvent` type for `limit_updated` doesn't include an `overage` field.

**Ask:** Update `ClientAccessEvent` and `AccessCheckData` types to include overage state. Define exactly what `can()` returns client-side when overage is active (allowed: true, but with `meta.limit.overage: true` and `meta.limit.overageCost`).

---

## Should Fix

### S1. The callback entitlement format `(r) => ({...})` creates a two-world problem

Entitlements have two shapes: `{ roles: [...] }` (object) and `(r) => ({ roles: [...], rules: [...] })` (callback). The callback returns the same shape as the object, plus `rules`. This means:

- Every developer must decide "do I need rules?" before choosing the format
- Refactoring from object to callback (when you later need a rule) changes the shape of the value, which could confuse diffs
- The `r` parameter is magical — what is it? Where are its types? The doc says "scoped to the entity's model" but doesn't show the import or type annotation

The gap is narrower than it looks (just wrapping in a function and adding `rules`), but consider: could the object format also support `rules`?

```ts
'task:delete': {
  roles: ['assignee'],
  rules: [{ where: { createdBy: '$user.id' } }],
},
```

This eliminates the callback entirely for simple attribute rules. The callback is only needed when you need runtime access to `r.user` or complex compositions. A template string like `'$user.id'` could be statically analyzed and type-checked by the framework.

If the callback must stay, at minimum document what `r` is. Show its type signature. Show what's on `r.user`. Show an IDE screenshot or type annotation so developers know what they're working with.

### S2. Plan components (`PricingTable`, `PlanManager`, `UsageDashboard`, etc.) are listed without data contracts

The doc lists five billing UI components:

```tsx
<PricingTable access={access} />
<PlanManager access={access} />
<UsageDashboard access={access} />
<AddOnStore access={access} />
<InvoiceHistory access={access} />
```

But `access` is the return value of `defineAccess()` — a server-side config object. These are client-side components. How does a client-side `<PricingTable>` get the list of plans, their prices, and the current tenant's active plan?

The design has no mention of:
- A client-facing API endpoint that serves plan metadata
- A `usePlans()` or `useBilling()` hook
- What shape the data takes on the client (the `plans` object in `defineAccess()` includes server-only details like `gates` entitlement keys)

This is hand-waved as "the components use the `can()` system internally" but `can()` answers "can the user do X?" — it doesn't answer "what plans exist?" or "what is the current plan?" or "how much does Pro cost?"

**Recommendation:** Define a `BillingContext` or `PlanContext` that mirrors the `AccessContext` pattern. The server computes a `BillingSet` (available plans with client-safe metadata, current plan, usage stats, add-on catalog) and sends it to the client. The billing components consume this context. Without this, the components are not buildable.

### S3. No guidance on building a "permissions page" (what can this user do?)

The doc acknowledges a future "query API" in the gap analysis:

> "Which resources can user X access?" / "Who has access to resource Z?" — useful for building permission UIs.

But this is labeled "Future." A developer building a SaaS admin panel today needs to show "User X has these permissions." The current `AccessSet` only contains pre-computed entitlement results — it doesn't expose the role assignments, entity relationships, or inheritance chain that produced those results.

Example: an admin wants to see "Why does Alice have `project:edit`?" The access set says `allowed: true` but doesn't say "because Alice is a `contributor` on project-123, which she inherited from being an `editor` on team-456." Without this, the admin panel is a black box.

**Recommendation:** Even if the full query API is future work, the `AccessSet` should include `effectiveRoles` — a map of `entity:role` pairs that the user currently has (after inheritance resolution). This is already computed server-side for the access set. Exposing it lets developers build basic permissions UIs without the full query API.

### S4. `override.set()` has confusing merge semantics — `add` vs `max` for the same key

The override API allows:

```ts
await access.overrides.set('org-123', {
  limits: { prompts: { add: 200 } },    // additive
});

await access.overrides.set('org-123', {
  limits: { prompts: { max: 1000 } },   // hard cap
});
```

The doc says "`max` takes precedence over `add` if both are set." But what happens when you call `set()` twice — does the second call replace the first, or merge? If I first set `add: 200` and then later set `max: 1000`, do I end up with `{ add: 200, max: 1000 }` (merged, but max wins at resolution) or `{ max: 1000 }` (replaced)?

This ambiguity will cause bugs. If `set()` is a full replacement, developers will accidentally wipe previous overrides. If it's a merge, they'll have stale `add` values lurking.

**Recommendation:** Make `set()` always a full replacement for that tenant. Provide `access.overrides.update()` for partial merges if needed. Document this clearly with examples showing multi-call scenarios.

### S5. Grandfathering grace period defaults are surprising for `one_off` plans

The doc says:

> Default matches the billing cycle. Monthly plans get 1 month grace, yearly plans get 3 months.

What about `one_off` add-ons? They have no billing cycle. And `free` plans have no price at all. The default grace period for these is undefined.

**Recommendation:** Explicitly state defaults for all interval types: `month` -> 1m, `quarter` -> 3m, `year` -> 3m, `one_off` -> immediate (no grace), free -> immediate.

### S6. The `entity:action` entitlement naming creates a namespace collision risk with limit `gates`

Limits declare `gates: 'prompt:create'` — but `prompt` might not be defined in `entities`. The doc's example has:

```ts
entities: { organization, team, project, task }
limits: { prompts: { gates: 'prompt:create' } }
```

`prompt` (singular) is not `prompts` (plural), but `prompt:create` implies an entity named `prompt` that must exist in `entities`. The validation rules say "Entitlement prefix (before `:`) must match a defined entity." But in the example, `prompt:create` is only referenced in limit `gates` — it never appears in the `entitlements` object.

Is `prompt:create` an entitlement? It must be, because `gates` links limits to entitlements. But it's not defined in the `entitlements` section. This means either:

1. The example is incomplete (missing `'prompt:create': { roles: [...] }` in entitlements), or
2. Limits can gate entitlements that aren't explicitly defined (implicit entitlements from limit gates)

Both are confusing. If it's (1), the example is misleading. If it's (2), the validation rules are wrong.

**Ask:** Fix the example to include all gated entitlements in the `entitlements` section, or clarify how implicit entitlements from `gates` work.

### S7. `syncToStripe()` is a fire-and-forget push, but plan changes from Stripe (e.g., failed payment) need the webhook handler

The doc describes two separate flows: `syncToStripe()` (push config to Stripe) and `webhookHandler()` (receive events from Stripe). But there's no connection between them. When `syncToStripe()` creates a Stripe Product, it stores the Stripe ID somewhere. Where? The webhook handler needs to map Stripe subscription IDs back to Vertz plan IDs.

There's an implicit "Stripe metadata store" that both `syncToStripe()` and `webhookHandler()` share, but it's not in the data residency table or the storage config. Is it local DB? Cloud? Where does the Stripe<->Vertz ID mapping live?

**Recommendation:** Add "Stripe/processor ID mapping" to the data residency table. Specify whether it's local or cloud. Show the round-trip: `syncToStripe()` stores mapping -> webhook receives event -> handler looks up mapping -> updates plan assignment.

---

## Nits

### N1. `price.interval` should include `'week'`

Some SaaS products offer weekly billing (trials, micro-SaaS). Adding `'week'` costs nothing and avoids a future breaking change. Even if it's uncommon, the type union is the right place to be inclusive.

### N2. The `rules` array semantics (OR between entries) are buried in a later section

The "Semantics: roles OR rules" section (line 497) explains that roles and rules entries are OR'd. But the entitlement example at the top of the doc shows `rules: [...]` without explaining the semantics. A developer reading the API surface section will assume AND (because that's the more common expectation for a list of rules). Move this clarification inline to the first example that uses `rules`.

### N3. `grandfathering.grace` should support a `Date` or ISO string, not just duration strings

Currently `grace: '12m'` uses a custom duration format. This works but is yet another format developers need to learn. Consider also accepting `grace: '2027-01-01'` (ISO date) for "grandfather until this date" — useful for coordinated launches where the migration date is known in advance.

### N4. The `canBatch()` return type `Map<string, AccessCheckResult>` assumes entities have string IDs

If entities use numeric IDs (common in SQL), the developer must coerce to string or the Map keys won't match. Consider `Map<string | number, AccessCheckResult>` or accept a generic ID type from the entity definition.

### N5. `access.plans.resolve()` returns `snapshot` but the type is not defined

The migration API example shows:

```ts
const info = await access.plans.resolve('org-123');
// { planId, version, currentVersion, grandfathered, graceEnds, snapshot: {...} }
```

`snapshot` contains the frozen plan config. Define the type — is it the full plan definition? Just features + limits + price? Does it include `grandfathering`? The resolve return type should be documented.

### N6. Missing `'quarter'` in the `per` field for limit windows

The doc lists `per: 'month' | 'year'` for limit windows, but `price.interval` includes `'quarter'`. If a business bills quarterly, they might also want quarterly limit resets. Add `'quarter'` to the limit window options for consistency.

---

## Approved

### Entity-centric grouping is a significant improvement

Grouping roles + inheritance under each entity (instead of scattering across `hierarchy`, `roles`, `inheritance`) is much more readable. A developer can understand the full access model for "project" by reading one block. This is a clear win.

### Plans referencing entitlements (instead of vice versa) is the right direction

`plans.pro.features: ['project:export']` reads naturally as "Pro plan includes export." The old `entitlements['project:export'].plans: ['enterprise']` forced you to bounce between entitlements and plans. One-directional is cleaner.

### The `can()` resolution order (most actionable denial first) is thoughtful

Ordering by actionability (plan_required before role_required before step_up_required) means the UI can always show the most useful message first. "Upgrade to Pro" is better than "You don't have the right role" when both are true and the upgrade would also grant the role.

### Performance strategy (preload once, evaluate many) is well-designed

The explicit separation of static layers (preloaded once per request) and dynamic layers (per-entity) with the query budget table gives confidence this will work at scale. The `canBatch()` API is the right primitive for list views.

### Inheritance defined on the child (not the parent) is more intuitive

`team.inherits: { 'organization:owner': 'lead' }` reads as "a team inherits org owner as team lead." This is easier to reason about than defining inheritance on the parent ("org owner grants team lead"), because you read the team's definition and see everything about teams in one place.

### The add-on model (stackable, additive features + limits) is clean

`Effective features = base ∪ addons` and `Effective limits = base + addons` are simple, predictable merge rules. The `requires` constraint for plan compatibility is a nice touch.

### Data residency split (local DB = hot path, cloud = accumulation) is pragmatic

Keeping `can()` resolution local while offloading high-write wallet data to the cloud is the right tradeoff. The SQLite longevity argument is compelling — developers shouldn't need Postgres just because their access system generates usage data.
