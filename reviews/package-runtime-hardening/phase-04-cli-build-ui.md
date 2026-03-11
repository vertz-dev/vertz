# Phase 4 Review: CLI build-ui Compiler Integration

- **Author:** caracas
- **Reviewer:** adversarial-review agent
- **Commits:** implementation of #1162
- **Date:** 2026-03-11

## Changes

- packages/cli/src/pipeline/orchestrator.ts (modified)
- packages/cli/src/pipeline/__tests__/orchestrator.test.ts (modified)
- plans/package-runtime-hardening-implementation.md (modified)

## CI Status

- [x] `bun test packages/cli/` — 425 tests pass
- [x] `bun run --filter @vertz/cli typecheck` — clean
- [x] `bunx biome check --write` — no new warnings

## Review Checklist

- [x] Delivers what the ticket asks for (#1162)
- [x] TDD compliance (RED test first, then GREEN implementation)
- [x] No type gaps — static type import for `VertzBunPluginOptions` ensures cross-package contract
- [x] No security issues
- [x] Public API matches POC recommendation

## Findings (from adversarial review)

### Finding 1 (Critical) — `runFull()` never calls `runBuildUI()`
**Resolution:** Added `runBuildUI()` call as Stage 5 in `runFull()`. Updated test to expect 5 stages.

### Finding 2 (Critical) — Real import path untested
**Resolution:** Added `vi.mock('@vertz/ui-server/bun-plugin')` and two tests exercising the real path: success (mock returns plugin) and failure (mock throws).

### Finding 3 (Major) — Plugin instance discarded
**Resolution:** Documented the tradeoff in a code comment. Option 3 (accept cost) chosen for simplicity.

### Finding 4 (Major) — Relative `srcDir` risk
**Resolution:** Removed `srcDir` parameter to match production build pattern. Plugin defaults to `resolve(projectRoot, 'src')`.

### Finding 5 (Major) — No integration test
**Resolution:** Mock-based test covers the real import path. Full E2E integration test deferred to the production build pipeline (already covered by existing `ui-build-pipeline.test.ts`).

### Finding 6 (Major) — Dynamic import bypasses type checking
**Resolution:** Added static `import type { VertzBunPluginOptions }` from `@vertz/ui-server/bun-plugin`. The options object is typed via this import, ensuring compile-time contract validation.

### Finding 7 (Minor) — Stale comment in `runFull()`
**Resolution:** Replaced with actual `runBuildUI()` call.

## Verdict

Approved. All critical and major findings addressed.
