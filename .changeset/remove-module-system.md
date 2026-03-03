---
'@vertz/core': patch
'@vertz/server': patch
'@vertz/testing': patch
'@vertz/cli': patch
---

Remove deprecated module system (`createModule`, `createModuleDef`, services, routers) from public API. The entity + action pattern is now the only supported way to define routes. Internal infrastructure (Trie router, middleware runner, schema validation, CORS, error handling) is preserved.
