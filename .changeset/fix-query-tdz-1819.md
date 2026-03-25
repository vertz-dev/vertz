---
'@vertz/ui': patch
---

fix(ui): prevent TDZ error in query() with reactive descriptor closures (#1819)

Moved `unsubscribeBus` and `unregisterFromRegistry` declarations to the
top of the `query()` function body and converted the inner `dispose`
function from a hoisted function declaration to a const arrow. This
prevents bundler scope-hoisting from reordering `let` declarations past
references, which re-created the TDZ in compiled output despite the
earlier fix in PR #1822.
