# Design Doc: ProtectedRoute Component

**Issue:** #1202
**Status:** Draft (Rev 2 — addresses DX, Product, Technical review feedback)
**Author:** hong-kong

---

## Problem

Every Vertz app with authentication needs a route guard that:
1. Shows a loading state while auth resolves (`idle`/`loading`)
2. Renders children when authenticated
3. Redirects to a login page when unauthenticated

Developers currently hand-write ~35 lines of boilerplate for this. The existing `AuthGate` only splits loading/resolved — it does NOT handle authenticated vs unauthenticated or redirect.

---

## API Surface

```tsx
import { ProtectedRoute } from '@vertz/ui/auth';

// In route definitions — JSX form (preferred):
'/dashboard': {
  component: () => (
    <ProtectedRoute loginPath="/login" fallback={() => <LoadingSpinner />}>
      <Dashboard />
    </ProtectedRoute>
  ),
}

// Function call form (also works):
'/dashboard': {
  component: () => ProtectedRoute({
    loginPath: '/login',
    fallback: () => <LoadingSpinner />,
    children: () => <Dashboard />,
  }),
}
```

### Props

```ts
interface ProtectedRouteProps {
  /** Path to redirect to when unauthenticated. Default: '/login' */
  loginPath?: string;
  /** Rendered while auth is resolving (idle/loading). Default: null */
  fallback?: () => unknown;
  /** Rendered when authenticated */
  children: (() => unknown) | unknown;
  /** Optional: required entitlements (integrates with can()) */
  requires?: string[];
  /** Rendered when authenticated but lacking required entitlements. Default: null */
  forbidden?: () => unknown;
  /** Append ?returnTo=<currentPath> when redirecting. Default: true */
  returnTo?: boolean;
}
```

### Naming Rationale

Existing auth primitives follow a `*Gate` pattern (`AuthGate`, `AccessGate`). Gates are purely presentational — they render or don't. `ProtectedRoute` is more than a gate: it renders, redirects, and integrates entitlements. The `*Route` name signals this higher-level abstraction that combines gating with navigation.

### Behavior Matrix

| `auth.status`     | `requires` match | Result                                         |
| ----------------- | ---------------- | ---------------------------------------------- |
| `idle`            | n/a              | Render `fallback` (or null)                    |
| `loading`         | n/a              | Render `fallback` (or null)                    |
| `authenticated`   | yes / omitted    | Render `children`                              |
| `authenticated`   | no               | Render `forbidden` (or null) — no redirect     |
| `unauthenticated` | n/a              | Navigate to `loginPath` (with `returnTo`)      |
| `mfa_required`    | n/a              | Navigate to `loginPath` (with `returnTo`)      |
| `error`           | n/a              | Navigate to `loginPath` (with `returnTo`)      |
| SSR               | n/a              | Render `fallback` (no redirect)                |
| No AuthProvider   | n/a              | Render `children` (fail-open + `__DEV__` warn) |

**Note on `error` status:** Redirecting to login on error is a pragmatic default (session expired / server issue). Apps needing custom error handling should use `useAuth()` + conditional rendering directly.

---

## Implementation Architecture

### Reactivity Constraints

Two critical architectural decisions from review feedback:

1. **No side effects in `computed()`**: Navigation (`router.navigate()`) is a side effect that mutates browser history. It must NOT be called inside `computed()`. The implementation uses:
   - `computed()` — pure derivation of what to render (children, fallback, forbidden, or null)
   - `watch()` — fires `navigate()` when auth state resolves to a redirect-worthy condition

2. **`can()` called eagerly in component body**: `can()` uses `useContext(AccessContext)` internally, which requires the Provider to be on the synchronous call stack. It must be called in the component body, NOT inside `computed()` or `watch()`:
   ```ts
   // Component body — Provider is on call stack
   const checks = requires?.map((e) => can(e));

   // Inside computed — read .allowed.value (not call can())
   const allAllowed = computed(() =>
     !checks || checks.every((c) => c.allowed.value)
   );
   ```

3. **Lazy router access**: The router is only needed for the redirect path. When no AuthProvider is present (fail-open), the component renders children without needing `useRouter()`. The router is accessed via `useContext(RouterContext)` directly (which returns `undefined` without throwing) rather than `useRouter()` (which throws). Navigate is only called when the router is available.

### SSR Safety

SSR is protected at two levels:
1. `typeof window === 'undefined'` check prevents the redirect `watch()` from firing
2. SSR routers have `navigate` as a no-op (`() => Promise.resolve()`) as a secondary guard

---

## Manifesto Alignment

- **One way to do things** — eliminates 3+ hand-rolled patterns across apps. One component, one API.
- **AI agents are first-class users** — LLM wraps a route with `<ProtectedRoute>` and is done. No auth state machine reasoning needed.
- **If it builds, it works** — props are typed. `loginPath` defaults to `/login`. No runtime surprises.
- **Convention over configuration** — default `loginPath`, default fallback (null), `returnTo` on by default.

**Rejected alternatives:**
- Higher-order route config (`protected: true` on route definition) — would require router-level auth awareness, coupling router to auth. Keeping them composable is better.
- Middleware/guard functions — opaque, harder for LLMs, doesn't compose with JSX.

---

## Non-Goals

- Route-level middleware system (future work)
- Automatic MFA challenge flow (MFA pages are app-specific)
- Server-side redirect (302) from SSR — SSR renders fallback, client redirects after hydration
- Nested `ProtectedRoute` composition — works naturally (each instance independently reads context), no special handling needed

---

## Unknowns

None identified. The component composes well-tested primitives (`useAuth()`, `useContext()`, `can()`, `computed()`, `watch()`).

---

## Type Flow Map

```
ProtectedRouteProps.children: (() => unknown) | unknown
  → computed() return value
  → ReadonlySignal<unknown> returned from ProtectedRoute

ProtectedRouteProps.requires: string[]
  → can(entitlement) calls (component body, eager)
  → AccessCheck.allowed (ReadonlySignal<boolean>)
  → read .allowed.value inside computed() condition

ProtectedRouteProps.forbidden: () => unknown
  → computed() return value when authenticated + entitlement denied
```

No generics. Props are concrete types. No dead type parameters.

---

## E2E Acceptance Test

```ts
describe('Feature: ProtectedRoute component', () => {
  // --- Loading states ---
  describe('Given auth status is idle', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then renders fallback content', () => {});
    });
  });

  describe('Given auth status is loading', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then renders fallback content', () => {});
    });
  });

  // --- Authenticated ---
  describe('Given auth status is authenticated', () => {
    describe('When ProtectedRoute renders without requires', () => {
      it('Then renders children', () => {});
    });
  });

  describe('Given auth status is authenticated with required entitlements met', () => {
    describe('When ProtectedRoute renders with requires', () => {
      it('Then renders children', () => {});
    });
  });

  describe('Given auth status is authenticated but missing entitlement', () => {
    describe('When ProtectedRoute renders with requires and forbidden prop', () => {
      it('Then renders forbidden content (not redirect)', () => {});
    });
  });

  describe('Given auth status is authenticated but missing entitlement and no forbidden prop', () => {
    describe('When ProtectedRoute renders with requires', () => {
      it('Then renders null', () => {});
    });
  });

  // --- Unauthenticated / redirect ---
  describe('Given auth status is unauthenticated', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then navigates to loginPath with returnTo', () => {});
    });
  });

  describe('Given no loginPath specified', () => {
    describe('When redirecting unauthenticated user', () => {
      it('Then navigates to /login (default) with returnTo', () => {});
    });
  });

  describe('Given returnTo is false', () => {
    describe('When redirecting unauthenticated user', () => {
      it('Then navigates to loginPath without returnTo param', () => {});
    });
  });

  // --- SSR ---
  describe('Given SSR environment', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then renders fallback without navigating', () => {});
    });
  });

  // --- Edge cases ---
  describe('Given no AuthProvider in tree', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then renders children (fail-open) with __DEV__ warning', () => {});
    });
  });

  describe('Given no fallback provided', () => {
    describe('When auth is loading', () => {
      it('Then renders null', () => {});
    });
  });

  // --- Reactive transitions ---
  describe('Given auth status transitions from loading to authenticated', () => {
    describe('When status signal changes', () => {
      it('Then switches from fallback to children reactively', () => {});
    });
  });

  describe('Given auth status transitions from loading to unauthenticated', () => {
    describe('When status signal changes', () => {
      it('Then calls navigate to loginPath', () => {});
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Core ProtectedRoute Component

**Deliverable:** `ProtectedRoute` component with auth gating, redirect, entitlement checks, and `returnTo`.

**Implementation:**
1. Create `packages/ui/src/auth/protected-route.ts`
2. Export from `packages/ui/src/auth/public.ts`
3. Tests in `packages/ui/src/auth/__tests__/protected-route.test.ts`

**Key implementation sketch:**
```ts
export function ProtectedRoute({
  loginPath = '/login',
  fallback,
  children,
  requires,
  forbidden,
  returnTo = true,
}: ProtectedRouteProps) {
  // Use useContext directly (not useAuth which throws) for fail-open
  const ctx = useContext(AuthContext);

  if (!ctx) {
    if (__DEV__) {
      console.warn('ProtectedRoute used without AuthProvider — rendering children unprotected');
    }
    return typeof children === 'function' ? children() : children;
  }

  // Lazy router access — only needed for redirect path
  const router = useContext(RouterContext);

  // can() called eagerly in component body (context stack requirement)
  const checks = requires?.map((e) => can(e));

  const allAllowed = computed(() =>
    !checks || checks.every((c) => c.allowed.value)
  );

  const isResolved = computed(() => {
    const status = ctx.status;
    return status !== 'idle' && status !== 'loading';
  });

  // Side effect: navigate on redirect-worthy states (watch, not computed)
  if (typeof window !== 'undefined' && router) {
    watch(
      () => ({ resolved: isResolved.value, authenticated: ctx.isAuthenticated, allowed: allAllowed.value }),
      ({ resolved, authenticated, allowed }) => {
        if (!resolved) return;
        if (!authenticated) {
          const search = returnTo ? `?returnTo=${encodeURIComponent(window.location.pathname)}` : '';
          router.navigate({ to: `${loginPath}${search}` as any });
        }
      },
    );
  }

  // Pure derivation: what to render
  return computed(() => {
    if (!isResolved.value) {
      return fallback ? fallback() : null;
    }
    if (!(ctx.isAuthenticated as boolean)) {
      return fallback ? fallback() : null; // Show fallback while redirect fires
    }
    if (!allAllowed.value) {
      return forbidden ? forbidden() : null;
    }
    return typeof children === 'function' ? children() : children;
  });
}
```

**Acceptance Criteria (BDD):**

```ts
describe('Feature: ProtectedRoute', () => {
  describe('Given auth status is idle', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then renders fallback', () => {});
    });
  });

  describe('Given auth status is loading', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then renders fallback', () => {});
    });
  });

  describe('Given auth status is authenticated', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then renders children', () => {});
    });
  });

  describe('Given auth status is unauthenticated', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then calls navigate with loginPath and returnTo', () => {});
    });
  });

  describe('Given auth status is error', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then calls navigate with loginPath', () => {});
    });
  });

  describe('Given auth status is mfa_required', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then calls navigate with loginPath', () => {});
    });
  });

  describe('Given no loginPath provided', () => {
    describe('When redirecting', () => {
      it('Then navigates to /login (default)', () => {});
    });
  });

  describe('Given returnTo is false', () => {
    describe('When redirecting', () => {
      it('Then navigates to loginPath without returnTo query', () => {});
    });
  });

  describe('Given no fallback provided', () => {
    describe('When auth is loading', () => {
      it('Then renders null', () => {});
    });
  });

  describe('Given no AuthProvider in tree', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then renders children (fail-open) with DEV warning', () => {});
    });
  });

  describe('Given SSR environment', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then renders fallback without calling navigate', () => {});
    });
  });

  describe('Given requires entitlements and user has them', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then renders children', () => {});
    });
  });

  describe('Given requires entitlements and user lacks them', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then renders forbidden content (not redirect)', () => {});
    });
  });

  describe('Given requires entitlements, user lacks them, no forbidden prop', () => {
    describe('When ProtectedRoute renders', () => {
      it('Then renders null', () => {});
    });
  });

  describe('Given auth transitions from loading to authenticated', () => {
    describe('When status signal changes', () => {
      it('Then switches from fallback to children reactively', () => {});
    });
  });

  describe('Given auth transitions from loading to unauthenticated', () => {
    describe('When status signal changes', () => {
      it('Then calls navigate to loginPath', () => {});
    });
  });
});
```

**Files changed:**
- `packages/ui/src/auth/protected-route.ts` (new)
- `packages/ui/src/auth/__tests__/protected-route.test.ts` (new)
- `packages/ui/src/auth/public.ts` (add export)

**No dependencies on other phases — single phase feature.**

---

## Review Feedback Log

### Rev 1 → Rev 2

| Reviewer | Finding | Resolution |
|----------|---------|------------|
| DX | `requires` failure → login is semantically wrong (401 vs 403) | Added `forbidden` render prop for 403 case |
| DX | `returnTo` should be in scope | Added `returnTo` prop (default: true) |
| DX | Show JSX as primary usage | Updated API surface examples |
| DX | Explain `*Route` vs `*Gate` naming | Added naming rationale section |
| DX | Add `__DEV__` warning for missing AuthProvider | Added to behavior matrix and implementation |
| Product | Authenticated + requires failed → login creates loop | Fixed: renders `forbidden` or null, no redirect |
| Product | Add non-goal about nested ProtectedRoute | Added |
| Product | Note about `error` status tradeoff | Added note in behavior matrix |
| Technical | BLOCKER: navigate() in computed() is wrong | Split into computed (render) + watch (navigate) |
| Technical | BLOCKER: can() in computed() fails (context stack) | Call can() eagerly in component body |
| Technical | requires failure → login creates loop | Fixed (see DX/Product resolution) |
| Technical | SSR double-protection | Added SSR Safety section |
| Technical | Fail-open vs RouterContext dependency | Lazy router via useContext (not useRouter) |
| Technical | Add reactive transition tests | Added transition test scenarios |
