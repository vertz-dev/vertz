---
'@vertz/compiler': patch
'@vertz/codegen': patch
---

Generate type-safe query parameters for SDK list/get methods. Entities with expose config get typed WhereInput, OrderByInput, IncludeInput, ListQuery, and GetQuery interfaces. Entities without expose fall back to VertzQLParams.
