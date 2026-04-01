# Phase 1-3: Remove Legacy Two-Pass SSR

- **Author:** implementation agent
- **Reviewer:** adversarial review agent (Opus 4.6)
- **Commits:** `1719d10c9..37c863a02`
- **Date:** 2026-04-01

## Changes

- `packages/ui-server/src/ssr-render.ts` (deleted -- 548 lines)
- `packages/ui-server/src/ssr-shared.ts` (new -- 94 lines, extracted shared types/helpers)
- `packages/ui-server/src/ssr-single-pass.ts` (modified -- added `runQueryDiscovery()`, `ssrStreamNavQueries()`, generic `filterByEntityAccess`, removed `prefetch: false` fallback)
- `packages/ui-server/src/index.ts` (modified -- re-pointed exports)
- `packages/ui-server/src/ssr/index.ts` (modified -- re-pointed exports)
- `packages/ui-server/src/ssr-handler.ts` (modified -- import path update)
- `packages/ui-server/src/node-handler.ts` (modified -- import path update)
- `packages/ui-server/src/bun-dev-server.ts` (modified -- import path update)
- `packages/ui-server/src/prerender.ts` (modified -- switched to ssrRenderSinglePass)
- Test files (6 files updated)
- `packages/landing/benchmark-ssr-direct.ts` (modified -- removed two-pass benchmark)
- `examples/task-manager/src/__tests__/ssr.test.ts` (modified -- switched imports)

## CI Status

- [x] Quality gates passed at `37c863a02` (1198 pass, 33 pre-existing fail, 17 skip)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### BLOCKER 1: Dead `prefetch: false` test (RESOLVED)

Test at `ssr-single-pass.test.ts:327-352` tested the removed `prefetch: false` option. The property no longer exists on `SSRSinglePassOptions` — the test passed by accident because single-pass always runs discovery + render (callCount === 2).

**Resolution:** Deleted the test block.

### BLOCKER 2: `render-to-html.ts` retains `twoPassRender()` (RESOLVED - Out of Scope)

`render-to-html.ts` contains a `twoPassRender()` function used by `renderToHTML()` and `renderToHTMLStream()`. These are a separate, lower-level API for streaming HTML with deferred query chunks — different from the `ssrRenderToString`/`ssrDiscoverQueries` pipeline targeted by this removal.

**Resolution:** Documented as explicitly out of scope in the PR description. Migration of `renderToHTML`/`renderToHTMLStream` to the single-pass architecture can be a follow-up.

### SHOULD-FIX 3-5: Stale docs, changeset (RESOLVED)

Already addressed in Phase 4 commit (`aa2e57452`):
- Updated `ssr-render-context.ts` JSDoc comments
- Updated `ARCHITECTURE.md` Section 4
- Added changeset file

## Resolution

Both blockers resolved. Dead test deleted, `render-to-html.ts` scope documented. All should-fixes were pre-addressed in Phase 4.
