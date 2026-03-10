# Product/Scope Review: VertzQL Automatic Field Selection

- **Reviewer:** pm (Product/Scope)
- **Date:** 2026-03-10
- **Verdict:** Approved with concerns

## Roadmap Fit

This feature sits squarely on Vertz's core value proposition: the compiler sees everything, so the developer writes nothing extra. The vision doc explicitly calls out "schema to database to API to client to UI" as the roadmap, and automatic field selection is the natural consequence of owning the full path. The entity-driven architecture (EDA) and entity store are already in progress; this closes the loop between "the UI knows which fields it reads" and "the API only sends those fields."

The timing is good. The prerequisites are in place:
- **SDK Query Integration** (design + implementation): Merged as PR #763. `QueryDescriptor` with `_key`, `_fetch`, `_entity` is working in `@vertz/fetch`.
- **Cross-File Reactivity Analysis** (design): Approved 2026-03-07. Layer 1 + Layer 2a merged as PR #995. Manifest generator merged as PR #1011. The manifest infrastructure that this design depends on is real, not theoretical.
- **FieldAccessAnalyzer + CrossComponentAnalyzer**: Both exist in `packages/compiler/src/analyzers/` with tests. These are standalone ts-morph analyzers, not yet wired into the compilation pipeline -- which is exactly the gap this design addresses.
- **VertzQL parser + field filter**: Working server-side infrastructure in `packages/server/src/entity/`.

This is a P1 feature and fits the current phase of work (building out the entity-driven full-stack story). No priority concerns.

## Scope Assessment

The scope is **almost right** but has one structural issue and a few edges that need tightening.

**What's well-scoped:**
- Limiting Phase 1 to flat field `select` only (no relations) is correct.
- Deferring production builds to Phase 4 is correct -- dev server first.
- The non-goals are appropriate (no manual API, no write-side narrowing, no cross-route aggregation).
- The "opaque access falls back gracefully" strategy is the right conservative default.

**What's concerning:**
- Phase 1 is described as "manifest generation" but has no user-visible behavior. It produces a JSON file. The developer can't see or verify that field selection is working until Phase 2. This violates the "thinnest possible E2E developer experience" principle -- see Phase Assessment below.
- The design depends on ts-morph for the pre-pass analyzer, but the existing MagicString-based compilation pipeline doesn't use ts-morph. This is a second analysis engine running alongside the first. The design acknowledges this ("Open Questions #1") but doesn't commit to a resolution. For a P1 feature, the performance and maintenance cost of running ts-morph at dev server startup needs a concrete answer, not a "needs POC."
- The `undefined` gap (Type Flow Map section) is a real footgun that contradicts "if it builds, it works." The design acknowledges this but defers mitigation entirely to Phase 2+. At minimum, Phase 1 should include the dev-mode runtime assertion in the entity store (log a warning when reading a non-selected field). Without it, developers will hit silent `undefined` bugs that TypeScript promised wouldn't happen.

## Concerns

### Blocking

1. **Phase 1 has no user-visible behavior -- it must be merged with Phase 2 or restructured.**

   The design doc's own principles say "if you can't demo it, it's not done." Phase 1 produces a `.vertz/field-selection.json` file. That's not demoable. The developer can't see field selection happening, can't verify it, can't benefit from it.

   The thinnest E2E slice is: "write a component that uses `query(api.users.list())` and accesses `user.name` in JSX. The compiled output includes `select: { id: true, name: true }`. The network request has fewer fields."

   **Recommendation:** Restructure Phase 1 to be "single-file field selection, no cross-component propagation." This means:
   - Run `FieldAccessAnalyzer` on the single file being compiled (inline in the Bun plugin, no separate pre-pass).
   - Inject `select` into the query descriptor call.
   - The developer sees narrowed API responses immediately.
   - Cross-component propagation (parent aggregates child's fields) becomes Phase 2.

   This is a smaller scope (single-file analysis is simpler than project-wide), gives a working feature in Phase 1, and defers the hard part (ts-morph pre-pass, incremental updates, cross-file graph) to Phase 2.

2. **No `encodeVertzQL` helper exists yet, and `createDescriptor` doesn't accept `select`.**

   The design says SDK methods will gain an `options` parameter with `select`, and there will be an `encodeVertzQL()` helper. Neither exists. This is implementation work that isn't accounted for in the phases. Phase 2 mentions "SDK codegen: Ensure list/get methods accept an optional `options` parameter" as a sub-bullet, but this is a significant change to `@vertz/fetch` (`createDescriptor` signature) and `@vertz/codegen` (SDK generator). It should be an explicit prerequisite or a clearly scoped sub-task within Phase 2, not a sub-bullet.

3. **Design doc is not in MAP.md.**

   The MAP.md is the central index. This design doc is not listed. It needs to be added under the appropriate section (likely "Entity Store & Client Reactivity" or a new "Compiler Optimizations" section).

### Should Fix

4. **The `undefined` gap needs a Phase 1 mitigation, not a Phase 2+ deferral.**

   The entity store already exists (`packages/ui/src/store/entity-store.ts`). Adding a dev-mode warning when reading a field that wasn't in the `select` set is low-effort and high-value. Without it, the first developer experience of field selection will be: "Why is `user.bio` undefined? TypeScript says it's a string." That's a terrible first impression for a feature that's supposed to be invisible.

   **Recommendation:** Add to Phase 2 (or the restructured Phase 1): entity store logs `[vertz] Field 'bio' was not included in the select for query 'GET:/users'. The field is undefined at runtime.` in dev mode.

5. **Performance Unknown #1 needs resolution before implementation, not during.**

   The design lists "Performance of ts-morph pre-pass on large projects" as needing a POC. But the implementation plan starts with Phase 1 using ts-morph. If the POC reveals ts-morph is too slow (>5s for 200 components), the architecture changes fundamentally. This unknown should be resolved as a prerequisite POC, not discovered during Phase 1 implementation.

   If the single-file restructuring from concern #1 is adopted, this becomes less urgent -- single-file analysis can use the existing MagicString AST or a lightweight parser, deferring the ts-morph question to the cross-component phase.

6. **Acceptance criteria for Phase 1 are not BDD-formatted.**

   Per the project's BDD Acceptance Criteria Guide (`.claude/rules/bdd-acceptance-criteria.md`), P1 issues should have Given/When/Then scenarios. The Phase 1 acceptance criteria are bullet points, not executable scenarios. An implementing agent would need to interpret "manifest correctly lists aggregated fields per query" into a concrete test.

7. **Interaction with entity store normalization is underspecified.**

   The entity store normalizes entities by `id`. When field selection is active, different queries for the same entity might select different field subsets. What happens when `entity-store.merge()` receives a partial entity (only `id`, `name`) and the store already has a full entity (all fields)? Does it overwrite with the partial? Shallow merge? The design should specify this -- it's a correctness concern, not an implementation detail.

### Nice to Have

8. **Consider a `// @vertz-no-select` escape hatch per-query.**

   The design correctly rejects a manual field selection API. But a per-query opt-out directive would be useful for debugging ("I want all fields for this query, even though the compiler thinks I only need three"). This is low priority but worth noting for future phases.

9. **The diagnostics endpoint (`/__vertz_diagnostics`) integration in Phase 5 could be pulled into Phase 2.**

   If the restructured Phase 1 produces working field selection, developers will want to know "which fields did the compiler select for my query?" Having the manifest data available via `/__vertz_diagnostics` from the start (even without the fancy dev overlay) is almost free and significantly helps debugging.

10. **Consider adding the design doc to the "Compiler" section in MAP.md**, not just "Entity Store & Client Reactivity." This feature spans the compiler, the Bun plugin, the SDK, and the server. A cross-cutting placement would be clearer.

## Phase Assessment

**Current phasing violates "thinnest E2E slice" principle.**

| Phase | Current | Concern |
|-------|---------|---------|
| Phase 1 | Manifest generation only | No user-visible behavior. Not demoable. |
| Phase 2 | Compile-time injection | This is where the feature actually starts working. |
| Phase 3 | Relation includes | Appropriate scope. Depends on entity schema at compile time. |
| Phase 4 | Production builds | Appropriate scope. |
| Phase 5 | Diagnostics | Appropriate scope but some pieces should be earlier. |

**Recommended restructuring:**

| Phase | Proposed | Rationale |
|-------|----------|-----------|
| Phase 1 | Single-file field selection (analyze + inject + round-trip) | Thinnest E2E: developer writes query, compiler narrows it, API responds with fewer fields. No cross-file. |
| Phase 2 | Cross-component propagation (manifest pre-pass + incremental) | Adds the ts-morph pre-pass for cross-component field aggregation. |
| Phase 3 | Relation includes | Unchanged. |
| Phase 4 | Production builds | Unchanged. |
| Phase 5 | Diagnostics | Unchanged, but pull `VERTZ_DEBUG=fields` into Phase 1. |

This restructuring means Phase 1 is demoable: "I wrote a component, the network tab shows only the fields I used." Phase 2 adds cross-component intelligence. Each phase is independently valuable.

**Phase 3 has an unresolved dependency:** Entity schema at compile time. The design's Open Question #2 asks "how do we make entity relation config available at compile time?" with three options but no decision. Phase 3 can't be implemented without resolving this. It should be marked as blocked on this decision.

## Questions for the Author

1. **Why start with manifest generation instead of single-file injection?** The FieldAccessAnalyzer already works on individual files. A single-file version that runs inline during compilation (no ts-morph pre-pass) would deliver a working feature in Phase 1. The cross-component propagation can be layered on top. What's the argument for needing the full manifest infrastructure before any `select` injection happens?

2. **What's the merge strategy for partial entities in the entity store?** If query A selects `{id, name}` and query B selects `{id, email}` for the same user, what does the store contain after both resolve? Shallow merge (`{id, name, email}`)? Last-write-wins (`{id, email}`, losing `name`)?

3. **Is the ts-morph performance POC blocking or not?** The design lists it as "needs POC" but the implementation plan uses ts-morph in Phase 1. If the POC shows ts-morph is too slow, the architecture needs to change. Should the POC be a Phase 0?

4. **How does this interact with HMR manifest updates (PR #1109)?** The recent `feat(ui-server): incremental HMR manifest updates` work added incremental manifest regeneration for the reactivity manifest. Does the field selection manifest piggyback on the same watcher infrastructure, or does it need its own update pipeline?

5. **What's the story for tests?** When a test renders a component with `query(api.users.list())`, will the compiler inject `select` in the test environment too? Or is field selection dev-server-only? The E2E acceptance test section shows tests that verify compiled output, but doesn't clarify whether the test runner uses the Bun plugin.
