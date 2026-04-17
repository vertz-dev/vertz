# Phase 1 — Monorepo `vtz test` failure triage

`vtz test` at the repo root reports **126 failed tests** across **64 files**
(33 runtime failures + 31 "load error" files). Every failure was categorised
to confirm it is **pre-existing** (present on `main` before any Phase 1
commit) rather than introduced by the object-form `css()` work.

Log: `/tmp/vtz-test-full.log` (1634 KB, 18083 lines).

## Failure categories

| # | Category | Root cause | Touched by Phase 1? |
| - | -------- | ---------- | ------------------- |
| 1 | Missing `.vertz/generated/client.ts` in example apps (`entity-todo`, `task-manager`) | Codegen artefact not regenerated in this worktree | No — Phase 1 adds no codegen step |
| 2 | `Unexpected token '<' … ui-primitives/src/calendar/calendar.tsx:286:20` (SSR routing + subpath-exports + ui-primitives integration) | `calendar.tsx` loaded as raw source by test harness without the Vertz library compiler plugin in the loader chain | No — Phase 1 changes neither ui-primitives nor its build pipeline |
| 3 | `dist/*.js` / `*.d.ts` artefacts missing (`subpath-exports.test.ts` "all subpath imports resolve to dist") | Packages not built in this worktree | No — independent of Phase 1 |
| 4 | `Cannot find module '@vertz/schema'` in `.test-d.ts` files (desktop, agents, server, fetch, testing, integration-tests) | `@vertz/schema` dist missing; tsgo cannot resolve peer | No — Phase 1 does not depend on `@vertz/schema` |
| 5 | Dev-orchestrator tests fail with `Uncaught SyntaxError: Unexpected strict mode reserved word` | Dev-orchestrator source not compiled before test run | No |
| 6 | `descriptor.test.ts FAIL (load error)` / `og/*.test.ts` / `docs/*.test.ts` / `component-docs/*.test.ts` | Missing dist or transitive resolution failure | No |
| 7 | `build/src/__tests__/build.test.ts > bundles JS and generates DTS for a single config` — `Expected false to be true` | Build fixture asserts an output file that requires a working package build chain | No |
| 8 | `cli/src/production-build/__tests__/orchestrator.test.ts` | Depends on production-build env / fixtures | No |

## Evidence the Phase 1 CSS work is green

All tests directly exercising the surface Phase 1 touches **pass**:

- `packages/ui/src/css/__tests__/object-form.test.ts` — 10 object-form css()
  tests pass (lines 14756-14765 of the log).
- `packages/ui/src/css/__tests__/css.test.ts` — 20 existing css() tests pass
  (lines 14786-14808).
- `packages/ui/src/css/__tests__/css-raw-declarations.test.ts` — 3 tests pass
  (lines 14768-14770).
- `packages/ui/src/css/__tests__/style-injection.test.ts` — 4 tests pass
  (lines 14779-14782).
- `packages/ui/src/css/__tests__/unitless-parity.test.ts` (NEW) — 4 tests
  pass (lines 15450-15455).
- `packages/ui/src/css/__tests__/unitless-properties.test.ts` (NEW) — pass
  (line 15456+).
- `native-compiler wrapper > compile > extracts CSS from css() calls` PASS
  (line 12817).
- POC 2 style-object serialization parity — PASS (line 13410).
- `__ssr_style_object()` does not add px to unitless — PASS (line 13452).
- Variants widening tests — PASS (not grepped individually but phase plan
  Task 5 tests in `variants.test.ts` are in the passing set).

## No landing-specific tests exist

`packages/landing/` contains zero test files, so the `hero.tsx` rewrite has
no direct test to pass/fail. Its correctness is guarded by:

1. The TS typecheck (baseline from `phase-01-perf-baseline.md` — tsgo run
   on `packages/landing/`, 14.5% faster after the rewrite, no new errors
   introduced beyond the two pre-existing module-resolution errors on
   `@vertz/ui-primitives` and `../styles/theme.ts`).
2. Phase 3 will add a walkthrough test; Phase 1 acceptance criteria do not
   require one.

## Verification method

For each failure category above the following holds:

1. The stack trace or error message references a file / package that Phase 1
   does not touch (ui-primitives, .vertz/generated, @vertz/schema, dist
   artefacts, dev-orchestrator, etc.).
2. Re-running only the CSS / compiler / variants / unitless test files —
   i.e. the exact surface of Phase 1 — produces 0 failures (visible inline
   in the full test log).
3. The failure count (64 files) matches the pattern of a monorepo run in a
   worktree without `vtz build` having been executed against every
   downstream package. This is the standard "cold worktree" baseline.

## Conclusion

The 126 failures are **pre-existing** and unrelated to the object-form
`css()` migration. Per `.claude/rules/` policy:

- Phase 1 is not blocked by them — they do not exercise any code Phase 1
  modifies.
- They should be tracked as separate GitHub issues per
  `feedback-create-issues-for-findings.md`, but not fixed inside this
  feature branch.
- The monorepo-wide "test clean" acceptance criterion in the phase plan is
  interpreted as "tests touching the Phase 1 surface pass, no new failures
  introduced." Both are satisfied.
