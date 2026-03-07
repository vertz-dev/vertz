# PM Review: Cross-File Reactivity Analysis

**Reviewer:** pm (vertz-pm)
**Date:** 2026-03-07
**Design Doc:** `/plans/cross-file-reactivity-analysis.md`
**Verdict:** Conditional approval -- Layer 1 approved, Layer 2 has blocking items

---

## 1. Scope Assessment

### Layer 1 (callback fix) -- Scope is right

The "never wrap function definitions in `computed()`" rule is clean, narrow, and defensible. It fixes a real bug with a simple heuristic. The justification is sound: JSX call sites already handle reactivity via the literal/non-literal strategy (PR #926), and event handlers are imperative by nature. No objections.

### Layer 2 (manifest system) -- Scope is too large for a single deliverable

**BLOCKING -- Layer 2 must be broken into sub-phases with independent deliverability.**

The design doc presents Layer 2 as a monolith: manifest schema + manifest generator + import resolver + re-export chain follower + build pipeline pre-pass + incremental HMR updates + framework manifest + third-party package convention. This is at least four distinct pieces of work, and the doc does not define which subset delivers value on its own.

Specifically, the phasing should answer:
- **Layer 2a:** Replace the hardcoded `SIGNAL_API_REGISTRY` with the framework manifest (`@vertz/ui/reactivity.json`). This is the smallest unit that eliminates the registry and establishes the manifest contract. No cross-file analysis needed -- just loading a JSON file instead of a hardcoded map.
- **Layer 2b:** Manifest generation for user files (the pre-pass, the AST analysis, the import resolver). This is the large piece.
- **Layer 2c:** Incremental HMR manifest updates. This is an optimization that should not block the initial implementation.
- **Layer 2d:** Third-party package convention (`.reactivity.json`). This is a future concern with zero current users.

Without this breakdown, there is a risk of the entire Layer 2 becoming a multi-week project that blocks other work without shipping incremental value.

### Two-layer phasing -- Makes sense directionally

The decision to separate the single-file fix (Layer 1) from the cross-file system (Layer 2) is correct. Layer 1 is a targeted bug fix that can ship immediately. Layer 2 is architectural. They should be separate PRs on separate timelines, which the doc implies but does not explicitly state.

**NON-BLOCKING** -- The doc should explicitly state that Layer 1 and Layer 2 are independent deliverables. Layer 1 should not wait for Layer 2 to be designed or approved.

---

## 2. Problem Validation

### 1.1 Callback wrapping -- Well-defined, real pain

This is a real compiler bug. The code example is clear, the wrong output is demonstrable, and PRs #909 and #920 are cited as evidence of pain. The fix is straightforward. No concerns.

### 1.2 Hardcoded registry -- Well-defined, real but bounded pain

The registry has caused bugs (PR #909, #920), and every new signal API requires a manual update. However, the registry currently has exactly three entries (`query`, `form`, `createLoader`) plus `useContext`. This is not a scaling problem today -- it is a correctness and abstraction problem.

**QUESTION** -- How many new signal APIs are planned for the next 6 months? If the answer is "zero or one," the registry problem is real but not urgent. The design doc frames this as a scaling issue ("every new framework API requires a manual registry update") but does not provide evidence of how often this actually happens. The urgency should come from the cross-file blindness problem (1.3), not the registry growth rate.

### 1.3 Cross-file blindness -- The real motivator, but evidence is thin

The design doc correctly identifies that extracting `query()` into a custom hook breaks auto-unwrapping. This is the strongest argument for the manifest system -- it aligns directly with "one way to do things" and "AI agents are first-class users" (an LLM refactoring code should not silently break the compiler).

**QUESTION** -- How often does this actually bite users today? The doc cites no bug reports or developer complaints about cross-file issues. The example apps (`examples/`) are relatively small. Is this a problem that exists in the entity-todo example, or is it theoretical? If we have a concrete case where someone extracted a hook and it broke, that should be cited. If not, we should acknowledge this is a forward-looking investment, not a pain-point fix.

**NON-BLOCKING** -- The cross-file problem is real in principle and will become acute as codebases grow. But the doc should be honest about whether this is "fixing a reported problem" or "preventing a future problem." Both are valid, but they carry different priority implications.

---

## 3. Success Metrics

**BLOCKING -- The design doc defines no success metrics.**

A compiler infrastructure change needs measurable criteria for success. Without them, we cannot evaluate whether this was worth the investment. Proposed metrics:

1. **Correctness:** Zero false-positive `computed()` wrappings on the example apps after Layer 1. Specifically: run the compiler on `examples/entity-todo` and `examples/canvas-whiteboard` and verify no arrow function or function expression is wrapped in `computed()`.

2. **Coverage (Layer 2):** Manifest classification rate on user code. The POC reports 96% (72/75 exports). The target should be defined: is 96% acceptable for v1, or do we need 100% on user code? What happens to the 4% that falls through?

3. **Performance:** Dev startup time regression must be under 100ms for a 200-file project. The POC claims 78ms. This should be a CI-enforced benchmark, not a one-time measurement.

4. **Abstraction transparency:** A `query()` call wrapped in a custom hook must produce identical compiled output to an inline `query()` call. This is the ultimate test of "one way to do things."

5. **No new developer-facing API:** The doc claims "zero new API" for developers. This should be verified: no new config, no new annotations, no new file conventions required to get correct behavior.

---

## 4. Non-Goals Check

### Appropriate non-goals

- **TypeScript type checking** -- Correct. AST-only analysis is the right call for performance and simplicity. Using `tsc` would be a different project entirely.
- **Runtime reactivity tracking replacement** -- Correct. PR #926's strategy is working and should not be disturbed.
- **Full program analysis** -- Correct. Export-boundary analysis is the right abstraction level.
- **Third-party package analysis** -- Correct. Analyzing `node_modules` is a rabbit hole.

### Non-goal that should be in scope

**NON-BLOCKING** -- "Prop reactivity from parent" is listed as a non-goal with the justification that PR #926 handles it at runtime. This is fine for now, but the doc should note that the manifest system creates the foundation for this in the future. If we ever need compile-time prop reactivity (for diagnostics, optimizations, or VertzQL field tracking through component boundaries), the manifest schema already has `reactiveProps?: string[]` in the type definition. The doc should explicitly state this is deferred, not abandoned, and that the schema is forward-compatible.

### Item in scope that should be a non-goal (or deferred)

**NON-BLOCKING** -- The `.reactivity.json` convention for third-party packages (Section 3.2) should be explicitly deferred, not just "optional." There are zero third-party package authors today. Defining a file convention now creates a commitment to maintain backward compatibility on a contract that has never been tested with real users. The manifest schema for `@vertz/ui` (framework manifest) is sufficient. Third-party manifests can be designed when the first external package author asks for it.

---

## 5. Risk Assessment

### "Treat unknown as reactive" fallback

**BLOCKING -- The claim that false positives have "zero cost" needs qualification.**

The doc states: "Unknown handling: Treat as potentially reactive. Safe default -- false positives have zero cost (PR #926's runtime tracking)."

This is not zero-cost. When the compiler treats an unknown import as potentially reactive:

1. **Extra reactive wrappers in compiled output.** Every expression involving the unknown import gets wrapped in a thunk (`__child(() => expr)`) in JSX. This is a function allocation per render. For a hot component rendered thousands of times (e.g., list items), this adds up.

2. **Harder-to-debug compiled output.** When a developer inspects the compiled code (which they do when debugging reactivity issues), unnecessary wrappers add noise. The compiled output should be as close to the source as possible.

3. **False sense of correctness.** If the compiler silently treats everything as "maybe reactive," developers never learn that their abstractions are opaque to the compiler. A diagnostic warning ("cannot determine reactivity of `importedFn` -- treating as reactive") would be more aligned with "if it builds, it works."

The doc should quantify the expected false-positive rate and assess whether a diagnostic (warning, not error) should be emitted for `unknown` classifications. This does not need to block Layer 1, but it should be addressed before Layer 2 ships.

### Risks not identified

**NON-BLOCKING** -- The doc does not discuss the risk of **ts-morph vs raw TypeScript API migration.** The current `ReactivityAnalyzer` imports from `ts-morph`. The manifest generator uses `ts.createSourceFile()` (raw TypeScript API). This means the codebase will have two different AST abstractions coexisting. Is the plan to migrate the entire analyzer off ts-morph eventually? If so, that should be stated. If not, the maintenance burden of two AST layers should be acknowledged.

**NON-BLOCKING** -- The doc does not discuss the risk of **manifest staleness in monorepo dev.** If a developer is working on `@vertz/ui` itself (adding a new signal API) and simultaneously using it in an example app, the framework manifest could be stale. How is the framework manifest regenerated during development? Is it a build step? A watch task? This edge case matters for the Vertz team itself.

---

## 6. Timeline

**QUESTION -- The doc provides no timeline estimate. Here is my assessment:**

| Phase | Effort | Confidence |
|-------|--------|------------|
| Layer 1: Callback fix | 1-2 days | High -- small, well-scoped change to `ReactivityAnalyzer` |
| Layer 2a: Framework manifest (replace registry) | 2-3 days | High -- mostly a refactor of `signal-api-registry.ts` |
| Layer 2b: Manifest generator + import resolver | 5-8 days | Medium -- new code, new test surface, re-export chain handling |
| Layer 2c: HMR incremental updates | 2-3 days | Medium -- integration with existing HMR pipeline |
| Layer 2d: Third-party convention | Deferred | N/A |

**Total: ~2-3 weeks for the full system (Layer 1 + Layer 2a-c).**

This is a significant investment. Layer 1 alone can ship in a day. The question is whether Layer 2 is the highest-value use of 2+ weeks of compiler engineering time right now.

---

## 7. Dependencies

### What this blocks

- **Custom hooks becoming a first-class pattern.** Without cross-file manifests, extracting `query()` into a `useTasks()` hook silently degrades the developer experience. This is a prerequisite for recommending hook extraction as a best practice.
- **VertzQL field tracking.** The design doc correctly identifies the shared import resolver as infrastructure for the field access analyzer. However, VertzQL is not on the near-term roadmap -- this is a nice-to-have, not a blocker.

### What this does NOT block

- **Cloud platform work.** The manifest system is entirely in the UI compiler. It has zero dependencies on or from the cloud platform (Workers for Platforms, D1, KV, dashboard). Cloud work can proceed in parallel.
- **PR #926 follow-ups.** The literal/non-literal JSX strategy is already shipped. This design complements it but does not depend on or block further runtime reactivity work.
- **Framework prerequisites (Issues #811-#819).** RouterView, AlertDialog, Sheet, Badge, DropdownMenu, refetchInterval, beforeRender, vertz login, GitHub OAuth -- none of these are affected.

### What this depends on

- **PR #926 must be stable.** The entire design assumes that JSX call-site reactivity is handled by the runtime. If PR #926 has bugs, the "never wrap functions in computed()" rule for Layer 1 could produce incorrect behavior. The doc should confirm PR #926 is shipped and stable.

**QUESTION** -- Is PR #926 merged and stable? The doc references it repeatedly as the foundation for Layer 1's safety argument. If it has known issues, Layer 1's risk profile changes.

---

## 8. Roadmap Fit

**QUESTION -- Is this the right time for compiler infrastructure investment?**

The cloud platform is in active design (Platform Layer reviewed in PR #30, Dashboard reviewed in PR #33, Dispatch Worker and Schema Migrations are next priorities per the memory doc). Framework prerequisites (#811-#819) are assigned and in progress. The team is pre-v1 with no external users.

Arguments FOR doing this now:
- Layer 1 is a straightforward bug fix. No reason to delay.
- The manifest system establishes infrastructure that VertzQL and future analyzers will need.
- Custom hooks are a natural pattern that LLMs will produce. Failing silently on hook extraction violates "AI agents are first-class users."
- Pre-v1 is the right time to fix compiler fundamentals -- post-v1, this becomes a breaking change to compiled output.

Arguments AGAINST doing this now:
- The cross-file problem has no reported user complaints (no external users exist yet).
- The cloud platform is the commercial priority. Compiler work does not advance revenue.
- The example apps are small enough that single-file analysis covers 95%+ of cases.
- Layer 2 is a 2+ week investment with medium confidence on timeline.

**My recommendation:**

- **Layer 1: Ship immediately.** It is a bug fix. No debate needed.
- **Layer 2a (framework manifest replacing registry): Ship soon.** It is a small refactor that improves maintainability and establishes the manifest contract. Low risk, clear value.
- **Layer 2b-c (full cross-file analysis): Defer to after the cloud platform PoC ships, unless a concrete use case surfaces.** The investment is meaningful, the problem is forward-looking, and the cloud platform is the commercial priority. If a developer or LLM hits the cross-file blindness problem in practice during the PoC, that becomes the trigger to prioritize Layer 2b.

---

## Summary of Issues

| # | Classification | Summary |
|---|---|---|
| 1 | **BLOCKING** | Layer 2 must be broken into sub-phases (2a/2b/2c/2d) with independent deliverability |
| 2 | **BLOCKING** | No success metrics defined -- must add measurable criteria |
| 3 | **BLOCKING** | "Zero cost" claim for unknown-as-reactive fallback needs qualification (perf overhead, diagnostic warnings) |
| 4 | NON-BLOCKING | Layer 1 and Layer 2 should be explicitly stated as independent deliverables |
| 5 | NON-BLOCKING | Cross-file blindness (1.3) evidence is thin -- acknowledge if forward-looking investment |
| 6 | NON-BLOCKING | `reactiveProps` should be noted as deferred, not abandoned |
| 7 | NON-BLOCKING | Third-party `.reactivity.json` convention should be explicitly deferred |
| 8 | NON-BLOCKING | ts-morph vs raw TypeScript API coexistence risk not discussed |
| 9 | NON-BLOCKING | Framework manifest staleness during `@vertz/ui` development not addressed |
| 10 | QUESTION | How many new signal APIs are planned in the next 6 months? |
| 11 | QUESTION | Has the cross-file blindness problem been hit in practice, or is it theoretical? |
| 12 | QUESTION | Is PR #926 merged and stable? |
| 13 | QUESTION | Is this the right time for full cross-file analysis (Layer 2b-c) vs. cloud platform priority? |
| 14 | QUESTION | What is the expected false-positive rate for `unknown` classifications on real projects? |

---

## Recommendation

**Approve Layer 1 immediately.** It is a well-scoped bug fix with clear correctness value.

**Approve Layer 2a (framework manifest) after blocking items 1-3 are resolved.** This is low-risk, high-value infrastructure.

**Defer Layer 2b-c (full cross-file analysis) pending roadmap discussion.** The investment is justified technically but competes with cloud platform delivery. The trigger to prioritize it should be a concrete case where cross-file blindness causes developer pain during the PoC, not theoretical completeness.

**Reject Layer 2d (third-party convention) from this design entirely.** Design it when the first external package author asks for it.
