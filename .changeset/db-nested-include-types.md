---
'@vertz/db': patch
---

feat(db): type nested include in IncludeOption

Nested `include` fields in query options are now validated against the target model's relations when `TModels` is provided to the type system. Invalid nested include keys produce compile-time errors instead of passing silently. Output types (`FindResult`) reflect nested relation data through `IncludeResolve`. Depth cap at 3 typed nesting levels matches the existing runtime cap. Backward compatible — existing code without `TModels` continues to work unchanged.
