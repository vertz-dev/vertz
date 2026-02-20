---
'@vertz/server': patch
---

Entity-Driven Architecture (EDA) v0.1.0 — entity system and server integration.

- Added `entity(name, config)` function with full type-safe config (access, before, after, actions, relations)
- Added `EntityContext` with `authenticated()`, `role()`, `tenant()` guard methods
- Added `EntityRegistry` for cross-entity access
- Added CRUD pipeline with before/after lifecycle hooks
- Added custom action pipeline with input schema validation
- Added `enforceAccess()` with deny-by-default semantics
- Added `stripHiddenFields()` and `stripReadOnlyFields()` field filters
- Added `entityErrorHandler()` mapping exceptions to `{ error: { code, message } }`
- Added `generateEntityRoutes()` producing HTTP routes from entity definitions
- Added `createServer()` wrapper injecting entity routes into core
- Removed `domain()` and all `Domain*` types (full replacement)
