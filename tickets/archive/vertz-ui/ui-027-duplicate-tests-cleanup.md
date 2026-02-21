# ui-027: Clean up duplicate test files and build config

- **Status:** 🟢 Done
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 1h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** mike review on PR #199 (should-fix #7)

## Description

4 test files exist in both root and `__tests__/` directories in `@vertz/ui-server`, causing them to run twice in CI.

**File:** `packages/ui-server/`

## Acceptance Criteria

- [ ] No duplicate test files in @vertz/ui-server
- [ ] All tests run exactly once
- [ ] CI test count matches expected (no double-counting)

## Progress

- 2026-02-12: Ticket created from mike's review on PR #199
- 2026-02-12: Deleted 4 duplicate test files from ui-server root (asset-pipeline.test.ts, head.test.ts, html-serializer.test.ts, render-to-stream.test.ts)
