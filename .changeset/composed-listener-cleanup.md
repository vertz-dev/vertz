---
'@vertz/ui-primitives': patch
---

Composed primitives (Dialog, AlertDialog, Sheet, DropdownMenu, Popover) now clean up event listeners on disposal. Previously, `addEventListener` calls on trigger and content elements never had matching `removeEventListener`, causing listener leaks when components were removed from the DOM.
