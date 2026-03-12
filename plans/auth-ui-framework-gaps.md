# Auth UI Framework Gaps — Self-Review

> Patterns discovered while building the Linear clone example that should be elevated
> to framework-level abstractions. Each section identifies the gap, shows the
> hand-written code, and proposes a framework solution.

---

## 1. Protected Route Guard (`AuthGuard`)

### The Problem

Every app with authentication needs a route guard — a component that:
1. Shows a loading state while auth resolves (`idle`/`loading`)
2. Renders children when authenticated
3. Redirects to a login page when unauthenticated

The Linear clone hand-writes this as a 35-line component with a helper `RedirectToLogin`:

```tsx
// examples/linear/src/components/auth-guard.tsx
function RedirectToLogin() {
  const { navigate } = useRouter();
  onMount(() => { navigate({ to: '/login' }); });
  return <div />;
}

export function AuthGuard() {
  const auth = useAuth();
  return (
    <div style="display:contents">
      {auth.status === 'idle' || auth.status === 'loading' ? (
        <div>Loading...</div>
      ) : auth.isAuthenticated ? (
        <WorkspaceShell />
      ) : (
        <RedirectToLogin />
      )}
    </div>
  );
}
```

### What Already Exists

`AuthGate` (in `@vertz/ui/auth`) only gates on "resolved vs loading" — it does NOT
handle the authenticated/unauthenticated split or the redirect:

```tsx
// packages/ui/src/auth/auth-gate.ts — current behavior
export function AuthGate({ fallback, children }: AuthGateProps) {
  // Only gates on idle/loading → resolved. Does NOT redirect.
  const isResolved = computed(() => status !== 'idle' && status !== 'loading');
  return computed(() => isResolved.value ? children() : fallback?.() ?? null);
}
```

### Proposed Framework Solution

Extend `AuthGate` or create a new `ProtectedRoute` component:

```tsx
import { ProtectedRoute } from '@vertz/ui/auth';

// In route definitions:
'/': {
  component: () => ProtectedRoute({
    loginPath: '/login',
    fallback: () => <LoadingSpinner />,
    children: () => <WorkspaceShell />,
  }),
}
```

**API:**
```tsx
interface ProtectedRouteProps {
  /** Path to redirect to when unauthenticated. Default: '/login' */
  loginPath?: string;
  /** Rendered while auth is resolving (idle/loading). Default: null */
  fallback?: () => unknown;
  /** Rendered when authenticated */
  children: (() => unknown) | unknown;
  /** Optional: required entitlements (integrates with AccessContext) */
  requires?: string[];
}
```

**Key decisions:**
- Uses `useRouter().navigate()` internally for SPA redirect (not `window.location.href`)
- Composes with existing `AuthGate` for the loading/resolved split
- Optionally checks entitlements via `can()` for role-gated routes
- Wraps children in `display:contents` div (or returns fragment) to avoid layout interference

---

## 2. OAuth Login Button / Login Page Primitives

### The Problem

The login page is ~60 lines of boilerplate for what is essentially "a button that
redirects to an OAuth provider":

```tsx
// examples/linear/src/pages/login-page.tsx
export function LoginPage() {
  const handleGitHubLogin = () => {
    window.location.href = '/api/auth/oauth/github';
  };
  return (
    <div class={styles.container}>
      <div class={styles.card}>
        <h1>Linear Clone</h1>
        <p>Sign in to your workspace</p>
        <button onClick={handleGitHubLogin}>
          <GitHubIcon />  {/* 5-line inline SVG */}
          Continue with GitHub
        </button>
      </div>
    </div>
  );
}
```

### What's Boilerplate Here

1. **The redirect URL** (`/api/auth/oauth/github`) — the framework knows this URL from
   the provider config, but the client has to hardcode it
2. **Provider icons** — every OAuth app needs GitHub/Google/Discord SVG icons
3. **The button pattern** — "Continue with {Provider}" is universal

### Proposed Framework Solution

**A. Provider metadata on the client:**

`AuthProvider` could expose the configured providers and their auth URLs:

```tsx
const auth = useAuth();
auth.providers // → [{ id: 'github', name: 'GitHub', authUrl: '/api/auth/oauth/github' }]
```

This requires the server to expose a `/api/auth/providers` endpoint (or embed it in
the SSR session payload).

**B. Pre-built OAuth button component:**

```tsx
import { OAuthButton } from '@vertz/ui/auth';

// Auto-discovers provider from AuthProvider config
<OAuthButton provider="github" />
// Renders: [GitHub icon] Continue with GitHub
// onClick: window.location.href = auth.providers.github.authUrl

// Or render all configured providers:
<OAuthButtons />
// Renders one button per configured provider
```

**C. Built-in provider icons:**

```tsx
import { ProviderIcon } from '@vertz/ui/auth';
<ProviderIcon provider="github" size={20} />
```

Icons for: GitHub, Google, Discord, Apple, Microsoft, Twitter/X.

**Priority:** Medium. The redirect URL hardcoding is the real pain point. Icons and
buttons are nice-to-have.

---

## 3. Dev Server Handler Auto-Composition

### The Problem

The dev server requires manual URL routing between auth and entity handlers:

```tsx
// examples/linear/src/dev-server.ts
apiHandler: async (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/auth')) {
    return app.auth.handler(req);
  }
  return app.handler(req);
},
```

Every app with auth must write this same if/else routing.

### Proposed Framework Solution

`createServer()` already knows about both auth and entities. It should expose a
unified handler:

```tsx
// Proposed: unified handler that routes internally
const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port: PORT,
  apiHandler: app.unifiedHandler, // Routes auth + entity internally
});
```

Or even simpler — pass the app directly:

```tsx
const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port: PORT,
  app, // Auto-extracts auth.handler + entity handler
});
```

**Priority:** High. This is pure boilerplate that every app duplicates.

---

## 4. SSR Session Injection

### The Problem

When the auth status resolves on the client, there's a flash: SSR renders "Loading...",
then the client hydrates, calls `refresh()`, and finally resolves to authenticated.
This causes a visible loading flash even for authenticated users.

The framework has `createSessionScript()` in `ssr-render.ts` but it's **not wired
into the rendering pipeline**. The SSR response never includes `window.__VERTZ_SESSION__`.

### What Already Exists

```tsx
// packages/ui-server/src/ssr-render.ts — exists but unused
function createSessionScript(session: { user: User; expiresAt: number }): string {
  return `<script>window.__VERTZ_SESSION__=${JSON.stringify(session)}</script>`;
}
```

The `AuthProvider` already reads from `window.__VERTZ_SESSION__`:

```tsx
// packages/ui/src/auth/auth-context.ts
if (window.__VERTZ_SESSION__?.user) {
  statusSignal.value = 'authenticated';
  // No refresh needed — instant hydration
}
```

### Proposed Framework Solution

The dev server should:
1. Read the session cookie from the incoming request
2. Validate the JWT
3. If valid, inject `<script>window.__VERTZ_SESSION__={...}</script>` into the SSR HTML
4. AuthProvider picks it up → no loading flash, no refresh call

This requires the SSR render pipeline to have access to the request (for cookies) and
the auth instance (for JWT validation).

```tsx
// Proposed: dev server passes request context to SSR
const devServer = createBunDevServer({
  app, // Has auth config for JWT validation
  // SSR render automatically reads cookies and injects session
});
```

**Priority:** High. Loading flash on every page load for authenticated users is a bad
DX. This is the #1 perceived-performance issue.

---

## 5. Sign-Out with Redirect

### The Problem

The Linear clone's sign-out handler calls `auth.signOut()` but relies on the
`AuthGuard`'s reactive ternary to redirect back to `/login`. This works but is implicit
— the developer doesn't control the post-sign-out destination.

```tsx
const handleSignOut = async () => {
  await auth.signOut();
  // No explicit redirect — AuthGuard's ternary handles it
};
```

### Proposed Framework Solution

`auth.signOut()` should accept an optional redirect path:

```tsx
await auth.signOut({ redirectTo: '/login' });
// or
await auth.signOut(); // Uses oauthErrorRedirect from server config as default
```

**Priority:** Low. The implicit redirect via AuthGuard works. Explicit redirect is
a DX improvement.

---

## 6. User Profile Display Helpers

### The Problem

Displaying user info (name, avatar, email) requires defensive coding:

```tsx
{auth.user?.avatarUrl && (
  <img src={auth.user.avatarUrl} alt="" />
)}
<span>{auth.user?.name ?? auth.user?.email}</span>
```

### Proposed Framework Solution

A `UserAvatar` or `UserProfile` component:

```tsx
import { UserAvatar, UserName } from '@vertz/ui/auth';

<UserAvatar size="sm" />  // Renders avatar or initials fallback
<UserName />              // Renders name ?? email ?? 'Unknown'
```

**Priority:** Low. This is trivial code. But it's also universal across every
authenticated app. Could be in a recipes/patterns doc instead.

---

## 7. `initialPath` Boilerplate in Router

### The Problem

Every app that uses SSR routing writes the same initialPath logic:

```tsx
const initialPath =
  typeof window !== 'undefined' && window.location
    ? window.location.pathname
    : ((globalThis as Record<string, unknown>).__SSR_URL__ as string) || '/';

export const appRouter = createRouter(routes, initialPath, { serverNav: true });
```

### Proposed Framework Solution

`createRouter` should auto-detect the initial path:

```tsx
// Proposed: auto-detect SSR vs client
export const appRouter = createRouter(routes, { serverNav: true });
// Internally: reads window.location.pathname or globalThis.__SSR_URL__ or '/'
```

**Priority:** Medium. Small but every app hits it.

---

## Summary: Priority Ranking

| # | Gap | Priority | Effort | Impact |
|---|-----|----------|--------|--------|
| 4 | SSR session injection | High | Medium | Eliminates loading flash for authed users |
| 3 | Dev server handler auto-composition | High | Low | Removes boilerplate from every app |
| 1 | ProtectedRoute component | High | Low | Replaces hand-written auth guard |
| 7 | Router initialPath auto-detect | Medium | Low | Removes boilerplate |
| 2 | OAuth button / provider metadata | Medium | Medium | Removes hardcoded URLs and icons |
| 5 | Sign-out with redirect | Low | Low | DX improvement |
| 6 | User profile display helpers | Low | Low | Nice-to-have, could be docs |

---

## Package Strategy

Two options:

**Option A: Extend existing packages**
- Items 1, 5, 6 → `@vertz/ui/auth` (already exists)
- Item 2 → `@vertz/ui/auth` + provider icons in `@vertz/icons`
- Item 3 → `@vertz/server` (unified handler)
- Item 4 → `@vertz/ui-server` (SSR pipeline)
- Item 7 → `@vertz/ui` (router)

**Option B: New `@vertz/ui-auth` package**
- Only if auth UI components grow significantly (login forms, MFA flows, password reset)
- Re-exported through `vertz` meta-package

**Recommendation:** Option A for now. The auth UI surface is small enough to stay in
`@vertz/ui/auth`. Create `@vertz/ui-auth` only when we add email/password login forms,
MFA challenge UI, password reset flows, etc.
