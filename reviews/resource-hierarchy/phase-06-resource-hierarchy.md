# Phase 6 Review — Resource Hierarchy with defineAccess()

## Delivery Check

- [x] `defineAccess()` replaces `createAccess()` with hierarchy, roles, inheritance, entitlements
- [x] `rules.*` builders: role(), entitlement(), where(), all(), any(), authenticated(), fva(), user markers
- [x] InMemoryClosureStore with self-reference rows, ancestor paths, cascade removal, 4-level depth cap
- [x] InMemoryRoleAssignmentStore with assign/revoke/getRoles, getEffectiveRole with inheritance
- [x] `createAccessContext()` with can/check/authorize/canAll
- [x] Five-layer resolution engine (flags/plan/wallet stubbed)
- [x] Public exports from `@vertz/server`
- [x] Integration test with public package imports
- [x] Type flow verification (.test-d.ts)
- [x] Changeset

## TDD Compliance

- [x] Each module started with failing test before implementation
- [x] Tests pass: 620 server tests, 276 integration tests
- [x] Typecheck clean on @vertz/server and @vertz/integration-tests
- [x] Biome lint clean

## Potential Issues

### 1. createAccess() not removed
The old `createAccess()` still exists alongside the new `defineAccess()`. Per breaking changes policy, this is fine for now — downstream consumers can migrate incrementally. However, the PR description should note this as a deferred removal.

### 2. Plan/flag stubs in resolution
The `can()` and `check()` methods stub plan and flag checks as always-pass. This is explicitly out of scope per the issue (Phase 8/9), but the stubs need to be clearly marked for future implementation. They are marked with comments.

### 3. Effective role resolution performance
The `getEffectiveRole()` method iterates through all ancestors and all role assignments for each ancestor. For deep hierarchies (4 levels) with many role assignments, this could be O(ancestors * assignments). The in-memory implementation is acceptable for dev/testing, but the DB implementation should use a single JOIN query.

### 4. canAll() is sequential, not batched
The current `canAll()` calls `can()` in a loop. The design doc mentions "batched hierarchy queries." The in-memory implementation doesn't benefit from batching, but the DB implementation should batch closure table queries.

### 5. Entity AccessRule type collision
The entity module already exports an `AccessRule` type (function-based). The rules module also exports `AccessRule` (union of rule objects). These are not re-exported from the server index together — entity `AccessRule` wins. The rules `AccessRule` is exported from `@vertz/server` via the auth module's re-exports but under a different export path. This needs attention when wiring rules into entity access.

## Security Review

- [x] Deny by default: unknown entitlements return false
- [x] Unauthenticated users always denied
- [x] Config is frozen — cannot be mutated after creation
- [x] Validation prevents misconfigured hierarchy/inheritance
- [x] Most permissive role wins — additive model (matching Zanzibar/IAM)

## Verdict

**PASS.** Delivers what the ticket asks for. The stubbed layers are clearly documented and out of scope. The type flow verification covers all generic paths.
