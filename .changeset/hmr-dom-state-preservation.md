---
'@vertz/ui-server': patch
---

Preserve DOM state (form values, focus, scroll positions) across fast refresh hot updates. Previously, `replaceChild` created an entirely new DOM tree, losing transient state like input values, cursor position, and scroll offsets. Now captures state by `name`/`id` attributes before replacement and restores it after.
