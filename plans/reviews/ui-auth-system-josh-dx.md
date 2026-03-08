# UI Auth System -- DX Review (josh)

## Verdict: APPROVE WITH CHANGES

The overall design is strong. `form(auth.signIn)` is genuinely delightful -- it's the kind of thing that makes a developer say "wait, that just works?" The decision to keep auth as a single `useAuth()` hook that returns both state and actions is correct. Splitting them would be a mistake.

But there are several DX gaps that will bite real developers. Some are solvable with small changes. A couple need design decisions before implementation.

---

## DX Wins

**1. `form(auth.signIn)` is brilliant.** This is the headline feature. A developer writes `form(auth.signIn)` and gets client-side validation, field-level error state, submission handling, and auth state transitions -- all for free. Compare this to NextAuth where you manually wire up `signIn()` callbacks, or Clerk where you import a completely different form component. Here, it's the same `form()` they already know.

**2. Single `useAuth()` hook.** State and actions in one place. No `useSession()` + `useSignIn()` + `useSignOut()` import soup. React Query devs who've used `useMutation()` will find this familiar.

**3. SSR hydration eliminates the loading flash.** The `window.__VERTZ_SESSION__` injection means authenticated pages render immediately without the dreaded "loading... loading... oh you're logged in" flicker. This is table stakes for production apps but most frameworks make you figure it out yourself.

**4. MFA as a state machine state is elegant.** `auth.status === 'mfa_required'` is a natural way to model the MFA challenge flow. The developer doesn't need to juggle separate "sign-in-but-not-really" intermediate state -- the state machine tells them exactly what to render.

**5. Consistent with existing patterns.** `AuthGate` follows `AccessGate`. `AuthContext` follows `AccessContext`. Context creation uses `createContext()` with a stable ID. The pattern language is coherent.

---

## DX Concerns

### C1. `auth.signIn` is NOT a real `SdkMethod` -- and the type system will expose this

The `SdkMethod` interface requires `.url` and `.method` properties:

```ts
export interface SdkMethod<TBody, TResult> {
  (body: TBody): PromiseLike<Result<TResult, Error>>;
  url: string;
  method: string;
  meta?: { bodySchema?: FormSchema<TBody> };
}
```

`auth.signIn` is described as "a closure that updates internal auth state signals on success." That's fine for the callable part. But does it also carry `.url` and `.method`? It must, because `form()` reads `sdkMethod.url` for `baseProperties.action` and `sdkMethod.method` for `baseProperties.method`.

The design doc doesn't address how these are attached. The `auth-client.ts` file is listed as "fetch wrappers, SdkMethod factories" -- but the actual construction of these SdkMethod-shaped closures isn't shown.

**Concern:** If `auth.signIn` is a plain closure without `.url`/`.method`, `form()` will produce `action: undefined, method: undefined`. The `<form>` will have no `action` attribute, breaking progressive enhancement (the form won't submit without JS).

**Suggestion:** The design doc should show the SdkMethod factory implementation explicitly. Something like:

```ts
function createAuthMethod<TBody, TResult>(
  basePath: string,
  endpoint: string,
  method: string,
  sideEffect: (result: TResult) => void,
): SdkMethod<TBody, TResult> {
  const fn = async (body: TBody) => {
    const res = await fetch(`${basePath}/${endpoint}`, { ... });
    if (res.ok) sideEffect(res.data);
    return res;
  };
  fn.url = `${basePath}/${endpoint}`;
  fn.method = method;
  return fn as SdkMethod<TBody, TResult>;
}
```

### C2. No validation schemas on auth methods -- `form()` will accept anything

The `form()` function has two overloads:

1. `SdkMethodWithMeta` (has `.meta.bodySchema`) -- schema optional
2. Plain `SdkMethod` -- schema **required**

`auth.signIn` won't have `.meta.bodySchema` because it's hand-crafted, not codegen'd. So the developer MUST pass a schema:

```tsx
// This won't typecheck:
const loginForm = form(auth.signIn); // Error: schema required

// This will:
const loginForm = form(auth.signIn, { schema: signInSchema });
```

But the design doc's E2E example shows `form(auth.signIn, { onSuccess: () => {} })` with **no schema**. That's a compile error.

**This is a DX papercut.** The whole pitch is "zero boilerplate auth forms." If the developer has to import and pass a schema just to make a login form work, the magic evaporates.

**Suggestion:** Either:
- (a) Attach `bodySchema` to the auth SdkMethods (`auth.signIn.meta = { bodySchema: signInSchema }`) so the first overload matches. This means shipping validation schemas with the auth module.
- (b) Add a third `form()` overload that accepts methods without `.meta` and makes schema optional -- but then you lose client-side validation, which is acceptable for auth forms (server validates anyway).

I'd go with (a). The schemas are trivial (`{ email: { required: true, type: 'email' }, password: { required: true, minLength: 8 } }`) and auth forms without client-side validation feel broken.

### C3. Error handling is underspecified

The design doc says `SdkMethod<SignInInput, AuthResponse>` returns `Result<AuthResponse, Error>`. But what error shapes can the developer expect?

Real scenarios:
- Wrong password: What's in `loginForm._form.error`? Is it "Invalid credentials"? A code like `INVALID_CREDENTIALS`?
- Rate limited: Does the error include retry-after info?
- Network failure: Generic `Error` or structured `AuthClientError`?
- Server returned 500: What happens?

The server auth returns structured `AuthError` objects with `.code` properties (`INVALID_CREDENTIALS`, `USER_EXISTS`, `MFA_REQUIRED`, `RATE_LIMITED`). The `AuthClientError` type is mentioned in the `useAuth()` table but never defined.

**Concern:** Without knowing the error shape, developers can't build useful error UIs. "Something went wrong" is not a production error message.

**Suggestion:** Define `AuthClientError` explicitly:

```ts
interface AuthClientError {
  code: string; // 'INVALID_CREDENTIALS' | 'USER_EXISTS' | 'RATE_LIMITED' | ...
  message: string; // Human-readable
  retryAfter?: number; // For rate limiting
}
```

And show how it surfaces in forms:

```tsx
const loginForm = form(auth.signIn, { ... });
// loginForm._form.error -> "Invalid email or password"
// auth.error -> AuthClientError with .code for programmatic handling
```

### C4. `AuthGate` vs `AccessGate` overlap is confusing

The existing `AccessGate` gates on access set loading. The new `AuthGate` gates on auth state loading. A developer building a protected page now has two gates to think about:

```tsx
<AuthProvider>
  <AuthGate fallback={<Loading />}>        {/* Wait for auth */}
    <AccessContext.Provider value={...}>
      <AccessGate fallback={<Loading />}>  {/* Wait for access set */}
        <App />
      </AccessGate>
    </AccessContext.Provider>
  </AuthGate>
</AuthProvider>
```

This is two layers of loading gates for what's conceptually one thing: "is the user's session ready?"

**Concern:** Phase 7 says "Access set loading coordinated with auth loading in AuthGate." This implies AuthGate will eventually subsume AccessGate's role. But the design doesn't make this explicit. Developers who adopt early will build the two-gate pattern, then have to refactor.

**Suggestion:** Either:
- (a) State upfront that AuthGate replaces AccessGate when both are used together, and Phase 7 will wire this up. Deprecate the double-gate pattern in docs.
- (b) Or, better: have `AuthProvider` automatically provide the `AccessContext` when access is configured. One provider, one gate:

```tsx
<AuthProvider>
  <AuthGate fallback={<Loading />}>
    <App />  {/* can() works, useAuth() works */}
  </AuthGate>
</AuthProvider>
```

### C5. `requireAuth` / `requireGuest` can't work without router integration

The design shows:

```tsx
const routes = {
  '/dashboard': {
    component: () => DashboardPage(),
    guard: requireAuth('/login'),
  },
};
```

But `RouteConfig` has no `guard` property. The router's `matchRoute()`, `RouterView`, and `createRouter` don't know about guards. This isn't a small addition -- it requires:

1. Extending `RouteConfig` with `guard?: (match: RouteMatch) => RouteMatch | string`
2. Teaching `RouterView` to check guards before rendering
3. Making guards work with both client-side nav and SSR
4. Deciding: does the guard run before or after loaders?

The design doc lists this as "Unknown #1" but then assigns it to Phase 5 as if it's straightforward. It's not. This is a router feature, not an auth feature.

**Suggestion:** Either:
- (a) Move route guards to a separate design doc/issue. Ship auth without route guards in v1. Developers can use the `AuthGate` / conditional redirect pattern in the meantime.
- (b) Or scope Phase 5 more explicitly: define the `guard` API, the execution order (guard -> loader -> component), the SSR behavior, and the `RouteConfig` type change. This is significant enough to warrant its own section in "Server-side changes needed."

I lean toward (a). Auth without route guards is still useful. Route guards deserve their own design.

### C6. `signOut` return type mismatch with `form()`

`signOut` is typed as `() => Promise<void>` -- it takes no arguments. But it appears alongside the SdkMethods in `useAuth()`. A developer might try:

```tsx
const logoutForm = form(auth.signOut); // Won't work -- signOut isn't an SdkMethod
```

This is a subtle trap. The mental model is "all auth actions work with `form()`" but `signOut` breaks that model.

**Concern:** Minor, but worth addressing in docs/examples. Show `signOut` used as a click handler, not in a form:

```tsx
<button onClick={auth.signOut}>Log Out</button>
```

### C7. `User` type is a loose bag -- `[key: string]: unknown` is an escape hatch

The client `User` type has `[key: string]: unknown`. This means:

```ts
const auth = useAuth();
auth.user.name; // typed as `unknown`, not `string`
```

This forces the developer into unsafe casts for any custom user fields. Coming from Clerk or NextAuth where you extend the `Session` type with a generic, this feels like a step backward.

**Suggestion:** Make `User` generic on `AuthProvider`:

```tsx
interface MyUser extends User {
  name: string;
  avatarUrl: string;
}

<AuthProvider<MyUser>>
  ...
</AuthProvider>

const auth = useAuth<MyUser>();
auth.user.name; // string
```

This is a non-trivial type change (generics flow through context), so it's fine to defer to a follow-up. But flag it as a known DX gap.

---

## Missing Use Cases

### M1. Redirect after login ("where was I going?")

The most common auth UX pattern: user visits `/dashboard`, gets redirected to `/login`, logs in, gets sent back to `/dashboard`. The design shows `onSuccess: () => navigate('/dashboard')` which is a hardcoded redirect.

Real apps need:

```tsx
const { returnTo } = useSearchParams(); // ?returnTo=/dashboard
const loginForm = form(auth.signIn, {
  onSuccess: () => navigate(returnTo || '/dashboard'),
});
```

This isn't framework infrastructure -- it's just a pattern. But it should be shown in the design doc examples. If `requireAuth('/login')` guards exist, they should automatically set `?returnTo=<originalUrl>`.

### M2. Auth state change events

When a token refresh fails (session expired by admin, password changed on another device), the app needs to react. The design says refresh failure transitions to `'unauthenticated'`, but there's no callback/event mechanism.

A developer might want:

```tsx
watch(
  () => auth.status,
  (newStatus, oldStatus) => {
    if (oldStatus === 'authenticated' && newStatus === 'unauthenticated') {
      showToast('Session expired. Please sign in again.');
    }
  },
);
```

This works if `auth.status` is signal-backed (which it is). But it's not shown anywhere. Worth documenting.

### M3. Loading state during sign-in

When the user clicks "Sign In", `loginForm.submitting` is true. Good. But `auth.status` stays `'unauthenticated'` until the response comes back. There's a brief gap where the form shows "submitting" but the auth system doesn't reflect the in-progress sign-in.

Is this a problem? Maybe not -- `loginForm.submitting` is the right thing to check. But developers might check `auth.isLoading` instead and wonder why it's `false` during sign-in.

**Suggestion:** Clarify in the doc: `auth.isLoading` is for session initialization/refresh only, not for sign-in/sign-up operations. Those use `form().submitting`.

### M4. Multi-tab auth synchronization

User signs out in tab A. Tab B should also sign out. The design mentions tab visibility for refresh scheduling but doesn't address cross-tab auth state synchronization.

Most frameworks use `BroadcastChannel` or `storage` events for this:

```ts
// When signOut completes, broadcast to other tabs
window.addEventListener('storage', (e) => {
  if (e.key === '__vertz_auth_event') {
    // refresh auth state
  }
});
```

This can be deferred but should be listed as a non-goal or future work.

### M5. Custom user fields from sign-up

`SignUpInput` has `[key: string]: unknown` on the server side. But the client `SignUpInput` type is `{ email: string; password: string; [key: string]: unknown }`. A developer signing up with custom fields:

```tsx
const signUpForm = form(auth.signUp, { schema: signUpSchema });
// signUpForm.name -- typed? or unknown field access?
```

If `form()` uses `TBody = SignUpInput`, the proxy will create field states for any property name (which is correct). But the developer has no type guidance for which fields exist. This goes back to the generic `User` suggestion in C7.

### M6. Email verification flow integration

The server has email verification (Phase 5-6 of server auth). The design includes `forgotPassword` and `resetPassword` methods but doesn't mention the email verification flow:

- After sign-up, does the user need to verify email?
- Is there a `verifyEmail` SdkMethod?
- How does `auth.user.emailVerified` interact with route guards?

If email verification is intentionally out of scope, list it explicitly in Non-Goals.

---

## API Naming Review

**Good names:**
- `useAuth()` -- obvious, universal. Every auth library uses this.
- `AuthProvider` -- standard React/component framework pattern.
- `signIn` / `signUp` / `signOut` -- consistent verb form. (Not `login`/`register`/`logout`, which is the other common convention. Pick one and stick with it -- `signIn` is fine.)
- `isAuthenticated` / `isLoading` -- boolean helper naming is correct.
- `mfaChallenge` -- clear that it's the MFA verification action, not MFA setup.

**Naming concerns:**

1. **`requireAuth` / `requireGuest`**: Good names, but `requireGuest` is slightly unusual. The concept is "redirect if already authenticated." Alternatives: `guestOnly`, `redirectIfAuth`. I think `requireGuest` is fine -- it's descriptive even if less common.

2. **`AuthGate` vs `AuthGuard`**: The design uses "gate" for the component and "guard" for route-level. This distinction is intentional (`AccessGate` already exists) but developers coming from Vue/Angular where "guard" is the universal term might search for `AuthGuard` first. Not a blocker, but worth a mention in docs.

3. **`auth.refresh`**: Could be confused with "refresh the page." Consider `refreshSession` or `refreshToken` to be explicit. Minor.

4. **`AuthStatus`** including `'idle'`: When would a developer check for `'idle'`? It exists before the first auth check. But with SSR hydration (Phase 3), auth state is `'authenticated'` or `'unauthenticated'` from the start -- `'idle'` only exists during the client-only bootstrap gap. If SSR is the default path, `'idle'` might be unnecessary complexity. Consider whether `'loading'` covers this case.

---

## Recommendation

**Approve with the following changes before implementation:**

1. **(Must fix)** Show the SdkMethod factory implementation in the design doc (C1). Developers and implementers need to see how `.url` and `.method` are attached to closures.

2. **(Must fix)** Resolve the `form()` overload mismatch (C2). Either attach `bodySchema` to auth SdkMethods or add a note about requiring explicit schema. The E2E example currently shows code that won't compile.

3. **(Must fix)** Define `AuthClientError` shape (C3). Error handling can't be an afterthought for auth.

4. **(Should fix)** Clarify `AuthGate` + `AccessGate` relationship (C4). At minimum, document that Phase 7 unifies them. Ideally, design the unified behavior now.

5. **(Should fix)** Descope route guards to a separate issue (C5), or expand Phase 5 significantly with router type changes and execution order.

6. **(Nice to have)** Add `returnTo` pattern to examples (M1).

7. **(Nice to have)** Document `watch()` pattern for auth state changes (M2).

8. **(Defer)** Generic `User<T>` type (C7) -- flag as known DX gap, design separately.

9. **(Defer)** Multi-tab sync (M4) -- list as explicit non-goal for v1.

The core design is sound. `form(auth.signIn)` is the right abstraction. The state machine model is clean. The SSR hydration story is complete. Fix the type/schema issues and clarify the scope boundaries, and this is ready to build.
