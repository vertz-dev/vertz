# Phase 2: Remove `mapProfile` + Clean Up Types

- **Author:** implementation agent
- **Reviewer:** claude-opus-4-6 (adversarial review)
- **Commits:** uncommitted (working tree changes on `feat/oauth-profile-mapping`)
- **Date:** 2026-03-12

## Changes

- `packages/server/src/auth/types.ts` (modified) -- removed `TProfile` generic from `OAuthProviderConfig`, removed `mapProfile` from both `OAuthProviderConfig` and `OAuthProvider`, removed `name`/`avatarUrl` from `OAuthUserInfo`, removed `[key: string]: unknown` from `AuthUser`, added auth-entity bridge types (`AuthCallbackContext`, `AuthEntityProxy`, `OnUserCreatedPayload`), added `onUserCreated`/`_entityProxy` to `AuthConfig`, added `deleteUser` to `UserStore`
- `packages/server/src/auth/providers/github.ts` (modified) -- removed `defaultMapProfile`, removed `mapProfile` from returned `OAuthProvider`, removed `name`/`avatarUrl` from `getUserInfo` return
- `packages/server/src/auth/providers/google.ts` (modified) -- same
- `packages/server/src/auth/providers/discord.ts` (modified) -- same, also removed unused `id`/`avatar` intermediate vars
- `packages/server/src/auth/providers/index.ts` (unmodified) -- `GithubProfile`, `GoogleProfile`, `DiscordProfile` still exported
- `packages/server/src/auth/index.ts` (modified) -- removed `mapProfile` call + `mappedFields` spread from OAuth handler, removed `...safeFields` spread into `AuthUser` in email sign-up, added `onUserCreated` callback wiring (both email and OAuth paths), added rollback logic, added new type exports
- `packages/server/src/auth/user-store.ts` (modified) -- added `deleteUser` method to `InMemoryUserStore`
- `packages/server/src/auth/db-user-store.ts` (modified) -- added `deleteUser` method to `DbUserStore`
- `packages/server/src/auth/__tests__/github.test.ts` (modified) -- removed mapProfile test suites, updated getUserInfo assertions (no name/avatarUrl, checks `raw`)
- `packages/server/src/auth/__tests__/google.test.ts` (modified) -- same
- `packages/server/src/auth/__tests__/discord.test.ts` (modified) -- same
- `packages/server/src/auth/__tests__/oauth-routes.test.ts` (modified) -- removed mapProfile test suites, updated mock provider (no mapProfile), added framework-fields-only test, added onUserCreated callback tests
- `packages/server/src/auth/__tests__/types.test-d.ts` (modified) -- removed mapProfile type tests, updated OAuthUserInfo test, added "without mapProfile" structural test
- `packages/server/src/auth/__tests__/on-user-created.test.ts` (new) -- email/password onUserCreated tests: fires callback, provides entities, rolls back on throw, works without callback, excludes reserved fields
- `packages/server/src/auth/__tests__/user-store.test.ts` (modified) -- added deleteUser tests
- `packages/server/src/auth/__tests__/shared-user-store.tests.ts` (modified) -- added deleteUser shared tests
- `packages/server/src/create-server.ts` (modified) -- wires `registry.createProxy()` into auth config as `_entityProxy`
- `packages/server/src/index.ts` (modified) -- exports new types (`AuthCallbackContext`, `AuthEntityProxy`, `OnUserCreatedPayload`)
- `packages/errors/src/domain/auth.ts` (modified) -- added `'general'` to `AuthValidationError.field` union

## CI Status

- [ ] `dagger call ci` not yet run -- review conducted on uncommitted working tree

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases -- see findings
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### Changes Requested

---

#### SEVERITY: MEDIUM -- Stale `name` property in oauth-routes.test.ts mock

**File:** `packages/server/src/auth/__tests__/oauth-routes.test.ts`, line 439

The "empty email" test creates a mock `getUserInfo` that returns `name: 'No Email User'` as a top-level property on the returned `OAuthUserInfo`:

```ts
getUserInfo: async () => ({
  providerId: 'mock-provider-id-456',
  email: '',
  emailVerified: false,
  name: 'No Email User',  // <-- OAuthUserInfo no longer has `name`
  raw: { id: 'mock-provider-id-456', name: 'No Email User' },
}),
```

`OAuthUserInfo` no longer has a `name` field. TypeScript doesn't flag this as an excess property error here because the contextual typing through `Partial<OAuthProvider>` and the inline arrow function's return type inference doesn't trigger excess property checks in this context. The test still passes because the extra property is harmlessly ignored at runtime.

However, this is semantically misleading. A future reader will think `OAuthUserInfo.name` still exists. The `name` should only be in `raw`, not as a top-level property.

**Fix:** Remove `name: 'No Email User',` from the `getUserInfo` return (keep it only in `raw`).

---

#### SEVERITY: LOW -- Test name references `mapProfile` removal rather than positive behavior

**File:** `packages/server/src/auth/__tests__/types.test-d.ts`, line 211

```ts
it('OAuthProvider without mapProfile is structurally correct', () => {
```

This test name frames the behavior negatively ("without mapProfile"). Since `mapProfile` is permanently removed, the test name should describe what IS true, not what's absent. A reader unfamiliar with the history would wonder "what was mapProfile?"

**Suggested rename:** `'OAuthProvider interface is structurally complete'` or simply delete this test, as it's redundant with the existing `'OAuthProvider interface is structurally correct'` test on line 75, which already validates the same interface shape.

---

#### SEVERITY: LOW -- No test for `'general'` field value in `@vertz/errors`

**File:** `packages/errors/src/domain/auth.ts`

The `AuthValidationError.field` union was expanded from `'email' | 'password'` to `'email' | 'password' | 'general'`. The `@vertz/errors` test file (`packages/errors/src/tests/domain/auth.test.ts`) has no test exercising `createAuthValidationError` with `field: 'general'`. This is a cross-package change that should be tested in the errors package itself, not just in the consumer (`on-user-created.test.ts`).

**Fix:** Add a test in `packages/errors/src/tests/domain/auth.test.ts`:
```ts
it('creates error with general field', () => {
  const error = createAuthValidationError('User setup failed', 'general', 'CALLBACK_FAILED');
  expect(error.field).toBe('general');
  expect(error.constraint).toBe('CALLBACK_FAILED');
});
```

---

#### SEVERITY: INFO -- Scope extends beyond Phase 2 acceptance criteria

The diff includes significant additions that are Phase 1 of the auth-entity bridge (not Phase 2's "remove mapProfile"):

- `onUserCreated` callback wiring in `auth/index.ts` (both email and OAuth paths)
- `AuthCallbackContext`, `AuthEntityProxy`, `OnUserCreatedPayload` types
- `deleteUser` on `UserStore` and implementations
- `_entityProxy` wiring in `create-server.ts`
- Rollback logic
- `on-user-created.test.ts` (new file)
- `AuthValidationError.field` union expansion

These are all Phase 1 deliverables per the design doc (lines 267-315). The review was scoped to Phase 2, but the working tree contains both phases as uncommitted changes. This is fine for review purposes -- both phases are coherent and the changes are correct -- but the commit(s) should be organized so each phase's changes are attributable.

---

#### SEVERITY: INFO -- Pre-existing type errors in types.test-d.ts

Three `@ts-expect-error` directives in `types.test-d.ts` (lines 56, 125, 148) are reported as "unused" by the TypeScript compiler. These are pre-existing issues (not introduced by this phase) caused by multiline object literals where the `@ts-expect-error` is on the `const` declaration line but the actual error occurs on a nested property line. TypeScript's `@ts-expect-error` only suppresses errors on the immediately following line.

This isn't a Phase 2 regression, but it does mean `bun run typecheck` will report errors in this file. Worth noting for CI.

---

### What's done well

1. **Complete removal**: All references to `mapProfile` are gone from implementation code. The only remaining mention in `.ts` files is the test name on line 211 of `types.test-d.ts`, which describes the absence (not the presence) of `mapProfile`.

2. **Typed profiles still exported**: `GithubProfile`, `GoogleProfile`, `DiscordProfile` remain exported from `packages/server/src/auth/providers/index.ts`. Developers can still cast `profile as GithubProfile` in their `onUserCreated` callback.

3. **`AuthUser` is properly closed**: The `[key: string]: unknown` index signature is removed. The interface has only framework-controlled fields: `id`, `email`, `role`, `plan?`, `emailVerified?`, `createdAt`, `updatedAt`.

4. **`auth_users` INSERT only writes framework columns**: The `...safeFields` spread is removed from `AuthUser` construction. The `safeFields` are still extracted (for `signUpData` in the callback) but never touch the user record.

5. **Rollback logic is correct**: OAuth rollback unlinks the account AND deletes the user. Email rollback deletes the user. Both handle rollback errors gracefully (log and continue). The `deleteUser` is properly no-op for non-existent IDs.

6. **`onUserCreated` fires before session creation**: The callback runs after `userStore.createUser` but before `createSessionTokens`. If the callback throws, the user is rolled back and no session is created. This ordering is correct -- the developer's entity setup must succeed before the user is considered "created."

7. **Security**: `DbUserStore.deleteUser` uses parameterized SQL (`sql` template literal). No injection risk. The `_entityProxy` is `@internal` and documented as set by `createServer()`.

## Resolution

Pending -- author should address the MEDIUM and LOW findings before committing.
