---
'@vertz/ui-primitives': patch
---

fix(ui-primitives): carousel crash — rootEl.querySelectorAll is not a function

Switch ComposedCarousel to use Provider callback pattern instead of JSX pattern.
The JSX pattern assigned the Provider result to a const, which the compiler wrapped
in computed() — making rootEl a signal instead of an HTMLElement, causing
querySelectorAll to fail.
