---
'@vertz/server': patch
---

Support custom tenant FK column names in entity CRUD pipeline. The tenant column is now resolved from the model's `_tenant` relation FK instead of being hardcoded to `tenantId`. Apps can use `workspaceId`, `orgId`, or any column name as long as the model declares a tenant relation pointing to it.
