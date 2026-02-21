---
'@vertz/fetch': patch
---

Added convenience methods to FetchClient: get(), post(), patch(), put(), delete().
Removed incorrect params-to-query mapping (params are path parameters, handled by codegen at the SDK layer).
