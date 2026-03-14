---
'@vertz/server': patch
---

Add Entity Expose API — unified `expose` config replacing `relations` for controlling VertzQL query surface.

- `expose.select` restricts which fields appear in API responses
- `expose.allowWhere` / `expose.allowOrderBy` restrict filtering and sorting
- `expose.include` controls relation exposure with fractal structure
- Field-level access descriptors (`rules.*`) for conditional field visibility
- Descriptor-guarded fields return `null` (not field omission)
