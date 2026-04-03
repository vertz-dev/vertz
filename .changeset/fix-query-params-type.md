---
'@vertz/fetch': patch
'@vertz/openapi': patch
---

Widen query param type from `Record<string, unknown>` to `QueryParams` (`object`) so typed interfaces from codegen are assignable without explicit index signatures.
