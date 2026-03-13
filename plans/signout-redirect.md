# Design: signOut with redirect option

**Issue:** #1207
**Status:** Draft — Rev 2 (addressed technical review)

## Problem

`auth.signOut()` clears the session but doesn't control post-sign-out navigation. Developers rely on reactive UI (e.g., AuthGuard ternary) to implicitly redirect, which can cause flicker or inconsistent UX.

## API Surface

```tsx
// Without redirect — existing behavior, unchanged
await auth.signOut();

// With redirect — navigates after clearing session
await auth.signOut({ redirectTo: '/login' });
```

### Type changes

```ts
// New options type
export interface SignOutOptions {
  /** Path to navigate to after sign-out completes. Uses SPA navigation. */
  redirectTo?: string;
}

// Updated signature
signOut: (options?: SignOutOptions) => Promise<void>;
```

### Behavior

1. Clear session (existing: cancel token refresh, POST to signout endpoint, clear signals, clear window session)
2. If `redirectTo` is provided, navigate using the router captured at render time (fire-and-forget — `signOut` resolves when state is cleared, not when navigation completes)
3. Navigation uses `replace: true` so the user can't "back" into a signed-out state
4. If `RouterContext` is not available (no router in tree), skip navigation silently — emit `console.warn` in dev mode
5. Navigation errors are caught and logged — `signOut` never rejects for navigation reasons

### Tree ordering constraint

`RouterContext.Provider` must be an **ancestor** of `AuthProvider` for `redirectTo` to work:

```tsx
// CORRECT — router is ancestor, AuthProvider can read RouterContext
<RouterContext.Provider value={router}>
  <AuthProvider>
    {/* app content */}
  </AuthProvider>
</RouterContext.Provider>

// WRONG — AuthProvider is outside router, redirectTo silently skipped
<AuthProvider>
  <RouterContext.Provider value={router}>
    {/* app content */}
  </RouterContext.Provider>
</AuthProvider>
```

This is the typical setup (auth wraps the app, router wraps auth), but the constraint should be documented.

## Implementation approach

**Key insight from technical review:** `useContext(RouterContext)` cannot be called inside the async `signOut` function. Vertz's context stack (`ContextScope`) is only populated during synchronous rendering. By the time `signOut` runs asynchronously (user clicks button), the stack is empty and `useContext` returns `undefined`.

**Fix:** Capture the router reference eagerly during `AuthProvider`'s synchronous render, and use it via closure:

```ts
export function AuthProvider({ ... }: AuthProviderProps): HTMLElement {
  // Capture router at render time (synchronous — context stack is active)
  const router = useContext(RouterContext);

  // ... existing code ...

  const signOut = async (options?: SignOutOptions) => {
    // ... existing cleanup ...

    // Navigate using the captured reference (fire-and-forget)
    if (options?.redirectTo) {
      if (router) {
        router.navigate({ to: options.redirectTo, replace: true }).catch(() => {
          // Navigation error after signout is non-fatal
        });
      } else if (typeof console !== 'undefined') {
        console.warn(
          '[vertz] signOut({ redirectTo }) was called but no RouterContext is available. Navigation was skipped.',
        );
      }
    }
  };
```

**Navigation timing:** `signOut` fires `router.navigate()` but does NOT await it. This means `await signOut()` resolves as soon as auth state is cleared. Navigation happens concurrently. This avoids surprises where `signOut` hangs because the login page has slow loaders.

## Manifesto Alignment

- **Principle 2 (Zero boilerplate):** Eliminates the need for manual `navigate()` calls after `signOut()`
- **Principle 4 (One way to do it):** Provides the canonical pattern for post-signout redirect
- **Principle 8 (LLM-friendly):** Simple, discoverable API — LLMs can easily generate `signOut({ redirectTo: '/login' })`

## Non-Goals

- Type-safe route paths in `redirectTo` — `signOut` doesn't know the route map. The developer passes a plain string. Type-safe navigation is the router's concern.
- Hard navigation (`window.location.href`) — SPA-only as specified in the issue
- Custom redirect logic (callbacks, conditional redirects) — the developer can do this in their own code before calling `signOut()`
- Configurable `replace` behavior — `replace: true` is always correct for sign-out
- Server-side redirect on signout — this is a client-side SPA feature only

## Unknowns

- ~~None identified~~ Resolved: `useContext` cannot be called in async context. Fix: capture router at render time (see Implementation approach).

## Type Flow Map

```
SignOutOptions.redirectTo (string)
  → signOut(options?) in AuthProvider
    → captured router.navigate({ to: redirectTo, replace: true })
```

No generics involved. The `redirectTo` is a plain string — no type flow to verify beyond the function signature.

## E2E Acceptance Test

```ts
describe('Feature: signOut with redirect', () => {
  describe('Given an authenticated user with a router in the tree', () => {
    describe('When calling signOut({ redirectTo: "/login" })', () => {
      it('Then clears auth state and navigates to /login', () => {
        // auth.status === 'unauthenticated'
        // auth.user === null
        // router.navigate was called with { to: '/login', replace: true }
      });
    });
  });

  describe('Given an authenticated user with a router in the tree', () => {
    describe('When calling signOut() without options', () => {
      it('Then clears auth state without navigating', () => {
        // auth.status === 'unauthenticated'
        // router.navigate was NOT called
      });
    });
  });

  describe('Given an authenticated user WITHOUT a router in the tree', () => {
    describe('When calling signOut({ redirectTo: "/login" })', () => {
      it('Then clears auth state without throwing (navigation silently skipped)', () => {
        // auth.status === 'unauthenticated'
        // No error thrown
        // console.warn emitted in dev mode
      });
    });
  });

  describe('Given signOut network call fails', () => {
    describe('When calling signOut({ redirectTo: "/login" })', () => {
      it('Then still clears state and navigates', () => {
        // Resilient — same as existing behavior, plus navigation
      });
    });
  });

  describe('Given navigation throws an error', () => {
    describe('When calling signOut({ redirectTo: "/login" })', () => {
      it('Then still resolves without throwing (navigation error is non-fatal)', () => {
        // signOut resolves successfully
        // auth state is cleared
        // navigation error is swallowed
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: signOut redirect option (single phase)

This is a small, self-contained change:

1. Add `SignOutOptions` interface to `auth-types.ts`
2. Update `signOut` signature in `AuthContextValue` interface
3. Import `RouterContext` and `useContext` in `auth-context.ts`, capture router at render time
4. Update `signOut` implementation to accept options and fire-and-forget navigate
5. Add tests (TDD: failing tests first)
6. Update type-level tests
7. Export `SignOutOptions` from `public.ts`

**Acceptance criteria:**
- `signOut()` with no args works as before
- `signOut({ redirectTo: '/login' })` navigates after clearing state
- Navigation uses `replace: true`
- Navigation is fire-and-forget (signOut resolves when state is cleared)
- No error when router is not in tree (console.warn in dev)
- Network failure still clears state and navigates
- Navigation error doesn't cause signOut to reject
- Type-level: `signOut()` accepts optional `SignOutOptions`, rejects invalid args
