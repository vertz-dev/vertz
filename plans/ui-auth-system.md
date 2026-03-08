# UI Authentication System — Design Plan

> **Revision 2** — Addresses review findings from josh (DX), mike (Technical), nora (Frontend/API).

## Context

Vertz has a complete server-side auth system (Phases 1-7 done: JWT sessions, OAuth, MFA/TOTP, email verification, password reset, RBAC, access sets, client `can()`). But the UI side has zero session management — no way for the client to track auth state, refresh tokens, handle login/signup flows, or protect routes. This design adds the client-side session infrastructure that integrates with the existing server-side auth.

**Goal:** A developer wraps their app in `<AuthProvider>`, uses `useAuth()` to read auth state, and uses `form(auth.signIn)` for login — same patterns as the rest of the framework.

## Architecture

### Where it lives

Extends `@vertz/ui/auth` (where `can()`, `AccessContext`, `AccessGate` already live). Single import path:

```ts
import { useAuth, AuthProvider, AuthGate, can } from '@vertz/ui/auth';
```

### Core design: `useAuth()` returns state + SdkMethodWithMeta

```tsx
function LoginPage() {
  const auth = useAuth();

  // auth.signIn is an SdkMethodWithMeta — works with form() directly, no schema needed
  const loginForm = form(auth.signIn, {
    onSuccess: () => navigate('/dashboard'),
  });

  return (
    <form onSubmit={loginForm.onSubmit}>
      <input name="email" type="email" />
      <span>{loginForm.email.error}</span>
      <input name="password" type="password" />
      <span>{loginForm.password.error}</span>
      <button type="submit" disabled={loginForm.submitting}>Sign In</button>
    </form>
  );
}
```

Key insight: `auth.signIn` is both an `SdkMethodWithMeta<SignInInput, AuthResponse>` (so `form()` works without explicit schema) AND a closure that updates internal auth state signals on success. The developer doesn't manually wire up state transitions — signing in just works.

### SdkMethod factory pattern (resolves B1, B2)

Auth methods are constructed as `SdkMethodWithMeta` — callable closures with `url`, `method`, and `meta.bodySchema` properties attached:

```ts
function createAuthMethod<TBody, TResult>(
  basePath: string,
  endpoint: string,
  httpMethod: string,
  schema: FormSchema<TBody>,
  sideEffect: (result: TResult) => void,
): SdkMethodWithMeta<TBody, TResult> {
  const fn = async (body: TBody): Promise<Result<TResult, Error>> => {
    const res = await fetch(`${basePath}/${endpoint}`, {
      method: httpMethod,
      headers: { 'Content-Type': 'application/json', 'X-VTZ-Request': '1' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) return err(await parseAuthError(res));
    const data = await res.json();
    sideEffect(data);
    return ok(data);
  };
  return Object.assign(fn, {
    url: `${basePath}/${endpoint}`,
    method: httpMethod,
    meta: { bodySchema: schema },
  }) as SdkMethodWithMeta<TBody, TResult>;
}
```

This satisfies:
- **Callable**: `(body: TBody) => PromiseLike<Result<TResult, Error>>`
- **`url` + `method`**: Attached via `Object.assign`, enabling progressive enhancement in `form()`
- **`meta.bodySchema`**: Embedded schema means `form()` first overload matches — no explicit `schema` option needed
- **Side effects**: The `sideEffect` callback updates internal auth signals (user, status, expiresAt)

### Auth state machine (resolves B6)

```
idle → loading → authenticated | unauthenticated | mfa_required | error
```

- **idle**: Initial state before any auth check
- **loading**: Fetching session (initial load or refresh)
- **authenticated**: Valid session, user available
- **unauthenticated**: No valid session
- **mfa_required**: Sign-in succeeded but MFA verification needed
- **error**: Auth system error (network failure, etc.)

**Error recovery transitions:**
- `error → loading`: Any new `signIn`/`signUp`/`refresh` attempt transitions out of `error`
- `mfa_required → loading`: New `signIn` attempt resets the MFA state
- `authenticated → loading`: Token refresh in progress
- All states except `idle` can transition to `loading` via explicit `signIn`/`signUp`

### How token refresh works

JWT is httpOnly (client can't read it). Server returns `expiresAt` in response body. Client schedules refresh at `expiresAt - 10s`.

```
signin/signup/refresh → { user, expiresAt } → schedule setTimeout → POST /api/auth/refresh → repeat
```

Deduplication: single in-flight refresh promise. Online/offline: defer when offline, debounce `navigator.onLine` transitions, execute on stable reconnect. Tab visibility: skip refresh in hidden tabs, refresh on focus if stale.

**Timer cleanup (resolves S5):** The refresh timer ID is stored and cleared via `onCleanup` when AuthProvider is disposed. This prevents leaked timers in tests and microfrontend scenarios.

**Stale hydration:** If `expiresAt - 10_000ms < Date.now()` at hydration time, refresh fires immediately. This is correct — the refresh endpoint validates the cookie, not the client's `expiresAt`.

### SSR integration (resolves S1)

1. SSR middleware validates JWT, renders with auth state
2. Server injects `window.__VERTZ_SESSION__` with `{ user, expiresAt }` (like existing `__VERTZ_ACCESS_SET__`)
3. Client AuthProvider hydrates from this — no initial `/api/auth/session` fetch needed
4. Access set hydration continues to work via `window.__VERTZ_ACCESS_SET__` (existing)

**SSR guard:** AuthProvider checks `typeof window !== 'undefined'` before reading `__VERTZ_SESSION__`, matching the pattern in `createAccessProvider()`. In SSR context, AuthProvider initializes to `'unauthenticated'` (server middleware handles auth separately via the request's cookie).

### How MFA challenge flow works

1. User submits login form → server returns 403 `MFA_REQUIRED` + sets `vertz.mfa` cookie
2. `auth.signIn` catches this, transitions status to `mfa_required`
3. Component reads `auth.status === 'mfa_required'`, shows MFA form
4. `form(auth.mfaChallenge)` submits TOTP code → server validates + sets session cookies
5. `auth.mfaChallenge` transitions status to `authenticated`

**Known constraint:** The MFA challenge cookie requires `oauthEncryptionKey` to be configured on the server, even when OAuth is not in use. This is a pre-existing server issue, not introduced by this design.

## API Surface

### AuthContext + AuthProvider

```tsx
// AuthContext with HMR-stable ID
export const AuthContext = createContext<AuthContextValue>(
  undefined,
  '@vertz/ui::AuthContext',
);

// Props
interface AuthProviderProps {
  basePath?: string;     // Default: '/api/auth'
  children: (() => unknown) | unknown;
}

// Usage
<AuthProvider basePath="/api/auth">
  <App />
</AuthProvider>
```

### useAuth()

```ts
function useAuth(): UnwrapSignals<AuthContextValue>;
```

Returns (all signal properties auto-unwrapped by compiler):

| Property | Type (unwrapped) | Description |
|---|---|---|
| `user` | `User \| null` | Current user or null |
| `status` | `AuthStatus` | `'idle' \| 'loading' \| 'authenticated' \| 'unauthenticated' \| 'mfa_required' \| 'error'` |
| `isAuthenticated` | `boolean` | Derived: `status === 'authenticated'` |
| `isLoading` | `boolean` | Derived: `status === 'loading'` |
| `error` | `AuthClientError \| null` | Last auth error |
| `signIn` | `SdkMethodWithMeta<SignInInput, AuthResponse>` | Works with `form()` — no schema needed |
| `signUp` | `SdkMethodWithMeta<SignUpInput, AuthResponse>` | Works with `form()` — no schema needed |
| `signOut` | `() => Promise<void>` | Clears session + cookies. Use as click handler, NOT with `form()`. |
| `refresh` | `() => Promise<void>` | Manual token refresh |
| `mfaChallenge` | `SdkMethodWithMeta<MfaInput, AuthResponse>` | MFA TOTP verification |
| `forgotPassword` | `SdkMethodWithMeta<ForgotInput, { message: string }>` | Request password reset |
| `resetPassword` | `SdkMethodWithMeta<ResetInput, { message: string }>` | Reset with token |

**Note:** `signOut` is `() => Promise<void>`, NOT an SdkMethod. It takes no input and doesn't work with `form()`. Use it as a click handler: `<button onClick={auth.signOut}>Log Out</button>`.

### AuthGate (resolves S3)

Renders children when auth state is **resolved** (any state except `idle`/`loading`). Does NOT gate on `authenticated` — it's a loading gate, not an auth gate. Use route-level patterns for auth-only rendering.

Semantics match `AccessGate`: render children once the state is known, regardless of the answer.

```tsx
<AuthGate fallback={() => <LoadingScreen />}>
  {/* Children render for authenticated OR unauthenticated — just not loading */}
</AuthGate>
```

**`fallback` type:** `() => unknown` (thunk), matching `AccessGate` convention. The compiler wraps JSX attribute values in thunks, so `fallback={<LoadingScreen />}` works in practice, but the type signature is `() => unknown`.

### AuthGate + AccessGate relationship (resolves S4)

Phase 6 (AccessContext Integration) will make AuthProvider internally provide the AccessContext. After Phase 6, `AuthGate` replaces the need for a separate `AccessGate` — one provider, one gate:

```tsx
// Before Phase 6 (two providers, two gates)
<AuthProvider>
  <AuthGate fallback={() => <Loading />}>
    <AccessContext.Provider value={createAccessProvider()}>
      <AccessGate fallback={() => <Loading />}>
        <App />
      </AccessGate>
    </AccessContext.Provider>
  </AuthGate>
</AuthProvider>

// After Phase 6 (AuthProvider subsumes AccessContext)
<AuthProvider>
  <AuthGate fallback={() => <Loading />}>
    <App />  {/* useAuth() AND can() both work */}
  </AuthGate>
</AuthProvider>
```

### Reactivity manifest entry (resolves B4)

Register `useAuth` as `signal-api` in `reactivity.json` with explicit signal and plain property lists:

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

**Why `signal-api` not `reactive-source`:** `useAuth()` returns an object with BOTH signal properties (user, status, etc.) AND plain function properties (signIn, signOut, etc.). With `reactive-source`, the compiler would attempt `.value` unwrap on ALL properties, including functions — producing runtime errors (`signIn.value` is `undefined`). With `signal-api`, the compiler knows exactly which properties to unwrap.

**Registry addition:** Also add `useAuth` to `SIGNAL_API_REGISTRY` in `signal-api-registry.ts` with the same property lists, and add `'useAuth'` to the exported API set. This keeps the hand-crafted `reactivity.json` consistent with the manifest generator.

**Note on scaling:** Hardcoding every `use*` wrapper in the registry doesn't scale long-term. Cross-file manifest analysis (per `plans/cross-file-reactivity-analysis.md`) should eventually auto-detect `useAuth → useContext` chains. For now, manual registration is the pragmatic stopgap.

### Redirect after login pattern

The framework doesn't prescribe a specific "return to" mechanism, but the pattern is straightforward:

```tsx
function LoginPage() {
  const auth = useAuth();
  const { navigate } = useAppRouter();
  const returnTo = new URLSearchParams(window.location.search).get('returnTo');

  const loginForm = form(auth.signIn, {
    onSuccess: () => navigate(returnTo || '/dashboard'),
  });
  // ...
}
```

### Auth state change observation

Since auth state is signal-backed, `watch()` works naturally:

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

**Clarification:** `auth.isLoading` reflects session initialization and token refresh only. During `signIn`/`signUp` form submission, use `loginForm.submitting` — the auth status stays at its current value until the response arrives.

## Types (resolves B3)

```ts
// Client-side user (subset of server AuthUser)
interface User {
  id: string;
  email: string;
  role: string;
  emailVerified?: boolean;
  [key: string]: unknown;
}

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'mfa_required' | 'error';

// Auth error with structured code for programmatic handling
interface AuthClientError {
  code: AuthErrorCode;
  message: string;        // Human-readable, suitable for UI display
  statusCode: number;     // HTTP status code from server
  retryAfter?: number;    // Seconds until retry allowed (for RATE_LIMITED)
}

type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'USER_EXISTS'
  | 'USER_NOT_FOUND'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'MFA_REQUIRED'
  | 'INVALID_MFA_CODE'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR';

interface SignInInput { email: string; password: string }
interface SignUpInput { email: string; password: string; [key: string]: unknown }
interface MfaInput { code: string }
interface ForgotInput { email: string }
interface ResetInput { token: string; password: string }

// Server response shape (after expiresAt addition)
interface AuthResponse { user: User; expiresAt: number }

// Validation schemas for SdkMethodWithMeta
const signInSchema: FormSchema<SignInInput> = {
  email: { required: true, type: 'email' },
  password: { required: true, minLength: 1 },
};

const signUpSchema: FormSchema<SignUpInput> = {
  email: { required: true, type: 'email' },
  password: { required: true, minLength: 8 },
};

const mfaSchema: FormSchema<MfaInput> = {
  code: { required: true, minLength: 6, maxLength: 6 },
};

const forgotPasswordSchema: FormSchema<ForgotInput> = {
  email: { required: true, type: 'email' },
};

const resetPasswordSchema: FormSchema<ResetInput> = {
  token: { required: true },
  password: { required: true, minLength: 8 },
};
```

**Error surface in forms:**

```tsx
const loginForm = form(auth.signIn, {
  onError: (error) => {
    // error is AuthClientError
    if (error.code === 'RATE_LIMITED') {
      showToast(`Too many attempts. Try again in ${error.retryAfter}s`);
    }
  },
});

// Field-level errors from server validation
// loginForm.email.error → "Invalid email address"

// Form-level errors
// loginForm._form.error → "Invalid email or password"
```

**Known DX gap (deferred):** `User` has `[key: string]: unknown` for custom fields, meaning `auth.user.name` is typed as `unknown`. A generic `User<T>` pattern (`AuthProvider<MyUser>`, `useAuth<MyUser>()`) would improve this but requires generics flowing through context. Flagged for a follow-up design.

## Server-side changes needed

### 1. Add `expiresAt` to response bodies

In `packages/server/src/auth/index.ts`, modify signin/signup/refresh responses:

```diff
- return new Response(JSON.stringify({ user: result.data.user }), {
+ return new Response(JSON.stringify({
+   user: result.data.user,
+   expiresAt: result.data.expiresAt.getTime(),
+ }), {
```

The `Session` type already has `expiresAt: Date` — just include it in the JSON response as a Unix timestamp.

### 2. SSR session injection (resolves B5)

Add `createSessionScript()` in `packages/ui-server/src/ssr-session.ts`, using the same XSS escaping as `createAccessSetScript()`:

```ts
export function createSessionScript(
  session: { user: User; expiresAt: number },
  nonce?: string,
): string {
  const json = JSON.stringify(session);

  // XSS prevention — same pattern as createAccessSetScript():
  // - Escape all < (covers </script>, <!--, CDATA)
  // - Escape \u2028 and \u2029 (line/paragraph separators that break JS parsing)
  const escaped = json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const nonceAttr = nonce ? ` nonce="${escapeAttr(nonce)}"` : '';
  return `<script${nonceAttr}>window.__VERTZ_SESSION__=${escaped}</script>`;
}
```

**signOut cleanup:** `signOut()` sets `window.__VERTZ_SESSION__ = undefined` after the server call succeeds, preventing stale session re-hydration on page refresh before SSR re-renders.

## Manifesto Alignment

### Principles served

- **Convention over configuration**: `<AuthProvider>` just works with default `/api/auth` base path. Zero config for the common case.
- **Forms are the primitive**: Auth operations are `SdkMethodWithMeta`s that plug directly into `form()`. No special auth form primitives. No explicit schema needed.
- **Signals are invisible**: Auth state uses signals internally but developers never see `.value` — compiler auto-unwraps via `useAuth()` with `signal-api` manifest classification.
- **Server-client symmetry**: SSR hydration means auth state is consistent between server render and client mount.

### Tradeoffs

- **SdkMethodWithMeta constraint**: `auth.signIn` must conform to `SdkMethodWithMeta` shape, which means it returns `Result<T, E>` and carries a `bodySchema`. This is fine because all server auth endpoints already return Result-shaped responses, and the validation schemas are trivial.
- **Single AuthProvider**: No nested auth contexts. One auth state per app. This is intentional — auth is global state.
- **httpOnly JWT**: Client can't read token contents. Trade: more secure, but requires server round-trip for any token inspection.
- **Embedded schemas**: Auth SdkMethods ship with built-in FormSchemas. Trade: less flexible (can't customize password rules via `form()` options), but zero-config for the common case. Developers who need custom validation can still pass `schema` to `form()` to override.

### What was rejected

- **Redux-style auth store**: Too much boilerplate. Vertz already has signals.
- **Separate `useAuthActions()` hook**: Splitting state from actions forces developers to import two hooks. Single `useAuth()` is simpler.
- **Client-side JWT decoding**: Security risk. Server returns user data in response body instead.
- **`reactive-source` classification**: Would cause compiler to `.value`-unwrap function properties. `signal-api` with explicit property lists is correct.

## Non-Goals

- OAuth provider integration on the client (server handles OAuth redirects, client just sees the session)
- Role/permission management UI (that's an admin feature, not framework infrastructure)
- Session storage adapter abstraction (httpOnly cookies only — the secure default)
- Multi-tenant auth (single tenant per app instance)
- Passwordless/magic-link auth (can be added later as additional SdkMethods)
- Multi-tab auth synchronization via BroadcastChannel (deferred — can be added later, server-side cookie invalidation already handles the security aspect)
- Email verification flow (`verifyEmail` SdkMethod — can be added as a follow-up, server-side support exists)
- Generic `User<T>` type (deferred — requires generics flowing through context, separate design)
- Route guards (`requireAuth`/`requireGuest`) — descoped to separate design (see below)

## Route Guards — Descoped (resolves S2)

Route guards (`requireAuth('/login')`, `requireGuest('/dashboard')`) are **descoped from this design** and will be a separate issue/design doc. Reasons:

1. `RouteConfig` has no `guard` property today
2. Adding guards requires router type system changes, `RouterView` rendering logic changes, and decisions about sync vs. async guard execution order (guard → loader → component)
3. This is a **router feature**, not an auth feature — it should be generic (usable for any gating pattern, not just auth)

**Interim pattern:** Developers use `AuthGate` + conditional redirects:

```tsx
function ProtectedPage() {
  const auth = useAuth();
  const { navigate } = useAppRouter();

  if (!auth.isAuthenticated) {
    navigate('/login?returnTo=' + encodeURIComponent(window.location.pathname));
    return null;
  }

  return <Dashboard />;
}
```

## Unknowns

1. ~~**Route guard API shape**~~: Descoped to separate design.

2. ~~**`form()` compatibility with closures**~~: **Resolved.** Closures satisfy `SdkMethodWithMeta` via `Object.assign(fn, { url, method, meta })`. Verified: `form()` reads `sdkMethod.url` and `sdkMethod.method` for progressive enhancement, and `sdkMethod.meta.bodySchema` for validation. All three are attached as properties on the closure.

**No remaining unknowns.**

## Type Flow Map

```
AuthContextValue (signals + SdkMethodWithMeta functions)
  → createContext<AuthContextValue>()
    → AuthContext (with __stableId: '@vertz/ui::AuthContext')
      → useAuth(): UnwrapSignals<AuthContextValue>
        → auth.user (User | null, unwrapped via signal-api)
        → auth.status (AuthStatus, unwrapped via signal-api)
        → auth.signIn (SdkMethodWithMeta<SignInInput, AuthResponse>, plain — NOT unwrapped)
          → form(auth.signIn) → FormInstance<SignInInput, AuthResponse>
            → loginForm.email.error (string, unwrapped via form signal-api)
            → loginForm.onSubmit (handler, plain)
            → loginForm.submitting (boolean, unwrapped via form signal-api)

SignInInput
  → SdkMethodWithMeta<SignInInput, AuthResponse>
    → form(auth.signIn) [first overload — schema optional because meta.bodySchema exists]
      → FormInstance<SignInInput, AuthResponse>

AuthClientError
  → auth.error (AuthClientError | null, unwrapped via signal-api)
  → form().onError callback parameter
```

## E2E Acceptance Test

```tsx
import { AuthProvider, useAuth, AuthGate } from '@vertz/ui/auth';
import { form } from '@vertz/ui';

// Valid usage — form(auth.signIn) works without explicit schema
function LoginPage() {
  const auth = useAuth();
  const loginForm = form(auth.signIn, {
    onSuccess: () => {},
  });

  // signOut is a click handler, not a form action
  const handleLogout = () => auth.signOut();

  return (
    <form onSubmit={loginForm.onSubmit}>
      <input name="email" />
      <input name="password" />
      <span>{loginForm.email.error}</span>
      <button type="submit" disabled={loginForm.submitting}>Sign In</button>
    </form>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthGate fallback={() => <div>Loading...</div>}>
        <LoginPage />
      </AuthGate>
    </AuthProvider>
  );
}

// Type tests (must be inside a component body where auth is in scope)
function TypeTests() {
  const auth = useAuth();

  // @ts-expect-error — signIn body requires email and password
  auth.signIn({ notEmail: 'test' });

  // @ts-expect-error — signOut takes no arguments
  auth.signOut('invalid');

  // Valid: form works with auth methods without schema
  const f = form(auth.signIn);

  // @ts-expect-error — mfaChallenge requires code field
  auth.mfaChallenge({});
}
```

## File structure

### New files in `packages/ui/src/auth/`

```
packages/ui/src/auth/
├── access-context.ts         (existing — unchanged)
├── access-gate.ts            (existing — unchanged)
├── access-set-types.ts       (existing — unchanged)
├── create-access-provider.ts (existing — unchanged in Phase 1-5; MODIFIED in Phase 6)
├── auth-types.ts             (NEW — User, AuthStatus, AuthClientError, input types, schemas)
├── auth-client.ts            (NEW — createAuthMethod factory, fetch wrappers, error parsing)
├── auth-context.ts           (NEW — AuthContext, AuthProvider, useAuth)
├── auth-gate.ts              (NEW — AuthGate component)
├── token-refresh.ts          (NEW — refresh scheduling, dedup, online/offline, timer cleanup)
├── public.ts                 (MODIFIED — export new APIs)
```

### Modified server files

```
packages/server/src/auth/index.ts     (MODIFIED — add expiresAt to responses)
packages/ui-server/src/ssr-session.ts  (NEW — SSR session injection with proper XSS escaping)
```

### Compiler / manifest files

```
packages/ui/reactivity.json                           (MODIFIED — add useAuth as signal-api)
packages/ui-compiler/src/signal-api-registry.ts        (MODIFIED — add useAuth to SIGNAL_API_REGISTRY)
```

## Implementation Phases

### Phase 1: Foundation — signIn + signUp + signOut + useAuth() + Reactivity Manifest

The minimum viable auth. After this phase, a developer can:
- Wrap app in `<AuthProvider>`
- Use `form(auth.signIn)` for login, `form(auth.signUp)` for signup
- Call `auth.signOut()` for logout
- Read `auth.user`, `auth.isAuthenticated` in any component
- Compiler auto-unwraps signal properties in JSX (no `.value` needed)

**Server change:** Add `expiresAt` to signin/signup/refresh response bodies.

**Reactivity manifest (moved from Phase 6):** Register `useAuth` as `signal-api` in `reactivity.json` and `SIGNAL_API_REGISTRY` so compiler auto-unwrapping works from day one.

**Files:**
- `packages/ui/src/auth/auth-types.ts`
- `packages/ui/src/auth/auth-client.ts`
- `packages/ui/src/auth/auth-context.ts`
- `packages/ui/src/auth/public.ts` (update exports)
- `packages/server/src/auth/index.ts` (add expiresAt)
- `packages/ui/reactivity.json` (add useAuth)
- `packages/ui-compiler/src/signal-api-registry.ts` (add useAuth)

**Acceptance tests:**
- `form(auth.signIn)` submits to `/api/auth/signin` with credentials, returns `Result<AuthResponse, Error>`
- `form(auth.signIn)` works WITHOUT explicit `schema` option (uses embedded bodySchema)
- On successful signin, `auth.user` is populated, `auth.status` transitions to `'authenticated'`
- On failed signin, `auth.error` contains `AuthClientError` with `.code` and `.message`
- On signout, `auth.user` is `null`, `auth.status` transitions to `'unauthenticated'`
- CSRF header `X-VTZ-Request: 1` is auto-added to all auth requests
- `credentials: 'include'` is set on all fetch calls
- `signIn` from `error` state transitions to `loading` (error recovery)
- `auth.signIn.url` is `/api/auth/signin` and `auth.signIn.method` is `POST`
- Compiler: `auth.user` in JSX auto-unwraps, `auth.signIn` in JSX is NOT unwrapped

### Phase 2: Token Refresh + AuthGate

Proactive token refresh scheduling. After this phase, tokens auto-refresh without user intervention.

**Files:**
- `packages/ui/src/auth/token-refresh.ts`
- `packages/ui/src/auth/auth-gate.ts`
- `packages/ui/src/auth/auth-context.ts` (integrate refresh)

**Acceptance tests:**
- Token refresh scheduled at `expiresAt - 10_000ms`
- Concurrent refresh calls deduplicated (single in-flight promise)
- Refresh failure transitions to `'unauthenticated'`
- AuthGate shows fallback (thunk) while auth is `idle` or `loading`; renders children for any resolved state (`authenticated`, `unauthenticated`, `mfa_required`, `error`)
- Tab visibility: refresh deferred in hidden tabs, triggered on focus if stale
- Online/offline: refresh deferred when offline, debounced on reconnect (not raw `navigator.onLine`)
- Refresh timer is cleared when AuthProvider is disposed (no timer leaks)

### Phase 3: SSR Hydration

Server-rendered pages include session data; client hydrates without an initial fetch.

**Files:**
- `packages/ui-server/src/ssr-session.ts` (new)
- `packages/ui/src/auth/auth-context.ts` (hydrate from `window.__VERTZ_SESSION__`)

**Acceptance tests:**
- SSR injects `window.__VERTZ_SESSION__` with `{ user, expiresAt }`
- XSS escaping: all `<` characters escaped as `\u003c`, line separators escaped, optional CSP nonce supported
- Client AuthProvider reads it on initialization — no `/api/auth/session` fetch
- Auth state is `'authenticated'` immediately (no loading flicker)
- Token refresh scheduled from hydrated `expiresAt`
- When `window.__VERTZ_SESSION__` is absent (user not logged in), auth state is `'unauthenticated'` immediately (not `'loading'`)
- AuthProvider SSR guard: `typeof window !== 'undefined'` check, initializes to `'unauthenticated'` in SSR
- `signOut()` clears `window.__VERTZ_SESSION__` to prevent stale re-hydration

### Phase 4: MFA Challenge + Password Reset

Complete auth flow including MFA and password reset.

**Files:**
- `packages/ui/src/auth/auth-context.ts` (add mfa methods, password methods)
- `packages/ui/src/auth/auth-types.ts` (add MFA/password types if not already present)

**Acceptance tests:**
- SignIn returning `MFA_REQUIRED` transitions status to `'mfa_required'`
- `form(auth.mfaChallenge)` submits TOTP code without explicit schema, transitions to `'authenticated'`
- `form(auth.forgotPassword)` submits email, returns success (always 200)
- `form(auth.resetPassword)` submits token + new password

### Phase 5: ~~Route Guards~~ → Removed

~~Declarative route protection utilities.~~

**Descoped to separate design.** See "Route Guards — Descoped" section above.

### Phase 6: AccessContext Integration

Connect AuthProvider with AccessContext so access set updates automatically on token refresh. After this phase, `AuthProvider` internally provides the `AccessContext`, eliminating the need for separate `AccessGate` + `AccessContext.Provider`.

**Files:**
- `packages/ui/src/auth/auth-context.ts` (update access set on refresh, provide AccessContext internally)
- `packages/ui/src/auth/create-access-provider.ts` (add refresh capability)

**Acceptance tests:**
- On token refresh, access set is re-fetched from `/api/auth/access-set`
- `can()` checks reflect updated access after refresh
- `AuthProvider` internally provides `AccessContext` — no separate `AccessContext.Provider` needed
- `AuthGate` waits for BOTH auth state AND access set to be resolved
- Existing apps using separate `AccessContext.Provider` continue to work (no breaking change — AuthProvider checks if AccessContext already has a value before providing one)

## Existing code to reuse

| What | Where | How used |
|---|---|---|
| `createContext()` + `useContext()` | `packages/ui/src/component/context.ts` | AuthContext creation |
| `wrapSignalProps()` | `packages/ui/src/component/context.ts` | Auto-unwrap auth signals |
| `signal()` + `computed()` | `packages/ui/src/runtime/signal.ts` | Internal auth state |
| `form()` + `SdkMethodWithMeta` | `packages/ui/src/form/form.ts` | Auth forms use `form(auth.signIn)` |
| `Result` / `ok()` / `err()` | `@vertz/errors` | Auth method return types |
| `AccessContext` / `can()` | `packages/ui/src/auth/access-context.ts` | Integrated access control |
| `AccessGate` | `packages/ui/src/auth/access-gate.ts` | Pattern for AuthGate |
| `createAccessSetScript()` | `packages/ui-server/src/ssr-access-set.ts` | Pattern + XSS escaping for SSR session injection |
| `SIGNAL_API_REGISTRY` | `packages/ui-compiler/src/signal-api-registry.ts` | Add useAuth entry |

## Verification

After implementation:
1. `bun test` — all auth tests pass
2. `bun run typecheck` — clean across `@vertz/ui`, `@vertz/server`, `@vertz/ui-server`, `@vertz/ui-compiler`
3. `bun run lint` — biome clean
4. Example app: complete login → dashboard → logout flow works
5. Token refresh: wait 60s, verify auto-refresh (no 401 on subsequent requests)
6. SSR: server-rendered page shows authenticated content, client hydrates without flicker

## Review Resolution Log

| Finding | Reviewer | Resolution |
|---|---|---|
| B1: SdkMethod closure construction | josh, mike, nora | Added `createAuthMethod` factory pattern with `Object.assign` |
| B2: form() schema requirement | josh, nora | Auth methods are `SdkMethodWithMeta` with embedded `bodySchema` |
| B3: AuthClientError undefined | josh, nora | Defined `AuthClientError` with `code`, `message`, `statusCode`, `retryAfter` |
| B4: Reactivity manifest misclassification | mike, nora | Changed to `signal-api` with explicit property lists |
| B5: XSS escaping weaker than existing | mike, nora | Copied exact pattern from `createAccessSetScript()` |
| B6: Error state no recovery | mike | Added explicit error recovery transitions |
| S1: AuthProvider SSR behavior | mike | Added `typeof window !== 'undefined'` guard |
| S2: Route guards too big | josh, mike | Descoped to separate design |
| S3: AuthGate semantics ambiguous | nora | Clarified: renders on any resolved state |
| S4: AuthGate/AccessGate overlap | josh | Phase 6 makes AuthProvider subsume AccessContext |
| S5: Timer leak on unmount | mike | Specified onCleanup for refresh timer |
| S6: Phase 6 should be Phase 1 | mike | Moved reactivity manifest to Phase 1 |
| signOut not SdkMethod | josh | Documented as click handler, not form action |
| E2E test scope error | nora | Moved type tests inside component body |
| fallback type mismatch | nora | Changed to `() => unknown` thunk convention |
