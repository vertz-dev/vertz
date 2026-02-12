# ui-021: Add missing hydration strategies (idle/media/visible)

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 6h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** mike review on PR #199 (should-fix #1), follow-ups #8, #9

## Description

The design doc specifies hydration strategies `idle`, `media`, and `visible`, but only `eager`, `interaction`, and `lazy` are implemented. The PR description incorrectly stated "No deviations from design doc."

Additionally:
- `lazyStrategy` falls back to eager when `IntersectionObserver` is unavailable, but this fallback path has no test coverage (follow-up #8)
- If `hydrate()` is called twice on the same page, components will be double-hydrated. Consider adding a `data-v-hydrated` attribute check (follow-up #9)

**File:** `packages/ui/src/hydrate.ts`

## Acceptance Criteria

- [ ] `idleStrategy` hydrates during `requestIdleCallback` (falls back to setTimeout)
- [ ] `mediaStrategy(query)` hydrates when a media query matches
- [ ] `visibleStrategy` hydrates when the element enters the viewport (IntersectionObserver)
- [ ] Test: idleStrategy triggers hydration via requestIdleCallback
- [ ] Test: mediaStrategy triggers hydration when media query matches
- [ ] Test: visibleStrategy triggers hydration when element is visible
- [ ] Test: lazyStrategy falls back to eager when IntersectionObserver is undefined
- [ ] Guard against double hydration (data-v-hydrated attribute or equivalent)
- [ ] Test: calling hydrate() twice on the same root does not double-hydrate
- [ ] Design doc updated to reflect all implemented strategies

## Progress

- 2026-02-12: Ticket created from mike's review on PR #199 + follow-ups #8, #9
