# Fix: popstate handler search-param-only optimization

**Issue:** [#1922](https://github.com/vertz-dev/vertz/issues/1922)
**Type:** Bug fix (Tier 1 — internal)
**Rev:** 2 (addresses technical review feedback)

## Problem

The `navigate()` function detects search-param-only changes (same pathname, different search params) and skips SSE prefetch, view transitions, and loaders. The `popstate` handler (browser back/forward) does NOT apply this optimization.

When a user presses the browser back button to return from `/?page=3` to `/?page=2`, the full navigation pipeline runs — SSE prefetch fires, view transitions execute, and loaders are invoked. This is inconsistent with the programmatic `navigate()` path.

## API Surface

No public API change. Internal behavior fix only.

### Current `onPopState` (lines 647–656 of `navigate.ts`):

```ts
const onPopState = () => {
  const popUrl = window.location.pathname + window.location.search;
  startPrefetch(popUrl);                                              // always
  const match = matchRoute(routes, popUrl);
  const transitionConfig = match?.route.viewTransition ?? options?.viewTransition; // always
  applyNavigation(popUrl, match, transitionConfig).catch(() => {});   // no skipLoaders
};
```

### Design: `lastPathname` tracking variable

Track the currently-rendered pathname in a `let lastPathname` variable. Updated **synchronously in callers** (not inside `applyNavigation`) to avoid async desync.

#### Shared helper

```ts
function extractPathname(url: string): string {
  return url.split('?')[0]?.split('#')[0] || '/';
}
```

Replaces the repeated `url.split('?')[0]?.split('#')[0] || '/'` pattern in both `navigate()` (line 593) and the new code.

#### Initialization

```ts
let lastPathname = extractPathname(initialUrl ?? window.location.pathname);
```

Note: `window.location.pathname` never includes query strings, so the `split('?')` is a no-op for the fallback. The helper is applied uniformly for consistency.

#### Update in `navigate()` — synchronously after pushState/replaceState

```ts
async function navigate(input: NavigateInput): Promise<void> {
  const navUrl = buildNavigationUrl(input.to, input);
  const navPathname = extractPathname(navUrl);
  const isSearchParamOnly = lastPathname === navPathname;

  const gen = ++navigateGen;
  const handle = isSearchParamOnly ? null : startPrefetch(navUrl);

  // Update browser history
  if (input.replace) {
    window.history.replaceState(null, '', navUrl);
  } else {
    window.history.pushState(null, '', navUrl);
  }

  // Update lastPathname synchronously AFTER history change, BEFORE any async work.
  // This ensures popstate events that fire during awaitPrefetch see the correct value.
  // Also covers the navigateGen early-return case (line 620) where applyNavigation
  // is never called but pushState already happened.
  lastPathname = navPathname;

  // ... rest unchanged (awaitPrefetch, navigateGen guard, applyNavigation)
}
```

#### Update in `onPopState` — at handler start

```ts
const onPopState = () => {
  const popUrl = window.location.pathname + window.location.search;
  const popPathname = extractPathname(popUrl);
  const isSearchParamOnly = lastPathname === popPathname;

  // Update lastPathname synchronously — browser has already moved window.location.
  lastPathname = popPathname;

  const handle = isSearchParamOnly ? null : startPrefetch(popUrl);
  const match = matchRoute(routes, popUrl);
  const transitionConfig = isSearchParamOnly
    ? undefined
    : (match?.route.viewTransition ?? options?.viewTransition);
  applyNavigation(popUrl, match, transitionConfig, isSearchParamOnly).catch(() => {});
};
```

#### Why callers, not `applyNavigation`?

`applyNavigation` is async (view transitions, loaders). If `lastPathname` is updated inside it:
1. Between `pushState` and `applyNavigation` completing, a popstate could read stale `lastPathname`
2. The `navigateGen` early-return in `navigate()` skips `applyNavigation` entirely, but pushState already happened — `lastPathname` would desync
3. If `applyNavigation` throws, `lastPathname` wouldn't update even though `window.location` already moved

By updating synchronously in callers, `lastPathname` always matches `window.location.pathname` after any synchronous navigation step. No async timing gaps.

## Manifesto Alignment

- **Principle: Zero Overhead** — search-param-only popstate should skip unnecessary work
- **Principle: Consistency** — popstate and navigate should behave the same for equivalent navigations

## Non-Goals

- Not adding new public API
- Not changing how `applyNavigation` works (it already accepts `skipLoaders`)

## Unknowns

None identified. The fix is a straightforward application of the existing pattern.

## Type Flow Map

No generic types introduced. No type-level changes.

## E2E Acceptance Test

```ts
describe('Feature: popstate search-param-only optimization', () => {
  describe('Given a router at /?page=2', () => {
    describe('When popstate fires with the same pathname but different search params (/?page=1)', () => {
      it('Then does NOT start prefetch', () => {});
      it('Then does NOT apply view transitions', () => {});
      it('Then skips loaders', () => {});
      it('Then still updates current match and searchParams', () => {});
    });
  });

  describe('Given a router at /tasks?q=foo', () => {
    describe('When popstate fires with /tasks (search params removed entirely)', () => {
      it('Then treats as search-param-only (skips prefetch/loaders)', () => {});
    });
  });

  describe('Given a router at /tasks', () => {
    describe('When popstate fires with a different pathname (/settings)', () => {
      it('Then starts prefetch as normal', () => {});
      it('Then applies view transitions as configured', () => {});
      it('Then runs loaders', () => {});
    });
  });

  describe('Given a router at /tasks/1', () => {
    describe('When popstate fires with /tasks/2 (different path param)', () => {
      it('Then treats it as a full navigation (NOT search-param-only)', () => {});
    });
  });

  describe('Given navigate({ to: "/", search: { page: "2" }, replace: true })', () => {
    describe('When popstate fires back to the previous history entry with a different pathname', () => {
      it('Then lastPathname was correctly set by replaceState path', () => {});
    });
  });
});
```

## Implementation Plan

### Phase 1 (only phase)

1. Add `extractPathname()` helper (replaces duplicated `split('?')[0]?.split('#')[0]` pattern)
2. Add `lastPathname` tracking variable, initialized from the initial URL
3. Update `navigate()` to use `extractPathname()` and set `lastPathname` synchronously after pushState/replaceState
4. Update `onPopState` to detect search-param-only changes using `lastPathname`, update it synchronously
5. Skip prefetch, view transitions, and loaders for search-param-only popstate

**Acceptance criteria:**
- Popstate from `/?page=2` to `/?page=1` skips prefetch and loaders
- Popstate from `/tasks?q=foo` to `/tasks` (params removed) skips prefetch and loaders
- Popstate from `/tasks` to `/settings` runs full pipeline
- Popstate from `/tasks/1` to `/tasks/2` runs full pipeline (different resource)
- `replaceState` navigation correctly updates `lastPathname` for subsequent popstate
- Existing popstate tests still pass
- `lastPathname` is updated synchronously in callers, not in `applyNavigation`

## Review Sign-offs

| Reviewer | Verdict | Notes |
|----------|---------|-------|
| DX | Approved | Hash-only changes correctly handled; rapid back/forward safe via navigationGen |
| Product/Scope | Approved | Scope correct, Tier 1 appropriate, suggested params-removed test (added) |
| Technical | Changes Requested → Rev 2 | Moved lastPathname update to callers; added extractPathname helper; added replaceState test |
