# Phase 1 Adversarial Review -- UI Auth System

## Verdict: APPROVE WITH CHANGES

Phase 1 delivers the core signIn/signUp/signOut/refresh/useAuth() foundation with good security defaults (CSRF headers, credentials: 'include', httpOnly cookie assumption). The SdkMethodWithMeta integration is correct and will work with `form()`. However, there are coverage gaps, a design deviation in SSR hydration, and a registry/interface mismatch that should be fixed before merging.

## Findings

### [BLOCKING] Coverage below 90% threshold for auth-context.ts

`bun test --coverage` reports 89.76% line coverage for `packages/ui/src/auth/auth-context.ts`. The project rule in `tdd.md` requires 90%+ per file. Uncovered lines:

- **Lines 124-130**: `signUp` wrapper body (state transitions on signUp call). The signIn wrapper is tested but signUp is never actually invoked in tests -- only its static properties (`url`, `method`, `meta`) are verified.
- **Line 154**: `delete window.__VERTZ_SESSION__` inside signOut.
- **Lines 193-197**: SSR hydration from `window.__VERTZ_SESSION__`.

**Fix**: Add at least one test that calls `auth.signUp()` with a mocked fetch and verifies the state transition (authenticated on success, error on failure). This mirrors the existing `signIn` tests and would push coverage above 90%.

### [BLOCKING] Reactivity registry lists properties not in AuthContextValue

`reactivity.json` and `signal-api-registry.ts` both list `mfaChallenge`, `forgotPassword`, and `resetPassword` as plain properties of `useAuth`. But `AuthContextValue` in `auth-context.ts` does NOT include these properties -- they are planned for Phase 4.

```json
"plainProperties": [
  "signIn", "signUp", "signOut", "refresh",
  "mfaChallenge", "forgotPassword", "resetPassword"
]
```

While this is technically harmless at runtime (the compiler just won't add `.value` to these non-existent properties), it creates a lie in the source of truth. If someone reads the registry, they will believe `useAuth()` returns these methods today. It also means the registry cannot be used for automated validation against the actual interface.

**Fix**: Remove `mfaChallenge`, `forgotPassword`, `resetPassword` from both `reactivity.json` and `signal-api-registry.ts`. Add them in Phase 4 when the interface is extended to include them.

### [SHOULD-FIX] AuthProvider has explicit `: HTMLElement` return type annotation

`auth-context.ts` line 61:

```ts
export function AuthProvider({ basePath = '/api/auth', children }: AuthProviderProps): HTMLElement {
```

The project rule in `.claude/rules/ui-components.md` explicitly says:

> Don't annotate return types -- Let TypeScript infer. `: HTMLElement` is a lossy upcast.

**Fix**: Remove the `: HTMLElement` return type annotation.

### [SHOULD-FIX] SSR hydration code exists but is untested (Phase 1 scope creep)

Lines 192-198 of `auth-context.ts` implement SSR hydration from `window.__VERTZ_SESSION__`:

```ts
if (typeof window !== 'undefined' && window.__VERTZ_SESSION__) {
  const session = window.__VERTZ_SESSION__;
  if (session.user) {
    userSignal.value = session.user;
    statusSignal.value = 'authenticated';
  }
}
```

The design doc places SSR hydration in **Phase 3**, not Phase 1. This code is present without any tests covering it. Per TDD rules: "if it's not tested, it doesn't exist." Either:

1. **Remove it** and implement it properly in Phase 3 with tests, OR
2. **Keep it** but add tests (which would then also fix the coverage gap for these lines).

Option 1 is the cleaner approach -- it keeps Phase 1 focused and avoids shipping untested code. The `window.__VERTZ_SESSION__` global declaration and the `signOut` cleanup (`delete window.__VERTZ_SESSION__`) should also move to Phase 3.

### [SHOULD-FIX] `refresh()` does not clear errorSignal on failure

When `refresh()` fails (non-ok response or network error), it sets `statusSignal = 'unauthenticated'` and `userSignal = null`, but does NOT clear `errorSignal`. If the user was previously in an `error` state (e.g., after a failed signIn), calling `refresh()` and having it also fail leaves the stale `AuthClientError` from the signIn visible via `auth.error`, even though the status is now `unauthenticated`.

Compare with `signOut()` which correctly clears all three signals (lines 150-152):
```ts
userSignal.value = null;
statusSignal.value = 'unauthenticated';
errorSignal.value = null;
```

**Fix**: Clear `errorSignal.value = null` on both failure paths in `refresh()` (lines 170-171 and 174-175).

### [SHOULD-FIX] No signUp state transition tests

The test file has comprehensive signIn tests (success, failure, error recovery, MFA transition) but no equivalent for signUp. While signIn and signUp share the same wrapper pattern, the signUp wrapper is distinct code (lines 123-138) and is never exercised. The acceptance criteria in the design doc explicitly list signUp as part of Phase 1.

**Fix**: Add at least these tests for signUp:
- `signUp` transitions to `authenticated` on success
- `signUp` transitions to `error` on failure

### [SHOULD-FIX] No type-level test file (.test-d.ts) for auth types

The TDD rules require type flow verification via `.test-d.ts` files. The design doc includes explicit type tests:

```ts
// @ts-expect-error -- signIn body requires email and password
auth.signIn({ notEmail: 'test' });

// @ts-expect-error -- signOut takes no arguments
auth.signOut('invalid');
```

No `.test-d.ts` file exists for auth. The generic flow `AuthContextValue -> createContext -> useAuth() -> UnwrapSignals` should be verified with type-level tests, especially:
- `auth.user` is `User | null` (not `Signal<User | null>`)
- `auth.signIn` is still `SdkMethodWithMeta<SignInInput, AuthResponse>` (not unwrapped)
- `auth.signOut` takes no arguments

**Fix**: Create `packages/ui/src/auth/__tests__/auth-context.test-d.ts` with at least the type tests from the design doc.

### [SHOULD-FIX] parseAuthError 409 fallback path not tested

The test at line 121 of `auth-client.test.ts` sends a 409 response WITH `{ code: 'USER_EXISTS', message: 'Email taken' }` in the body. The `parseAuthError` function has a specific fallback for 409 without a body code (line 34):

```ts
code = code === 'SERVER_ERROR' ? 'USER_EXISTS' : code;
message = message === 'An unexpected error occurred'
  ? 'An account with this email already exists'
  : message;
```

This fallback path is never tested. If the server sends a 409 with a non-JSON body (e.g., plain text), the defaults should apply.

**Fix**: Add a test case: `it('defaults to USER_EXISTS for 409 without body code')` that sends a plain text 409 response.

### [NOTE] parseAuthError unconditionally overrides code on 429

Line 40: `code = 'RATE_LIMITED';` for 429 responses always overrides whatever code came from the JSON body. This differs from the 401 and 409 branches which only override if the code is `'SERVER_ERROR'` (the default). The 429 behavior is arguably more correct (rate limiting is always rate limiting regardless of what the body says), but it's inconsistent with the other branches. Also, the message is NOT overridden for 429 without a JSON body, so a plain-text 429 response would produce `{ code: 'RATE_LIMITED', message: 'An unexpected error occurred' }`, which is confusing.

No action required -- just flagging the inconsistency for awareness.

### [NOTE] `as Record<string, unknown>` casts in validation schemas

The validation schemas in `auth-types.ts` use `data as Record<string, unknown>` (line 81, 100, 123, 137, 151) and several narrower casts like `(err as Error & { issues: typeof errors })`. These are necessary because `FormSchema.parse` takes `unknown`, but they are technically unsafe. After the type guard checks (`typeof d.email !== 'string'`), the subsequent `d.email as string` casts are redundant but harmless since TypeScript does not narrow index-signature access.

No action required -- this is the expected pattern for runtime validation.

### [NOTE] `signOut` cleanup of `window.__VERTZ_SESSION__` uses `delete` instead of assignment

Line 154: `delete window.__VERTZ_SESSION__`. The `declare global` block at line 17-20 declares it as optional (`__VERTZ_SESSION__?: ...`), so `delete` is valid. However, if Phase 3 implements `createSessionScript()` which uses `window.__VERTZ_SESSION__ = ...` (assignment), the cleanup should use `window.__VERTZ_SESSION__ = undefined` for consistency, as the design doc also suggests. Low priority -- will be addressed in Phase 3.

### [NOTE] Schemas for Phase 4 features already implemented

`auth-types.ts` includes `mfaSchema`, `forgotPasswordSchema`, and `resetPasswordSchema` along with `MfaInput`, `ForgotInput`, and `ResetInput` types. These are tested in `auth-types.test.ts`. While this is ahead of schedule (Phase 4), having the types and schemas ready is harmless and reduces Phase 4 work. The important thing is that the reactivity registry does NOT forward-declare the methods (see BLOCKING finding above).

### [NOTE] Good: Security defaults are correct

- CSRF header `X-VTZ-Request: 1` on all auth requests
- `credentials: 'include'` on all fetch calls
- No token storage in JavaScript (httpOnly cookie assumption)
- No XSS vector in current Phase 1 (SSR injection is Phase 3)
- Network errors properly wrapped as `NETWORK_ERROR` code
- signOut clears local state even on network failure (fail-safe)

### [NOTE] Good: SdkMethodWithMeta integration is correct

The `createAuthMethod` factory correctly produces objects satisfying `SdkMethodWithMeta`:
- Callable: `(body: TBody) => Promise<Result<TResult, Error>>`
- `url` and `method` attached via `Object.assign`
- `meta.bodySchema` embedded for `form()` auto-validation
- The wrapper in AuthProvider preserves all three static properties

This means `form(auth.signIn)` will work without an explicit `schema` option, matching the design doc's core DX goal.

### [NOTE] Good: HMR stability via context stable ID

`AuthContext` is created with `'@vertz/ui::AuthContext'` stable ID, following the `context-stable-ids.md` rule. The test at line 20-23 of `auth-context.test.ts` verifies identity preservation via the context registry.
