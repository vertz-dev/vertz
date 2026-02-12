# ui-019: Fix __list effect leak on child removal

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 3h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** ben review on PR #199 (noting N3)

## Description

`__list` does not dispose reactive children when removing nodes. When items are removed from a list, any `effect()` or `computed()` created by the removed item's component continue running — they are never cleaned up. This is a memory/effect leak that gets worse over time in long-lived UIs.

**File:** `packages/ui/src/dom/list.ts`

## Acceptance Criteria

- [ ] When an item is removed from a `__list`, its reactive effects are disposed
- [ ] When `__list` receives an entirely new array, old item effects are disposed before new ones are created
- [ ] Test: effect inside a list item stops running after the item is removed
- [ ] Test: computed inside a list item is garbage-collectible after removal
- [ ] No regressions in existing __list tests

## Progress

- 2026-02-12: Ticket created from ben's review on PR #199
