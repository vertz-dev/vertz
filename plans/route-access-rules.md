# Unified Route Access Rules

**Issue:** [#1083](https://github.com/vertz-dev/vertz/issues/1083)
**Status:** Design — awaiting approval

## Summary

Route-level access control using the same `rules.*` descriptors as entity access. One declarative API for protecting API operations, entities, and UI pages.

## API Surface

### Route definitions with access rules

```ts
import { defineRoutes, rules } from '@vertz/ui';

const routes = defineRoutes({
  '/login': {
    component: () => LoginPage(),
    // no access → public (unlike entities, where no rule → deny)
  },
  '/dashboard': {
    component: () => Dashboard(),
    access: rules.authenticated(),
  },
  '/admin': {
    component: () => AdminLayout(),
    access: rules.role('super_admin'),
    children: {
      '/billing': {
        component: () => BillingPage(),
        access: rules.entitlement('admin:billing'),
      },
      '/users': {
        component: () => UsersPage(),
        // inherits parent's rules.role('super_admin')
      },
    },
  },
  '/settings': {
    component: () => SettingsLayout(),
    access: rules.all(
      rules.authenticated(),
      rules.fva(600),
    ),
    children: {
      '/security': {
        component: () => SecurityPage(),
        access: rules.entitlement('settings:security'),
      },
    },
  },
});
```

### RouteAccessRule type (subset of AccessRule — no `where`)

```ts
// Route-level rules — no row context, so no `where()`
export type RouteAccessRule =
  | PublicRule
  | AuthenticatedRule
  | RoleRule
  | EntitlementRule
  | FvaRule
  | RouteAllRule
  | RouteAnyRule;

export interface RouteAllRule {
  readonly type: 'all';
  readonly rules: readonly RouteAccessRule[];
}

export interface RouteAnyRule {
  readonly type: 'any';
  readonly rules: readonly RouteAccessRule[];
}
```

Routes have no "row" to check against, so `rules.where()` is excluded at the type level. TypeScript rejects `rules.where()` in route access — compile-time enforcement per Principle 1.

### SSR handler integration

```ts
import { createSSRHandler } from '@vertz/ui-server';

const handler = createSSRHandler({
  module,
  template,
  routes,
  auth: {
    /** Extract auth context from request (JWT cookie parsing) */
    fromRequest: (request: Request) => ({
      userId: claims?.sub ?? null,
      tenantId: claims?.tid ?? null,
      authenticated: () => !!claims,
      role: (...roles: string[]) => roles.includes(claims?.role),
    }),
    /** Where to redirect when denied */
    onDenied: (reason) => reason === 'not_authenticated' ? '/login' : '/403',
  },
});
```

### Client-side route evaluation

```ts
import { createRouter } from '@vertz/ui';

const router = createRouter(routes, {
  // Auth state provider for client-side access evaluation
  auth: () => ({
    authenticated: () => auth.isAuthenticated,
    role: (...roles: string[]) => roles.some(r => auth.user?.role === r),
    can: (entitlement: string) => accessContext.can(entitlement).allowed,
  }),
  // Redirect when client-side access check fails
  onAccessDenied: (reason) => {
    if (reason === 'not_authenticated') {
      router.navigate({ to: '/login' });
    } else {
      router.navigate({ to: '/403' });
    }
  },
});
```

### E2E Acceptance Test — invalid usage rejected at compile time

```ts
import { defineRoutes, rules } from '@vertz/ui';

defineRoutes({
  '/admin': {
    component: () => AdminPage(),
    // @ts-expect-error — routes don't support where() (no row context)
    access: rules.where({ tenantId: rules.user.tenantId }),
  },
  '/dashboard': {
    component: () => Dashboard(),
    // @ts-expect-error — access must be a RouteAccessRule, not a boolean
    access: true,
  },
});

// Valid: all descriptor-based rules (except where) are accepted
defineRoutes({
  '/public': { component: () => Page(), access: rules.public },
  '/auth': { component: () => Page(), access: rules.authenticated() },
  '/role': { component: () => Page(), access: rules.role('admin') },
  '/ent': { component: () => Page(), access: rules.entitlement('page:view') },
  '/mfa': { component: () => Page(), access: rules.fva(600) },
  '/combo': {
    component: () => Page(),
    access: rules.all(rules.authenticated(), rules.entitlement('page:view')),
  },
  '/either': {
    component: () => Page(),
    access: rules.any(rules.role('admin'), rules.entitlement('page:view')),
  },
});
```

## Manifesto Alignment

### Principles upheld

1. **"If it builds, it works"** — `RouteAccessRule` type excludes `where()` at compile time. Using `rules.where()` on a route is a type error, not a runtime surprise.

2. **"One way to do things"** — Same `rules.*` API for entities, services, and routes. Developer learns the pattern once. LLM generates correct code on first try.

3. **"AI agents are first-class users"** — Single import (`import { rules } from '@vertz/ui'`), predictable descriptor shape, zero ambiguity.

4. **"Production-ready by default"** — SSR handler enforces access before rendering. No "oops I forgot to add the auth check" — access is declarative in the route config.

5. **Convention over configuration** — Default behavior is safe: no access = public for routes (explicit opt-in to protection), parent access cascades to children (no accidental exposure of child routes).

### Tradeoffs

- **Descriptors over callbacks**: The original issue (#1083) proposed `(ctx) => ctx.authenticated()` callbacks. We use `rules.authenticated()` descriptors instead. Callbacks are opaque — can't be serialized to client, can't be inspected by tooling. Descriptors are data; they can be sent to the client for advisory UI checks and logged for debugging.

- **Subset type over full type**: `RouteAccessRule` excludes `where()` rather than accepting the full `AccessRule` and erroring at runtime. Compile-time > runtime per manifesto.

- **Public by default for routes** (vs. deny-by-default for entities): Routes without an `access` field are public. This differs from entities (which deny by default). Rationale: most apps have public routes (login, signup, marketing). The safe default for entities is deny; the ergonomic default for routes is public. This is a deliberate, documented divergence.

### What was rejected

- **Function-based access rules** `(ctx) => ctx.authenticated()`: Opaque, not serializable, not inspectable. Violates the descriptor convention established in entity access rules.

- **Separate `requireAuth()` / `requireGuest()` helpers**: Creates multiple ways to protect routes. Violates "one way to do things."

- **Route guards as middleware**: Separate from route config, easy to forget, not co-located with the route definition.

## Non-Goals

1. **Row-level access on routes** — Routes have no "row." If a page needs row-level checks (e.g., "can this user view this task?"), that's handled by the entity access rules when fetching the data, not the route.

2. **Redirect configuration per route** — Redirect targets (login page, 403 page) are configured globally on the SSR handler and router, not per-route. Per-route redirects add complexity for a rare use case.

3. **Client-side enforcement as security** — Client-side route access is advisory. The SSR handler is the security boundary. Client-side checks prevent unnecessary navigation and improve UX but are not relied upon for security.

4. **Dynamic access rules** — Rules are static descriptors defined at route definition time. No runtime rule modification. If you need dynamic routing (e.g., feature flags), use `rules.entitlement()` and control via `defineAccess()`.

## Unknowns

### 1. Where should `rules.*` builders live? — needs discussion

Currently in `@vertz/server/src/auth/rules.ts`. Routes are defined in `@vertz/ui` code. Options:

- **A) Extract to `@vertz/auth`** — new tiny package, pure data. Both `@vertz/server` and `@vertz/ui` depend on it.
- **B) Mirror types in `@vertz/ui`** — duplicate the builder code (100 lines). Structurally compatible. Follows the precedent of `access-set-types.ts` which mirrors server types.
- **C) Put in `@vertz/core`** — shared foundation, but `@vertz/ui` doesn't currently depend on `@vertz/core` (which has server concepts).

**Recommendation: Option B** (mirror in `@vertz/ui`). The builders are 100 lines of pure data. TypeScript structural typing means they're compatible with the server types. Consolidation to a shared package can happen later. This avoids creating a new package or adding a dependency from `@vertz/ui` to a server-adjacent package.

### 2. Entitlement evaluation on the client — resolved

Client-side entitlement checks use the `AccessSet` (pre-computed in JWT). `rules.entitlement('admin:billing')` checks `accessSet.entitlements['admin:billing'].allowed`. This is already implemented in `can()` from `@vertz/ui/auth`.

## Type Flow Map

```
rules.authenticated()          → RouteAccessRule (type: 'authenticated')
                                    ↓
RouteConfig.access             → RouteConfig<TPath, ..., TAccess>
                                    ↓
defineRoutes({ '/x': config }) → TypedRoutes<T> (carries access rule per route)
                                    ↓
         ┌──────────────────────────┴──────────────────────────┐
         ↓                                                      ↓
createSSRHandler({ routes })                        createRouter(routes, { auth })
         ↓                                                      ↓
matchRoute(routes, url)                             matchRoute(routes, url)
         ↓                                                      ↓
evaluateRouteAccess(matched, ctx)                   evaluateRouteAccess(matched, authState)
         ↓                                                      ↓
allow → ssrRenderToString()                         allow → applyNavigation()
deny  → 302 redirect                               deny  → onAccessDenied()
```

Generic flow: `RouteAccessRule` is carried through `RouteConfig` → `CompiledRoute` → `matchRoute` result → access evaluator. No dead generics.

## E2E Acceptance Tests

### SSR: Unauthenticated user redirected from protected route

```ts
describe('Feature: SSR route access enforcement', () => {
  describe('Given a route with access: rules.authenticated()', () => {
    describe('When an unauthenticated request hits the route', () => {
      it('Then returns 302 redirect to login', async () => {
        const handler = createSSRHandler({
          module, template, routes,
          auth: {
            fromRequest: () => ({ userId: null, tenantId: null,
              authenticated: () => false, role: () => false, tenant: () => false }),
            onDenied: (reason) => reason === 'not_authenticated' ? '/login' : '/403',
          },
        });
        const response = await handler(new Request('http://localhost/dashboard'));
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('/login');
      });
    });
  });

  describe('Given a route with access: rules.authenticated()', () => {
    describe('When an authenticated request hits the route', () => {
      it('Then returns 200 with rendered HTML', async () => {
        const handler = createSSRHandler({
          module, template, routes,
          auth: {
            fromRequest: () => ({ userId: 'u1', tenantId: 't1',
              authenticated: () => true, role: () => false, tenant: () => true }),
            onDenied: () => '/login',
          },
        });
        const response = await handler(new Request('http://localhost/dashboard'));
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/html');
      });
    });
  });
});
```

### SSR: Parent access cascades to children

```ts
describe('Feature: Parent access cascades', () => {
  describe('Given /admin has access: rules.role("admin") with child /admin/users', () => {
    describe('When a non-admin authenticated user hits /admin/users', () => {
      it('Then returns 302 redirect (parent rule fails)', async () => {
        const handler = createSSRHandler({
          module, template, routes: defineRoutes({
            '/admin': {
              component: () => null as unknown as Node,
              access: rules.role('admin'),
              children: {
                '/users': { component: () => null as unknown as Node },
              },
            },
          }),
          auth: {
            fromRequest: () => ({ userId: 'u1', tenantId: 't1',
              authenticated: () => true, role: () => false, tenant: () => true }),
            onDenied: () => '/403',
          },
        });
        const response = await handler(new Request('http://localhost/admin/users'));
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('/403');
      });
    });
  });
});
```

### Client-side: Router prevents navigation to denied route

```ts
describe('Feature: Client-side route access', () => {
  describe('Given an unauthenticated user and route with rules.authenticated()', () => {
    describe('When navigating to the protected route', () => {
      it('Then calls onAccessDenied instead of rendering', () => {
        const onDenied = vi.fn();
        const router = createRouter(routes, {
          auth: () => ({
            authenticated: () => false,
            role: () => false,
            can: () => false,
          }),
          onAccessDenied: onDenied,
        });
        router.navigate({ to: '/dashboard' });
        expect(onDenied).toHaveBeenCalledWith('not_authenticated');
      });
    });
  });
});
```

### Type-level: where() rejected on routes

```ts
// route-access.test-d.ts
import { defineRoutes, rules, type RouteAccessRule } from '@vertz/ui';

// Positive: valid rules accepted
const _auth: RouteAccessRule = rules.authenticated();
const _role: RouteAccessRule = rules.role('admin');
const _ent: RouteAccessRule = rules.entitlement('x');

// Negative: where() is not assignable to RouteAccessRule
// @ts-expect-error — where() produces WhereRule, not RouteAccessRule
const _where: RouteAccessRule = rules.where({ tenantId: rules.user.tenantId });
```

## Implementation Plan

### Phase 1: Route access rule types and builders in `@vertz/ui`

**Goal:** `RouteConfig` accepts `access?: RouteAccessRule`. Type-level tests verify `where()` is rejected. `rules` builders are available from `@vertz/ui`.

**Files:**
- `packages/ui/src/auth/route-rules.ts` — `RouteAccessRule` type + `rules` builders (mirrors server/auth/rules.ts, no `where`)
- `packages/ui/src/router/define-routes.ts` — Add `access?: RouteAccessRule` to `RouteConfig`, `RouteConfigLike`, `CompiledRoute`
- `packages/ui/src/router/define-routes.test.ts` — Route matching still works with access field present
- `packages/ui/src/auth/__tests__/route-rules.test-d.ts` — Type flow tests

**Acceptance criteria:**
```ts
describe('Feature: RouteAccessRule type', () => {
  describe('Given a RouteConfig with access: rules.authenticated()', () => {
    describe('When defineRoutes() compiles the route', () => {
      it('Then the compiled route carries the access rule', () => {});
    });
  });

  describe('Given a RouteConfig with access: rules.where()', () => {
    describe('When TypeScript checks the type', () => {
      it('Then it produces a compile error (where not in RouteAccessRule)', () => {});
    });
  });

  describe('Given a RouteConfig with no access field', () => {
    describe('When defineRoutes() compiles the route', () => {
      it('Then the compiled route has access: undefined (public)', () => {});
    });
  });
});
```

### Phase 2: Route access evaluator

**Goal:** A pure function `evaluateRouteAccess(matched, ctx)` that walks the matched route chain and evaluates access rules. Reusable by both SSR handler and client-side router.

**Files:**
- `packages/ui/src/router/route-access.ts` — `evaluateRouteAccess()` function
- `packages/ui/src/router/__tests__/route-access.test.ts` — Unit tests for all rule types

**Acceptance criteria:**
```ts
describe('Feature: Route access evaluation', () => {
  describe('Given matched chain [/admin (role:admin), /admin/users (no access)]', () => {
    describe('When evaluateRouteAccess is called with non-admin ctx', () => {
      it('Then returns { allowed: false, reason: "role_denied" }', () => {});
    });
  });

  describe('Given matched chain [/admin (role:admin), /admin/billing (entitlement:admin:billing)]', () => {
    describe('When evaluateRouteAccess is called with admin who has the entitlement', () => {
      it('Then returns { allowed: true }', () => {});
    });
  });

  describe('Given matched chain with rules.all(authenticated, fva(600))', () => {
    describe('When evaluateRouteAccess is called with authenticated user, no fva', () => {
      it('Then returns { allowed: false, reason: "fva_required" }', () => {});
    });
  });

  describe('Given matched chain with no access rules', () => {
    describe('When evaluateRouteAccess is called', () => {
      it('Then returns { allowed: true } (public by default)', () => {});
    });
  });
});
```

### Phase 3: SSR handler route access enforcement

**Goal:** `createSSRHandler` accepts route access config. Before rendering, it evaluates route access and redirects on denial.

**Depends on:** Phase 1, Phase 2

**Files:**
- `packages/ui-server/src/ssr-handler.ts` — Extend `SSRHandlerOptions` with route access config
- `packages/ui-server/src/__tests__/ssr-handler-access.test.ts` — Integration tests

**Acceptance criteria:**
```ts
describe('Feature: SSR route access enforcement', () => {
  describe('Given SSR handler with routes and auth config', () => {
    describe('When unauthenticated request hits protected route', () => {
      it('Then returns 302 to onDenied redirect target', () => {});
    });

    describe('When authenticated request hits protected route', () => {
      it('Then returns 200 with rendered HTML', () => {});
    });

    describe('When request hits public route (no access field)', () => {
      it('Then returns 200 regardless of auth state', () => {});
    });

    describe('When request hits non-matching URL', () => {
      it('Then renders normally (404 handling unchanged)', () => {});
    });
  });

  describe('Given SSR handler with nav pre-fetch (X-Vertz-Nav: 1)', () => {
    describe('When nav request hits a protected route without auth', () => {
      it('Then returns SSE error event with access_denied', () => {});
    });
  });
});
```

### Phase 4: Client-side router access checks

**Goal:** `createRouter` accepts auth config. During navigation, evaluates route access before executing loaders. Calls `onAccessDenied` callback when denied.

**Depends on:** Phase 1, Phase 2

**Files:**
- `packages/ui/src/router/navigate.ts` — Add access check in `applyNavigation()` flow
- `packages/ui/src/router/__tests__/navigate-access.test.ts` — Unit tests

**Acceptance criteria:**
```ts
describe('Feature: Client-side route access', () => {
  describe('Given router with auth config and protected route', () => {
    describe('When navigating to denied route', () => {
      it('Then calls onAccessDenied and does not execute loaders', () => {});
      it('Then does not update current route signal', () => {});
    });

    describe('When navigating to allowed route', () => {
      it('Then proceeds with normal navigation (loaders + render)', () => {});
    });

    describe('When auth state changes (user logs in)', () => {
      describe('And user navigates to previously denied route', () => {
        it('Then allows navigation', () => {});
      });
    });
  });
});
```

### Phase 5: Documentation and exports

**Goal:** Public API exports, documentation, and developer walkthrough.

**Depends on:** Phase 1–4

**Files:**
- `packages/ui/src/auth/public.ts` — Export `rules`, `RouteAccessRule`
- `packages/ui/src/router/index.ts` — Export route access types
- `packages/docs/` — New page: "Route Access Rules"

**Acceptance criteria:**
- Developer can `import { rules } from '@vertz/ui'` and use in route definitions
- Developer can `import { rules } from '@vertz/server'` and both produce structurally compatible types
- Docs page with examples of public routes, protected routes, role-based routes, nested access
- Changeset added
