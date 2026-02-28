---
'@vertz/db': patch
'@vertz/cli': patch
---

Remove legacy domain codegen (defineDomain, generateTypes, generateClient) and domain-gen CLI command. This dead pre-EDA code is superseded by the domain() grouping primitive.
