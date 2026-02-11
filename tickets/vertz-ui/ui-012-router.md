# ui-012: Router

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 6 — Router
- **Estimate:** 40 hours
- **Blocked by:** ui-001, ui-002, ui-003
- **Blocks:** ui-014
- **PR:** —

## Description

Implement the `@vertz/ui` router: `defineRoutes()` with typed params, `searchParams` schema integration, nested layouts, parallel loaders, code splitting, navigation API, and `<Link>` component.

### What to implement

- `defineRoutes()` configuration API
- Route matching and resolution (path patterns with `:param` and `*` wildcard)
- Template literal type inference for route params (`/:id` -> `{ id: string }`)
- `searchParams` schema integration with `@vertz/schema`
- Nested layouts with children slot (layout persists across child navigation)
- Parallel loader execution (parent + child loaders fire simultaneously)
- Route-level code splitting (lazy component imports)
- Route-level error components
- `useSearchParams()` typed hook
- `router.navigate()` and `revalidate()`
- `<Link>` component with active state
- `LoaderData<Route>` type utility

### Files to create

- `packages/ui/src/router/define-routes.ts`
- `packages/ui/src/router/matcher.ts`
- `packages/ui/src/router/loader.ts`
- `packages/ui/src/router/params.ts`
- `packages/ui/src/router/search-params.ts`
- `packages/ui/src/router/navigate.ts`
- `packages/ui/src/router/link.ts`
- `packages/ui/src/router/outlet.ts`
- All corresponding `__tests__/` files

### References

- [Implementation Plan — Phase 6](../../plans/ui-implementation.md#phase-6-router)
- [UI Design Doc](../../plans/ui-design.md)

## Acceptance Criteria

- [ ] `defineRoutes()` accepts route configuration with components, loaders, and children
- [ ] Route matching correctly extracts params from URL paths
- [ ] Template literal type inference provides typed params (`:id` -> `{ id: string }`)
- [ ] `searchParams` schema validates and coerces query string values
- [ ] Nested layouts render children correctly (layout persists across child navigation)
- [ ] Parent and child loaders execute in parallel
- [ ] Route components are lazily loaded via dynamic imports (code splitting)
- [ ] Route error components render on loader failure
- [ ] `useSearchParams()` returns typed search params
- [ ] `router.navigate()` navigates programmatically
- [ ] `revalidate()` re-runs loaders
- [ ] `<Link>` component renders with active state
- [ ] `LoaderData<Route>` type utility extracts loader return type
- [ ] Integration tests pass (see below)

### Integration Tests

```typescript
// IT-6-1: defineRoutes matches paths and extracts typed params
test('route matching extracts params from URL', () => {
  const routes = defineRoutes({
    '/users/:id': { component: () => UserDetail, loader: async ({ params }) => params },
  });
  const match = matchRoute(routes, '/users/123');
  expect(match.params).toEqual({ id: '123' });
});

// IT-6-2: Nested layouts render children correctly
test('nested layout renders child route', async () => {
  const routes = defineRoutes({
    '/users': {
      component: () => Layout,
      children: {
        '/': { component: () => UserList },
        '/:id': { component: () => UserDetail },
      },
    },
  });

  const { findByText } = renderTest(createTestRouter(routes, { initialPath: '/users' }));
  expect(findByText('User List')).toBeTruthy();
  expect(findByText('Layout Header')).toBeTruthy();
});

// IT-6-3: Parallel loaders fire simultaneously
test('parent and child loaders execute in parallel', async () => {
  const loadOrder: string[] = [];
  const routes = defineRoutes({
    '/users': {
      component: () => Layout,
      loader: async () => { loadOrder.push('parent'); return {}; },
      children: {
        '/:id': {
          component: () => UserDetail,
          loader: async () => { loadOrder.push('child'); return {}; },
        },
      },
    },
  });

  await navigateTo(routes, '/users/123');
  // Both should fire — order may vary but both must complete
  expect(loadOrder).toContain('parent');
  expect(loadOrder).toContain('child');
});

// IT-6-4: searchParams schema validates and coerces query string
test('searchParams coerces query string values', () => {
  const routes = defineRoutes({
    '/users': {
      component: () => UserList,
      searchParams: s.object({ page: s.coerce.number().default(1) }),
    },
  });

  const match = matchRoute(routes, '/users?page=3');
  expect(match.search.page).toBe(3); // number, not string
});

// IT-6-5: Code splitting lazily loads route components
test('route component is lazily loaded on navigation', async () => {
  let loaded = false;
  const routes = defineRoutes({
    '/lazy': {
      component: () => { loaded = true; return import('./LazyPage'); },
    },
  });

  expect(loaded).toBe(false);
  await navigateTo(routes, '/lazy');
  expect(loaded).toBe(true);
});

// IT-6-6: Route error component renders on loader failure
test('error component renders when loader throws', async () => {
  const routes = defineRoutes({
    '/fail': {
      component: () => Page,
      error: () => ErrorPage,
      loader: async () => { throw new Error('Not Found'); },
    },
  });

  const { findByText } = renderTest(createTestRouter(routes, { initialPath: '/fail' }));
  await waitFor(() => expect(findByText('Not Found')).toBeTruthy());
});
```

## Progress

- 2026-02-10: Ticket created from implementation plan.
