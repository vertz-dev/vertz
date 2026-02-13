# ui-031: Document UI gotchas and behavioral notes

- **Status:** 🔴 Todo
- **Assigned:** josh (developer advocate)
- **Phase:** v0.2.0
- **Estimate:** 3h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —

## Description

Document known behavioral gotchas so developers aren't surprised.

### What to document

1. **onMount timing (M2):** `onMount()` fires synchronously during component initialization, NOT after DOM insertion.
2. **Controlled mode not yet supported (follow-up #12):** All primitives currently only support uncontrolled mode.
3. **Popover is non-modal (follow-up #11):** No focus trap — correct behavior but needs documentation.
4. **onCleanup outside disposal scope (ui-016):** Throws `DisposalScopeError` when called outside a disposal scope.

## Where to document

- API reference docs for each feature
- A "Gotchas" or "Common Pitfalls" section in the UI guide
- JSDoc on the relevant functions where practical
