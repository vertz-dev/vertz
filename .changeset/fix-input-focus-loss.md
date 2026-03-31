---
'@vertz/ui': patch
'@vertz/ui-primitives': patch
'@vertz/ui-server': patch
---

Fix Input component focus loss with value+onInput binding: handle IDL properties (value, checked) via Reflect.set in __spread, preserve getter descriptors in withStyles, and emit reactive source parameter from compiler
