# Phase 1: @vertz/build Package

- **Author:** claude
- **Reviewer:** claude (adversarial)
- **Commits:** 941d09e64..a52d46306
- **Date:** 2026-04-11

## Changes

- `packages/build/package.json` (new)
- `packages/build/tsconfig.json` (new)
- `packages/build/tsconfig.typecheck.json` (new)
- `packages/build/src/types.ts` (new)
- `packages/build/src/index.ts` (new)
- `packages/build/src/externals.ts` (new)
- `packages/build/src/bundle.ts` (new)
- `packages/build/src/dts.ts` (new)
- `packages/build/src/hooks.ts` (new)
- `packages/build/src/build.ts` (new)
- `packages/build/src/cli.ts` (new)
- `packages/build/src/__tests__/*.ts` (new — 6 test files)
- `packages/build/src/__tests__/types.test-d.ts` (new)
- `packages/build/src/__tests__/fixtures/` (new — 2 fixture packages)
- `.gitignore` (modified — negation for packages/build/)
- `packages/.gitignore` (modified — scoped build/ pattern)

## CI Status

- [x] Quality gates passed at a52d46306
  - 43 tests passing
  - Typecheck clean
  - Lint clean

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### Blockers (Fixed)

1. **BLOCKER-1: Missing subpath wildcard externals** — `resolveExternals` only added `dep` but not `dep/*`, causing esbuild to bundle subpath imports like `lodash/capitalize`. Fixed: added `${dep}/*` wildcard for each dependency.

2. **BLOCKER-2: @ts-ignore in fixture** — Used `@ts-ignore` instead of `@ts-expect-error`. Fixed per codebase conventions.

### Should-Fix (Fixed)

1. **SHOULD-FIX-1: Dead `format` field** — `BuildConfig` had a `format` field but design doc says ESM-only. Removed.

2. **SHOULD-FIX-2: Missing sourcemaps** — esbuild config didn't set `sourcemap: true`. Fixed.

3. **SHOULD-FIX-3: Unsafe cast in normalizeHooks** — Used `as PostBuildHook` on a plain function. Replaced with wrapper function `{ name: 'custom', handler: () => fn() }`.

4. **SHOULD-FIX-4: No type-level tests** — No `.test-d.ts` file for `defineConfig`. Added `types.test-d.ts` with 4 negative type tests using `@ts-expect-error`.

5. **SHOULD-FIX-5: No tsc error propagation test** — `generateDts` rejects on tsc failure but had no test for it. Added test with dedicated `type-error-pkg` fixture.

### Deferred

6. **SHOULD-FIX-6: CLI tests** — CLI is a thin wrapper (load config via jiti, call `build()`). Integration-tested implicitly when packages migrate in Phases 3-4. Adding unit tests for CLI would require mocking `jiti.import` and `process.exit`, providing marginal value.

## Resolution

All blockers and 5 of 6 should-fix items addressed in commit a52d46306. SHOULD-FIX-6 (CLI tests) deferred — CLI will be integration-tested during package migration phases.
