---
'@vertz/ui': patch
---

Simplify hydration: automatic strategy replaces manual picker.

- `hydrate(registry)` now auto-detects above/below fold via IntersectionObserver with 200px rootMargin
- Removed public exports: eagerStrategy, lazyStrategy, visibleStrategy, interactionStrategy, idleStrategy, mediaStrategy
- Removed unused `registry` field from MountOptions
