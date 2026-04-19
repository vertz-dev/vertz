---
'@vertz/native-compiler': patch
---

fix(compiler): don't reactify ternaries inside callback bodies in JSX branches

When a conditional's non-JSX branch contained a nested callback with its
own ternary (e.g., `onPick={(v) => selected = v ? env.id : null}`), the
JSX compiler would lift that inner ternary out of its closure, rewriting
it as `__conditional(() => v, () => env.id, () => null)` at the call site.
This produced a runtime `ReferenceError: v is not defined` because the
callback parameter `v` no longer existed in the outer scope.

The branch-level `ConditionalSpanFinder` now stops descending into
function/arrow-function bodies that are strictly nested inside the target
branch span, so imperative ternaries inside callbacks stay in place while
genuine JSX-level nested ternaries (`a ? <X/> : b ? <Y/> : <Z/>`) keep
their reactive `__conditional` wrapping.

Closes #2816.
