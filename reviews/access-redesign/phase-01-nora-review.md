# Phase 01 Review — nora (Frontend/DX)

## Scope
API surface of the new `defineAccess()`, developer experience, naming conventions.

## Findings

### Blockers
None.

### Should-Fix

1. **Error messages throw `Error` instead of `VertzException` subclasses** — All validation errors in `defineAccess()` throw plain `Error`. The biome rule `no-throw-plain-error` warns about this. For consistency with the rest of the framework, these should use a framework-specific exception (e.g., `ConfigurationError` or `BadRequestException`). Not blocking because `defineAccess()` runs at startup time, not request time, but should be addressed.

### Observations

- The entity-centric API is a significant DX improvement. Instead of three separate config objects (`hierarchy`, `roles`, `inheritance`), developers declare everything in one `entities` object with co-located `inherits`.
- Entitlement callback `(r) => ({ roles, rules })` with `r.where()` and `r.user.id` is clean. The `__marker` pattern for user field references is non-obvious but documented.
- Lowercase entity names (`organization`, `team`, `project`, `task`) are enforced by convention in tests. No runtime validation enforces lowercase — if needed, that's a follow-up.
- The `RuleContext` type is well-designed — provides just enough for attribute-based rules without exposing internals.
- All integration tests use public imports (`@vertz/server`) — good.
- The test rewrites are comprehensive — every test file was updated to use the new API shape with lowercase entity names.

### Verdict
**Pass.** API surface is intuitive and well-documented through tests. Error handling improvement deferred.
