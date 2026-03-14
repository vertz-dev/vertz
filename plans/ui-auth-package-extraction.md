# Design: Extract `@vertz/ui-auth` Package

## Problem

All auth-related UI components in `packages/ui/src/auth/` use manual DOM primitives (`__element`, `__append`, `__enterChildren`, etc.) because `@vertz/ui` is a pre-built package that does NOT go through the Vertz compiler. This means:

1. Components can't use JSX — they must construct DOM manually
2. Components are called as functions (`Avatar({...})`) instead of `<Avatar />` — violating `ui-components.md` rules
3. No compiler transforms — no reactive signal auto-unwrap, no getter-based props, no CSS extraction

### Current Violations

- `user-avatar.ts:57` — `Avatar({ src, alt, size, fallback, class: className })`
- `oauth-buttons.ts:28` — `OAuthButton({ provider, _providers })`
- `protected-route.ts:62` — `(c.allowed as unknown as ReadonlySignal<boolean>).value` (manual signal cast because no compiler)

## API Surface

### Import Paths

```ts
// New canonical import for UI components
import { Avatar, UserAvatar, UserName, OAuthButton, OAuthButtons } from '@vertz/ui-auth';
import { AuthGate, ProtectedRoute, AccessGate } from '@vertz/ui-auth';

// Meta package
import { Avatar, UserAvatar } from 'vertz/ui-auth';

// Auth logic stays in @vertz/ui/auth (no change)
import { AuthProvider, useAuth, AuthContext } from '@vertz/ui/auth';
import { can, AccessContext, useAccessContext } from '@vertz/ui/auth';
import { getUserDisplayName, getUserInitials } from '@vertz/ui/auth';
```

**Note:** `@vertz/ui/auth` does NOT re-export `@vertz/ui-auth` components. This avoids a circular dependency (`@vertz/ui` → `@vertz/ui-auth` → `@vertz/ui`). This follows the same pattern as `@vertz/ui-primitives` — nobody imports `Dialog` from `@vertz/ui/primitives`.

### Build Strategy

`@vertz/ui-auth` ships **pre-built** `dist/` via `bunup`, matching the `@vertz/ui-primitives` pattern:

- `bunup.config.ts` uses `createVertzLibraryPlugin` from `@vertz/ui-compiler` (devDependency)
- JSX is compiled at package build time, not by the consumer
- `tsconfig.json` has `jsx: "react-jsx"` and `jsxImportSource: "@vertz/ui"`
- Consumer just imports from `@vertz/ui-auth` — no plugin needed

### Components After Conversion (JSX)

```tsx
// Avatar — presentational avatar with fallback
export function Avatar({ src, alt, size = 'md', fallback, class: className }: AvatarProps) {
  let imgFailed = false;
  const sizeConfig = sizes[size] ?? sizes.md;

  return (
    <div class={className} style={containerStyle(sizeConfig)}>
      {!src || imgFailed
        ? (fallback ? (typeof fallback === 'function' ? fallback() : fallback) : <UserIconFallback size={sizeConfig.icon} />)
        : <img src={src} alt={alt ?? ''} style={imgStyle} onError={() => { imgFailed = true; }} />
      }
    </div>
  );
}

// UserAvatar — auth-connected avatar
// Note: The compiler transforms `const` derivations into `computed()` automatically.
// In the current DOM-primitive implementation, `computed(() => renderAvatar(ctx.user, ...))`
// reconstructs the entire Avatar element on user change. With JSX + compiler, only individual
// prop values (avatarUrl, alt) update reactively while the Avatar element stays stable —
// this is *better* behavior (more granular updates).
export function UserAvatar({ size, user, fallback, class: className }: UserAvatarProps) {
  if (user) {
    return <Avatar src={user.avatarUrl} alt={getUserDisplayName(user)} size={size} fallback={fallback} class={className} />;
  }

  const ctx = useAuth();
  const avatarUrl = ctx.user && typeof ctx.user.avatarUrl === 'string' ? ctx.user.avatarUrl : undefined;
  const alt = getUserDisplayName(ctx.user);
  return <Avatar src={avatarUrl} alt={alt} size={size} fallback={fallback} class={className} />;
}

// OAuthButtons — composition via JSX
export function OAuthButtons({ _providers }: OAuthButtonsProps) {
  const providers = _providers ?? useAuth().providers;
  return (
    <div>
      {(providers as OAuthProviderInfo[]).map((p) => (
        <OAuthButton provider={p.id} _providers={providers as OAuthProviderInfo[]} />
      ))}
    </div>
  );
}

// ProtectedRoute — the compiler eliminates manual signal casts
// Current code has: `(c.allowed as unknown as ReadonlySignal<boolean>).value`
// Under the compiler, `can()` is a registered signal-api, so `c.allowed` is auto-unwrapped.
// All manual `.value` accesses and `as unknown as ReadonlySignal<T>` casts are removed.
export function ProtectedRoute({
  loginPath = '/login',
  fallback,
  children,
  requires,
  forbidden,
  returnTo = true,
}: ProtectedRouteProps) {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    if (__DEV__) {
      console.warn('ProtectedRoute used without AuthProvider — rendering children unprotected');
    }
    return typeof children === 'function' ? children() : children;
  }

  const router = useContext(RouterContext);
  const checks = requires?.map((e) => can(e));

  // No more `as unknown as ReadonlySignal<boolean>` — compiler auto-unwraps can().allowed
  const allAllowed = computed(
    () => !checks || checks.every((c) => c.allowed),
  );

  const isResolved = computed(() => {
    return ctx.status !== 'idle' && ctx.status !== 'loading';
  });

  const shouldRedirect = computed(() => {
    if (!isResolved.value) return false;
    return !ctx.isAuthenticated;
  });

  if (router) {
    domEffect(() => {
      if (shouldRedirect.value) {
        const search =
          returnTo && isBrowser()
            ? `?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
            : '';
        router.navigate({ to: `${loginPath}${search}`, replace: true });
      }
    });
  }

  return computed(() => {
    if (!isResolved.value) return fallback ? fallback() : null;
    if (shouldRedirect.value) return fallback ? fallback() : null;
    if (!allAllowed.value) return forbidden ? forbidden() : null;
    return typeof children === 'function' ? children() : children;
  });
}
```

### What Stays in `@vertz/ui`

All auth logic, context, types, and utilities remain:

```ts
// These stay in @vertz/ui/auth
export { AuthContext, AuthProvider, useAuth } from './auth-context';
export { AccessContext, can, useAccessContext } from './access-context';
export { getUserDisplayName, getUserInitials } from './user-display';
export { getUserIcon } from './user-icon';
export { getProviderIcon } from './provider-icons';
export { createAccessEventClient } from './access-event-client';
export { handleAccessEvent } from './access-event-handler';
export { createAccessProvider } from './create-access-provider';
// All types
```

### What Moves to `@vertz/ui-auth`

UI components that render DOM or gate rendering:

```ts
// These move to @vertz/ui-auth
export { Avatar } from './avatar';         // .ts → .tsx, DOM primitives → JSX
export { UserAvatar } from './user-avatar'; // .ts → .tsx
export { UserName } from './user-name';     // .ts → .tsx
export { OAuthButton } from './oauth-button'; // .ts → .tsx
export { OAuthButtons } from './oauth-buttons'; // .ts → .tsx
export { AuthGate } from './auth-gate';     // .ts → .tsx (computed-return, minimal change)
export { ProtectedRoute } from './protected-route'; // .ts → .tsx (removes manual signal casts)
export { AccessGate } from './access-gate'; // .ts → .tsx (computed-return, minimal change)
```

## Manifesto Alignment

### Principle 2: One Way to Do Things
The current state violates this — auth components use DOM primitives while user components use JSX. After extraction, ALL components (framework and user) use JSX via `<Component />` syntax.

### Principle 3: AI Agents are First-Class Users
DOM primitives (`__element`, `__append`, `__enterChildren`) are an internal API that LLMs shouldn't need to learn. JSX is the one obvious way to write components.

### Principle 1: If It Builds, It Works
JSX components get full compiler transforms — getter-based props, signal auto-unwrap — which means the type system catches more errors at compile time. Specifically, `ProtectedRoute`'s manual `as unknown as ReadonlySignal<boolean>` casts are eliminated, replaced by compiler-driven signal unwrapping.

### Tradeoff: Hydration
Components currently use `__enterChildren`/`__exitChildren` for hydration safety. In the new package, JSX generates these automatically via the compiler. The Vertz JSX factory already handles hydration — no behavioral change.

### Tradeoff: Reactivity Granularity
The JSX conversion changes reactivity granularity for `UserAvatar` and `UserName`. Currently, the entire component element is reconstructed inside a `computed()` when `ctx.user` changes. With JSX + compiler transforms, only individual props update reactively while the element stays stable. This is a **behavioral improvement** (more granular, fewer DOM operations), not a regression.

### What Was Rejected
- **Moving AuthProvider/AuthContext to `@vertz/ui-auth`**: AuthProvider uses `RouterContext`, `signal()`, `computed()` directly. It's pure logic with no rendered UI beyond the Provider wrapper. Moving it would create a circular dependency concern and it's not a component that benefits from JSX.
- **Creating `@vertz/ui-auth/context` sub-path**: Over-engineering for current needs. One entry point is sufficient.
- **Re-exporting `@vertz/ui-auth` from `@vertz/ui/auth`**: This would create a circular dependency at the package.json level (`@vertz/ui` → `@vertz/ui-auth` → `@vertz/ui`). UI components use a new import path; auth logic keeps the old path. This matches `@vertz/ui-primitives` — components live in their own package, not re-exported through `@vertz/ui`.

## Non-Goals

- **Styling the components**: Avatar/OAuthButton remain unstyled (inline styles). Theming is a separate concern.
- **Adding new auth components**: No new components in this PR.
- **Changing AuthProvider internals**: The provider stays in `@vertz/ui` with its signal-based logic.
- **Backward-compatible re-exports from `@vertz/ui/auth`**: The moved components get a new import path (`@vertz/ui-auth`). This is pre-v1 — breaking import paths is expected and encouraged.

## Unknowns

1. **`AuthGate`, `AccessGate`, `ProtectedRoute` don't use DOM primitives** — they return `computed()` signals, not DOM elements. Moving them is still correct (they're UI components conceptually), but the JSX conversion is trivial (they already don't create elements).
   - Resolution: Move them anyway. They're UI components consumed in JSX trees. The `.tsx` extension is correct even if they don't produce JSX — the compiler handles `computed()` returns fine.

2. **Hydration of computed-return components** — Components like `AuthGate` return `ReadonlySignal<unknown>`. The JSX factory handles signal children natively. No hydration concern.
   - Resolution: Verified — `jsx-runtime` handles signal children via `domEffect()`.

3. **Compiler double-unwrap risk in `ProtectedRoute`** — `can()` is registered in `reactivity.json` as a signal-api. The compiler will auto-insert `.value` for properties like `c.allowed`. The current code has explicit `.value` access (`(c.allowed as unknown as ReadonlySignal<boolean>).value`). Under the compiler, this would become `c.allowed.value.value` — a double-unwrap bug.
   - Resolution: During conversion, remove all manual `.value` accesses and `as unknown as ReadonlySignal<T>` casts on `can()` results. The compiler handles unwrapping. Same applies to `ctx.status` and `ctx.isAuthenticated` reads from `useContext(AuthContext)`. Add explicit test cases validating reactive `can().allowed` behavior in JSX context.

## Type Flow Map

```
AvatarProps ──────────────────────────────────────────────→ Avatar({ ... })
                                                              │
UserAvatarProps ──→ UserAvatar({ ... }) ──→ <Avatar /> ───────┘
                         │
                    useAuth() ──→ AuthContextValue (from @vertz/ui)
                         │
                    ctx.user ──→ User type (from @vertz/ui)

OAuthButtonProps ──→ OAuthButton({ ... })
                         │
                    useAuth() ──→ AuthContextValue.providers
                         │
                    OAuthProviderInfo (from @vertz/ui)

AuthGateProps ──→ AuthGate({ ... }) ──→ ReadonlySignal<unknown>
                       │
                  useContext(AuthContext) ──→ AuthContextValue (from @vertz/ui)

ProtectedRouteProps ──→ ProtectedRoute({ ... }) ──→ ReadonlySignal<unknown>
                              │
                         useContext(AuthContext) ──→ AuthContextValue
                         useContext(RouterContext) ──→ Router
                         can(entitlement) ──→ AccessCheck (compiler auto-unwraps)
```

All types flow from `@vertz/ui` → `@vertz/ui-auth`. No generics to trace — all types are concrete.

## E2E Acceptance Test

```tsx
// Auth logic stays in @vertz/ui/auth
import { AuthProvider } from '@vertz/ui/auth';

// UI components now come from @vertz/ui-auth (new package, compiled with JSX)
import { Avatar, UserAvatar, UserName, OAuthButton, AuthGate, ProtectedRoute } from '@vertz/ui-auth';

function App() {
  return (
    <AuthProvider basePath="/api/auth">
      <AuthGate fallback={() => <div>Loading...</div>}>
        {() => (
          <div>
            <UserAvatar size="md" />
            <UserName fallback="Guest" />
          </div>
        )}
      </AuthGate>
    </AuthProvider>
  );
}

function LoginPage() {
  return (
    <div>
      <OAuthButton provider="github" />
      <Avatar src="https://example.com/avatar.jpg" alt="User" size="lg" />
    </div>
  );
}

// @ts-expect-error — "xl" is not a valid size
<Avatar size="xl" />;

// @ts-expect-error — OAuthButton requires provider
<OAuthButton />;
```

## Implementation Plan

### Phase 1: Create Package + Move Avatar (Thinnest E2E Slice)

Create `packages/ui-auth/` with:
- `package.json` (depends on `@vertz/ui`, devDependency on `@vertz/ui-compiler` for `createVertzLibraryPlugin`)
- `tsconfig.json` (jsx: "react-jsx", jsxImportSource: "@vertz/ui")
- `bunup.config.ts` (uses `createVertzLibraryPlugin`)
- `bunfig.toml` (preload happy-dom + test compiler plugin, matching `@vertz/ui-primitives`)

Convert `Avatar` from DOM primitives to JSX. Update `@vertz/ui/auth` public.ts to remove `Avatar` export. Update `vertz` meta package to add `./ui-auth` export.

**Acceptance Criteria:**

```typescript
describe('Feature: @vertz/ui-auth package with Avatar component', () => {
  describe('Given @vertz/ui-auth is installed', () => {
    describe('When importing Avatar from @vertz/ui-auth', () => {
      it('Then Avatar is a function component', () => {});
    });
  });

  describe('Given Avatar rendered with src', () => {
    describe('When the image loads successfully', () => {
      it('Then renders an img element with the src', () => {});
    });
    describe('When the image fails to load', () => {
      it('Then renders the fallback content', () => {});
      it('Then renders default user icon when no fallback provided', () => {});
    });
  });

  describe('Given Avatar rendered without src', () => {
    it('Then renders fallback immediately', () => {});
    it('Then renders default user icon when no fallback provided', () => {});
  });

  describe('Given Avatar with size prop', () => {
    it('Then sm renders 32x32 container', () => {});
    it('Then md renders 40x40 container', () => {});
    it('Then lg renders 56x56 container', () => {});
  });

  describe('Given Avatar with class prop', () => {
    it('Then applies class to the container element', () => {});
  });
});
```

### Phase 2: Convert Remaining Components

Convert `UserAvatar`, `UserName`, `OAuthButton`, `OAuthButtons` to JSX. These depend on `useAuth()` context. Remove the `renderAvatar` helper in `UserAvatar` — JSX composition replaces it. Move corresponding tests from `@vertz/ui` to `@vertz/ui-auth`.

**Acceptance Criteria:**

```typescript
describe('Feature: Auth-connected components in JSX', () => {
  describe('Given UserAvatar with user prop', () => {
    it('Then renders Avatar with user avatarUrl and display name', () => {});
  });
  describe('Given UserAvatar without user prop (uses context)', () => {
    it('Then reads user from AuthContext and updates reactively', () => {});
    it('Then throws without AuthProvider', () => {});
  });

  describe('Given UserName with user prop', () => {
    it('Then renders display name in a span', () => {});
  });
  describe('Given UserName without user prop (uses context)', () => {
    it('Then reads user from AuthContext', () => {});
  });

  describe('Given OAuthButton with provider prop', () => {
    it('Then renders button with provider icon and label', () => {});
    it('Then navigates to authUrl on click', () => {});
    it('Then renders icon-only when iconOnly=true', () => {});
    it('Then rejects dangerous URL schemes', () => {});
  });

  describe('Given OAuthButtons', () => {
    it('Then renders an OAuthButton for each configured provider', () => {});
  });
});
```

### Phase 3: Convert Gate/Route Components + Wire Exports

Convert `AuthGate`, `AccessGate`, `ProtectedRoute` to JSX. `ProtectedRoute` conversion must:
- Remove all `as unknown as ReadonlySignal<T>` casts
- Remove manual `.value` accesses on `can()` results and context properties
- Let the compiler handle signal unwrapping
- Add test specifically validating `can().allowed` reactive behavior in compiled context

Update `@vertz/ui/auth` public.ts to remove moved component exports. Add to `vertz` meta package. Move corresponding tests.

**Acceptance Criteria:**

```typescript
describe('Feature: Gate and route components + export wiring', () => {
  describe('Given AuthGate with auth context', () => {
    it('Then renders fallback while status is idle/loading', () => {});
    it('Then renders children when status resolves', () => {});
    it('Then renders children without AuthProvider (fail-open)', () => {});
  });

  describe('Given AccessGate with access context', () => {
    it('Then renders fallback while access set is loading', () => {});
    it('Then renders children when access set is loaded', () => {});
  });

  describe('Given ProtectedRoute with auth context', () => {
    it('Then renders fallback while auth is resolving', () => {});
    it('Then renders children when authenticated', () => {});
    it('Then navigates to loginPath when unauthenticated', () => {});
    it('Then renders forbidden when lacking entitlements', () => {});
    it('Then can().allowed works reactively without manual signal casts', () => {});
  });

  describe('Given vertz/ui-auth meta package import', () => {
    it('Then re-exports all from @vertz/ui-auth', () => {});
  });

  describe('Given @vertz/ui/auth', () => {
    it('Then no longer exports moved components (Avatar, UserAvatar, etc.)', () => {});
    it('Then still exports auth logic (AuthProvider, useAuth, can, types)', () => {});
  });
});
```

### Phase 4: Changeset + Cleanup

Add changesets. Remove dead code from `@vertz/ui/auth`. Update example imports. Final quality gates.

**Acceptance Criteria:**
- [ ] Changeset added for `@vertz/ui-auth` (new package, patch)
- [ ] Changeset added for `@vertz/ui` (patch — component exports removed from `@vertz/ui/auth`)
- [ ] Changeset added for `vertz` (patch — new `./ui-auth` export)
- [ ] No unused imports in `@vertz/ui/src/auth/`
- [ ] Example apps updated to import from `@vertz/ui-auth`
- [ ] All existing tests pass
- [ ] `bun run build && bun test && bun run typecheck && bun run lint` clean
