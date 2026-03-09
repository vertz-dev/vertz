# UI Auth System -- Frontend & API Re-Review (nora, v2)

## Previous Review

See `ui-auth-system-nora-frontend.md` -- APPROVE WITH CHANGES, 2 blocking + 6 non-blocking concerns.

## Concern-by-Concern Resolution

### Blocking 1: form() schema requirement not reflected in examples

**Status: RESOLVED (with caveat)**

Auth methods are now typed as `SdkMethodWithMeta<TBody, TResult>` (not bare `SdkMethod`). The `createAuthMethod` factory attaches `meta: { bodySchema: schema }` via `Object.assign`. The `form()` first overload matches `SdkMethodWithMeta` and makes `schema` optional. Examples correctly show `form(auth.signIn)` without explicit `schema`. Good.

**Caveat -- schema definitions don't compile.** The design doc defines validation schemas as declarative rule objects:

```ts
const signInSchema: FormSchema<SignInInput> = {
  email: { required: true, type: 'email' },
  password: { required: true, minLength: 1 },
};
```

But the actual `FormSchema<T>` interface (in `packages/ui/src/form/validation.ts`) is:

```ts
export interface FormSchema<T> {
  parse(data: unknown): { ok: true; data: T } | { ok: false; error: unknown };
}
```

These are structurally incompatible. A plain `{ email: { required: true } }` object has no `parse()` method and will fail typecheck. The design doc needs to either:
- Show schemas as objects with a `parse()` method (wrapping the validation rules), or
- Note that an auth-specific schema adapter will be implemented that conforms to `FormSchema<T>`.

This is **non-blocking for the design** (the *approach* is correct -- embed bodySchema, use SdkMethodWithMeta), but the concrete schema examples are wrong and will mislead the implementor.

### Blocking 2: SdkMethod closure construction unspecified

**Status: RESOLVED**

The `createAuthMethod` factory is fully specified with `Object.assign(fn, { url, method, meta: { bodySchema: schema } })`. It returns `SdkMethodWithMeta<TBody, TResult>`. The pattern is concrete, compiles, and correctly attaches all required properties (`url`, `method`, `meta.bodySchema`) to the closure.

The `sideEffect` callback parameter cleanly separates the auth state update from the fetch logic. Good design.

### Non-blocking 3: reactive-source manifest strategy

**Status: RESOLVED**

Changed from `reactive-source` to `signal-api` with explicit property lists. The `reactivity.json` entry correctly uses:

```json
{
  "useAuth": {
    "kind": "function",
    "reactivity": {
      "type": "signal-api",
      "signalProperties": ["user", "status", "isAuthenticated", "isLoading", "error"],
      "plainProperties": ["signIn", "signUp", "signOut", "refresh", "mfaChallenge", "forgotPassword", "resetPassword"]
    }
  }
}
```

This is better than `reactive-source` because it prevents the compiler from attempting `.value` unwrap on function properties. The doc also mentions adding `useAuth` to `SIGNAL_API_REGISTRY` in `signal-api-registry.ts` for consistency. Good.

**Property lists verified against API surface table:**
- Signal properties: `user`, `status`, `isAuthenticated`, `isLoading`, `error` -- all match the reactive state columns in the API table. Correct.
- Plain properties: `signIn`, `signUp`, `signOut`, `refresh`, `mfaChallenge`, `forgotPassword`, `resetPassword` -- all match the non-reactive method columns. Correct.

The doc also acknowledges this as a stopgap and references cross-file analysis as the long-term solution. Good.

### Non-blocking 4: AuthGate render semantics

**Status: RESOLVED**

Explicitly clarified: "Renders children when auth state is **resolved** (any state except `idle`/`loading`). Does NOT gate on `authenticated` -- it's a loading gate, not an auth gate." Semantics match `AccessGate`. Good.

### Non-blocking 5: AuthClientError undefined

**Status: RESOLVED**

`AuthClientError` is now fully defined:

```ts
interface AuthClientError {
  code: AuthErrorCode;
  message: string;
  statusCode: number;
  retryAfter?: number;
}
```

With `AuthErrorCode` as a union of string literal types. Good.

### Non-blocking 6: E2E test scope error

**Status: RESOLVED**

Type tests are now inside a `TypeTests()` component body where `const auth = useAuth()` is in scope. Good.

### Non-blocking 7: createAuthProvider bootstrap

**Status: RESOLVED (implicitly)**

AuthProvider is self-contained. The `refresh` method on `useAuth()` serves as the escape hatch for manual refresh. The design doesn't add a `createAuthProvider()` factory, which is fine -- the AuthProvider component handles all lifecycle internally, consistent with the simpler API surface.

### Non-blocking 8: XSS escaping inconsistency

**Status: RESOLVED**

`createSessionScript()` now uses the exact same pattern as `createAccessSetScript()`:
- `json.replace(/</g, '\\u003c')` (all `<`, not just `</` and `<!--`)
- `\u2028` and `\u2029` line separator escaping
- `escapeAttr(nonce)` for CSP nonce

Identical escaping strategy. Good.

### API consistency 1: AuthGate semantics diverge

**Status: RESOLVED**

See Non-blocking 4 above. Semantics now explicitly match AccessGate.

### API consistency 3: fallback type

**Status: RESOLVED**

Changed to `() => unknown` thunk, matching `AccessGate` convention. The doc notes the compiler wraps JSX attribute values in thunks, so `fallback={<LoadingScreen />}` works in practice. Good.

## New Findings

### Finding 1: (Non-blocking) FormSchema type mismatch in schema definitions

As noted under Blocking 1's caveat, the five `FormSchema` examples in the Types section (`signInSchema`, `signUpSchema`, `mfaSchema`, `forgotPasswordSchema`, `resetPasswordSchema`) use a declarative rule-object format that doesn't match the actual `FormSchema<T>` interface. The real interface requires `{ parse(data: unknown): ... }`.

The implementation will need to create proper schema objects that conform to `FormSchema<T>`. The design doc should show the correct shape, or at minimum note that these rule definitions will be wrapped in a `parse()`-based adapter.

This is non-blocking because the *mechanism* is sound (embed schemas in `meta.bodySchema`, match `SdkMethodWithMeta` overload). Only the example schema literals are wrong.

### Finding 2: (Non-blocking) onError callback type mismatch in form() example

The design doc shows:

```tsx
const loginForm = form(auth.signIn, {
  onError: (error) => {
    // error is AuthClientError
    if (error.code === 'RATE_LIMITED') { ... }
  },
});
```

But `FormOptions.onError` is typed as `(errors: Record<string, string>) => void`, not `(error: AuthClientError) => void`. The `form()` `onError` callback receives a map of field names to error message strings, not a typed error object.

The `AuthClientError` from a failed `signIn` call surfaces through the `Result.error` path, which `form()` converts to `loginForm._form.error` (a string). To get the structured `AuthClientError`, the developer would need to inspect `auth.error` (the signal on the auth context), not `loginForm`'s `onError`.

The design doc should either:
- Fix the example to use `auth.error` for structured error handling, or
- Note that `onError` receives `Record<string, string>` and show the correct pattern:

```tsx
// Structured error handling via auth context signal
watch(() => auth.error, (error) => {
  if (error?.code === 'RATE_LIMITED') {
    showToast(`Too many attempts. Try again in ${error.retryAfter}s`);
  }
});

// Field-level errors via form
const loginForm = form(auth.signIn, {
  onError: (errors) => {
    // errors is Record<string, string>, e.g. { _form: 'Invalid email or password' }
  },
});
```

### Finding 3: (Non-blocking) SdkMethodWithMeta type flow gap -- `createAuthMethod` return type cast

The `createAuthMethod` factory ends with:

```ts
return Object.assign(fn, {
  url: `${basePath}/${endpoint}`,
  method: httpMethod,
  meta: { bodySchema: schema },
}) as SdkMethodWithMeta<TBody, TResult>;
```

`Object.assign` returns `typeof fn & { url: string; method: string; meta: { bodySchema: FormSchema<TBody> } }`. This structurally matches `SdkMethodWithMeta<TBody, TResult>` since:
- `fn` is `(body: TBody) => Promise<Result<TResult, Error>>`, which satisfies the callable signature
- `url: string` and `method: string` are present
- `meta: { bodySchema: FormSchema<TBody> }` is present (non-optional, matching `SdkMethodWithMeta`)

The `as` cast is safe here. TypeScript can't automatically narrow `Object.assign`'s return type to match the `SdkMethodWithMeta` interface (because the callable signature merging is complex), so the cast is justified. Acceptable.

## SdkMethodWithMeta Type Flow Verification

Tracing the full flow:

1. **Factory**: `createAuthMethod<SignInInput, AuthResponse>(basePath, 'signin', 'POST', signInSchema, sideEffect)` returns `SdkMethodWithMeta<SignInInput, AuthResponse>`

2. **Context**: The returned method is stored in `AuthContextValue.signIn`. Since it's a plain function (not a signal), it's listed in `plainProperties` of the `signal-api` manifest entry. The compiler does NOT `.value`-unwrap it. Correct.

3. **useAuth()**: Returns `UnwrapSignals<AuthContextValue>`. `SdkMethodWithMeta` does not extend `ReadonlySignal`, so `Unwrapped<SdkMethodWithMeta<...>>` returns `SdkMethodWithMeta<...>` unchanged. Correct.

4. **form()**: `form(auth.signIn)` matches the first overload `form(SdkMethodWithMeta<TBody, TResult>, options?)` because `auth.signIn` is typed as `SdkMethodWithMeta<SignInInput, AuthResponse>`. The `schema` option is optional. Correct.

5. **FormInstance**: `form()` returns `FormInstance<SignInInput, AuthResponse>`. Properties like `loginForm.email` resolve to `FieldState<string>` via the Proxy. `loginForm.submitting` is a `Signal<boolean>`. Correct.

The type flow is complete and sound from factory to form instance.

## Verdict: APPROVE

All original concerns have been addressed. The two new findings (FormSchema example format, onError callback type) are non-blocking implementation details that the implementor should be aware of but don't affect the design's soundness.

**Summary of remaining non-blocking items for the implementor:**

1. The five `FormSchema` definitions in the Types section use a declarative rule format that doesn't match the actual `FormSchema<T>` interface (which requires `parse()`). Build proper schema objects during implementation.

2. The `onError` example in the "Error surface in forms" section incorrectly shows the callback receiving `AuthClientError`. The actual `form()` `onError` receives `Record<string, string>`. Use `auth.error` signal or `watch()` for structured error access.
