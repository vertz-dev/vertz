---
'@vertz/db': patch
'@vertz/server': patch
---

Add VertzQL query builder unification — bridges entity REST API with typed query builder.

**@vertz/db:**
- Add `orderBy` to `ListOptions` type
- Add `createDatabaseBridgeAdapter` to wrap `DatabaseInstance` as `EntityDbAdapter`
- Deprecate `createDbProvider` in favor of `createDb`

**@vertz/server:**
- Add VertzQL parser with bracket-syntax URL params (`where[field]=value`, `orderBy=field:dir`, `limit`, `after`)
- Add `q=` param for base64url-encoded structural queries (select, include)
- Add `POST /api/<entity>/query` fallback for large queries
- Add entity relations config runtime enforcement via `narrowRelationFields`
- Add `validateVertzQL` with hidden field, select, and include validation
- Add `applySelect` for response field narrowing
- Add typed query option types: `TypedSelectOption`, `TypedWhereOption`, `TypedIncludeOption`, `TypedQueryOptions`
- Constrain `EntityRelationsConfig` field narrowing to actual target table columns
- Type `ServerConfig.db` as `DatabaseInstance | EntityDbAdapter` union
- Add `MAX_LIMIT` (1000) to prevent DoS via unbounded result sets
