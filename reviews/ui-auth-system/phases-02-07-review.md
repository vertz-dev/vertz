# UI Auth System — Phases 2-7 Adversarial Review

**Reviewer:** Adversarial Agent
**Date:** 2026-03-08
**Scope:** token-refresh, auth-gate, ssr-session, auth-context (Phases 2-7), reactivity.json, signal-api-registry

---

## Verdict: APPROVE WITH CHANGES

The core architecture is solid. Auth methods as `SdkMethodWithMeta`, token refresh with dedup/visibility/offline handling, and SSR session injection are well-implemented. The signal-api registry integration is correct. However, there are several missing tests, a design deviation, a behavioral bug, and a few security surface items that need attention.

---

### Blocking issues (must fix)

#### B1: SSR hydration status mismatch — absent session stays `'idle'` instead of transitioning

**File:** `/packages/ui/src/auth/auth-context.ts` lines 328-339

The design doc Phase 3 acceptance criteria states: "When `window.__VERTZ_SESSION__` is absent (user not logged in), auth state is `'unauthenticated'` immediately (not `'loading'`)."

The implementation initializes `statusSignal` to `'idle'` (line 84) and only transitions to `'authenticated'` when `window.__VERTZ_SESSION__` has a user. When there is no session (guest user), the status remains `'idle'` forever. This means:

1. `AuthGate` will show fallback indefinitely for guests (since `'idle'` is not a "resolved" state).
2. `auth.isLoading` returns `false` but `auth.isAuthenticated` also returns `false`, and `auth.status` is `'idle'` -- an ambiguous state for consumers.

**Fix:** After the SSR hydration block, if `statusSignal.value` is still `'idle'` (no session found), transition to `'unauthenticated'`:

```ts
// After SSR hydration block
if (typeof window !== 'undefined' && statusSignal.value === 'idle') {
  statusSignal.value = 'unauthenticated';
}
```

#### B2: No SSR hydration tests for AuthProvider

**File:** `/packages/ui/src/auth/__tests__/auth-context.test.ts`

Phase 3 acceptance criteria require tests for:
- Client AuthProvider reads `window.__VERTZ_SESSION__` on initialization
- Auth state is `'authenticated'` immediately (no loading flicker)
- Token refresh scheduled from hydrated `expiresAt`
- `signOut()` clears `window.__VERTZ_SESSION__`

None of these are tested. This is a blocking gap because SSR hydration is a core behavior path that's currently untested.

#### B3: `handleAuthError` does not clear error signal on `MFA_REQUIRED`

**File:** `/packages/ui/src/auth/auth-context.ts` lines 135-147

When `error.code === 'MFA_REQUIRED'`, the function transitions status to `'mfa_required'` but does **not** clear `errorSignal`. If a previous auth attempt set an error (e.g., `INVALID_CREDENTIALS`), the stale error persists in `auth.error` even though the status moved to `mfa_required`.

```ts
function handleAuthError(error: Error & Partial<AuthClientError>) {
  if (error.code === 'MFA_REQUIRED') {
    statusSignal.value = 'mfa_required';
    // BUG: errorSignal is NOT cleared here
  } else {
    ...
  }
}
```

**Fix:** Add `errorSignal.value = null;` in the `MFA_REQUIRED` branch.

#### B4: Missing `.test-d.ts` type flow verification

The TDD rules state: "Every phase with generic type parameters MUST include `.test-d.ts` tests proving each generic flows from definition to consumer."

There is no `.test-d.ts` for the auth system. The design doc's Type Flow Map traces generics from `AuthContextValue` through `createContext` to `useAuth()` to `form(auth.signIn)`. These type flows need verification via `@ts-expect-error` tests. At minimum:

- `auth.signIn({})` should error (missing email/password)
- `auth.signOut('arg')` should error (takes no args)
- `auth.mfaChallenge({})` should error (missing code)
- `form(auth.signIn)` should typecheck without explicit schema

---

### Should-fix (recommended)

#### S1: `forgotPassword` and `resetPassword` return type deviates from design doc

**Files:** `/packages/ui/src/auth/auth-context.ts` lines 49-50

Design doc specifies:
- `forgotPassword: SdkMethodWithMeta<ForgotInput, { message: string }>`
- `resetPassword: SdkMethodWithMeta<ResetInput, { message: string }>`

Implementation uses `void` for both. If the server returns `{ message: string }`, the `void` type discards the response data. If the intent is to not use the response, the deviation should be documented and the design doc updated.

#### S2: No tests for `forgotPassword()` and `resetPassword()` actual execution

**File:** `/packages/ui/src/auth/__tests__/auth-context.test.ts`

The tests only verify that `forgotPassword.url` and `resetPassword.url` are correct, but never actually call the functions. There is no test that:
- `forgotPassword({ email: 'a@b.com' })` sends a `POST` to `/api/auth/forgot-password`
- `resetPassword({ token: 'tok', password: 'newpass' })` sends a `POST` to `/api/auth/reset-password`
- Either handles errors correctly

These are Phase 4 acceptance criteria.

#### S3: No test for `mfaChallenge` failure (invalid code)

**File:** `/packages/ui/src/auth/__tests__/auth-context.test.ts`

The test for `mfaChallenge` only tests the success path. Phase 4 acceptance criteria should include a test for when the MFA code is invalid (server returns 401 or 403 with `INVALID_MFA_CODE`). This tests the `handleAuthError` path from the MFA flow.

#### S4: `refresh()` has no deduplication at the auth-context level

**File:** `/packages/ui/src/auth/auth-context.ts` lines 285-306

The `refresh()` function exposed via `useAuth().refresh` has no deduplication. If a user calls `auth.refresh()` twice rapidly, two concurrent `POST /api/auth/refresh` requests are sent. The `createTokenRefresh` controller deduplicates its internal `executeRefresh()`, but the public `refresh()` method does not benefit from that deduplication.

This creates a race condition: two concurrent refresh calls could interleave, with the second call setting `statusSignal.value = 'loading'` while the first's response is being processed, or the first setting `statusSignal.value = 'unauthenticated'` (on failure) while the second's response arrives and sets `'authenticated'`.

**Fix:** Either route public `refresh()` through the same `createTokenRefresh` mechanism, or add a simple dedup guard:

```ts
let refreshInFlight: Promise<void> | null = null;
const refresh = async () => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefresh().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
};
```

#### S5: `AuthProvider` and `AuthGate` have explicit return type annotations

**Files:**
- `/packages/ui/src/auth/auth-context.ts` line 82: `): HTMLElement {`
- `/packages/ui/src/auth/auth-gate.ts` line 19: `): ReadonlySignal<unknown> | unknown {`

The ui-components rules state: "Don't annotate return types — Let TypeScript infer."

`AuthProvider` should not have `: HTMLElement` (it's a lossy upcast). `AuthGate` should not have `: ReadonlySignal<unknown> | unknown`.

#### S6: No AuthGate reactivity test (status change during lifecycle)

**File:** `/packages/ui/src/auth/__tests__/auth-gate.test.ts`

All AuthGate tests create a mock with a fixed status. No test verifies that when `statusSignal` changes from `'idle'` to `'authenticated'`, the AuthGate reactively switches from rendering the fallback to rendering children. This is the primary use case for AuthGate -- it gates on auth state *resolution*, which is inherently a reactive change over time.

#### S7: `token-refresh` — no test for `onRefresh` rejection

**File:** `/packages/ui/src/auth/__tests__/token-refresh.test.ts`

There is no test for what happens when `onRefresh()` rejects. While the current implementation's `.finally()` correctly clears `inflightPromise` even on rejection, the unhandled promise rejection would propagate. A test should verify that:
1. `inflightPromise` is cleared after rejection
2. Subsequent refresh calls work after a rejection

---

### Notes (informational)

#### N1: `as unknown as AccessCheck` double-cast in `access-context.ts`

**File:** `/packages/ui/src/auth/access-context.ts` lines 58, 113

Two instances of `as unknown as AccessCheck` (double-cast). This is flagged by the `no-double-cast` biome plugin. The cast is structurally necessary because the object has `ReadonlySignal<T>` properties but `AccessCheck` declares them as `T` (the compiler auto-unwraps). This is an intentional pattern in the signal-api design, but worth noting.

#### N2: `reschedule` test has a potential timing sensitivity

**File:** `/packages/ui/src/auth/__tests__/token-refresh.test.ts` line 63

```ts
expect(timers[0].delay).toBe(110_000);
```

This expects an exact value but `Date.now()` is called in the implementation. If there's any sub-millisecond delay between `Date.now()` in the test and `Date.now()` in `schedule()`, this could flake. The first test uses a tolerance range (`49_900` to `50_000`), but this second test uses an exact match. Use a tolerance range for consistency.

#### N3: `auth-gate.test.ts` casts results with `as ReadonlySignal<unknown>`

**File:** `/packages/ui/src/auth/__tests__/auth-gate.test.ts`

The tests repeatedly cast `result as ReadonlySignal<unknown>` to read `.value`. This is acceptable for testing but is somewhat fragile -- if `AuthGate`'s return type changes, these tests would still compile due to the cast. Consider using a helper function that asserts the type.

#### N4: `signInSchema` / `signUpSchema` validation schemas use `as Record<string, unknown>` cast

**File:** `/packages/ui/src/auth/auth-types.ts`

The validation schemas cast `data as Record<string, unknown>` in their `parse` methods. This is a pragmatic choice for runtime validation but means TypeScript doesn't help catch mismatches. This is consistent with how other schemas in the codebase work, so no action needed.

#### N5: SSR session script test could verify JSON parseability

**File:** `/packages/ui-server/src/__tests__/ssr-session.test.ts`

The tests verify that certain strings are present/absent in the output, but don't verify that the escaped JSON is actually parseable by a browser. A test that extracts the JSON from the script tag and `JSON.parse()`s it (after reversing the escaping) would be stronger.

#### N6: `AuthProviderProps.accessControl` is a boolean flag

The `accessControl` prop is a boolean. This means the developer can't customize the access-set fetch URL separately from `basePath` -- it's always `${basePath}/access-set`. This is fine for now but could become a limitation if the access-set endpoint lives at a different path than the auth endpoints.
