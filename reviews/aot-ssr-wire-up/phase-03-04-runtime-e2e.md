# Phase 3-4: Runtime Handler Integration + E2E Validation

- **Author:** claude-opus-4-6
- **Reviewer:** claude-opus-4-6 (adversarial)
- **Commits:** fabdbf50d..1cd3b2bae
- **Date:** 2026-03-24

## Changes

- packages/ui-server/src/aot-manifest-loader.ts (new)
- packages/ui-server/src/__tests__/aot-manifest-loader.test.ts (new)
- packages/ui-server/src/__tests__/aot-e2e-pipeline.test.ts (new)
- packages/ui-server/src/ssr-aot-pipeline.ts (modified)
- packages/ui-server/src/__tests__/ssr-aot-pipeline.test.ts (modified)
- packages/ui-server/src/ssr-handler.ts (modified)
- packages/ui-server/src/__tests__/ssr-handler.test.ts (modified)
- packages/ui-server/src/index.ts (modified)
- packages/ui-server/src/ssr/index.ts (modified)
- packages/ui-server/src/aot-manifest-build.ts (modified - .tsx extension fix)
- packages/ui-compiler/src/transformers/aot-string-transformer.ts (modified - export keyword)
- packages/ui-compiler/src/__tests__/aot-compiler.test.ts (modified)
- packages/ui-compiler/src/__tests__/aot-hydration-markers.test.ts (modified)
- packages/cli/src/commands/start.ts (modified)
- packages/cli/src/production-build/ui-build-pipeline.ts (modified)
- packages/cli/src/commands/__tests__/start.test.ts (modified)

## CI Status

- [x] Quality gates passed at 1cd3b2bae

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Changes Requested (initial review)

**BLOCKER 1 (FIXED):** `prefetchSession` not passed to `ssrRenderAot()` from handler.
The handler resolved `ssrAuth` but never derived `prefetchSession`, meaning `ctx.session`
was always undefined for AOT renders. Fixed by calling `toPrefetchSession(ssrAuth)`.

**BLOCKER 2 (FIXED):** Missing handler-level AOT tests. Added 3 tests to
`ssr-handler.test.ts`: AOT route match, fallback for non-AOT route, backward compatibility.

**SHOULD-FIX 1 (FIXED):** Missing `loadAotManifest` in CLI start test mock.

**SHOULD-FIX 2-4 (FIXED):** Missing error path tests for `loadAotManifest` (invalid JSON,
empty routes, broken module import).

**SHOULD-FIX 5 (FIXED):** Timer leak in `prefetchForAot` — timeout not cleared when
fetch resolved first.

### Additional bugs found during E2E testing

**BUG 1 (FIXED):** Generated `__ssr_*` functions were not exported (`function` instead of
`export function`), preventing the barrel's `export { __ssr_X } from './module'` from working.

**BUG 2 (FIXED):** Barrel temp files used `.ts` extension but contained JSX from original
source, causing `Bun.build()` parse errors. Changed to `.tsx` extension.

**BUG 3 (FIXED):** `Bun.build()` externals list didn't include `react/jsx-dev-runtime`
and `react/jsx-runtime`, causing import resolution failures in the bundled output.

## Resolution

All findings addressed in commits b3fe855c1 and 1cd3b2bae. Quality gates clean.
