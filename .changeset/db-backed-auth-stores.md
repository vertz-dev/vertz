---
'@vertz/server': patch
---

Add DB-backed auth store implementations (DbUserStore, DbSessionStore, DbRoleAssignmentStore, DbClosureStore, DbFlagStore, DbPlanStore, DbOAuthAccountStore) with dialect-aware DDL for SQLite and PostgreSQL. Export authModels, initializeAuthTables, validateAuthModels, and all DB store classes from @vertz/server.
