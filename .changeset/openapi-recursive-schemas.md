---
'@vertz/openapi': patch
---

fix(openapi): generate standalone types for recursive component schemas

Component schemas with circular `$ref` references now produce proper type
declarations in `types/components.ts` and `schemas/components.ts`.
Previously, recursive references were emitted as bare type names that
were never defined, causing TS2304 errors.
