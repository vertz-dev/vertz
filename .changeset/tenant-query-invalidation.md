---
'@vertz/ui': patch
'@vertz/fetch': patch
'@vertz/codegen': patch
---

Auto-invalidate tenant-scoped queries on tenant switch. When `switchTenant()` succeeds, all active queries with `tenantScoped: true` metadata are automatically cleared and refetched, preventing stale cross-tenant data from being visible.

**What changed:**
- `EntityQueryMeta` now includes an optional `tenantScoped` boolean field
- `registerActiveQuery()` accepts an optional `clearData` callback for data clearing before refetch
- `invalidateTenantQueries()` exported from `@vertz/ui` — clears data + refetches all tenant-scoped queries
- `TenantProvider.switchTenant()` calls `invalidateTenantQueries()` automatically on success
- Codegen emits `tenantScoped: true/false` in entity SDK descriptors based on entity configuration
- `QueryEnvelopeStore` gains a `delete(queryKey)` method for per-key cleanup
