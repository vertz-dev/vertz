---
'@vertz/ui-compiler': patch
---

Hyphenated JSX prop names (e.g. `data-testid`, `aria-label`) on custom components are now quoted in compiled output, producing valid JavaScript object literals.
