---
'@vertz/server': patch
---

Migrate action pipeline from throwing `NotFoundException` to returning `Result<CrudResult, EntityError>`, aligning custom entity actions with the CRUD pipeline's errors-as-values pattern.
