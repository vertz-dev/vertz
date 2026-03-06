---
'@vertz/ui': patch
---

Add `ListTransition` component for animated list item enter/exit. New items get `data-presence="enter"`, removed items get `data-presence="exit"` with DOM removal deferred until CSS animation completes. Initial render items are not animated. Uses comment markers (no wrapper element) and keyed reconciliation with proper scope disposal.

Also wraps `__list` and `listTransition` items in reactive proxies backed by signals. When an item at an existing key changes (e.g., after refetch with index-based keys), the signal updates and any `domEffect` bindings inside the node re-run automatically — without re-creating the DOM node.
