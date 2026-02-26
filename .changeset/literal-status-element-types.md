---
'@vertz/errors': patch
'@vertz/ui': patch
---

HTTP error subclasses now expose literal status types (e.g., `FetchNotFoundError.status` is `404`, not `number`), enabling type narrowing after `instanceof` checks. `__element()` now returns specific HTML element types via overloads (e.g., `__element('div')` returns `HTMLDivElement`).
