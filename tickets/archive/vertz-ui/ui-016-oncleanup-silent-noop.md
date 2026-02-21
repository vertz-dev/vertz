# ui-016: onCleanup() silently no-ops without disposal scope

- **Status:** 🟢 Done
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 3h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Priority:** P1 (correctness bug — memory leak)

## Description

`onCleanup(fn)` silently discards the callback when called outside an active disposal scope. In the task-manager demo, every route component calls `onCleanup(() => taskQuery.dispose())`, but because there is no disposal scope wrapping route rendering, the cleanup never runs. Queries leak on every navigation.

This was independently flagged by both ava and nora during the PR #210 DX review.

### Current behavior

```ts
// Inside a route component:
const taskQuery = query(() => fetchTasks(), { key: 'tasks' });
onCleanup(() => taskQuery.dispose()); // silently ignored — no active scope
```

No error, no warning. The callback is dropped. The query keeps running after the user navigates away.

### Expected behavior

Either:
1. **Throw** when `onCleanup()` is called without an active scope (fail-fast, like React's "hooks outside component" error), OR
2. **Create an implicit scope** tied to the component's DOM lifecycle so cleanup actually runs when the element is removed

Option 1 is the minimal bug fix. Option 2 is a feature that requires design work (ties into the component model).

## Acceptance Criteria

- [ ] `onCleanup()` called outside a disposal scope throws `DisposalScopeError` (or equivalent)
- [ ] Error message clearly states: "onCleanup() must be called within a disposal scope (effect, component, or createScope)"
- [ ] Existing tests that call `onCleanup()` inside a scope continue to pass
- [ ] New test: calling `onCleanup()` outside any scope throws
- [ ] New test: calling `onCleanup()` inside `createScope()` registers the callback and it runs on dispose

## Progress

- 2026-02-12: Ticket created from PR #210 DX review (ava + nora)
- 2026-02-12: Already implemented — onCleanup() throws DisposalScopeError, _tryOnCleanup() silently discards. Added 3 new tests for _tryOnCleanup coverage.
