---
'@vertz/ui': patch
'@vertz/ui-primitives': patch
---

Fix composed component test failures: use style.cssText instead of setAttribute for style bindings in compiler and runtime, add missing DOM shim classes (HTMLHeadingElement, HTMLParagraphElement, PointerEvent), fix style/StyleMap sync, and fix HTMLSelectElement.selectedIndex
