# Auto-detect `initialPath` in `createRouter`

**Issue:** [#1205](https://github.com/vertz-dev/vertz/issues/1205)

## Problem

Every SSR-compatible app writes identical boilerplate to detect the initial path:

```tsx
const initialPath =
  typeof window !== 'undefined' && window.location
    ? window.location.pathname
    : ((globalThis as Record<string, unknown>).__SSR_URL__ as string) || '/';

export const appRouter = createRouter(routes, initialPath, { serverNav: true });
```

This appears verbatim in `examples/task-manager/src/router.ts` and `examples/component-catalog/src/router.ts`. It's boilerplate that `createRouter` should handle internally.

## API Surface

```tsx
// Before — verbose, repeated in every app
const initialPath =
  typeof window !== 'undefined' && window.location
    ? window.location.pathname
    : ((globalThis as Record<string, unknown>).__SSR_URL__ as string) || '/';
export const appRouter = createRouter(routes, initialPath, { serverNav: true });

// After — auto-detect (options as second arg)
export const appRouter = createRouter(routes, { serverNav: true });

// After — auto-detect (no options)
export const appRouter = createRouter(routes);

// After — explicit path still works (backward compatible)
export const appRouter = createRouter(routes, '/tasks', { serverNav: true });
```

### Signature Change

```tsx
// Current
function createRouter<T>(routes: TypedRoutes<T>, initialUrl?: string, options?: RouterOptions): Router<T>;

// Proposed — overloaded (more-specific first per TS convention)
function createRouter<T>(routes: TypedRoutes<T>, initialUrl: string, options?: RouterOptions): Router<T>;
function createRouter<T>(routes: TypedRoutes<T>, options?: RouterOptions): Router<T>;
```

When the second argument is an object (or omitted), auto-detect. When it's a string, use it as `initialUrl`.

### Auto-detection Logic

The router already has two branches (SSR vs browser). Each branch already has the correct auto-detection — this change just makes `initialUrl` truly optional by parsing the overloaded arguments:

- **SSR branch** (`isSSR || typeof window === 'undefined'`): `initialUrl ?? ssrCtx?.url ?? '/'` (already implemented)
- **Browser branch**: `initialUrl ?? window.location.pathname + window.location.search` (already implemented)

No new detection mechanisms are needed. The `__SSR_URL__` global is a dead concept — the SSR pipeline uses `AsyncLocalStorage` via `getSSRContext()`. The examples' boilerplate references `__SSR_URL__` but the server never sets it. Removing this boilerplate is safe.

**Behavior improvement:** The current user boilerplate only captures `window.location.pathname` (dropping search params). The auto-detection captures `window.location.pathname + window.location.search`, which is more correct — query strings are now preserved on initial load.

## Manifesto Alignment

- **Principle 2 (One way to do things):** Eliminates the "detect initial path" pattern that every app copies. One canonical way: just call `createRouter(routes, options)`.
- **Principle 3 (AI agents are first-class users):** An LLM can now scaffold a router without knowing about environment detection. Less boilerplate = fewer mistakes.
- **Principle 1 (If it builds, it works):** The overloaded signature uses TypeScript's discriminated overloads — passing wrong types is a compile error.

## Non-Goals

- **Changing SSR context injection** — the dev server's `getSSRContext()` mechanism stays as-is.
- **Changing `RouterOptions`** — no new options needed.
- **Changing the Router return type** — purely an input change.
- **Changing `createLink` / `currentPath` patterns** — the examples' `currentPath` computed is orthogonal; updating it is a minor cleanup included in the example updates.

## Unknowns

None identified. The auto-detection logic already exists inside `createRouter`. This change just adds argument parsing to support the overloaded signature.

## Type Flow Map

The generic `T` flows unchanged:
- `createRouter<T>(routes: TypedRoutes<T>, ...)` → `Router<T>`
- The overload resolution is purely on the second argument (`string` vs `RouterOptions` vs `undefined`).
- No new generics introduced.

## E2E Acceptance Test

```tsx
// ✅ Auto-detect — compiles, routes correctly
const router1 = createRouter(routes, { serverNav: true });
const router2 = createRouter(routes);

// ✅ Explicit path — backward compatible
const router3 = createRouter(routes, '/tasks');
const router4 = createRouter(routes, '/tasks', { serverNav: true });

// @ts-expect-error — number is not a valid second arg
const bad1 = createRouter(routes, 42);

// @ts-expect-error — boolean is not a valid second arg
const bad2 = createRouter(routes, true);
```

## Implementation Plan

### Phase 1: Overloaded Signature + Auto-detection

**Changes:**
- `packages/ui/src/router/navigate.ts` — add overloaded signatures, parse arguments at runtime
- `packages/ui/src/router/__tests__/navigate.test.ts` — tests for new overload paths
- `examples/task-manager/src/router.ts` — remove boilerplate, use `createRouter(routes, { serverNav: true })`
- `examples/component-catalog/src/router.ts` — remove boilerplate, use `createRouter(routes)`

**Backward compatibility:** All existing tests must pass unmodified. The overloaded signature is a strict superset of the current signature.

**Acceptance Criteria (BDD):**

```typescript
describe('Feature: createRouter auto-detects initialPath', () => {
  describe('Given window.location is available (browser)', () => {
    describe('When createRouter(routes) is called without initialUrl', () => {
      it('Then uses window.location.pathname + search as initial URL', () => {});
    });
  });

  describe('Given an active SSR context with a URL', () => {
    describe('When createRouter(routes) is called without initialUrl', () => {
      it('Then uses ssrCtx.url as initial URL', () => {});
    });
  });

  describe('Given neither window nor SSR context is available', () => {
    describe('When createRouter(routes) is called', () => {
      it('Then falls back to "/" as initial URL', () => {});
    });
  });

  describe('Given an explicit initialUrl string', () => {
    describe('When createRouter(routes, "/tasks") is called', () => {
      it('Then uses the explicit URL (backward compat)', () => {});
    });
  });

  describe('Given options as second argument', () => {
    describe('When createRouter(routes, { serverNav: true }) is called', () => {
      it('Then auto-detects URL and applies options', () => {});
    });
  });

  describe('Given options as third argument with explicit URL', () => {
    describe('When createRouter(routes, "/tasks", { serverNav: true }) is called', () => {
      it('Then uses explicit URL and applies options', () => {});
    });
  });
});
```

**Type-level tests:**

```typescript
// createRouter(routes) — valid
// createRouter(routes, '/path') — valid
// createRouter(routes, { serverNav: true }) — valid
// createRouter(routes, '/path', { serverNav: true }) — valid
// @ts-expect-error — createRouter(routes, 42)
// @ts-expect-error — createRouter(routes, true)
```
