---
'@vertz/openapi': patch
---

Shorten fallback type names by stripping redundant path segments from operationId.

Generated type names like `ListBrandCompetitorsWebBrandIdCompetitorsGetQuery` are now shortened
to `ListBrandCompetitorsQuery` by removing trailing HTTP method words and URL path segments that
are already encoded in the operation's route.

Closes #2219.
