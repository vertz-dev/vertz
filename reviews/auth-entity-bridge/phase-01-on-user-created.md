# Phase 1: `onUserCreated` callback + `deleteUser` + entity registry wiring

- **Author:** Implementation agent
- **Reviewer:** Adversarial review agent (Claude Opus 4.6)
- **Commits:** be80d882..c2dfe779
- **Date:** 2026-03-12

## Changes

- `packages/errors/src/domain/auth.ts` (modified) — widened `AuthValidationError.field` to include `'general'`
- `packages/server/src/auth/types.ts` (modified) — new types: `AuthCallbackContext`, `AuthEntityProxy`, `OnUserCreatedPayload`, `onUserCreated` on `AuthConfig`, `_entityProxy` on `AuthConfig`, `deleteUser` on `UserStore`
- `packages/server/src/auth/index.ts` (modified) — `onUserCreated` integration in sign-up and OAuth paths with rollback
- `packages/server/src/auth/user-store.ts` (modified) — `deleteUser` in `InMemoryUserStore`
- `packages/server/src/auth/db-user-store.ts` (modified) — `deleteUser` in `DbUserStore`
- `packages/server/src/auth/__tests__/on-user-created.test.ts` (new) — tests for email/password callback path
- `packages/server/src/auth/__tests__/oauth-routes.test.ts` (modified) — tests for OAuth callback path
- `packages/server/src/auth/__tests__/user-store.test.ts` (modified) — `deleteUser` tests for InMemory
- `packages/server/src/auth/__tests__/shared-user-store.tests.ts` (modified) — shared `deleteUser` behavioral parity tests
- `packages/server/src/create-server.ts` (modified) — `_entityProxy` wiring via `registry.createProxy()`
- `packages/server/src/index.ts` (modified) — barrel re-exports for new types

## CI Status

- [ ] `dagger call ci` passed at `<pending>`

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases (see findings)
- [ ] No security issues (see findings)
- [x] Public API changes match design doc

## Findings

### 1. BUG (High): `_entityProxy` only wired in `hasDbClient && config.auth` path

**File:** `packages/server/src/create-server.ts`, line 292

The `_entityProxy` is only injected into the auth config when both `hasDbClient` and `config.auth` are truthy. This means if someone uses `createServer` with auth but without a `DatabaseClient` (e.g., using an `EntityDbAdapter` or in-memory stores for testing), `_entityProxy` is never set. The `onUserCreated` callback will receive an empty `{}` as `ctx.entities`, and any entity access will fail silently (accessing a property on `{}` returns `undefined`, not an error).

This is a real scenario: the test files in `on-user-created.test.ts` use `createAuth()` directly without `createServer`, and they manually pass `_entityProxy`. But a developer using `createServer({ auth: { ... }, entities: [...] })` **without** a `DatabaseClient` would get a broken `ctx.entities`.

**Recommendation:** Move the `_entityProxy` wiring outside the `hasDbClient` guard. The entity registry is populated regardless of whether `db` is a `DatabaseClient` or an `EntityDbAdapter` (lines 257-261 register entities unconditionally). The proxy should be wired whenever `config.auth` and `config.entities` are both present.

### 2. BUG (High): `signUpData` contains `safeFields` which still leaks into `auth_users`

**File:** `packages/server/src/auth/index.ts`, lines 361-388

The `safeFields` are destructured from `additionalFields` after removing reserved fields (id, createdAt, updatedAt, role, plan, emailVerified). These `safeFields` are then BOTH:
1. Spread into the `AuthUser` object: `{ ...safeFields, id: ..., email: ..., ... }` (line 371)
2. Passed as `signUpData: { ...safeFields }` in the callback payload (line 388)

This means the `AuthUser` object still gets arbitrary fields from the sign-up form via the spread. Per the design doc, `auth_users` should only contain framework fields. The `safeFields` spread into `AuthUser` is the old behavior that the design doc explicitly says should be removed in Phase 2 (item 7: "Remove `safeFields` spread in email sign-up path"). However, this creates an inconsistency: Phase 1 adds `onUserCreated` but leaves the `safeFields` spread in place, meaning developers get BOTH the old behavior (extra fields in auth_users) AND the new callback. The `signUpData` properly excludes reserved fields, which is correct.

**Verdict:** This is technically deferred to Phase 2 per the design doc, so it's not a Phase 1 bug per se. But it should be flagged: until Phase 2 lands, extra sign-up fields go to both places, which could confuse developers. Acceptable for now since both phases ship together.

### 3. CONCERN (Medium): `AuthEntityProxy` is a weaker type than `EntityOperations`

**File:** `packages/server/src/auth/types.ts`, lines 227-233

`AuthEntityProxy` uses `Promise<unknown>` for return types and `unknown` for parameters, while `EntityOperations<ModelDef>` uses actual generic types (`TModel['table']['$response']`, `TModel['table']['$create_input']`, etc.). The `_entityProxy` field on `AuthConfig` is typed as `Record<string, AuthEntityProxy>`, but `registry.createProxy()` returns `Record<string, EntityOperations>`.

This works at runtime because `EntityOperations` is structurally compatible with `AuthEntityProxy` (the methods exist with compatible signatures — `unknown` is the supertype). But it means the developer's `onUserCreated` callback loses all type safety: `ctx.entities.users.create(data)` accepts `Record<string, unknown>` and returns `Promise<unknown>`.

**Verdict:** The design doc acknowledges this tradeoff (callback operates on `Record<string, EntityOperations>` typed loosely). This is acceptable for Phase 1 since the callback is a single integration point, and the developer knows what entity they're operating on. A future improvement could parameterize `AuthCallbackContext` with the entity map, but that's a non-trivial type gymnastics exercise. Not blocking.

### 4. CONCERN (Medium): Rollback does not handle cascading failures

**File:** `packages/server/src/auth/index.ts`, lines 392-396 and 1424-1433

If the `onUserCreated` callback throws and the rollback (`userStore.deleteUser`) also fails, the error from `deleteUser` is swallowed because it's inside the `catch` block of the callback. The original callback error is also discarded (bare `catch` with no variable). This leaves an orphaned auth user in the database with no corresponding entity record.

For the OAuth path (line 1424-1433), there's a double rollback: `unlinkAccount` then `deleteUser`. If `unlinkAccount` succeeds but `deleteUser` fails, you have an orphaned user with no entity record but also no OAuth link (so they can't sign in again).

**Recommendation:** At minimum, log the rollback failure so it's diagnosable. Consider wrapping each rollback step in its own try/catch and logging failures. The response to the user is still an error either way, but the orphaned data should be observable.

### 5. CONCERN (Medium): `onUserCreated` does not fire for trusted-email auto-link path

**File:** `packages/server/src/auth/index.ts`, lines 1354-1367

When a trusted provider auto-links by verified email (line 1356-1366), an existing user is found and the OAuth account is linked, but `onUserCreated` does NOT fire. This is correct per the design doc (the callback is for NEW users only). However, the test suite does not explicitly verify this behavior — that `onUserCreated` does NOT fire when an existing user is auto-linked via trusted email.

**Recommendation:** Add a test case to the OAuth `onUserCreated callback` describe block that sets up `trustEmail: true`, pre-creates a user, does the OAuth flow, and asserts the callback was NOT called. This is a regression safety net.

### 6. CONCERN (Medium): `DbUserStore.deleteUser` does not verify deletion

**File:** `packages/server/src/auth/db-user-store.ts`, line 82

```typescript
async deleteUser(id: string): Promise<void> {
  await this.db.query(sql`DELETE FROM auth_users WHERE id = ${id}`);
}
```

Unlike `createUser` which calls `assertWrite(result, 'createUser')` to verify the write succeeded, `deleteUser` does not check the result. If the DELETE fails (e.g., foreign key constraint from `auth_sessions` or `auth_oauth_accounts` that wasn't cleaned up first), the error is silently swallowed.

In the rollback scenario, this matters: the OAuth path calls `oauthAccountStore.unlinkAccount()` before `userStore.deleteUser()`, which should clear the FK. But if `unlinkAccount` fails silently too, the DELETE will fail on FK constraints.

**Recommendation:** Either add `assertWrite` or at minimum check `result.ok`. The `InMemoryUserStore` version is fine (it just deletes from Maps), but the DB version should be robust.

### 7. MISSING TEST (Low): No test for `onUserCreated` callback receiving the actual `profile.raw` content

The OAuth test checks `p.profile` is defined and has `login: 'mockuser'`, but doesn't verify the full `raw` object structure matches what `getUserInfo` returned. The test should verify that `profile` is exactly `userInfo.raw` — not a subset or transformation.

### 8. MISSING TEST (Low): No test for error response body content on email/password rollback

**File:** `packages/server/src/auth/__tests__/on-user-created.test.ts`, line 108

The test checks `body.error` is defined, but doesn't verify the error shape. The implementation returns `createAuthValidationError('User setup failed', 'general', 'CALLBACK_FAILED')`. The test should assert the error code is `'AUTH_VALIDATION_ERROR'`, the field is `'general'`, and the constraint is `'CALLBACK_FAILED'`. This ensures the error contract is stable.

### 9. OBSERVATION (Low): `AuthValidationError` field widening to `'general'` is a good fit

The `'general'` field value addition to `AuthValidationError` makes semantic sense for callback failures that aren't tied to a specific input field. This is a backward-compatible change (union widening). No issues here.

### 10. OBSERVATION (Low): Re-exports in `index.ts` are complete

`OnUserCreatedPayload`, `AuthCallbackContext`, `AuthEntityProxy` are all re-exported as types from `packages/server/src/index.ts`. This is correct for the public API surface.

### 11. SECURITY (Low): `_entityProxy` naming convention is adequate but not enforced

The `_entityProxy` uses the underscore convention and has a `@internal` JSDoc tag, which is the project convention. Biome's `no-internals-import` rule only flags `@vertz/core/internals` imports, not underscore-prefixed fields. A developer could theoretically pass `_entityProxy` directly. This is acceptable since it's on `AuthConfig` which is an internal detail — developers interact via `createServer({ auth: { onUserCreated } })`, not by constructing `AuthConfig` directly.

## Resolution

### Changes Requested

1. **[High] #1 — `_entityProxy` wiring for non-DatabaseClient path:** This is a real bug that will break the callback for developers using `EntityDbAdapter` instead of `DatabaseClient`. Must be fixed before merge.

2. **[High] #4 — Rollback failure logging:** Add try/catch around rollback operations in both paths and log failures. Orphaned auth users with no entity records are a data integrity issue that must be diagnosable.

3. **[Medium] #5 — Add negative test for trusted-email auto-link:** Ensure `onUserCreated` does NOT fire when an existing user is auto-linked. One additional test case.

4. **[Medium] #6 — `DbUserStore.deleteUser` result checking:** Add `assertWrite` or result check to the DB implementation. The in-memory version is fine.

5. **[Low] #8 — Assert error shape in rollback test:** Strengthen the assertion to check error code, field, and constraint.

Items #2 (safeFields) and #3 (loose typing) are acknowledged as deferred to Phase 2 and future work respectively. Not blocking.
