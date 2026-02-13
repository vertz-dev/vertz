# ui-019: Compiler conditional & list transforms with disposal scopes

- **Status:** 🟡 In Progress
- **Assigned:** ben (compiler) + nora (runtime)
- **Phase:** v0.1.x patch
- **Estimate:** 12h
- **Blocked by:** ui-016 (onCleanup throw — merged)
- **Blocks:** none
- **PR:** —

## Description

When a developer writes `{condition ? <A/> : <B/>}` in JSX, the compiler currently treats it as an opaque reactive expression and wraps it in `__text(() => expr)`. This means:

1. Branches are re-evaluated every time but not properly swapped as DOM subtrees
2. Effects and cleanup handlers inside branches are never disposed when switching
3. Memory leaks accumulate as stale subscriptions pile up

The fix has two parts:

### Part 1: Runtime — `__conditional` and `__list` disposal scopes

Both `__conditional` (dom/conditional.ts) and `__list` (dom/list.ts) create DOM subtrees without disposal scopes. This means:
- `__conditional`: when the condition flips, effects and `onCleanup()` handlers inside the old branch are never called
- `__list`: when an item is removed from the list, its `renderFn()` subtree's effects and `onCleanup()` handlers are leaked — just does `removeChild` with no cleanup

**What needs to change in `__conditional`:**
- Before calling `trueFn()` or `falseFn()`, push a new disposal scope via `pushScope()`
- After the branch function returns, pop the scope via `popScope()` and store the collected cleanups
- When the condition changes and the old branch is replaced, run `runCleanups()` on the old branch's collected cleanups
- On `dispose()` of the entire conditional, run cleanups for whichever branch is currently active

**What needs to change in `__list`:**
- When calling `renderFn(item)` for a new key, wrap it in `pushScope()` / `popScope()` and store the cleanups per key alongside the node in `nodeMap`
- When a key is removed (lines 32-36), run `runCleanups()` for that key's collected cleanups before `removeChild`
- On `dispose()` of the entire list, run cleanups for all currently rendered items

### Part 2: Compiler — Transform ternaries and .map() to `__conditional()` / `__list()`

The JSX transformer (`jsx-transformer.ts`) needs to detect two patterns and emit the correct DOM helpers:

#### Ternary / `&&` → `__conditional()`

```tsx
// Ternary → __conditional with both branches
{show.value ? <div>Yes</div> : <div>No</div>}
// Emits: __conditional(() => show.value, () => /* compiled Yes */, () => /* compiled No */)

// && → __conditional with empty false branch
{show.value && <div>Content</div>}
// Emits: __conditional(() => show.value, () => /* compiled Content */, () => document.createComment(''))

// Static (non-reactive) ternary → leave as-is, no __conditional needed
{true ? <div>A</div> : <div>B</div>}
// Emits: just the true branch directly (dead code elimination)
```

**Detection heuristic:** A ternary/`&&` expression is a "conditional render" if:
- It's reactive (references a signal/computed)
- At least one branch contains JSX (a `<tag>` or component call)

If the expression is just text (`{x ? "yes" : "no"}`), keep the current `__text()` behavior — no DOM lifecycle needed for text swaps.

#### `.map()` → `__list()`

```tsx
// Reactive list rendering
{items.value.map(item => <TodoItem task={item} />)}
// Emits: __list(container, items, (item) => /* key */, (item) => /* compiled TodoItem */)

// With explicit key
{items.value.map(item => <div key={item.id}>{item.name}</div>)}
// Emits: __list(container, items, (item) => item.id, (item) => /* compiled div */)
```

**Detection heuristic:** A `.map()` call is a "list render" if:
- The receiver is reactive (signal/computed)
- The callback returns JSX

**Key extraction:** If a `key` prop is present on the root element of the map callback, use it. Otherwise, fall back to array index (with a compiler warning that keyed lists are preferred).

**Compiler pipeline placement:** Both detections should happen in the JSX analyzer (step 7) and the transforms in the JSX transformer (step 8). The signal/computed transforms (steps 5-6) have already run, so `.value` access is visible.

### What NOT to do

- Do NOT add `<Show>`, `<Switch>`, or any rendering primitive to the public API
- Do NOT transform non-reactive ternaries — those are static and don't need reactive wrappers
- Do NOT handle deeply nested ternaries specially — let the developer extract to components or use early returns

## Acceptance Criteria

### Runtime — `__conditional` disposal

- [ ] When condition changes from true → false, all `onCleanup()` handlers registered inside the true branch are called
- [ ] When condition changes from false → true, all `onCleanup()` handlers registered inside the false branch are called
- [ ] Effects created inside a branch are disposed when the branch is swapped out (no stale subscriptions)
- [ ] Nested `__conditional` inside a branch: inner conditional is fully disposed when outer branch swaps
- [ ] `dispose()` on the entire conditional runs cleanups for the currently active branch
- [ ] Existing tests continue to pass (basic branch switching)

### Runtime — `__list` disposal

- [ ] When an item is removed from the list, all `onCleanup()` handlers registered inside its `renderFn()` are called
- [ ] Effects created inside a list item's `renderFn()` are disposed when the item is removed
- [ ] When the list is fully cleared (empty array), all items' cleanups fire
- [ ] `dispose()` on the entire list runs cleanups for all currently rendered items
- [ ] Reordering items does NOT trigger cleanup (only removal does)
- [ ] Existing tests continue to pass (basic list rendering and reconciliation)

### Compiler — ternary → `__conditional`

- [ ] `{sig.value ? <A/> : <B/>}` compiles to `__conditional(() => sig.value, () => ..., () => ...)`
- [ ] `{sig.value && <A/>}` compiles to `__conditional(() => sig.value, () => ..., () => document.createComment(''))`
- [ ] Non-reactive ternaries are NOT wrapped in `__conditional`
- [ ] Text-only ternaries (`{x ? "a" : "b"}`) continue using `__text()`, not `__conditional`
- [ ] `__conditional` is auto-imported from `@vertz/ui/internals` when used

### Compiler — `.map()` → `__list`

- [ ] `{items.value.map(item => <X />)}` compiles to `__list(container, items, keyFn, renderFn)`
- [ ] `key` prop on root element of map callback is extracted as the key function
- [ ] Missing `key` prop falls back to index with a compiler warning
- [ ] Non-reactive `.map()` calls are NOT wrapped in `__list`
- [ ] `__list` is auto-imported from `@vertz/ui/internals` when used

### Integration

- [ ] E2E test: component with signal-driven ternary renders correctly, switches branches, effects inside old branch are cleaned up
- [ ] E2E test: component with signal-driven list renders correctly, items removed trigger cleanup
- [ ] Task-manager example app continues to build and pass typecheck

## Progress

- 2026-02-12: Ticket created. Research complete — see exploration agent findings for current compiler/runtime state.
- 2026-02-12: Part 2 (Compiler) DONE — conditional and list transforms added to jsx-transformer.ts with 14 new tests (8 conditional, 6 list), all 205 compiler tests passing
- 2026-02-12: Part 1 (Runtime) PARTIAL — __conditional disposal scopes working (pushScope/popScope/runCleanups), _tryOnCleanup fix applied. __list disposal scopes also fixed (ui-019-list-effect-leak). Remaining: E2E integration tests
