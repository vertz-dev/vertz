---
'@vertz/openapi': patch
---

Derive generated type names (Query, Response, Input, Event) from the resource name + cleaned method name instead of the raw operationId. This produces readable, unique type names like `BrandsFindManyQuery` instead of verbose path-embedded names like `FindManyWebOrganizationsOrganizationIdBrandsGetQuery` when using adapters like `fastapi()`. The resource prefix ensures uniqueness across files when types are imported together.
