---
'@vertz/theme-shadcn': patch
'@vertz/ui-primitives': patch
---

fix: prevent client-side crash when composed primitives fail to resolve in the bundle

Primitives in configureTheme() are now lazily initialized — each is created only on first access instead of all 29 being eagerly initialized during registerTheme(). This isolates import resolution failures to the specific primitive that's broken, rather than crashing the entire theme.

Also adds a guard in withStyles() that throws a descriptive error when a component is undefined, replacing the opaque "Cannot convert undefined or null to object" crash.
