# Re-Review: Access Redesign

**Reviewer:** ava (quality/testing)
**Date:** 2026-03-09

---

## Original Blockers

### B1. No migration plan from current `defineAccess()` API -- ADDRESSED

The design doc now has a dedicated "Migration from Current API" section (lines 294-338). It explicitly states: "Hard break. All packages are pre-v1 with no external users. [...] the old `defineAccess()` shape [...] is removed entirely. All existing tests (40+ in `packages/server/src/auth/__tests__/` and 28+ integration tests) are rewritten as part of the implementation." It includes a before/after code example and key migration notes (lowercase entity names, entity-scoped roles, hierarchy inference, `canAll()` replaced by `canBatch()`). This is exactly what was needed -- clear, unambiguous, actionable.

### B2. Entitlement roles validation against entity scope is underspecified -- ADDRESSED

The design doc now has an explicit "Entitlement roles are entity-scoped" section (lines 371-383) with valid/invalid examples. Validation rule #10 states: "Entitlement roles must all exist in the referenced entity's `roles` list -- no cross-entity roles." The migration notes explicitly say: "Entitlement roles must belong to the referenced entity (no cross-entity roles in entitlements -- use inheritance)." The old test pattern `'project:create': { roles: ['admin', 'owner'] }` is addressed in the migration example, where it becomes `'organization:create-project': { roles: ['admin', 'owner'] }` -- the entitlement is moved to the correct entity. This resolves the contradiction cleanly.

### B3. `inherits` direction change breaks mental model without clear error guidance -- ADDRESSED

Validation rules #20 and #21 (lines 726-727) now cover this explicitly. Rule #20 validates direction: "inherits keys must reference an ancestor entity [...] not a descendant or sibling." Rule #21 provides specific error guidance: "when a developer accidentally uses the old direction [...] the error message explicitly says: 'Inheritance is defined on the child entity. Move `'organization:admin': 'editor'` to team.inherits.'" This is exactly the kind of developer-facing error message I was asking for.

### B4. Hierarchy inference from DB schema is unspecified -- ADDRESSED

The design doc now has a detailed "Hierarchy -- inferred from `inherits` declarations" section (lines 342-369) with a concrete inference algorithm: parse `inherits` keys, extract parent-child edges, build a directed graph, topologically sort. The hierarchy is NOT inferred from the DB schema as originally stated -- it is inferred from the `inherits` config within `defineAccess()` itself. This is a much cleaner design. The section also addresses standalone entities (no `inherits`, not referenced by others), closure store consistency validation at runtime, and the explicit hierarchy depth limit (rule #6, max 4 levels). Rule #5 additionally validates that each entity can have at most one parent entity, preventing ambiguous multi-parent hierarchies.

### B5. Limit `gates` field is new and breaks existing limit shape -- ADDRESSED

The migration section (line 296) acknowledges the hard break for all shapes. The design doc now fully specifies: limit scoping via structured `scope` field (lines 461-479), multi-limit resolution (lines 481-499 -- ALL limits must pass), `canAndConsume()` atomic semantics with multiple limits (line 499), limit windows (lines 501-517) including `per` as optional (omitted = lifetime cap), and special values `max: -1` (unlimited) and `max: 0` (disabled, line 515-516). The wallet keying change (entitlement name to limit name with `gates`) is clearly specified throughout, and the multi-limit consumption atomicity is explicitly stated.

---

## Original Should-Fix

### S1. Validation rules are missing several important cases -- ADDRESSED

The updated validation rules now cover all 10 cases I raised:

1. Duplicate roles: Rule #7 (line 704) -- validation error.
2. Empty roles: Rule #8 (line 705) -- valid, entity participates in hierarchy but can't be role-assigned.
3. Self-referencing inheritance: Rule #3 (line 700) -- explicitly invalid.
4. Circular inheritance: Rule #4 (line 701) -- must be a DAG.
5. Entitlement with empty roles AND callback: Not explicitly addressed as a separate rule, but the union type (`EntitlementDef | callback`) and OR semantics (line 688-692) make it clear -- empty `roles` + rules from callback are OR'd, so only rules need to match. Acceptable.
6. Multiple limits gating same entitlement: Lines 481-499, explicit "ALL must pass" semantics with per-limit denial metadata.
7. Add-on features referencing entitlements no base plan includes: Line 565 -- "Add-on features do NOT need to exist in any base plan." Explicitly valid with reasoning.
8. `defaultPlan` referencing an add-on: Rule #15 (line 718) -- "must reference a defined base plan (not an add-on)."
9. Plan with `addOn: true` AND a `group`: Rule #18 (line 721) -- "Base plans must have a `group`. Add-ons must NOT have a `group`." This makes the distinction unambiguous.
10. `limit.max: 0`: Line 515 and rule #19 (line 722) -- valid, means "zero capacity." Negative values other than `-1` are invalid.

### S2. Override edge cases are unspecified -- ADDRESSED

The "Override edge cases" table (lines 1139-1149) now explicitly covers all 6 scenarios I raised:

1. Override nonexistent limit: validation error.
2. Negative `add`: valid, reduces effective limit.
3. `max: -1`: valid, overrides to unlimited.
4. `max: 0`: valid, hard blocks. Negative max other than `-1`: invalid.
5. Both `add` and `max`: `max` wins, both stored, removing `max` reveals `add`.
6. Feature override for nonexistent entitlement: validation error.

This is thorough and precise.

### S3. Grandfathering system testability -- ADDRESSED

The "Grandfathering testability" section (lines 874-898) addresses all 4 concerns:

1. Config simulation: call `defineAccess()` with different configs, call `initialize()` to simulate deploy-time version detection. Concrete code example provided.
2. Time travel: clock injection via `clock: () => new Date('2027-01-16')` parameter on `defineAccess()`. Clear and testable.
3. `access.plans.migrate()` location: line 863 explicitly states `defineAccess()` returns an `AccessDefinition` object with a `plans` property providing the runtime API.
4. Version hash determinism: line 804 specifies SHA-256 of canonical JSON with sorted keys via `JSON.stringify` with sorted replacer. Deterministic and testable.

### S4. Cloud/local split has no local testing story -- ADDRESSED

Line 1354: "Everything falls back to local DB. [...] All cloud features have `InMemory` implementations for testing -- no cloud dependency required to run the full test suite." Lines 1234: "In test/dev environments (using InMemory stores), overage is tracked but not billed." Line 898: "InMemoryPlanVersionStore, InMemoryGrandfatheringStore, InMemoryWalletStore are provided for testing." This covers the three specific concerns I raised (test suite locality, overage testing, grandfathering testing).

### S5. Performance claim "3-4 queries for batch of 50" needs verification criteria -- ADDRESSED

The "Performance verification" section (lines 1012-1019) provides concrete verification:

1. Batch closure store API: `getAncestorsBatch()` -- explicitly noted as not existing yet, part of implementation.
2. Batch wallet API: `checkBatch()` -- specified.
3. Integration benchmark: test that instruments stores and asserts `<= 4` queries for 50 entities.
4. Fallback: "If the batch APIs prove infeasible, the claim will be revised and documented with actual measured query counts."

This is honest and verifiable. The claim is no longer unbacked.

### S6. Callback entitlement `r` context type safety is hand-waved -- ADDRESSED

The "Callback `r` type safety -- schema generic" section (lines 389-426) now provides:

- Concrete schema generic usage: `defineAccess<typeof schema>({...})`
- Full type flow chain: `schema -> defineAccess<S> -> entitlement key prefix -> S['task'] -> RuleContext<S['task']> -> r.where() accepts Record<keyof S['task']['columns'], ...>`
- Compile-time vs runtime distinction: compile-time column validation via TypeScript generic, no runtime column validation, invalid columns evaluate to `false` at runtime.
- Opt-in degradation: without schema generic, `r.where()` accepts `Record<string, unknown>`.

This transforms the feature from vaporware to a concrete, implementable type flow. Still needs `.test-d.ts` validation during implementation, but the design is sufficient.

### S7. `canBatch()` vs `canAll()` naming confusion -- ADDRESSED

Line 338: "`canAll()` is replaced by `canBatch()`." Lines 948-949: "`canAll()` is removed. `canBatch()` is its replacement with proper batch semantics." Before/after code example with `// OLD -- removed` annotation. Unambiguous.

### S8. Add-on `one_off` price interval semantics with limits -- ADDRESSED

The "One-off add-on semantics" section (lines 567-585) explicitly answers all 4 questions:

1. Lifetime addition -- permanent increase, does not reset with billing period.
2. Independent of base plan's `per` -- the +50 is applied on top and persists indefinitely.
3. Stackable -- multiple purchases allowed, 2x = +100. Each creates a separate assignment.
4. Persists across plan changes -- tied to tenant, not the plan.

Additionally specifies FIFO consumption order (base periodic allocation first, then add-on oldest first). Recurring add-ons follow base plan reset behavior. This is thorough.

---

## New Issues Found

### N-NEW-1. `inherits` multi-parent validation may be too restrictive

Validation rule #5 (line 702) says: "All sources in a single entity's `inherits` must reference the same parent entity." This prevents patterns like:

```ts
project: {
  inherits: {
    'team:lead': 'manager',
    'organization:admin': 'manager',  // invalid -- two parent entities
  },
}
```

But this is a reasonable real-world pattern: an org admin should have access to all projects regardless of team. The current workaround is to chain through team (`org:admin -> team:lead -> project:manager`), which works but requires the team->project inheritance to be set up even if the access grant is conceptually org->project. This is a design tradeoff, not a bug, but worth flagging as a potential DX friction point during implementation. The transitive chain is the intended escape hatch and is documented, so this is minor.

### N-NEW-2. No specification for `scope` entity in `can()` call

The multi-limit section (line 492) shows `can('prompt:create', { entity: prompt, scope: { brand: 'brand-1' } })`. But the second parameter to `can()` currently only accepts `{ entity }`. The `scope` parameter for scoped limit resolution is new and not reflected in the TypeScript signature or type flow map. During implementation, the `can()` API surface needs to be updated to accept this optional `scope` parameter, and the type flow map should show how the scope entity type is validated.

### N-NEW-3. Event naming is now consistent but `billing:payment_failed` vs webhook `invoice.payment_failed` mapping needs care

The event naming convention (line 1272) uses `category:action` format. The webhook table (line 1250) maps Stripe's `invoice.payment_failed` to `billing:payment_failed`. But the developer hooks section (line 1263) uses `billing:payment_failed`. Consistent within the framework, but the Stripe event name mismatch (dot vs colon separator) could confuse developers reading both Stripe docs and Vertz docs. This is cosmetic -- the framework handles the translation in the webhook handler.

---

## Verdict: APPROVED

All 5 original blockers are resolved. All 8 original should-fix items are addressed. The new issues found are minor (design tradeoff acknowledgment, a missing type flow detail for `scope`, and cosmetic naming) -- none rise to blocker level. The design doc is now comprehensive enough to implement against with confidence.
