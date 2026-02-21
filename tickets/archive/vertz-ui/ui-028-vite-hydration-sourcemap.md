# ui-028: Fix Vite plugin hydration source map

- **Status:** 🟢 Done
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 2h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** ben review on PR #199 (should-fix S3)

## Description

The Vite plugin discards the hydration source map — only the compile result source map is returned. When debugging hydrated components, developers won't be able to trace back to the original source.

**File:** `packages/ui-compiler/src/vite-plugin.ts` (or equivalent Vite integration)

## Acceptance Criteria

- [ ] Vite plugin chains/merges the hydration source map with the compile source map
- [ ] Debugger can trace from hydrated component output back to original source
- [ ] Test: Vite transform produces valid source map that maps to original source

## Progress

- 2026-02-12: Ticket created from ben's review on PR #199
- 2026-02-12: Fixed — chained hydration + compile source maps via @ampproject/remapping. New test verifies end-to-end source mapping.
