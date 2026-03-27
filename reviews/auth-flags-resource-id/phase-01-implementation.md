# Phase 1: auth_flags (resource_type, resource_id) alignment

- **Author:** Claude Opus 4.6 (implementation agent)
- **Reviewer:** Claude Opus 4.6 (review agent)
- **Commits:** 15862bd5b
- **Date:** 2026-03-26

## Changes

- packages/server/src/auth/flag-store.ts (modified)
- packages/server/src/auth/db-flag-store.ts (modified)
- packages/server/src/auth/access-set.ts (modified)
- packages/server/src/auth/access-context.ts (modified)
- packages/server/src/auth/auth-tables.ts (modified)
- packages/server/src/auth/auth-models.ts (modified)
- packages/server/src/auth/__tests__/flag-store.test.ts (modified)
- packages/server/src/auth/__tests__/db-flag-store.test.ts (modified)
- packages/server/src/auth/__tests__/shared-flag-store.tests.ts (modified)
- packages/server/src/auth/__tests__/access-set.test.ts (modified)
- packages/server/src/auth/__tests__/access-context.test.ts (modified)
- packages/server/src/auth/__tests__/multi-level-flag-resolution.test.ts (modified)
- packages/server/src/auth/__tests__/auth-tables.test.ts (modified)
- packages/integration-tests/src/__tests__/auth-db-stores.test.ts (modified)
- packages/integration-tests/src/__tests__/reactive-invalidation.test.ts (modified)
- .changeset/auth-flags-resource-id.md (new)
- plans/auth-flags-resource-id.md (new)

## CI Status

- [x] Quality gates passed at 15862bd5b (2058 tests, 0 failures across packages/server/)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases (see findings)
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### 1. SHOULD-FIX: Missing `.test-d.ts` type-level negative test

**Severity:** Should-fix

The design doc (plans/auth-flags-resource-id.md, lines 307-310) explicitly specifies a type-level test:

```typescript
// In flag-store.test-d.ts -- type-level negative test
declare const store: FlagStore;
// @ts-expect-error -- old 3-arg API shape should not compile
store.setFlag('org-1', 'beta_ai', true);
```

This file was not created. Per `.claude/rules/tdd.md`, every phase with type changes must include `.test-d.ts` tests proving the type flow. The old 3-arg API should fail to compile -- a negative type test verifies this.

**Resolution needed:** Create `packages/server/src/auth/__tests__/flag-store.test-d.ts` with the negative type tests from the design doc.

### 2. APPROVED: Correctness of all call sites

Every `FlagStore` call site was verified:

| Call site | resourceType source | Correct? |
|-----------|-------------------|----------|
| `access-context.ts:156` (can) | `resolvedOrg.type` from orgResolver | Yes -- orgResolver returns `{ type: string; id: string }` |
| `access-context.ts:313` (check) | `resolvedOrg.type` from orgResolver | Yes -- same as above |
| `access-set.ts:184` (multi-level) | `entry.type` from ancestor chain | Yes -- chain entries have `type` field |
| `access-set.ts:207` (single-level) | `config.tenantLevel ?? 'tenant'` | Yes -- matches subscription store default |

### 3. APPROVED: No remaining old API references

Searched all packages for `.setFlag(`, `.getFlag(`, `.getFlags(` calls. Every single invocation uses the new 4-arg/3-arg API. Zero remaining 2-arg/3-arg (old) calls.

### 4. APPROVED: Test coverage of resource-type isolation

New test added to both `flag-store.test.ts` and `shared-flag-store.tests.ts`:
- "flags are isolated by resource type (same id, different type)" -- verifies that `('account', 'id-1')` and `('project', 'id-1')` are independent.

New test added to `db-flag-store.test.ts`:
- "hydrates flags for different resource types" -- verifies DB round-trip with different resource types.
- "persists with ON CONFLICT on (resource_type, resource_id, flag) triple" -- verifies upsert correctness.

### 5. APPROVED: Schema correctness

DDL change: `UNIQUE(tenant_id, flag)` replaced with `UNIQUE(resource_type, resource_id, flag)`. The `ON CONFLICT` clause in `DbFlagStore.setFlag()` matches exactly: `ON CONFLICT(resource_type, resource_id, flag)`.

Model change: `tenantId: d.text()` replaced with `resourceType: d.text()` + `resourceId: d.text()`. Correct.

### 6. APPROVED: Test resource types match code paths

| Test context | resourceType used in setFlag | Code path exercised | Match? |
|-------------|------------------------------|---------------------|--------|
| access-set single-level (no tenantLevel) | `'tenant'` | `config.tenantLevel ?? 'tenant'` -> `'tenant'` | Yes |
| access-set multi-level | `'account'`, `'project'` | `entry.type` from ancestor chain | Yes |
| access-context flag tests | `'tenant'` | orgResolver returns `{ type: 'tenant', ... }` | Yes |
| reactive-invalidation (integration) | `'organization'` | orgResolver looks up 'organization' ancestor | Yes |
| reactive-invalidation computeAccessSet | `'tenant'` | Single-level default `'tenant'` | Yes |

### 7. APPROVED: Composite key collision risk

The `key()` method uses `${resourceType}:${resourceId}`. If a resourceType contained a colon (e.g., `'my:type'`), the key `'my:type:id-1'` would be ambiguous with `'my'` + `'type:id-1'`. However, this is the same pattern used by `InMemorySubscriptionStore`, `GrandfatheringStore`, and `PlanVersionStore`. Resource types in practice are simple identifiers like `'tenant'`, `'account'`, `'project'` -- never containing colons. Consistent with existing convention. No action needed.

### 8. APPROVED: Fire-and-forget DB write race conditions

`DbFlagStore.setFlag()` updates the cache synchronously and fires off the DB write asynchronously. If two `setFlag()` calls for the same key happen in rapid succession, the DB writes may arrive out of order. However:

1. The cache is always up-to-date (synchronous writes, single-threaded JS).
2. The DB write uses `INSERT ... ON CONFLICT ... DO UPDATE SET enabled = $val`, so the last write wins.
3. If a `loadFlags()` call happens between the two writes, it could load a stale DB value. But `loadFlags()` is called once at initialization, not during normal operation.
4. This race condition is pre-existing -- it existed before this change and is inherent to the fire-and-forget pattern.

The new test "persists with ON CONFLICT on (resource_type, resource_id, flag) triple" covers the upsert path with a 50ms wait. Adequate for this change.

### 9. APPROVED: Security -- resource_type confusion

The `resourceType` is always determined by framework code, not user input:
- In `access-set.ts`: comes from `config.tenantLevel` (set by framework) or `entry.type` (from ancestor chain resolution)
- In `access-context.ts`: comes from `resolvedOrg.type` (returned by `orgResolver`, framework-provided)

No user-controllable path to inject a wrong `resourceType`. The framework controls the types at every call site.

### 10. NOTE: Design doc Phase 4 (docs update) not completed

The design doc lists Phase 4 as "Docs + changeset + follow-up issues". The changeset was created. The mint-docs only have a bare import listing for `DbFlagStore` with no API examples, so there's nothing concrete to update. However, no follow-up issues were filed for:
- Aligning `OverrideStore` with `(resourceType, resourceId)` pattern
- Aligning `WalletStore` with `(resourceType, resourceId)` pattern
- `AccessEventBroadcaster` consistency audit

These were called out as non-goals in the design doc. Follow-up issues should be filed.

## Resolution

### Blocker: None

### Should-fix:
1. **Missing `.test-d.ts`**: Create `packages/server/src/auth/__tests__/flag-store.test-d.ts` with the negative type test from the design doc.

### Nice-to-have:
1. File follow-up GitHub issues for `OverrideStore`, `WalletStore`, and `AccessEventBroadcaster` alignment as mentioned in the design doc's non-goals section.

### Verdict: **Approved with one should-fix** (missing type-level test)

The implementation is correct, complete, and well-tested. All call sites pass the correct `resourceType`. The schema change is correct. Resource-type isolation is tested. The only gap is the missing `.test-d.ts` file that the design doc explicitly calls for.
