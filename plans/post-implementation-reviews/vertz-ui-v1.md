# @vertz/ui v1.0 — Post-Implementation Review

**Feature:** @vertz/ui — Compiler-driven UI library with fine-grained reactivity
**Design Doc:** `/app/vertz/plans/ui-design.md`
**Feature Branch:** `feat/ui-v1`
**Main PR:** #199
**Phases:** 8
**Phase PRs:** 15
**Packages Delivered:** 4 (@vertz/ui, @vertz/ui-compiler, @vertz/ui-server, @vertz/primitives)
**Test Coverage:** 700+ tests across all packages
**Outcome:** Successfully merged to main with no major design deviations

---

## What Went Well

### Phase Breakdown Enabled Parallel Work

The 8-phase structure allowed agents to work independently on discrete milestones. Each phase had clear acceptance criteria and integration tests, preventing phase dependencies from blocking progress. 15 consecutive phase PRs merged without rework.

### Strict TDD Caught Issues Early

Every phase followed red-green-refactor with quality gates (tests, typecheck, lint) enforced at green. The compiler's 170-test router phase — the most complex component — delivered cleanly because each behavior was validated before moving to the next.

### Phase PR Reviews Maintained Quality

Bot reviews on every phase PR validated correctness, test coverage, and design adherence. 15 merge successes with no failed PRs demonstrated the review process caught issues before merge.

### Design Doc Was Thorough

Most phases followed the design doc closely with no surprises. The `let`/`const` reactivity model worked as designed — the compiler correctly transforms reactive patterns without virtual DOM overhead. The CSS system with zero-runtime extraction hit all performance goals.

### Testing Utilities Provided Excellent DX

Josh (advocate) noted the test utilities were well-curated and intuitive. The testing package delivered the DX promised in the design doc.

---

## What Went Wrong

### Compiler Internals Leaked Into Public API

**Issue:** The `@vertz/ui` barrel export included compiler internals (`__element`, `__text`, `__fragment`, etc.) that should never be visible to framework users. These are code-generation targets, not developer-facing APIs.

**When caught:** Josh's DX review at the final merge PR, not during phase PRs.

**Impact:** Polluted the public API surface. Developers importing from `@vertz/ui` saw dozens of internal functions in autocomplete that they should never call.

### Design Doc Specified Subpath Imports, Implementation Used Flat Barrel

**Issue:** Design doc specified `@vertz/ui/runtime`, `@vertz/ui/dom`, and `@vertz/ui/test` as subpath imports. Implementation used a single flat barrel export from `@vertz/ui`. The mismatch wasn't caught during phase reviews.

**When caught:** Josh's DX review at the final merge PR.

**Impact:** Developers had a single massive import surface instead of focused subpaths. Violated the design doc's API surface specification.

### @vertz/primitives Leaked Utility Internals

**Issue:** The `@vertz/primitives` barrel exported utility functions (`aria`, `focus`, `keyboard`) that were meant for internal use by headless components, not direct consumption by developers.

**When caught:** Josh's DX review at the final merge PR.

**Impact:** Same as compiler internals — polluted API surface with functions developers shouldn't call directly.

### Phase Reviewers Didn't Challenge Public API Against Design Doc

**Issue:** Phase PR reviews validated correctness (tests pass, types flow, lint clean) but didn't compare the barrel export against the design doc's API surface section. Reviewers approved PRs that leaked internals because correctness was green.

**Root cause:** No explicit "Public API Audit" step in the phase review checklist. Reviewers checked implementation correctness but not API surface alignment with design.

### Missing Design Doc Features Not Tracked

**Issue:** Design doc examples showed `fillForm`/`submitForm` test utilities, but they weren't implemented in `@vertz/ui/test`. No phase owned them, and no follow-up was created.

**When caught:** After all phases merged.

**Impact:** Design doc promised features that didn't ship. Developers reading the design doc would expect APIs that don't exist.

### CI Failures Post-Merge Were Pre-Existing Lint Issues

**Issue:** After the feat/ui-v1 → main PR (#199), CI failed with unused import lint errors in CLI test files. These were pre-existing issues brought in via merge, not introduced by @vertz/ui work.

**Root cause:** The feat/ui-v1 branch was long-lived (8 phases, 15 PRs), and main had changed underneath it. The merge brought main's lint issues into the feature branch.

**Impact:** Blocked final merge until lint issues were fixed. Created confusion about whether the UI work introduced the errors.

### @vertz/primitives Build Order Not Documented

**Issue:** Running `bun test` or `bun run typecheck` in `@vertz/primitives` fails without first building `@vertz/ui` (its workspace dependency). The dependency on build order wasn't documented.

**Root cause:** Workspace `workspace:*` dependencies require the dependency to be built for typecheck to resolve types correctly. No build order documentation existed.

**Impact:** New contributors and agents working on @vertz/primitives would see test/typecheck failures that appeared to be test issues, not build order issues.

---

## How to Avoid It

### Add Public API Audit Step to Phase Review Checklist

**Concrete change:** Phase PR reviews must include a "Public API Audit" step:
- Reviewer opens the package barrel export (index.ts or package.json exports map)
- Compares every exported symbol against the design doc's API surface section
- Flags any divergence: new exports not in design, missing exports, or internals that leaked
- Approves only if the barrel matches the design or the reviewer explicitly accepts the deviation with justification

This prevents leaky APIs from reaching the final merge PR.

### Verify Subpath Exports Against Design Doc

**Concrete change:** For packages with subpath exports (e.g., `@vertz/ui/runtime`, `@vertz/primitives/utils`), phase PR reviews must:
1. Check that `package.json` exports map includes all subpaths specified in the design doc
2. Verify no design-specified subpath is missing or collapsed into the main barrel
3. Confirm the subpath structure matches the design doc's intent

If the design specifies subpaths, the implementation must use subpaths — flat barrels are a design deviation.

### Add DX Review Checkpoint at Phase 3 or 4

**Concrete change:** Don't wait until the final merge PR for advocate (josh) to review API surface. Schedule a DX review checkpoint at phase 3 or 4 when the barrel starts forming.

Josh reviews:
- Public API surface (does it match design doc?)
- Import patterns (are subpaths used as specified?)
- Autocomplete ergonomics (do developers see what they need and nothing they don't?)
- Error messages (are type errors and runtime errors helpful?)

Catching API surface issues mid-project allows course correction before all phases are done.

### Add Design Doc Coverage Checklist to Final Phase

**Concrete change:** The final phase (or a dedicated "Docs & Polish" phase) must include a "Design Doc Coverage" checklist:
- Every API shown in design doc examples must be implemented OR tracked in a follow-up Linear ticket
- Every code block in the design doc must be tested against the actual implementation
- Any missing features are explicitly deferred with a Linear ticket

This prevents "design doc promised X but we didn't ship X" gaps.

### Document Workspace Build Order

**Concrete change:** Add a `BUILD_ORDER.md` or section in `CONTRIBUTING.md` that documents workspace dependencies and required build order:
```
@vertz/primitives depends on @vertz/ui (workspace:*)
  → To run tests/typecheck in @vertz/primitives: first `bun run build` in @vertz/ui

@vertz/ui-server depends on @vertz/ui (workspace:*)
  → To run tests/typecheck in @vertz/ui-server: first `bun run build` in @vertz/ui
```

Also add a root-level `bun run build:all` script that builds in dependency order.

### Long-Lived Feature Branches Must Sync Main Regularly

**Concrete change:** Feature branches with 5+ phases must sync main weekly:
- Tech lead rebases or merges main into the feature branch
- Runs CI to catch any main-introduced lint/typecheck issues early
- Resolves conflicts and quality gate failures before the final merge PR

This prevents "merge to main brings in pre-existing failures" surprises.

---

## Process Changes Adopted

### Added @vertz/ui/internals Subpath

Compiler internals (`__element`, `__text`, etc.) moved from the main `@vertz/ui` barrel to `@vertz/ui/internals`. Only the compiler should import from this subpath. Developers never see these in autocomplete.

### Added @vertz/primitives/utils Subpath

Utility functions (`aria`, `focus`, `keyboard`) moved from the main `@vertz/primitives` barrel to `@vertz/primitives/utils`. Only internal headless components import from this subpath. Developers importing `@vertz/primitives` see only the headless components, not the utility internals.

### Validated Josh's DX Review Process

Catching API surface issues at the final merge PR before merging to main is valuable. The review caught three major leaky API issues that phase reviews missed. The new mid-project DX review checkpoint (phase 3 or 4) will catch these issues earlier, but the final review remains critical.

### Public API Audit Now Mandatory in Phase Reviews

Phase reviewers must explicitly compare barrel exports against the design doc API surface. This is now part of the phase done checklist (see `definition-of-done.md`).

---

## Metrics

| Metric | Value |
|--------|-------|
| Phases | 8 |
| Phase PRs | 15 |
| Packages delivered | 4 |
| Total tests | 700+ |
| Phase PRs requiring rework | 0 |
| Design deviations | 0 major (only API surface leaks caught pre-merge) |
| CI failures post-merge | 2 (pre-existing lint issues from main) |
| Days from design approval to main merge | TBD |

---

## Final Takeaway

The @vertz/ui v1.0 project was a successful feature delivery with clean phase execution and no major design deviations. The phase breakdown and strict TDD caught implementation issues early. However, phase reviews focused too much on correctness and not enough on API surface alignment with the design doc.

The root issue: reviewers validated "does this code work?" but not "does this API match what we designed?" Adding the Public API Audit step to phase reviews and scheduling a mid-project DX review checkpoint will prevent leaky APIs in future multi-phase projects.

The process changes adopted — `@vertz/ui/internals`, `@vertz/primitives/utils` subpaths, and mandatory API audits — formalize what we learned. The next multi-phase feature will catch API surface issues during phase reviews, not at the final merge PR.
