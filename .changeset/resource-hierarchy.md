---
'@vertz/server': patch
---

feat(auth): resource hierarchy with closure table, role inheritance, and defineAccess()

Introduces hierarchical RBAC replacing flat createAccess():
- `defineAccess()` with hierarchy, roles, inheritance, and entitlements config
- `rules.*` builders: role(), entitlement(), where(), all(), any(), authenticated(), fva()
- InMemoryClosureStore for resource hierarchy (4-level depth cap)
- InMemoryRoleAssignmentStore with inheritance resolution (additive, most permissive wins)
- `createAccessContext()` with can(), check(), authorize(), canAll()
- Five-layer resolution engine (flags and plan/wallet stubbed for Phase 8/9)
