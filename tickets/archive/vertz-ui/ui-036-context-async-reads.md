# ui-036: Fix context for async reads (watch/query)

- **Status:** 🟢 Done
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 6h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** mike review on PR #199 (should-fix #5)

## Description

`useContext` uses a call-stack model — the Provider pushes context onto a stack during component initialization and pops it after. If `useContext` is called inside `watch()` or `query()` callbacks that execute after the synchronous component setup phase, the Provider has already popped off the stack, so `useContext` returns `undefined`.

This is a correctness bug that breaks any pattern where context is read asynchronously or in reactive callbacks.

**File:** `packages/ui/src/component/context.ts`

## Acceptance Criteria

- [ ] `useContext` works inside `watch()` callbacks
- [ ] `useContext` works inside `query()` fetcher functions
- [ ] `useContext` works inside `effect()` callbacks
- [ ] Test: component reads context inside `watch()` — returns correct value
- [ ] Test: component reads context inside `query()` fetcher — returns correct value
- [ ] Test: nested providers with async reads return the correct context
- [ ] Existing synchronous context tests still pass

## Progress

- 2026-02-12: Ticket created from mike's review on PR #199
- 2026-02-12: Already implemented — EffectImpl captures/restores context scope. Fixed broken test using vi.waitFor() (not in bun). All 11 context tests pass.
