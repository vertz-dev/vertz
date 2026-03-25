---
'@vertz/ui': patch
'@vertz/ui-compiler': patch
---

Fix query() not re-fetching when reactive state changes after SSR hydration (#1861)

Runtime: call thunk during SSR hydration (when key is derived) to register reactive deps in the effect.
Compiler: auto-wrap `query(descriptor)` in a thunk when the argument references reactive variables.
