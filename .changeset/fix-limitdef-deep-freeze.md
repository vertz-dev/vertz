---
'@vertz/server': patch
---

fix(auth): deep-freeze LimitDef.overage sub-object in defineAccess()

The shallow `Object.freeze({ ...v })` on LimitDef left the nested `overage` config mutable. Now freezes the overage sub-object when present.
