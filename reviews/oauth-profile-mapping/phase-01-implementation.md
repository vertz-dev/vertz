# Phase 1: OAuth Profile Mapping Implementation

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Branch:** `feat/oauth-profile-mapping`
- **Date:** 2026-03-12

## Changes

- `packages/server/src/auth/types.ts` (modified) -- `OAuthProviderConfig<TProfile>` generic, `OAuthUserInfo.raw`, `OAuthProvider.mapProfile`
- `packages/server/src/auth/providers/github.ts` (modified) -- `GithubProfile` interface, `defaultMapProfile`, `raw` passthrough
- `packages/server/src/auth/providers/google.ts` (modified) -- `GoogleProfile` interface, `defaultMapProfile`, `raw` passthrough
- `packages/server/src/auth/providers/discord.ts` (modified) -- `DiscordProfile` interface, `defaultMapProfile`, `raw` passthrough
- `packages/server/src/auth/providers/index.ts` (modified) -- re-exports profile types
- `packages/server/src/auth/index.ts` (modified) -- calls `provider.mapProfile(userInfo.raw)` in user creation
- `packages/server/src/auth/__tests__/types.test-d.ts` (modified) -- type-level tests for `raw`, `mapProfile`, generic config
- `packages/server/src/auth/__tests__/github.test.ts` (modified) -- raw passthrough, default/custom mapProfile
- `packages/server/src/auth/__tests__/google.test.ts` (modified) -- raw passthrough, default/custom mapProfile
- `packages/server/src/auth/__tests__/discord.test.ts` (modified) -- raw passthrough, default/custom mapProfile
- `packages/server/src/auth/__tests__/oauth-routes.test.ts` (modified) -- integration tests: default mapping, custom mapping, security override prevention

## CI Status

- [ ] `dagger call ci` passed (not yet run -- pending review)

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases -- **FINDINGS BELOW**
- [x] No security issues (injection, XSS, etc.) -- **FINDINGS BELOW**
- [x] Public API changes match design doc

## Findings

### SEVERITY: HIGH -- `emailVerified` and `plan` Not Protected in OAuth User Creation

**File:** `packages/server/src/auth/index.ts`, lines 1358-1366

The email/password signup path (lines 354-372) explicitly destructures and discards six dangerous fields before spreading user-supplied data:

```ts
const {
  id: _id,
  createdAt: _c,
  updatedAt: _u,
  role: _role,
  plan: _plan,
  emailVerified: _emailVerified,
  ...safeFields
} = additionalFields as Record<string, unknown>;
```

The OAuth path does **none of this filtering**:

```ts
const mappedFields = provider.mapProfile(userInfo.raw);
const newUser: AuthUser = {
  ...mappedFields,   // <-- raw spread, no filtering
  id: crypto.randomUUID(),
  email: userInfo.email.toLowerCase(),
  role: 'user',
  createdAt: now,
  updatedAt: now,
};
```

The secure spread order (`...mappedFields` first, then framework fields override) correctly prevents `id`, `email`, `role`, `createdAt`, and `updatedAt` from being overridden. **However, `emailVerified` and `plan` are NOT in the override list.**

A malicious or buggy `mapProfile` returning `{ emailVerified: true, plan: 'enterprise' }` would successfully set those fields on the created user.

**Impact:**
- `emailVerified: true` bypasses email verification entirely -- the user gets a verified account without proving email ownership. This is a privilege escalation.
- `plan: 'enterprise'` could bypass billing/entitlements.

**Comparison:** The email/password path explicitly strips both fields. The OAuth path must do the same.

**Fix:** Either:
1. Add `emailVerified` and `plan` to the spread override (preferred -- minimal change):
   ```ts
   const newUser: AuthUser = {
     ...mappedFields,
     id: crypto.randomUUID(),
     email: userInfo.email.toLowerCase(),
     role: 'user',
     emailVerified: false,  // or based on provider.trustEmail && userInfo.emailVerified
     createdAt: now,
     updatedAt: now,
   };
   ```
2. Or destructure-and-discard dangerous fields from `mappedFields` before spreading, matching the email/password approach.

Note: `emailVerified` for OAuth users is a nuanced decision. If the provider says the email is verified (`userInfo.emailVerified: true`) and the provider is trusted (`provider.trustEmail: true`), it might be correct to set `emailVerified: true`. But that should be an explicit framework decision, NOT delegated to `mapProfile`.

**Tests missing:** There is a test for `role` and `id` and `email` override prevention but NO test for `emailVerified` or `plan` override prevention.

---

### SEVERITY: HIGH -- `mapProfile` Exceptions Caught By Wrong Error Message

**File:** `packages/server/src/auth/index.ts`, lines 1307-1429

If `mapProfile` throws (e.g., user-supplied callback accesses a field on `undefined`, or the provider API changed shape), the exception is caught by the outer `try/catch` at line 1422:

```ts
} catch {
  const headers = new Headers({
    Location: `${errorRedirect}?error=token_exchange_failed`,
    ...securityHeaders(),
  });
```

The error redirect says `token_exchange_failed`, which is misleading. The user sees "token exchange failed" when the actual problem is in their `mapProfile` callback. This makes debugging extremely difficult.

**Fix:** Wrap `provider.mapProfile()` in its own try/catch with a specific error code like `profile_mapping_failed`, or at minimum differentiate the error in the catch block.

---

### SEVERITY: MEDIUM -- Unsafe `as` Cast Erases Type Safety At Provider Boundary

**Files:** `github.ts:64`, `google.ts:44`, `discord.ts:52`

All three providers cast `mapProfile`:

```ts
mapProfile: (config.mapProfile ?? defaultMapProfile) as (
  raw: Record<string, unknown>,
) => Record<string, unknown>,
```

This cast converts `(profile: GithubProfile) => Record<string, unknown>` to `(raw: Record<string, unknown>) => Record<string, unknown>`. This is a **widening cast** that erases the typed parameter.

**Why this is dangerous:** The `OAuthProvider` interface defines `mapProfile` as `(raw: Record<string, unknown>) => Record<string, unknown>`. But the user-provided callback expects `GithubProfile`. At the call site in `index.ts`, the handler calls `provider.mapProfile(userInfo.raw)` where `userInfo.raw` is `Record<string, unknown>` -- the typed profile interface is lost.

In practice this works today because the providers happen to put the right data in `raw`. But the type system has a hole: nothing enforces that `userInfo.raw` actually conforms to `GithubProfile`. If a provider's API changes (e.g., GitHub renames `avatar_url` to `avatarUrl`), the custom `mapProfile` will silently get `undefined` for the renamed field -- the type system won't catch it because the cast erased the constraint.

**Design gap:** The `OAuthProvider.mapProfile` signature uses `Record<string, unknown>` because the `OAuthProvider` interface is not generic (it's stored in `Map<string, OAuthProvider>` at runtime). The generic `TProfile` from `OAuthProviderConfig<TProfile>` is erased at the provider boundary. This is an inherent design tradeoff, but the `as` cast is the wrong tool -- it should be documented as a known limitation, and the cast should ideally be replaced with a wrapper that validates or at least a `// @ts-expect-error` with explanation.

**Recommendation:** At minimum, replace the `as` casts with a comment explaining why it's safe:

```ts
// Safe: getUserInfo() returns the full provider API response as `raw`,
// which conforms to the typed profile interface for this provider.
mapProfile: (config.mapProfile ?? defaultMapProfile) as OAuthProvider['mapProfile'],
```

---

### SEVERITY: MEDIUM -- No Validation of `mapProfile` Return Value

**File:** `packages/server/src/auth/index.ts`, line 1358

```ts
const mappedFields = provider.mapProfile(userInfo.raw);
```

There is no validation that `mappedFields`:
1. Is actually an object (not `null`, `undefined`, a string, etc.)
2. Does not contain dangerous field types (nested objects, functions, symbols)
3. Has reasonable size (a malicious callback could return an object with thousands of keys)

If `mapProfile` returns `null` or `undefined`, the spread `...mappedFields` will silently produce no fields -- which is probably fine. But if it returns a primitive like `"hello"`, the spread will produce `{ 0: 'h', 1: 'e', ... }` which would corrupt the user record.

**Fix:** Add a runtime guard:

```ts
const mappedFields = provider.mapProfile(userInfo.raw);
if (typeof mappedFields !== 'object' || mappedFields === null || Array.isArray(mappedFields)) {
  // redirect to error or use empty object
}
```

---

### SEVERITY: MEDIUM -- `mapProfile` Only Called For New Users, Not Existing Users

**File:** `packages/server/src/auth/index.ts`, lines 1326-1375

`mapProfile` is only called in the "Create new user" branch (line 1358). When an existing user signs in via OAuth (lines 1328-1344), `mapProfile` is never called. This means:

1. Profile data is never updated on subsequent logins. If a user changes their GitHub name or avatar, the Vertz user record remains stale.
2. This is not documented or tested.

This may be an intentional design choice (create-only, not update), but it should be explicitly documented and tested. Most OAuth implementations offer a hook for updating profile data on login.

**Recommendation:** At minimum, add a test that verifies existing users are NOT updated (to lock in the behavior), and document this as a known limitation / future enhancement.

---

### SEVERITY: LOW -- Provider Tests Call `mapProfile` With Untyped Objects

**Files:** `github.test.ts:174`, `google.test.ts:184`, `discord.test.ts:135`

The tests call `provider.mapProfile()` with plain objects that don't conform to the full profile interfaces:

```ts
// github.test.ts:174
const result = provider.mapProfile({
  name: 'Octocat',
  login: 'octocat',
  avatar_url: 'https://github.com/avatar.jpg',
});
```

This works because `OAuthProvider.mapProfile` accepts `Record<string, unknown>`. But it means the tests don't verify that the default `mapProfile` handles the actual typed profile correctly -- they only test with minimal subsets.

Consider adding at least one test per provider that passes a fully-populated profile object matching the `*Profile` interface.

---

### SEVERITY: LOW -- Missing Negative Type Test for `mapProfile` Return Type

**File:** `types.test-d.ts`

There are good type tests for `OAuthProvider.mapProfile` being required (line 237) and structurally correct (line 255). But there's no negative test verifying that `mapProfile` must return `Record<string, unknown>` and not e.g. `void` or `string`.

```ts
// Missing test:
it('OAuthProvider rejects mapProfile that returns void', () => {
  // @ts-expect-error -- mapProfile must return Record<string, unknown>
  const _provider: OAuthProvider = {
    ...validProvider,
    mapProfile: (_raw) => { console.log('side effect only'); },
  };
});
```

---

### SEVERITY: LOW -- `OAuthUserInfo` Still Has Redundant `name` and `avatarUrl` Fields

`OAuthUserInfo` now has both:
- `name?: string` and `avatarUrl?: string` (legacy fields)
- `raw: Record<string, unknown>` (new field containing the same data)

The `name` and `avatarUrl` on `OAuthUserInfo` are no longer used by the auth handler for user creation (that now goes through `mapProfile`). They're only used for backward compatibility or debugging. Consider deprecating them or documenting that `raw` + `mapProfile` is the canonical path.

---

### SEVERITY: INFO -- Inconsistent Error Handling Pattern

The email/password signup returns `Result<Session, AuthError>` (structured error). The OAuth callback redirects to error URLs with query params. This is expected (OAuth is redirect-based), but the `mapProfile` failure path produces `?error=token_exchange_failed` which is misleading (see HIGH finding above).

---

## Summary

| Severity | Count | Summary |
|----------|-------|---------|
| HIGH | 2 | `emailVerified`/`plan` not protected; misleading error on mapProfile throw |
| MEDIUM | 3 | Unsafe `as` cast; no return value validation; no update on re-login |
| LOW | 3 | Untyped test objects; missing negative type test; redundant fields |
| INFO | 1 | Inconsistent error message |

## Verdict

### Changes Requested

The two HIGH findings must be addressed before merge:

1. **`emailVerified` and `plan` must be protected** in the OAuth user creation spread, matching the email/password path. Add tests for both.
2. **`mapProfile` errors need a distinct error code** so users can debug their callbacks.

The MEDIUM findings are strongly recommended but could be deferred if documented as known limitations.

## Resolution

_Pending -- awaiting author fixes._
