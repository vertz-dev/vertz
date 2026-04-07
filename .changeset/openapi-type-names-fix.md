---
'@vertz/openapi': patch
---

Derive generated type names (Query, Response, Input, Event) from the cleaned method name instead of the raw operationId. This produces short, readable type names like `FindManyQuery` instead of verbose path-embedded names like `FindManyWebOrganizationsOrganizationIdBrandsGetQuery` when using adapters like `fastapi()`.
