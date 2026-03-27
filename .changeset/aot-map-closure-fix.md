---
'@vertz/ui-compiler': patch
'@vertz/ui-server': patch
---

Fix AOT compiler crash on `.map()` callbacks with closure variables (#1936). The compiler now falls back to runtime evaluation when a map callback defines local variables before its return statement. Also adds graceful fallback from AOT to single-pass SSR when the render function throws at runtime.
