# Phase 1: Subscription & Tenant Architecture Refactoring

- **Author:** Implementation agent
- **Reviewer:** Adversarial review agent
- **Date:** 2026-03-12

## Changes

- `plan-store.ts` -> `subscription-store.ts` (renamed types, methods, fields)
- `db-plan-store.ts` -> `db-subscription-store.ts` (renamed)
- `flag-store.ts` — `orgId` -> `tenantId`
- `wallet-store.ts` — `orgId` -> `tenantId`
- `types.ts` — removed `plan` from `AuthUser`, `ReservedSignUpField`, `UserTableEntry`; added `subscriptionStore`/`walletStore` to `AuthAccessConfig`
- `auth-tables.ts` — removed plan column from `auth_users` DDL
- `db-user-store.ts` — removed plan from INSERT/SELECT/rowToUser
- `access-set.ts` — removed `plan` param, replaced with `subscriptionStore` + `tenantId`
- `access-context.ts` — `planStore` -> `subscriptionStore`, `.getPlan()` -> `.get()`
- `plan-manager.ts` — `planStore` -> `subscriptionStore`, `.getPlan()` -> `.get()`
- `billing/webhook-handler.ts` — `planStore` -> `subscriptionStore`, `.assignPlan()` -> `.assign()`
- `index.ts` (auth) — updated all re-exports
- `index.ts` (server) — updated top-level re-exports
- `packages/docs/guides/server/auth.mdx` — partially updated
- All test files updated

## Review Checklist

### 1. Stale References in Source Code

**PASS** - No stale `PlanStore`, `OrgPlan`, `InMemoryPlanStore`, `DbPlanStore`, `assignPlan`, `getPlan`, `removePlan` references found in source files under `packages/server/src/`.

The old files `plan-store.ts` and `db-plan-store.ts` have been deleted. All imports updated.

### 2. Logic Correctness in `access-set.ts`

**PASS** - Verified:
- The `plan` parameter is removed from `ComputeAccessSetConfig` (line 38-53)
- Plan resolution now goes through `subscriptionStore.get(tenantId)` (line 184)
- Null tenantId correctly results in no plan resolution (line 183: `if (subscriptionStore && tenantId)`)
- Unauthenticated early return has `plan: null` (line 85) -- correct
- Flag resolution uses `tenantId` (line 153-154) -- correct
- Wallet consumption uses `tenantId` (line 267-272) -- correct

### 3. Logic Correctness in `access-context.ts`

**PASS** - Verified:
- Config type uses `subscriptionStore` (line 58)
- All internal `.get()` calls replace `.getPlan()` (lines 170, 319, 525, 627, 764)
- All internal `.getAddOns?.()` calls use `subscriptionStore` (lines 197, 701, 722, 968)
- The `orgResolver` is KEPT as-is (line 64) -- correct, this resolves the org/tenant from a resource
- `resolvedOrgId` local variables are KEPT (lines 200, 268, 507) -- correct, the variable name describes what orgResolver returns

### 4. `index.ts` Call Sites

**PASS** - Both `computeAccessSet` call sites verified:
- **Line 240 (token creation):** passes `subscriptionStore: config.access?.subscriptionStore`, `tenantId: null` -- correct (no tenant at login)
- **Line 1018 (access-set endpoint):** passes `subscriptionStore: config.access?.subscriptionStore`, `tenantId: sessionResult.data.payload?.tenantId ?? null` -- correct (extracts tenantId from session)
- Neither passes `plan: user.plan` -- confirmed old pattern removed

**NOTE:** Neither call site passes `walletStore`. This means `AuthAccessConfig.walletStore` is declared but unused in the computeAccessSet call sites. This is not a regression (the old code didn't pass walletStore either), but it is a gap: wallet/limit data will never appear in the JWT access set. See Finding F-1 below.

### 5. Public API Surface

**PASS** - `packages/server/src/index.ts` verified:
- Old names removed: `DbPlanStore`, `PlanStore`, `OrgPlan`, `InMemoryPlanStore` are gone
- New names exported: `DbSubscriptionStore` (line 189), `InMemorySubscriptionStore` (line 213), `Subscription` (line 153), `SubscriptionStore` (line 154)

### 6. Test Coverage

**PASS** - `access-set.test.ts` has tests for:
- Resolving plan from `subscriptionStore` + `tenantId` (line 362-417)
- Null tenantId resulting in no plan (line 145-158: "stubs flags as empty and plan is null without subscription store")
- No references to old `plan:` config parameter -- confirmed

### 7. Types.ts

**PASS** - Verified:
- `AuthUser` has no `plan` field (line 344-353)
- `ReservedSignUpField` does not include `'plan'` (line 407)
- `AuthAccessConfig` has `subscriptionStore` (line 336) and `walletStore` (line 337)
- `UserTableEntry` has no `plan` field (line 545-554)

### 8. Docs (`auth.mdx`)

**CHANGES REQUESTED** - Multiple stale references found. See findings below.

---

## Findings

### F-1 [INFO] `walletStore` not passed to `computeAccessSet` in `index.ts`

**Severity:** Low (pre-existing gap, not a regression)

`AuthAccessConfig` now declares `walletStore?: WalletStore` (types.ts line 337), but neither `computeAccessSet` call site in `index.ts` passes it:

```ts
// Line 240 — token creation
const accessSet = await computeAccessSet({
  userId: user.id,
  accessDef: config.access.definition,
  roleStore: config.access.roleStore,
  closureStore: config.access.closureStore,
  flagStore: config.access.flagStore,
  subscriptionStore: config.access?.subscriptionStore,
  tenantId: null,
  // walletStore: config.access?.walletStore,  <-- MISSING
});

// Line 1018 — access-set endpoint (same pattern)
```

Without `walletStore`, `computeAccessSet` will never include `limit` metadata in the access set, and `limit_reached` will never appear as a denial reason in the JWT. The `AuthAccessConfig.walletStore` field is dead in the current code.

This was already broken before the refactor (the old code also didn't pass walletStore), so it's not a regression. But since the refactor adds `walletStore` to `AuthAccessConfig`, it should probably be wired through. Otherwise, why add it to the config type?

**Recommendation:** Either wire `walletStore` through to both `computeAccessSet` calls, or remove `walletStore` from `AuthAccessConfig` and add a TODO comment explaining the gap.

---

### F-2 [BUG] Shared test file not renamed: `shared-plan-store.tests.ts`

**Severity:** Medium (naming inconsistency, confusing)

The file `packages/server/src/auth/__tests__/shared-plan-store.tests.ts` was updated internally (content now references `SubscriptionStore`, `subscriptionStoreTests`, etc.), but the **filename** was not renamed to `shared-subscription-store.tests.ts`.

The import in `db-subscription-store.test.ts` line 5 still references the old filename:
```ts
import { subscriptionStoreTests } from './shared-plan-store.tests';
```

This works at runtime but is confusing -- the file says "plan-store" but its content is about "subscription-store".

**Recommendation:** Rename the file to `shared-subscription-store.tests.ts` and update the import.

---

### F-3 [BUG] Test file not renamed: `plan-store.test.ts`

**Severity:** Medium (naming inconsistency)

The file `packages/server/src/auth/__tests__/plan-store.test.ts` was updated internally (now tests `InMemorySubscriptionStore`, `checkAddOnCompatibility`, etc.), but the **filename** was not renamed to `subscription-store.test.ts`.

**Recommendation:** Rename to `subscription-store.test.ts`.

---

### F-4 [BUG] Stale references in `auth.mdx` documentation

**Severity:** High (documentation is wrong, will confuse developers)

Multiple stale references remain in `packages/docs/guides/server/auth.mdx`:

1. **Line 86:** `plan: user.plan` in the JWT claims example -- `AuthUser` no longer has a `plan` field.
   ```ts
   claims: (user) => ({
     plan: user.plan,   // <-- AuthUser no longer has .plan
     orgId: user.orgId,
   }),
   ```

2. **Line 451:** "Reserved auth fields such as `role`, `plan`, `emailVerified`..." -- `plan` is no longer a reserved sign-up field.

3. **Line 623:** `planStore,` in `createAccessContext()` example -- should be `subscriptionStore,`.

4. **Line 667:** `planStore,` in `computeAccessSet()` example -- should be `subscriptionStore,`.

5. **Line 669:** `orgId: user.orgId,` in `computeAccessSet()` example -- should be `tenantId: tenant.id,` or similar. `computeAccessSet` no longer has an `orgId` parameter; it has `tenantId`.

**Recommendation:** Fix all five stale references. The `planStore` -> `subscriptionStore` and `orgId` -> `tenantId` renames must be reflected in the docs.

---

### F-5 [INFO] `orgId` variables kept in `access-context.ts` -- intentional and correct

The internal helper functions in `access-context.ts` use `orgId` as a local variable name (e.g., `resolvedOrgId`). This is correct and intentional -- the variable represents what `orgResolver()` returns, which is conceptually an org/tenant ID. The `orgResolver` callback name is also kept, which is correct since this is a public API and renaming it would be a breaking change.

No action needed.

---

### F-6 [INFO] `access-context.ts` comment says "checkLayers1to3() — checks Layers 1-4"

**Severity:** Trivial

Line 122 of `access-context.ts` has a misleading comment:
```ts
// checkLayers1to3() — internal, checks Layers 1-4 with pre-resolved orgId
```

The function name says "1to3" but the comment says "Layers 1-4". This is a pre-existing naming inconsistency, not introduced by this refactor. No action required for this PR, but worth noting.

---

## Summary

| Finding | Severity | Action Required |
|---------|----------|-----------------|
| F-1: `walletStore` not wired to `computeAccessSet` | Low | No (pre-existing, not regression) |
| F-2: `shared-plan-store.tests.ts` not renamed | Medium | Yes -- rename file |
| F-3: `plan-store.test.ts` not renamed | Medium | Yes -- rename file |
| F-4: Stale references in `auth.mdx` | High | Yes -- fix 5 stale references |
| F-5: `orgId` kept in access-context.ts | Info | No action (correct) |
| F-6: Misleading comment in access-context.ts | Trivial | No (pre-existing) |

## Resolution

**All actionable findings resolved.**

- **F-2 (FIXED):** Renamed `shared-plan-store.tests.ts` → `shared-subscription-store.tests.ts` via `git mv`. Updated import in `db-subscription-store.test.ts`.
- **F-3 (FIXED):** Renamed `plan-store.test.ts` → `subscription-store.test.ts` via `git mv`.
- **F-4 (FIXED):** All 5 stale references in `auth.mdx` corrected:
  1. Removed `plan: user.plan` from JWT claims example
  2. Removed `plan` from reserved sign-up fields text
  3. `planStore,` → `subscriptionStore,` in `createAccessContext()` example
  4. `planStore,` → `subscriptionStore,` in `computeAccessSet()` example
  5. `orgId: user.orgId,` → `tenantId: session.tenantId,` in `computeAccessSet()` example

**Verification:** 1278 server tests pass, typecheck clean, lint clean. No stale references to `PlanStore`, `OrgPlan`, `InMemoryPlanStore`, `DbPlanStore`, `assignPlan`, `getPlan`, `removePlan`, or `user.plan` in source or test files.
