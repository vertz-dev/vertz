---
'@vertz/ui-compiler': patch
---

fix(compiler): classify signal API variables passed as function arguments as reactive

Expressions like `{queryMatch(todosQuery, ...)}` were classified as static because
`todosQuery` (a signal API variable from `query()`) was only recognized via property
accesses (`.data`, `.loading`), not when passed as a bare argument. This caused the
compiler to emit `__insert()` instead of `__child()`, breaking hydration — the SSR
`<span style="display:contents">` wrapper was never claimed, so reactive content
(delete dialogs, form updates, checkbox toggles) was invisible after hydration.
