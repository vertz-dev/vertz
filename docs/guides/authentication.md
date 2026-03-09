# Authentication

Vertz provides a built-in auth system that manages JWT sessions, token refresh, MFA, and SSR hydration. Wrap your app in `<AuthProvider>`, use `useAuth()` to read state, and use `form(auth.signIn)` for login forms — same patterns as the rest of the framework.

---

## Quick Start

### 1. Wrap your app in AuthProvider

```tsx
import { AuthProvider } from '@vertz/ui/auth';

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
```

### 2. Build a login form

```tsx
import { useAuth } from '@vertz/ui/auth';
import { form } from '@vertz/ui';

function LoginPage() {
  const auth = useAuth();

  const loginForm = form(auth.signIn, {
    onSuccess: () => navigate('/dashboard'),
  });

  return (
    <form action={loginForm.action} method={loginForm.method} onSubmit={loginForm.onSubmit}>
      <input name="email" type="email" />
      <span>{loginForm.email.error}</span>

      <input name="password" type="password" />
      <span>{loginForm.password.error}</span>

      <button type="submit" disabled={loginForm.submitting}>Sign In</button>
    </form>
  );
}
```

### 3. Read auth state anywhere

```tsx
import { useAuth } from '@vertz/ui/auth';

function Header() {
  const auth = useAuth();

  return (
    <header>
      {auth.isAuthenticated
        ? <span>Welcome, {auth.user.email}</span>
        : <a href="/login">Sign in</a>}
    </header>
  );
}
```

That's it. `auth.signIn` is an `SdkMethod` — `form()` works with it directly for validation, submission, and error handling. No manual fetch calls, no state wiring.

---

## How It Works

### Auth state machine

```
idle → loading → authenticated | unauthenticated | mfa_required | error
```

- **idle** — Initial state before any auth check (SSR/Node only)
- **loading** — Auth operation in progress
- **authenticated** — Valid session, `auth.user` is populated
- **unauthenticated** — No valid session
- **mfa_required** — Sign-in succeeded but MFA verification needed
- **error** — Auth operation failed, `auth.error` has details

### JWT session lifecycle

Vertz uses httpOnly cookies for JWT tokens — the client never reads the token directly. The server returns `expiresAt` in the response body, and the client schedules proactive refresh:

```
signIn/signUp → { user, expiresAt } → schedule refresh at expiresAt - 10s → POST /refresh → repeat
```

Token refresh is automatic:
- Scheduled 10 seconds before expiry
- Deduplicated (concurrent calls share one in-flight request)
- Deferred when the tab is hidden (refreshes on focus if stale)
- Deferred when offline (refreshes on reconnect)

---

## API Reference

### AuthProvider

Wraps your app with auth context. All `useAuth()` calls must be inside an `AuthProvider`.

```tsx
<AuthProvider basePath="/api/auth" accessControl>
  <App />
</AuthProvider>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `basePath` | `string` | `'/api/auth'` | Base URL for auth endpoints |
| `accessControl` | `boolean` | `false` | Enable automatic access set management |
| `children` | `unknown` | — | App content |

### useAuth()

Returns reactive auth state. All signal properties are auto-unwrapped by the compiler — no `.value` needed.

```ts
const auth = useAuth();
```

| Property | Type | Description |
|----------|------|-------------|
| `user` | `User \| null` | Current user or null |
| `status` | `AuthStatus` | Current auth state |
| `isAuthenticated` | `boolean` | `true` when status is `'authenticated'` |
| `isLoading` | `boolean` | `true` when status is `'loading'` |
| `error` | `AuthClientError \| null` | Last auth error |
| `signIn` | `SdkMethod` | Sign in with email/password |
| `signUp` | `SdkMethod` | Create account with email/password |
| `signOut` | `() => Promise<void>` | Clear session and cookies |
| `refresh` | `() => Promise<void>` | Manually refresh the token |
| `mfaChallenge` | `SdkMethod` | Submit MFA TOTP code |
| `forgotPassword` | `SdkMethod` | Request password reset email |
| `resetPassword` | `SdkMethod` | Reset password with token |

### AuthGate

Gates rendering on auth state resolution. Shows fallback while auth is loading, children once resolved.

```tsx
import { AuthGate } from '@vertz/ui/auth';

<AuthGate fallback={() => <LoadingScreen />}>
  <App />
</AuthGate>
```

---

## Auth Methods as SdkMethods

Every auth method (`signIn`, `signUp`, `mfaChallenge`, `forgotPassword`, `resetPassword`) is an `SdkMethod`. This means:

1. **`form()` works directly** — validation, submission, field errors, all automatic
2. **`.url` and `.method`** are available for `<form action={...} method={...}>`
3. **`.meta.bodySchema`** provides the validation schema

```tsx
// All of these work the same way
const loginForm = form(auth.signIn);
const signupForm = form(auth.signUp);
const mfaForm = form(auth.mfaChallenge);
const forgotForm = form(auth.forgotPassword);
const resetForm = form(auth.resetPassword);
```

### Input types

| Method | Required fields |
|--------|----------------|
| `signIn` | `{ email: string, password: string }` |
| `signUp` | `{ email: string, password: string }` |
| `mfaChallenge` | `{ code: string }` |
| `forgotPassword` | `{ email: string }` |
| `resetPassword` | `{ token: string, password: string }` |

---

## MFA Flow

When the server requires MFA, `signIn` transitions to `mfa_required` instead of `authenticated`:

```tsx
function LoginPage() {
  const auth = useAuth();

  const loginForm = form(auth.signIn);
  const mfaForm = form(auth.mfaChallenge, {
    onSuccess: () => navigate('/dashboard'),
  });

  // Show MFA form when required
  if (auth.status === 'mfa_required') {
    return (
      <form onSubmit={mfaForm.onSubmit}>
        <input name="code" placeholder="Enter 6-digit code" />
        <span>{mfaForm.code.error}</span>
        <button type="submit" disabled={mfaForm.submitting}>Verify</button>
      </form>
    );
  }

  return (
    <form onSubmit={loginForm.onSubmit}>
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button type="submit" disabled={loginForm.submitting}>Sign In</button>
    </form>
  );
}
```

---

## Password Reset Flow

### Request reset email

```tsx
function ForgotPasswordPage() {
  const auth = useAuth();
  let submitted = false;

  const forgotForm = form(auth.forgotPassword, {
    onSuccess: () => { submitted = true; },
  });

  if (submitted) {
    return <p>Check your email for a reset link.</p>;
  }

  return (
    <form onSubmit={forgotForm.onSubmit}>
      <input name="email" type="email" placeholder="Your email" />
      <span>{forgotForm.email.error}</span>
      <button type="submit" disabled={forgotForm.submitting}>Send Reset Link</button>
    </form>
  );
}
```

### Reset with token

```tsx
function ResetPasswordPage() {
  const auth = useAuth();
  const token = new URLSearchParams(location.search).get('token');

  const resetForm = form(auth.resetPassword, {
    onSuccess: () => navigate('/login'),
  });

  return (
    <form onSubmit={resetForm.onSubmit}>
      <input type="hidden" name="token" value={token} />
      <input name="password" type="password" placeholder="New password" />
      <span>{resetForm.password.error}</span>
      <button type="submit" disabled={resetForm.submitting}>Reset Password</button>
    </form>
  );
}
```

---

## SSR Hydration

When using SSR, the server injects the session into the page so the client doesn't need an initial `/api/auth/session` fetch:

### Server side

```ts
import { createSessionScript } from '@vertz/ui-server';

// In your SSR handler, after validating the JWT:
const sessionScript = createSessionScript({
  user: { id: '1', email: 'user@example.com', role: 'admin' },
  expiresAt: session.expiresAt.getTime(),
});

// Include in the HTML response <head>
```

### What happens on the client

1. Server injects `window.__VERTZ_SESSION__` with `{ user, expiresAt }`
2. `AuthProvider` reads it on initialization — no fetch needed
3. Auth state is `'authenticated'` immediately — no loading flicker
4. Token refresh is scheduled from the hydrated `expiresAt`

When there's no session (guest user), `AuthProvider` transitions to `'unauthenticated'` immediately.

---

## Access Control Integration

When `accessControl` is enabled, `AuthProvider` automatically manages the access set:

```tsx
<AuthProvider accessControl>
  <App />
</AuthProvider>
```

This:
- Wraps children in `AccessContext.Provider`
- Fetches the access set from `${basePath}/access-set` after successful auth
- Clears the access set on sign out
- Hydrates from `window.__VERTZ_ACCESS_SET__` during SSR

Use `can()` anywhere inside the provider:

```tsx
import { can } from '@vertz/ui/auth';

function AdminPanel() {
  if (!can('admin:manage')) {
    return <p>Access denied</p>;
  }
  return <AdminDashboard />;
}
```

---

## Error Handling

Auth errors are available via `auth.error`:

```tsx
const auth = useAuth();

if (auth.error) {
  // auth.error has: code, message, statusCode, retryAfter?
  return <div class="error">{auth.error.message}</div>;
}
```

### Error codes

| Code | When |
|------|------|
| `INVALID_CREDENTIALS` | Wrong email/password |
| `USER_EXISTS` | Email already registered |
| `MFA_REQUIRED` | MFA verification needed (status transitions to `mfa_required`) |
| `INVALID_MFA_CODE` | Wrong MFA code |
| `RATE_LIMITED` | Too many attempts (`retryAfter` is set) |
| `NETWORK_ERROR` | Fetch failed (offline, DNS, etc.) |
| `SERVER_ERROR` | Unexpected server error |

---

## Common Patterns

### Logout button

```tsx
function LogoutButton() {
  const auth = useAuth();

  return (
    <button onClick={() => auth.signOut()}>
      Sign Out
    </button>
  );
}
```

### Conditional rendering based on auth

```tsx
function AppContent() {
  const auth = useAuth();

  return (
    <AuthGate fallback={() => <LoadingSpinner />}>
      {auth.isAuthenticated
        ? <Dashboard />
        : <LandingPage />}
    </AuthGate>
  );
}
```

### Sign-up with extra fields

```tsx
const signupForm = form(auth.signUp);

<form onSubmit={signupForm.onSubmit}>
  <input name="email" type="email" />
  <input name="password" type="password" />
  <input name="name" />
  <button type="submit">Create Account</button>
</form>
```

The `signUp` input accepts `{ email, password, ...extra }` — additional fields are passed through to the server.

---

## Summary

| What | How |
|------|-----|
| Wrap app | `<AuthProvider>` |
| Read auth state | `useAuth()` — returns reactive `user`, `status`, `isAuthenticated` |
| Login form | `form(auth.signIn)` — validation + submission + errors |
| Sign up form | `form(auth.signUp)` |
| Logout | `auth.signOut()` |
| MFA flow | `auth.status === 'mfa_required'` → `form(auth.mfaChallenge)` |
| Forgot password | `form(auth.forgotPassword)` |
| Reset password | `form(auth.resetPassword)` |
| Gate on auth | `<AuthGate fallback={...}>` |
| SSR hydration | `createSessionScript(session)` on server |
| Access control | `<AuthProvider accessControl>` + `can('permission')` |
| Token refresh | Automatic — 10s before expiry, deduped, visibility-aware |
