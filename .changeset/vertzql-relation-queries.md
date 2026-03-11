---
'@vertz/server': patch
'@vertz/db': patch
'@vertz/fetch': patch
'@vertz/codegen': patch
'@vertz/compiler': patch
---

feat: VertzQL relation queries with where/orderBy/limit support

Breaking change to EntityRelationsConfig: flat field maps replaced with structured
RelationConfigObject containing `select`, `allowWhere`, `allowOrderBy`, `maxLimit`.

- Extended VertzQL include entries to support `where`, `orderBy`, `limit`, nested `include`
- Recursive include validation with path-prefixed errors and maxLimit clamping
- Include pass-through from route handler → CRUD pipeline → DB adapter
- GetOptions added to EntityDbAdapter.get() for include on single-entity fetch
- Codegen IR and entity schema manifest include allowWhere/allowOrderBy/maxLimit
