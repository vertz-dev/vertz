---
'@vertz/ui': patch
'@vertz/ui-auth': patch
---

refactor(ui): UserName/UserAvatar update in-place instead of rebuilding subtree

__child now updates Text.data in-place when the reactive expression returns a
primitive and the existing content is a single text node, avoiding DOM removal
and recreation.

Avatar always renders the img element and toggles visibility via CSS, so
reactive src/alt changes update attributes in-place instead of rebuilding
the entire element via __conditional.
