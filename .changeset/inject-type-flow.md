---
'@vertz/core': patch
---

Service types injected via `.router({ inject: { ... } })` now flow through to handler `ctx` automatically. Previously, injected services were typed as `unknown`, requiring manual `as` casts in every handler. The router, module def, and HTTP method types now carry a `TInject` generic parameter that preserves the inject map type through `ExtractMethods` and `ResolveInjectMap` utility types.
