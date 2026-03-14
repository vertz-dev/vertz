---
'@vertz/server': patch
---

Add OpenAPI 3.1 spec generation from entity definitions. The `generateOpenAPISpec()` function produces a complete OpenAPI document from entity `expose` configs, including response schemas, create/update input schemas, VertzQL query parameters, relation includes, custom actions, and standard error responses.
