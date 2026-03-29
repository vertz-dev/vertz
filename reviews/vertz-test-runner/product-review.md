# Product/Scope Review: Vertz Test Runner

- **Reviewer:** Product Agent
- **Date:** 2026-03-28
- **Document:** plans/vertz-test-runner.md Rev 1

## Review Checklist

- [x] Fits the roadmap and runtime strategy
- [ ] Scope is appropriate (not too broad, not too narrow)
- [x] Non-goals are correct and complete
- [ ] Phasing makes sense (vertical slices, each usable)
- [ ] Timeline is realistic
- [ ] Dependencies are identified
- [x] Delivers value at each phase (not "all or nothing")

## Findings

### Blockers

**B1: Phase 4 must be split — 1,010 files in one migration phase is too risky**

Phase 4 says "migrate the entire Vertz monorepo from bun test to vertz test" as a single phase. This is 1,010+ test files across 22 packages. If any package has an incompatibility, it blocks the entire migration. Split into:
- Phase 4a: Codemod tool + migrate 2-3 proof packages (smallest, then one with mocking, then one with .tsx)
- Phase 4b: Remaining 19-20 packages, with per-package parity gates (run both bun test and vertz test, compare results)

This is a blocker because the current phasing makes Phase 4 an all-or-nothing gamble.

**B2: Missing Dependencies/Preconditions section**

The doc assumes runtime infrastructure (V8 contexts, module graph) works for test execution, but the dev server uses these for SSR — different lifecycle, different global injection. Must explicitly state: "Phase 1 depends on verifying V8 context creation works for test isolation (POC 1)." Timeline estimates are unreliable without this validation.

### Should Fix

**S1: Timeline should be 12-15 weeks, not 8-11**

Each phase lists 2-3 weeks, but doesn't account for: POC time (U1, U2), review cycles, fix-review loops, unexpected Bun API edge cases. Realistic: Phase 1 (3-4 weeks), Phase 2 (3-4 weeks), Phase 3 (3-4 weeks), Phase 4a+4b (3-4 weeks). Total: 12-16 weeks.

**S2: `vi` namespace is scope creep**

The codebase uses `bun:test` (112 `vi` uses, mostly `vi.fn()` and `vi.spyOn()`). Adding full vitest `vi` compatibility (vi.mock, vi.hoisted, vi.stubGlobal, etc.) is unnecessary. Limit to `vi.fn()` and `vi.spyOn()` only. Make this explicit in Non-Goals: "Full vitest vi namespace compatibility is not a goal."

**S3: Preload system should be simpler**

The doc describes a Bun-compatible plugin API (`plugin({ setup(build) { build.onLoad(...) } })`). But the native compiler already handles `.tsx`. The preload system only needs to: (1) execute a script before tests, (2) register DOM globals. No plugin API needed — just `preload: ['./setup.ts']` that runs the file. The plugin API is scope creep.

**S4: `.only` and `.skip` modifiers missing from Phase 1**

`it.only()`, `it.skip()`, `describe.skip()` are essential developer workflow tools during TDD. They should be in Phase 1, not deferred. Without them, developers can't focus on a single test during development.

**S5: Phase 1 could be thinner — cut .tsx criterion**

Phase 1's acceptance criteria include "compiles .tsx imports with the native compiler." For the thinnest E2E slice, restrict to `.test.ts` files that import only `.ts` modules. `.tsx` compilation can move to Phase 2 alongside the full matcher library. This makes Phase 1 achievable in ~2 weeks.

**S6: Performance targets need a hard fail criterion**

"Within 1.5x of bun test" is the parity target, but there's no kill criterion. Add: "If vertz test is >2x slower than bun test after Phase 3 optimization, re-evaluate the architecture." This prevents shipping a slow test runner.

### Nice to Have

**N1: Consider `--update-snapshots` flag even though snapshots aren't used today**

Snapshot testing is a non-goal, but the flag is cheap to stub. If a user tries it, a clear error ("Snapshot testing not supported — use expect().toEqual() instead") is better than a cryptic "unknown flag" error.

**N2: `vertz test --changed` (run tests for changed files since last commit)**

Git-aware test selection would be valuable for large monorepos. Not for Phase 1, but worth listing as a future enhancement.

**N3: Consider structured error output for AI agents (Principle 3)**

The doc mentions JSON reporter, but assertion failure messages should include structured data (file, line, expected, actual) even in terminal mode. This helps AI agents parse failures without needing the JSON reporter.

**N4: Add an explicit "Migration Guide" deliverable to Phase 4**

When migrating 22 packages, a written guide (in docs/) helps human developers understand what changed and why. Not just a codemod — documentation.

## Verdict: Changes Requested

2 blockers (split Phase 4, add Dependencies section), 6 should-fix items. The core design is sound and well-aligned with the runtime strategy. Scope needs tightening around vi namespace and preload plugin API.
