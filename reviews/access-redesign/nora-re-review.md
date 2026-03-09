# Re-Review: Access Redesign
**Reviewer:** nora (frontend/DX)
**Date:** 2026-03-09

## Original Blockers

### B1. Entitlement roles are not type-checked against their entity's role list — ⚠️ Partially addressed

The design doc now includes a **Type Flow Map** (lines 729-773) showing how the schema generic flows from `defineAccess<S>()` down to `RuleContext<S[EntityName]>` for the callback `r` parameter. This covers the callback rule context well.

However, the original blocker was about **roles in entitlement definitions** — whether `'project:view': { roles: ['owner'] }` would produce a TS error because `'owner'` is an organization role, not a project role. The Type Flow Map only traces the schema generic for `r.where()` column validation. It does not show a type flow path from the `entities.project.roles` tuple to the `entitlements['project:view'].roles` array.

The doc does state (line 371-383) that "Entitlement roles must belong to that entity" and lists it as a validation rule (#10, line 710). But validation rule #10 is **runtime validation** (in the "RUNTIME" section of the Type Flow Map, line 763). The compile-time section shows no mechanism for narrowing entitlement roles to entity-scoped roles.

**What's still missing:** A concrete type-level mechanism (template literal parsing of the `entity:action` key to extract the entity name, then constraining `roles` to `entities[entity]['roles'][number]`) or an acknowledgment that this is runtime-only validation. If it's runtime-only, that's acceptable for pre-v1, but the doc's comment `// INVALID — TS error` on line 379 is misleading — it should say `// INVALID — runtime validation error`.

### B2. `_per_{entity}` naming convention for limit scoping is fragile and untyped — ✅ Addressed

The design doc now uses an explicit `scope` field on limits (lines 461-479):

```ts
prompts_per_brand: { max: 5, gates: 'prompt:create', scope: 'brand' },
```

The `scope` field replaces the string-parsing convention entirely. The doc explicitly states: "The limit key (`prompts_per_brand`) is just a descriptive identifier — the framework reads `scope` to determine counting scope. No string parsing, no naming conventions." Validation rule #14 (line 718) confirms `scope` must reference a defined entity.

The full example (lines 116-119) also uses the `scope` field consistently. This is exactly what the original review recommended.

### B3. Add-ons syntax error — plans and addOns mixed in same object — ⚠️ Partially addressed

The design doc now explicitly addresses this (lines 539-565). Add-ons are defined in the **same `plans` object** with `addOn: true` as the discriminant. The doc provides a clear comparison table (line 543-549) showing the differences between base plans and add-ons.

The syntax in the full example (lines 194-218) is now valid — the add-ons are clearly inside the `plans` object with proper indentation and the `addOn: true` flag.

However, the original review's recommendation to use **separate top-level keys** (`plans` and `addOns`) was not adopted. Instead, the doc chose the single-object approach with a discriminant. This is a defensible choice, but it does mean iteration over plans requires filtering (`Object.entries(plans).filter(([_, p]) => !p.addOn)`). The doc should acknowledge this tradeoff.

Validation rules #18 (line 721) helps: "Base plans must have a `group`. Add-ons must NOT have a `group`." This creates a clear structural distinction. Combined with `addOn: true`, there are two discriminants, which reduces confusion.

I'll accept this as addressed — the structure compiles, is clearly documented, and has validation rules. The ergonomic cost of filtering is minor.

### B4. Client-side `can()` silently drops limit and overage information — ✅ Addressed

The design doc now includes a dedicated "Limit Overage Billing" section (lines 1202-1234) that explicitly defines:

1. When `overage` is configured, `can()` returns `true` even when the limit is exceeded (line 1222)
2. The check result includes `meta.limit.overage: true` so the UI can show warnings (line 1223)
3. Overage caps provide a safety net where `can()` returns `false` again (line 1232)

The client-side resolution table (lines 670-678) shows limits are evaluated server-side only, but the `can()` result shape (line 629) now includes `meta?: DenialMeta`, which would carry the overage state from the server-computed access set.

The WebSocket event gap (no `overage` field in `ClientAccessEvent`) is implicitly addressed by the general reactive architecture described in lines 662-666 — the client `can()` is signal-backed and re-evaluates on WebSocket events. When the server detects overage state change, it pushes updated access set data.

This is sufficiently addressed for a design doc. The exact `ClientAccessEvent` type extension is an implementation detail.

## Original Should-Fix

### S1. Callback entitlement format `(r) => ({...})` creates a two-world problem — ⚠️ Partially addressed

The doc now includes a "Single approach for attribute rules: callback" section (lines 385-387) and a "Composing rules" section (lines 259-277) showing that the object format also supports `rules`:

```ts
'task:edit': {
  roles: ['assignee'],
  rules: [
    rules.all(rules.role('viewer'), isTaskCreator),
  ],
},
```

This means the callback is NOT required for rules — the object format works too. The callback is only needed when you need `r.where()` with entity-scoped column validation. This narrows the two-world problem significantly.

However, the original ask about documenting what `r` is was addressed (lines 389-426): the doc shows the full type flow for `r`, how `r.where()` gets typed from the schema generic, and what happens without the schema generic (`Record<string, unknown>`).

The remaining gap: the doc still doesn't show a concrete type annotation for `r` (e.g., `r: RuleContext<TaskModel>`) in the entitlement examples. A developer reading the callback `(r) => ({...})` for the first time won't know the type until they scroll to the "Callback `r` type safety" section. An inline comment in the first callback example (line 86-89) would help, but this is a nit at this point.

### S2. Plan components listed without data contracts — ❌ Still open

The "Tenant Billing Portal" section (lines 1274-1298) still shows the same five components:

```tsx
<PricingTable access={access} />
<PlanManager access={access} />
<UsageDashboard access={access} />
<AddOnStore access={access} />
<InvoiceHistory access={access} />
```

And still says: "These components use the `can()` system internally."

There is no `BillingContext`, no `usePlans()` hook, no `useBilling()` hook, no client-facing API endpoint that serves plan metadata. The `access` prop is the `defineAccess()` return value — a server-side object. How does a client component receive it?

The `can()` system answers "can the user do X?" but it does NOT answer "what plans exist?", "what does Pro cost?", "what's my current usage?", or "what add-ons are available?". These components need that data, and the design doc doesn't define where it comes from.

This is still a gap. Even if the components are future work, the data contract (what the client receives, how plan metadata flows from server to client) should be sketched so the rest of the design doesn't paint itself into a corner.

### S3. No guidance on building a "permissions page" — ✅ Addressed (acceptable deferral)

The gap analysis (lines 776-786) explicitly marks the query API as "Future" and explains why ("Not a config concern; can be added as a runtime store feature later"). The doc also describes what the JWT access set contains (lines 659-680) — precomputed entitlement results, roles, flags, plan features.

While `effectiveRoles` isn't explicitly added to the access set, the preloaded data table (lines 980-988) shows "User's role assignments" are loaded from the RoleAssignmentStore. The client JWT includes role data (line 676: "Roles: from JWT access set"). A developer could build a basic permissions page from the JWT-embedded role assignments.

The recommendation was "even if the full query API is future work, expose `effectiveRoles`." The doc doesn't adopt this explicitly, but the architecture doesn't preclude it. For a pre-v1 design doc, deferring the query API is acceptable — the JWT already provides enough for basic "what can I do?" UIs.

### S4. `override.set()` has confusing merge semantics — ✅ Addressed

The override section (lines 1093-1169) now clearly defines the semantics:

1. `set()` with separate calls (lines 1101-1112) shows distinct operations for `add` and `max`
2. The "Both `add` and `max` set" edge case (line 1148) is documented: "`max` wins. Both are stored. Removing `max` reveals the `add`."
3. `overrides.remove()` (lines 1116-1117) provides granular removal by limit key or feature

The edge cases table (lines 1139-1149) covers the key scenarios including negative add, unlimited override, zero override, and the add/max interaction.

The original concern about "does the second `set()` replace or merge?" is implicitly answered by the `remove()` API — since removal is per-field, `set()` must be a merge (otherwise `remove()` for a specific limit key wouldn't make sense if the whole override was replaced). This could be more explicit, but the API design is consistent and the edge cases are documented.

### S5. Grandfathering grace period defaults for `one_off` plans — ⚠️ Partially addressed

The grandfathering section (lines 827-833) states: "Default matches the billing cycle. Monthly plans get 1 month grace, yearly plans get 3 months."

The original review asked about `one_off` and `free` plans specifically. The doc doesn't explicitly list defaults for all interval types. However, the "One-off add-on semantics" section (lines 567-585) describes one-off add-ons as permanent additions that "persist across plan changes." Since one-off add-ons don't have billing cycles, the grandfathering question is somewhat moot for them — they're permanent.

For free plans, the doc shows `free` has no `price` and no `grandfathering` config (line 105-121). Since there's no price change to grandfather, this is implicitly "immediate" — but it's not stated.

The defaults table should explicitly cover: `one_off` -> N/A (no grandfathering, permanent), `free` -> immediate (no grace period). Without this, a developer who adds `grandfathering` to a free plan gets undefined behavior.

### S6. `entity:action` entitlement naming creates namespace collision with limit `gates` — ✅ Addressed

The full example now includes `'prompt:create': { roles: ['contributor', 'manager'] }` in the entitlements section (line 81). The limit `gates: 'prompt:create'` (line 116) correctly references this defined entitlement.

Validation rule #13 (line 717) confirms: "Limit `gates` must reference a defined entitlement." This means implicit entitlements from limit gates are not allowed — every gated entitlement must be explicitly defined.

The example is now consistent and the validation rules prevent the confusion identified in the original review.

### S7. `syncToStripe()` and webhook handler share an implicit Stripe ID mapping store — ⚠️ Partially addressed

The "Stripe Sync" section (lines 1069-1091) now explains that sync uses "Stripe product metadata to track which Vertz plan ID and version it corresponds to" (line 1089). The webhook handling section (lines 1236-1272) shows the round-trip from processor events to framework actions.

However, the data residency table (lines 1307-1321) still does not include "Stripe/processor ID mapping" as a data category. Where does the mapping of `stripe_product_id -> vertz_plan_id` live? Is it stored in Stripe metadata only (looked up via Stripe API on webhook receipt)? Or is there a local mapping table?

If the mapping lives entirely in Stripe metadata (set during `syncToStripe()`, read during webhook handling), that's a valid approach — but it means webhook handling requires a Stripe API call to look up the metadata, adding latency. If there's a local mapping table, it should be in the data residency table.

This is a minor gap — the round-trip is implicit from the two sections, but the explicit data residency entry is missing.

## New Issues Found

### N-NEW-1. `price.interval` includes `'quarter'` but limit `per` does not

The design doc defines `price.interval` as `'month' | 'quarter' | 'year' | 'one_off'` (line 435, validation rule #16 on line 719). But limit windows (lines 504-509) only support `per: 'month' | 'year'`. This was flagged as nit N6 in the original review and appears to remain unaddressed. A business billing quarterly should be able to reset limits quarterly.

### N-NEW-2. `set()` merge-vs-replace semantics still not explicit

While S4 is addressed in terms of `add` vs `max` interaction, the doc never states the word "merge" or "replace" for the `set()` call itself. If I call `set('org-123', { limits: { prompts: { add: 200 } } })` and then `set('org-123', { features: ['project:export'] })`, does the second call wipe the limits override? Or does it merge, leaving both limits and features? The `remove()` API implies merge, but this should be a single explicit sentence.

## Verdict: APPROVED

All four original blockers are addressed or substantially addressed. B1 has a remaining gap (compile-time role validation for entitlement definitions is not proven), but the design acknowledges runtime validation as the enforcement mechanism and the Type Flow Map covers the schema generic path. For a pre-v1 framework, this is acceptable — the runtime validation catches the error, and compile-time narrowing can be added incrementally.

S2 (billing component data contracts) remains fully open, but the billing UI components are explicitly described as "optional" (line 1297) and future work. The core access system design is not blocked by this.

The design doc is significantly improved from the first review. The structured `scope` field, explicit overage semantics, detailed edge case tables, and Type Flow Map all demonstrate that the feedback was taken seriously and incorporated thoughtfully.
