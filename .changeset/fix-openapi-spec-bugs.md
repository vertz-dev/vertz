---
'@vertz/openapi': patch
---

Fix identifier sanitization, CLI bin path, auth field casing, and fallback type names

- Sanitize Zod schema variable names to produce valid JS identifiers (strip hyphens)
- Fix CLI bin entry to import from dist/ instead of src/ for published package
- Handle acronym-prefixed security scheme names (HTTPBearer → httpBearer)
- PascalCase fallback type/schema names derived from operationId
