---
'@vertz/ui-primitives': patch
'@vertz/theme-shadcn': patch
---

Move event handler wiring (`wireEventHandlers`, `isKnownEventHandler`, `ElementEventHandlers`) from `@vertz/theme-shadcn` to `@vertz/ui-primitives/utils`. Add `applyProps()` utility that combines event wiring and attribute forwarding. Theme components now delegate DOM behavior to primitives.
