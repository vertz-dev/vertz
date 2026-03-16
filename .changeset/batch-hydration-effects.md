---
'@vertz/ui': patch
---

perf(ui): batch effect registration during tolerant hydration

Add `deferredDomEffect()` variant that defers the first run during hydration.
`__text` and `__attr` now use deferred effects — SSR content is already correct,
so the first execution is skipped during the hydration walk. Effects are flushed
synchronously at `endHydration()`, establishing dependency tracking so reactive
updates work immediately after.

Benchmark: 2.5x faster hydration walk phase for 1000 reactive nodes.
