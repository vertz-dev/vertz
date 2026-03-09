# Re-Review: Access Redesign
**Reviewer:** josh (DX)
**Date:** 2026-03-09

## Original Blockers

### B1. The full example is doing too much, too soon — ✅ Addressed

The doc now opens with a dedicated **Quickstart** section: 15 lines of code, just `entities` + `entitlements` + `inherits`, no plans, no limits, no billing. The sentence "That's the minimum viable config. Add plans and limits later when you need billing. Everything below builds on this foundation." is exactly the progressive disclosure framing I asked for. The full 195-line example is positioned after the quickstart as "Full example" under API Surface, which is the right placement. A developer sees the simple version first and only scrolls into complexity when they're ready.

### B2. `gates` is confusing and the relationship is backwards — ⚠️ Partially addressed

The doc now includes an explanation: "The name 'gates' means 'this limit gates (controls passage through) this entitlement.'" and a rationale for choosing `gates` over `guards`/`controls`. This is better than the original — at least a developer reading the design section will understand the intent.

However, the core DX concern is not fully resolved. The rationale section argues for keeping `gates` but doesn't address the discoverability issue: when a developer defines `'prompt:create'`, they still have to scan every plan's limits section to find which limits gate it. There's no cross-reference, no `--explain` tooling mentioned, and no reverse-lookup API (like `access.whatLimits('prompt:create')`). The direction (limits point at entitlements) is a reasonable design choice, but the doc should at least acknowledge that discoverability is a tradeoff and point to a future solution (e.g., a diagnostic helper or dev-time report).

The word `gates` itself — I still think `guards` or `blocks` would be more intuitive for a broader audience, but the rationale is now stated and defensible. I won't block on naming preference alone. The missing reverse-lookup discoverability is the remaining gap.

### B3. `_per_{entity}` naming convention is fragile — ✅ Addressed

Fully addressed. The doc now uses an explicit `scope` field on limits:

```ts
prompts_per_brand: { max: 5, gates: 'prompt:create', scope: 'brand' },
```

The key changes section confirms: "Limit scoping — Explicit `scope` field (not string parsing)". The limit key (`prompts_per_brand`) is now just a descriptive identifier — the framework reads `scope` to determine counting scope. Validation rule #14 confirms `scope` must reference a defined entity. This is exactly the fix I asked for: structured, typed, autocompletable.

## Original Should-Fix

### S1. Entitlement callback `(r) => ({...})` needs more explanation — ✅ Addressed

The doc now has a dedicated "Entitlement definition formats" section that explicitly shows the two forms (object vs callback), explains when to use each, and includes a type-safety subsection ("Callback `r` type safety — schema generic") showing the full type flow from schema to `r.where()`. The type connection is clear: `r` is typed to the entity's model via the schema generic, `r.where()` autocompletes columns, and there's a compile-time error example for invalid columns. The `r.user` type question isn't explicitly answered (what properties does it have?), but the overall explanation is substantially improved.

### S2. Plan groups — the mental model isn't explained — ⚠️ Partially addressed

The doc now clarifies: "All base plans must have a `group`. Plans without a `group` are allowed only when `addOn: true`." And: "Switching from `pro_monthly` to `pro_yearly` replaces within the `main` group."

But my original question remains unanswered: "When would I have multiple groups?" There's no multi-group example. A developer with both a base platform plan and an AI tier plan (two independent plan axes) would wonder if that's the use case for groups, but the doc only ever shows `group: 'main'`. A single sentence like "Most apps only need one group. Use multiple groups when a tenant can hold two independent plan axes simultaneously (e.g., `group: 'platform'` + `group: 'ai'`)." would close this gap.

### S3. Grandfathering default behavior will surprise developers — ⚠️ Partially addressed

The doc now explains the default clearly: "Default matches the billing cycle. Monthly plans get 1 month grace, yearly plans get 3 months." And provides a rationale: "Early-stage companies iterate fast — pricing changes are expected and acceptable with reasonable notice."

However, the doc does NOT mention any deploy-time warning or notification when plan changes will affect existing tenants. My original concern was: "Most developers won't read the grandfathering section until they've already deployed a plan change." The framework emits `plan:version_created` and `plan:grace_approaching` events (good), but there's no deploy-time warning surfaced to the developer during `defineAccess()` initialization or CLI output. The events are passive — the developer has to subscribe to them. A loud deploy-time log like "[access] Plan pro_monthly changed. 47 tenants will be migrated in 30 days." would make this safe by default.

Not blocking, since the events exist and the default is documented, but the deploy-time visibility gap could cause real surprises.

### S4. Add-ons are visually nested inside `plans` but syntactically broken — ✅ Addressed

The full example now clearly shows add-ons inside the `plans` object with a visual separator comment (`// -- Add-ons --`) and proper indentation. The "Add-ons" design section explicitly states: "Add-ons are plans with `addOn: true`. They are defined in the same `plans` object as base plans." Validation rule #18 confirms: "Base plans must have a `group`. Add-ons must NOT have a `group`." The structural ambiguity is resolved — add-ons are in `plans`, discriminated by `addOn: true`, and the doc is clear about it.

I still think a separate `addOns` top-level key would be cleaner, but the doc now has a defensible position with clear validation. Not blocking.

### S5. `max: -1` for unlimited is a code smell — ❌ Still open

The doc still uses `max: -1` throughout. The validation section codifies it: "`-1` (unlimited) and `0` (disabled) are valid. Negative values other than `-1` are invalid." But there's no acknowledgment of the DX concern. No `Infinity` alternative, no `unlimited: true` shorthand, no discussion of why `-1` was chosen over more explicit alternatives.

The original concern stands: `max: -1` is a magic number. A developer writing `if (limit.max > 0)` will accidentally block unlimited plans. An LLM will not reliably know that `-1` means unlimited. This is a real footgun in a TypeScript-first framework that values explicitness.

This was a should-fix, not a blocker, but it was not addressed at all — not even with a rationale for keeping `-1`.

### S6. The `can()` resolution flow buries practical error handling — ❌ Still open

The `can()` resolution flow section still shows only the internal evaluation order. There is no practical error-handling example showing how a developer would use the `reasons` array or `reason` field in their application code. The denial reason types are listed (`'plan_required'`, `'limit_reached'`, `'role_required'`, etc.), but there's no copy-pasteable `switch (result.reason)` pattern showing how to map denials to user-facing actions.

My original request was a concrete example:
```ts
if (!result.allowed) {
  switch (result.reason) {
    case 'plan_required': return showUpgradePrompt();
    case 'limit_reached': return showLimitWarning(result.meta);
    case 'role_required': return show403();
  }
}
```

This is the code developers will actually write. The doc describes the resolution order beautifully but never shows the consumption side.

### S7. Too many concepts introduced simultaneously — ⚠️ Partially addressed

The quickstart (B1 fix) helps significantly here — a developer now sees only `entities` + `entitlements` first. The doc's structure is progressive.

However, there's still no explicit "concept map" or "what's required vs opt-in" section. The doc doesn't say: "For simple RBAC, you need only `entities` and `entitlements`. Plans, limits, billing, overrides, add-ons, and grandfathering are all opt-in." A developer scanning the table of contents still sees all 10+ concept groups at once. A two-sentence callout after the quickstart would help: "The quickstart is all you need for RBAC. Every section below adds an opt-in capability."

### S8. No error message examples — ⚠️ Partially addressed

The doc now includes one concrete error message example in validation rule #21 (inheritance direction): "Inheritance is defined on the child entity. Move `'organization:admin': 'editor'` to team.inherits." This is good — it shows the framework gives actionable guidance, not generic errors.

But there are 21 validation rules and only one has an example error message. The most common mistakes (typo in entity name, role not found in entity, invalid limit scope) still have no example messages. Even a brief statement like "All validation errors include the offending key, available alternatives, and a suggestion (e.g., 'Did you mean X?')" would set the DX expectation.

## New Issues Found

### N-new-1. `r.where()` runtime behavior is silently wrong

The doc says: "If a condition references a field that doesn't exist on the entity, it evaluates to `false` (no match) — not an error." This means if a developer has a typo in `r.where({ cretedBy: r.user.id })` and doesn't use the schema generic, the rule silently never matches and the entitlement is always denied for attribute-based checks. No error, no warning, no log. The developer will spend hours debugging why their delete permission doesn't work.

This is mitigated when the schema generic is used (compile-time error), but the doc explicitly says the schema generic is opt-in. The silent-false fallback for the non-generic path should at least emit a dev-mode warning.

### N-new-2. `canBatch()` only works for a single entitlement

The doc says: "For checking multiple entitlements on a single entity, call `can()` multiple times — the preloaded context makes this cheap." But a common UI pattern is: render a list of items where each item has edit/delete/export buttons, and you need to check 3 entitlements per item across 50 items. That's 150 `can()` calls. The doc should acknowledge this pattern and clarify whether `can()` calls within a preloaded context are truly cheap (no extra queries) or if a multi-entitlement batch API is planned.

## Verdict: APPROVED

The three original blockers are resolved (B1 fully, B2 substantively, B3 fully). The structured `scope` field and quickstart are exactly what was needed. The should-fix items are a mixed bag — S4 fully addressed, S1 mostly addressed, S2/S3/S7/S8 partially addressed, S5/S6 not addressed. But none of the remaining gaps are blockers for implementation — they're documentation and polish items that can be addressed during or after implementation.

The design is solid. Ship it.
