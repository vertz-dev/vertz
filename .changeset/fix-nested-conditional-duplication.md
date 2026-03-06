---
'@vertz/ui': patch
'@vertz/ui-server': patch
---

Fix nested conditional DOM duplication and stable context IDs for HMR.

Nested `__conditional` calls (from chained ternaries) returned DocumentFragments that lost children after DOM insertion, causing stale text nodes. `normalizeNode()` now wraps fragments in `<span style="display:contents">` for stable parent references.

Framework-internal contexts (`RouterContext`, `OutletContext`, `DialogStackContext`) now have stable IDs so they survive HMR module re-evaluation without breaking `useContext()`.
