# Phase 4: Validate HMR + Error Overlay

- **Author:** belo-horizonte
- **Reviewer:** (pending adversarial review)
- **Commits:** (no code changes — validation only)
- **Date:** 2026-04-04

## Changes

No code changes in this phase — purely validation with temporary edits.

## Validation Findings

### Task 1: HMR Component Updates — PASS

**WebSocket Connection:**
- HMR client connects via `ws://localhost:3099/__vertz_hmr`
- Log: `[vertz-hmr] Connected`
- Reconnection with exponential backoff works (100ms → 200ms → 400ms → ... → 5000ms cap)
- Warning after 10 rapid reconnects: "Server may be down"

**Hot Module Update:**
- Edited `project-card.tsx` (added text " (HMR test)")
- Server detected file change and sent WebSocket update
- Log: `[vertz-hmr] Hot updated: /src/components/project-card.tsx`
- Log: `[vertz-hmr] Updated 1 module(s) in 4ms`
- Module-level HMR — no full page reload
- Fast Refresh runtime properly injected in all compiled modules

**Note:** The HMR update re-executes the module, which triggers the AuthProvider crash again (since it re-mounts App). This is expected behavior — the auth issue (#2302) is upstream.

### Task 2: Error Overlay — PASS

**Syntax Error Detection:**
- Introduced `const x = {{{ invalid syntax` in `project-card.tsx`
- Error overlay appeared showing:
  - Title: "Update failed"
  - Error: "Unexpected token '{'"
  - Source link: `src/components/project-card.tsx` (clickable VS Code link)
- Error overlay renders as a non-dismissible bar (only auto-clears on fix)

**Auto-Dismiss:**
- Reverted the syntax error
- Error overlay auto-dismissed
- Showed "Updated (3ms)" confirming the fix was applied via HMR

**Error Overlay WebSocket:**
- Connects via `ws://localhost:3099/__vertz_errors`
- Error reports sent via `/__vertz_api/report-error` fetch endpoint
- Runtime errors (AuthProvider crash) also displayed with source-mapped locations

### Additional Finding: Error Overlay Shows Runtime Errors Too

During initial page load, the error overlay displayed the AuthProvider crash with:
- Full stack trace
- Source-mapped file locations
- Code context showing the exact line

This is a positive finding — the error overlay handles both build errors (syntax) and runtime errors (TypeError).

## Acceptance Criteria Status

- [x] File save triggers WebSocket HMR update message
- [x] Browser updates the component without full page reload
- [x] Syntax error causes error overlay to appear with file path
- [x] Fixing the error auto-dismisses the overlay
- [x] No new issues found in HMR or error overlay

## Summary

HMR and error overlay are fully functional in the Rust dev server. Both features work as expected with the linear-clone example. The only limitation is that HMR re-execution triggers the AuthProvider crash, which is expected given issue #2302.
