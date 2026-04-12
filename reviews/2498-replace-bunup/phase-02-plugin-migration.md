# Phase 2: Plugin Migration

- **Author:** claude
- **Reviewer:** claude (adversarial)
- **Commits:** 8012d5171..63be53277
- **Date:** 2026-04-11

## Changes

- `packages/ui-server/src/compiler/library-plugin.ts` (modified — BunPlugin → esbuild Plugin)
- `packages/ui-server/src/__tests__/library-plugin.test.ts` (new)
- `packages/ui-server/package.json` (modified — added esbuild dep)
- `packages/ui-primitives/src/build-hooks.ts` (new — PostBuildHook implementations)
- `packages/ui-primitives/src/__tests__/build-hooks.test.ts` (new)
- `packages/ui-primitives/package.json` (modified — added @vertz/build devDep)
- `packages/db/src/build-hooks.ts` (new — PostBuildHook implementation)
- `packages/db/src/__tests__/build-hooks.test.ts` (new)
- `packages/db/package.json` (modified — added @vertz/build devDep)

## CI Status

- [x] Quality gates passed at 63be53277

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### BLOCKER (Fixed)
1. **B1: Barrel skip too broad** — `stripBareChunkImports` skipped any `index.js` instead of `src/index.js`. Fixed to match original behavior.

### SHOULD-FIX
1. **S1: Shallow library plugin tests** — Added onLoad registration tests (filter, namespace). Full onLoad callback behavior will be integration-tested during Phase 3/4 migration.
2. **S2: Fragile source barrel path** — Documented the `outDir` assumption in code comment.
3. **S3: Async vs sync inconsistency** — Preserved original per-package patterns. Not worth changing.

## Resolution

Blocker fixed, S1/S2 addressed, S3 acknowledged as acceptable. Commit 63be53277.
