# Re-Review: Access Redesign

**Reviewer:** mike (architecture)
**Date:** 2026-03-09
**Artifact:** `plans/access-redesign.md` (updated)

---

## Original Blockers

### B1. `canAndConsume()` is NOT atomic and the doc knows it but hand-waves it — ✅ Addressed

The updated doc (lines 1058-1067) now explicitly describes the resolution as a two-phase operation: (1) evaluate all non-limit layers first with fail-fast, (2) advisory limit check, (3) CAS atomic consume. The doc correctly states "the check in step 2 is advisory — the atomic step in 3 is the source of truth" and "the framework never over-grants." This is the right framing — the CAS is the authoritative gate, not the pre-check. The authorization race (role revoked between check and consume) remains a theoretical window, but the doc's position is clear: the CAS prevents over-consumption, and the worst case is a denied user consuming one credit that can be reconciled. This is a conscious, documented tradeoff. Acceptable.

### B2. Config hashing for plan versioning is under-specified and fragile — ✅ Addressed

The updated doc (lines 804) now specifies: (a) SHA-256 hash algorithm, (b) canonical JSON with sorted keys via `JSON.stringify` with sorted replacer, (c) only `{ features, limits, price }` are included — `title` and `description` are explicitly excluded (lines 930-940). The rollback scenario is implicitly addressed by the hash-based deduplication — deploying an old config produces the same hash, so no new version is created (the hash already exists). This could be more explicit, but the mechanism is sound. The "which fields are versioned" question is clearly answered. Satisfied.

### B3. The design is too large for a single implementation — no phasing — ⚠️ Partially addressed

The "Open — to define later" section (line 1387) now includes "Implementation phases — to be broken down before implementation begins." This acknowledges the problem and defers phasing to pre-implementation. However, my original blocker requested the phasing be IN the design doc, not deferred. The reason: without phases, reviewers cannot verify that each phase delivers a usable vertical slice (per the project's design-and-planning rules). The doc is 1388 lines covering entities, plans, versioning, billing, Stripe, webhooks, overrides, add-ons, UI components, and cloud storage. Saying "we'll phase it later" means the phasing will happen without architectural review.

**What's still missing:** At minimum, a rough phase outline (Phase 1 = entity restructuring + entitlements, Phase 2 = plans + limits, Phase 3 = versioning + grandfathering, Phase 4 = billing/Stripe, etc.) with dependency arrows. The detailed acceptance criteria can come later, but the architectural boundaries need to be here so reviewers can validate the slicing.

### B4. Inheritance direction change is a silent semantic inversion — ✅ Addressed

The updated doc now has a dedicated "Hierarchy — inferred from `inherits` declarations" section (lines 342-369) that specifies the inference algorithm: (1) parse all `inherits` keys, (2) extract parent-child edges, (3) build directed graph, (4) topological sort, (5) validate linear chains. The validation rules section (lines 694-727) adds: rule 3 (no self-referencing), rule 4 (no circular inheritance — DAG requirement), rule 5 (linear chains only — one parent per entity), and rule 20 (direction validation — inherits must reference ancestors, not descendants). Rule 21 provides error guidance for developers accidentally using the old direction. The resolution algorithm change is well-documented.

---

## Original Should-Fix

### S1. Cloud wallet + local roles = split-brain during cloud outage — ❌ Still open

The updated doc does not specify a failure mode for cloud wallet queries. The query flow diagram (lines 1362-1368) still shows `Limits → cloud (wallet API — single HTTP call, <50ms with edge)` without addressing what happens when that call fails. The "Open — to define later" section mentions "Multi-region cloud edge caching for wallet queries" but does not mention failure modes. The `<50ms with edge` claim is still unsubstantiated for non-edge deployments. A `cloud.failMode: 'open' | 'closed'` config (or equivalent) is still needed.

### S2. `_per_{entity}` naming convention is fragile — ✅ Addressed

The updated doc introduces a structured `scope` field (lines 461-479). Limit definitions now use `scope: 'brand'` instead of encoding the entity in the key name. The key changes table (line 291) explicitly calls out: "Limit scoping: Explicit `scope` field (not string parsing)." Validation rule 14 ensures `scope` references a defined entity. The key name (`prompts_per_brand`) is now purely descriptive — the framework reads `scope` for semantics. This is exactly what was recommended.

### S3. Hierarchy inferred from DB schema is under-specified — ✅ Addressed

The updated doc (lines 342-369) specifies that hierarchy is inferred from `inherits` declarations via topological sort — not from the DB schema. The inference algorithm is explicit: parse keys, extract edges, build graph, topo-sort, validate. The key changes table (line 284) confirms: "Hierarchy order: Inferred from `inherits` declarations." This replaces the vague "comes from the database schema" statement. The resolution algorithm has a concrete ordering to work with.

### S4. Overrides `add` vs `max` interaction is ambiguous with add-ons — ⚠️ Partially addressed

The updated doc (lines 1126-1148) specifies the resolution formula and the override edge cases table. The formula `Effective limits = plan.limits + addons.limits + overrides.limits` is stated. The `add` vs `max` behavior is clearer: `add` is additive on top of plan + add-ons, `max` replaces the computed total. The edge cases table covers negative add, unlimited override, and both-set precedence.

**What's still missing:** The concrete numeric walkthrough I requested. Given: plan base = 100, add-on = +50, override `add: 200` — is the result 350 (100+50+200) or 300 (100+200, ignoring add-on)? The formula says `plan.limits + addons.limits + overrides.limits`, which implies 100+50+200=350. But this should be spelled out with a concrete example showing each step. Similarly, if `max: 1000` is set, the result is 1000 — but does it replace plan+addons+add, or just plan+addons? The edge cases table says "Both `add` and `max` set: `max` wins" but this is about the same override, not the full stack. A 4-line pseudocode block would eliminate all ambiguity.

### S5. Grandfathering auto-migration has no rollback story — ⚠️ Partially addressed

The migration semantics section (lines 866-871) describes what happens on migration but does not address rollback. There is no `cancelSchedule()`, `rollback()`, or `revertMigration()` API. The `plan:migrated` event (line 909) is documented but the doc doesn't confirm whether it includes the old version for manual recovery. The `schedule()` API exists (line 845) but there's no `cancelSchedule()` counterpart. The "anti-patterns" section (line 927) says "instant forced migration" is discouraged, but there's no mechanism to undo a migration that turns out to be wrong.

**What's still missing:** Either (a) a `cancelSchedule()` API, or (b) an explicit statement that migration is irreversible and the `plan:migrated` event includes `previousVersion` and `previousSnapshot` so developers can manually revert via `access.plans.migrate('pro_monthly', { tenantId, toVersion: oldVersion })`. As-is, a buggy migration has no documented recovery path.

### S6. Stripe sync as push-only is incomplete — ⚠️ Partially addressed

The updated doc now has a separate "Webhook Handling" section (lines 1236-1272) that describes payment events flowing FROM the processor TO the framework. However, the Stripe Sync section (lines 1089-1091) still says: "This is a push operation, not a webhook listener. The framework pushes config to Stripe, not the other way around. Stripe is the source of truth for access." That last sentence contradicts the rest of the doc — Vertz is the source of truth for access, Stripe is the source of truth for payment/subscription state.

The webhook section (lines 1241-1253) correctly shows Stripe events triggering plan assignments, which is pull behavior. The two sections contradict each other. The doc needs to clarify: "Stripe Sync" = push of plan definitions, "Webhook Handling" = pull of subscription state. The sentence "Stripe is the source of truth for access" on line 1091 should be corrected — Stripe is the source of truth for *payments*, not access.

### S7. Missing: what happens when `r.where()` references columns not available at check time — ✅ Addressed

The updated doc (lines 389-426) explains the type flow for `r.where()`. The schema generic connects entity names to model types. The API surface shows `can('task:edit', { entity: task })` where `task` is the full entity object. Line 424 explicitly states: "If a condition references a field that doesn't exist on the entity, it evaluates to `false` (no match) — not an error." The compile-time vs runtime distinction is clear: TypeScript validates columns at compile time (with schema generic), runtime evaluates against whatever entity data is passed to `can()`. Without schema generic, `r.where()` accepts `Record<string, unknown>`. This is well-specified.

---

## New Issues Found

### N-new-1. "Open — to define later" list is load-bearing but untracked

The "Open" section (lines 1382-1388) lists four deferred items:
1. Rate limiting / abuse prevention
2. Multi-region cloud edge caching
3. Self-hosted cloud alternative
4. Implementation phases

Items 2 and 4 are blockers from this review (S1 depends on #2, B3 depends on #4). Listing them as "open" acknowledges them but doesn't commit to resolving them before implementation. At minimum, #4 (implementation phases) must be resolved before any code is written — it should not be in the "open" list, it should be a prerequisite.

### N-new-2. `canBatch()` signature constrains to single entitlement — limits batch-check use cases

`canBatch('task:edit', tasks)` only checks one entitlement across multiple entities. A common UI pattern is checking multiple entitlements for a single entity (e.g., showing edit/delete/export buttons on a row). The doc says "call `can()` multiple times — the preloaded context makes this cheap." This is true, but it means there's no batch API for the multi-entitlement case. Not a blocker, but worth noting — if a developer needs to check 5 entitlements × 50 entities, they'll call `can()` 250 times (fast due to preloading, but verbose). A `canMultiple([{entitlement, entity}])` could be useful later.

---

## Verdict: BLOCKED

Two items remain unresolved:

1. **B3 (phasing)** is deferred, not addressed. The design doc needs at minimum a rough phase outline with dependency arrows before implementation begins. This is a process requirement per the project's design-and-planning rules ("vertical slices — each phase usable end-to-end").

2. **S1 (cloud failure mode)** is completely unaddressed. The cloud/local split is a core architectural decision, and the failure mode for cloud wallet queries must be specified — even if the answer is "fail-closed, configurable later."

**To unblock:** Add a 10-line phase outline to the doc (detailed acceptance criteria can follow separately), and specify the default cloud failure mode with a 3-sentence paragraph. Neither requires significant design work — just documenting decisions that must be made regardless.
