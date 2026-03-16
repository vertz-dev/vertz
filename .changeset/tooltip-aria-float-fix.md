---
'@vertz/ui-primitives': patch
---

Composed Tooltip trigger now sets `aria-describedby` on the user's child element (not just the primitive wrapper). All four composed primitives (Tooltip, Popover, Select, DropdownMenu) now forward `positioning` options to their underlying primitive `Root()`.
