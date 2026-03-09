# Module Singletons — Global State Without Providers

## The Pattern

Vertz uses **module-scoped singletons** for truly global state — state that exists once per application and needs to be accessible anywhere without prop threading or Context providers.

```typescript
// @vertz/ui — framework provides the singleton
let instance: EntityStore | undefined;

export function getEntityStore(): EntityStore {
  if (!instance) instance = new EntityStore();
  return instance;
}

export function resetEntityStore(): void {
  instance?.clear();
  instance = undefined;
}
```

**Characteristics:**

- Lazy creation on first access
- Module-level scope — same instance everywhere that imports it
- Explicit `reset*()` function for SSR per-request isolation
- No Context providers, no prop threading, no DI containers
- Generated code auto-wires the singleton — developer setup is zero or minimal

## When to Use

Use module singletons for state that is:

1. **Truly global** — one instance per app, not per component or subtree
2. **Shared across unrelated parts of the tree** — if two components that don't share a parent both need it, a Context provider would require wrapping the entire app anyway
3. **Needed by infrastructure code** — generated clients, framework internals, middleware — not just components

**Examples that fit:** entity cache, authentication session, theme configuration, feature flags, analytics context.

**Examples that don't fit:** form state (per-form), router state (per-router instance), component-local state (per-instance). These have natural ownership boundaries — use `let` (signals), `createContext()`, or function parameters.

## The Convention

### 1. `get*()` accessor — lazy singleton

```typescript
export function getEntityStore(): EntityStore { ... }
export function getAuthStore(): AuthStore { ... }
export function getThemeStore(): ThemeStore { ... }
```

Always a function, never a bare exported instance. The function enables lazy initialization and makes reset possible.

### 2. `reset*()` — SSR per-request isolation

```typescript
export function resetEntityStore(): void { ... }
export function resetAuthStore(): void { ... }
```

SSR renders multiple requests in the same process. Without reset, request A's state leaks into request B. Every singleton must have a reset function.

### 3. SSR hook registration

```typescript
// Registered once at module load
globalThis.__VERTZ_CLEAR_ENTITY_STORE__ = resetEntityStore;
globalThis.__VERTZ_CLEAR_AUTH_STORE__ = resetAuthStore;
```

`ui-server` calls all `__VERTZ_CLEAR_*__` hooks before each SSR request. This is the same pattern `query()` uses with `__VERTZ_CLEAR_QUERY_CACHE__`.

### 4. Generated code auto-wires singletons

The generated `createClient` imports `get*()` functions and wires them internally. The developer's app code doesn't change:

```typescript
// Developer writes (unchanged across phases)
import { createClient } from '#generated';
export const api = createClient();
```

```typescript
// Generated code wires singletons internally
import { getEntityStore, createOptimisticHandler } from '@vertz/ui';
import { getAuthStore } from '@vertz/ui';

export function createClient(options = {}) {
  const client = new FetchClient({
    baseURL: options.baseURL ?? '/api',
    auth: getAuthStore(),                          // auto-wired
  });
  const handler = createOptimisticHandler(getEntityStore());  // auto-wired
  return {
    todos: createTodosSdk(client, handler),
  };
}
```

## Application: Authentication

Vertz provides a built-in auth system via `AuthProvider` and `useAuth()` that manages JWT sessions, token refresh, MFA, and SSR hydration — see the full [Authentication Guide](./authentication.md).

```tsx
import { AuthProvider, useAuth } from '@vertz/ui/auth';
import { form } from '@vertz/ui';

// Wrap your app
<AuthProvider>
  <App />
</AuthProvider>

// Use auth state anywhere
const auth = useAuth();
const loginForm = form(auth.signIn); // SdkMethod — form() works directly
```

The module singleton pattern (EntityStore, etc.) is still the right choice for state that generated code needs to auto-wire. Authentication uses Context instead because it manages a complex lifecycle (token refresh, MFA, SSR hydration) that benefits from component-scoped setup and disposal.

## Why Not Context Providers?

Context providers solve a different problem — **subtree-scoped state**. A theme provider on a dialog gives that dialog a different theme than the rest of the app. A router provider on a section enables nested routing.

Module singletons solve **app-scoped state** — state where there's only ever one instance. Using Context for this adds ceremony without benefit:

```tsx
// UNNECESSARY — auth is always app-global
<AuthProvider value={authStore}>
  <EntityStoreProvider value={entityStore}>
    <App />
  </EntityStoreProvider>
</AuthProvider>
```

vs.

```tsx
// Module singletons — no wrapping needed
<App />
// getEntityStore() and getAuthStore() are available everywhere
```

The module singleton approach also works in non-component code — generated clients, middleware, utilities — where Context is unavailable.

## SSR Safety Checklist

When adding a new module singleton:

- [ ] `get*()` function with lazy initialization
- [ ] `reset*()` function that clears state and nulls the instance
- [ ] `globalThis.__VERTZ_CLEAR_*__` hook registered at module load
- [ ] `ui-server` updated to call the new hook before each request
- [ ] Hydration support if the singleton carries state from SSR → client (`hydrate()` / `dehydrate()`)
