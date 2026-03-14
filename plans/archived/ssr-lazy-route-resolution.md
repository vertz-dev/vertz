# Plan: SSR Lazy Route Resolution — Sync-Await for Async Route Components

**Status:** Draft
**Priority:** P1
**Owner:** TBD

## Problem

Lazy route components (`() => import('./Page')`) don't produce content during SSR. The result is:

1. **No route-level code splitting** — all route components must be eagerly imported, bundling all route JS upfront regardless of which route the user visits.
2. **Wasted bytes** — the landing page loads ~30 KiB of unused JS (ManifestoPage) on the `/` route because it can't be lazy-loaded without breaking SSR.
3. **SEO regression risk** — converting content-heavy pages to lazy routes would produce empty HTML for crawlers.

### Root Cause

`RouterView` and `Outlet` handle `Promise`-returning components via `.then()`:

```ts
// router-view.ts:122-129 (current)
const result = rootFactory();
if (result instanceof Promise) {
  result.then((mod) => {
    // This runs AFTER SSR serialization is done
    const node = mod.default();
    container.appendChild(node);
  });
}
```

SSR rendering is synchronous — `ssrRenderToString()` calls the app factory, walks the DOM shim tree, and serializes to HTML. By the time the `.then()` callback fires, the HTML is already sent. The lazy route's container is empty in the SSR output.

### Why This Hasn't Been Solved Yet

The two-pass SSR pipeline (`ssrRenderToString`) already awaits async work between passes — it resolves `query()` data fetches during Pass 1 (Discovery) before rendering in Pass 2. But route component resolution happens *during* Pass 2 (Render), inside `RouterView`'s `domEffect`, where no async awaiting occurs.

The fix is straightforward: resolve lazy route components during Pass 1, alongside query discovery, so Pass 2 has synchronous access to all component factories.

## API Surface

### Zero consumer-facing API changes

Route definitions stay exactly the same:

```ts
import { defineRoutes } from '@vertz/ui';

const routes = defineRoutes({
  '/': { component: () => import('./HomePage') },
  '/manifesto': { component: () => import('./ManifestoPage') },
  '/docs/:slug': {
    component: () => import('./DocsLayout'),
    children: {
      '/': { component: () => import('./DocsIndex') },
      '/:section': { component: () => import('./DocsSection') },
    },
  },
});
```

The `component` field type is unchanged:

```ts
component: () => Node | Promise<{ default: () => Node }>
```

Lazy routes now SSR with full HTML output. The production bundler splits them into separate chunks via `Bun.build({ splitting: true })`. On the client, the router loads chunks on navigation as it does today.

### SSR behavior change (internal)

#### Modified `ssrRenderToString` control flow

The key insight: route matching and lazy component discovery happen *inside* `createApp()` during Pass 1. `RouterView`'s `domEffect` runs synchronously during SSR (the effect system executes `fn()` directly, no tracking). When `RouterView` encounters a lazy component, instead of calling `.then()`, it registers the Promise into the SSR context. Between Pass 1 and Pass 2, the SSR pipeline awaits all registered lazy component Promises — mirroring how query discovery already works.

```
Pass 1:  createApp()
         └─ RouterView.domEffect fires synchronously
            └─ buildInsideOutFactory() calls route.component()
               └─ If result is a Promise → registers into ctx.pendingRouteComponents
         └─ query() calls register into ctx.queries

Resolve: await all ctx.pendingRouteComponents → stores in ctx.resolvedComponents
Await:   Promise.allSettled(ctx.queries)

Pass 2:  createApp()
         └─ RouterView.domEffect fires synchronously
            └─ buildInsideOutFactory() checks ctx.resolvedComponents
               └─ Uses pre-resolved sync factory instead of calling route.component()
         └─ query() reads pre-fetched data from signals
```

This is the same self-registration pattern used by queries: the framework doesn't need access to route definitions externally — `RouterView` itself registers lazy components during Pass 1 execution, and the pipeline resolves them before Pass 2.

#### Lazy component registration during Pass 1

During Pass 1, `RouterView`/`buildInsideOutFactory` detects `isSSR()` and, when `route.component()` returns a Promise, registers it into the SSR context instead of calling `.then()`:

```ts
// During SSR Pass 1, in buildInsideOutFactory:
const result = route.component();
if (result instanceof Promise) {
  const ssrCtx = getSSRContext();
  if (ssrCtx) {
    // Register for resolution between Pass 1 and Pass 2
    ssrCtx.pendingRouteComponents.set(route, result);
  }
}
```

#### Resolution between passes

```ts
// In ssrRenderToString, after Pass 1:
const pending = ctx.pendingRouteComponents;
if (pending.size > 0) {
  const timeout = options?.routeResolveTimeout ?? 5000;
  await Promise.allSettled(
    [...pending.entries()].map(async ([route, promise]) => {
      const mod = await Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject('timeout'), timeout)),
      ]);
      ctx.resolvedComponents.set(route, (mod as { default: () => Node }).default);
    }),
  );
  if (pending.size > 0 && ctx.resolvedComponents.size === 0) {
    console.warn('[vertz] All lazy route components timed out during SSR');
  }
}
```

### Internal types

```ts
// Added to SSRRenderContext (packages/ui/src/ssr/ssr-render-context.ts)

/** Lazy component Promises registered by RouterView during Pass 1. */
pendingRouteComponents: Map<CompiledRoute, Promise<{ default: () => Node }>>;

/** Resolved sync factories, populated between Pass 1 and Pass 2. */
resolvedComponents: Map<CompiledRoute, () => Node>;
```

The map is keyed by `CompiledRoute` object identity (not `route.pattern` string) because pattern strings can collide across nesting levels (e.g., child `/` under `/docs` and child `/` under `/blog` both have pattern `'/'`). `CompiledRoute` objects are created once by `defineRoutes()` at module scope, so identity is stable across Pass 1 and Pass 2.

### RouterView SSR path change

During SSR Pass 2, `buildInsideOutFactory()` checks the SSR context for pre-resolved factories. The modification point is `buildInsideOutFactory`, not `Outlet` — since `Outlet` reads from the `childSignal` that `buildInsideOutFactory` populates.

```ts
// During SSR Pass 2, in buildInsideOutFactory (for every level in the chain):
function getComponentFactory(route: CompiledRoute): () => Node | Promise<{ default: () => Node }> {
  const ssrCtx = getSSRContext();
  const resolved = ssrCtx?.resolvedComponents?.get(route);
  if (resolved) return resolved; // Sync factory — no Promise
  return route.component; // Fallback: original (may be async on client)
}
```

### Client-side hydration strategy

When SSR renders a lazy route, the client receives full HTML. During hydration, the client's `RouterView` calls `route.component()` which returns a Promise. Without intervention, this causes a race: hydration ends before the Promise resolves, and the `.then()` callback appends duplicate content.

**Solution: Modulepreload + await before mount.**

The production build pipeline emits a route→chunk manifest alongside the HTML. The SSR handler injects `<link rel="modulepreload">` tags for the matched route's chunks, and the client entry awaits the matched route's import before calling `mount()`.

```html
<!-- SSR HTML output for /manifesto -->
<link rel="modulepreload" href="/assets/ManifestoPage-a1b2c3.js">
<script type="module">
  // Client entry: await the matched route's chunk before mounting
  await import('/assets/ManifestoPage-a1b2c3.js');
  // Now route.component() resolves synchronously (cached by ES module registry)
  const { mount } = await import('/assets/entry-client-x9y8z7.js');
  mount();
</script>
```

After the `await import(...)`, calling `route.component()` (which is `() => import('./ManifestoPage')`) returns immediately — ES module semantics cache the resolved module. `RouterView` sees a synchronous result, enters the `__append` path, and hydration claims existing SSR nodes normally via `isFirstHydrationRender`.

**Build-time requirements:**
- Production build emits a `route-manifest.json` mapping route patterns to chunk file paths
- SSR handler reads the manifest, matches the request URL, and injects `<link rel="modulepreload">` + `await import(...)` for the matched chunks
- The client entry script is generated (or wrapped) to await route chunks before `mount()`

## Manifesto Alignment

### Principles Applied

- **Production-Ready by Default** — Route-level code splitting should work with SSR out of the box. Developers shouldn't need to choose between SSR and code splitting.
- **One Way to Do Things** — `() => import('./Page')` is the single pattern for lazy routes. It works identically in CSR and SSR. No special SSR-only config, no `getServerSideProps`, no separate `dynamic()` wrapper.
- **If It Builds, It Works** — The same `component` type signature works for both sync and async. The framework handles the async→sync resolution transparently during SSR.
- **Performance Is Not Optional** — Eliminates ~30 KiB of unused JS on routes that don't need it. Route chunks load only when navigated to.
- **AI Agents Are First-Class Users** — An LLM writing `component: () => import('./Page')` gets SSR + code splitting automatically. No follow-up prompt needed for "how do I make this work with SSR?"

### Tradeoffs

- SSR Pass 1 takes slightly longer (resolving lazy imports adds <1ms for module resolution in Bun — these are in-memory module registry lookups, not network fetches). Acceptable.
- The SSR context grows by two Maps (`pendingRouteComponents` + `resolvedComponents`). Memory impact is negligible — one entry per matched route (typically 1-3 entries).
- The production build must emit a route→chunk manifest, adding a build step. Acceptable — this is a one-time build cost, and the manifest is small.

### Rejected Alternatives

- **`Suspense` boundaries around lazy routes** — Would require the streaming renderer to emit fallback HTML + replacement chunks. Adds complexity (hydration must swap nodes), worse SEO (crawlers see fallback content), and introduces a second rendering model. The sync resolution approach is simpler and produces complete HTML.
- **`dynamic()` wrapper (Next.js pattern)** — Introduces a second API for the same thing. Violates "One Way to Do Things." Forces LLMs to learn when to use `import()` vs `dynamic()`.
- **Pre-importing all route modules at server startup** — Would work but defeats the purpose of lazy loading in development. Also doesn't scale for apps with 100+ routes.
- **Async SSR rendering (awaiting inside Pass 2)** — Would require making the entire DOM shim tree construction async, breaking the synchronous `domEffect` contract. Too invasive.

## Non-Goals

- **Client-side Suspense for route transitions** — This plan does not add loading indicators during client-side navigation. The existing `.then()` pattern handles that. A future plan may add route transition UI.
- **Generic `AsyncComponent` primitive** — The universal rendering model plan proposes this. This plan solves the specific route-level problem without waiting for the broader primitive. When `AsyncComponent` ships, `resolveRouteComponents()` may be refactored to use it internally, but the route-level behavior and API surface are unaffected.
- **Streaming SSR for route content** — The `renderToStream` infrastructure supports Suspense boundaries, but route components should resolve completely before serialization. Streaming partial route content would complicate hydration.
- **Parallel route + query resolution** — Pass 1 currently resolves queries after app execution. Route resolution happens before app execution (we need the factories before the app renders). These are sequential by nature. A future optimization could overlap them for independent routes.
- **Dev server lazy loading** — In development, Bun loads all modules eagerly. This plan targets production bundles where `Bun.build({ splitting: true })` produces real chunks.

## Unknowns

### 1. Does `route.component()` return the same module when called twice?

During SSR, `RouterView` calls `route.component()` in Pass 1 and registers the Promise. In Pass 2, the pipeline uses the resolved factory from the SSR context. On the client, `route.component()` is called again — but because the client has already `await import()`-ed the chunk before `mount()`, the ES module cache returns the same module synchronously.

**Resolution:** No double-call needed. Pass 1 registers, resolution happens between passes, Pass 2 reads from context. Client pre-imports before mount. Verified by test.

### 2. Does Bun's server-side `import()` resolve synchronously for already-loaded modules?

In Node.js, `import()` of an already-loaded module resolves on the next microtick. In Bun, it may resolve synchronously. Either way, we `await` it between Pass 1 and Pass 2 where async is allowed.

**Resolution:** `await` between passes handles both cases. No special handling needed.

### 3. Nested routes — do we resolve the entire matched chain?

A URL like `/docs/getting-started/installation` may match 3 levels: layout + docs index + section. All three component factories need resolution.

**Resolution:** Yes. During Pass 1, `buildInsideOutFactory` iterates every level in the matched chain, so all lazy components are registered. The resolution step between passes awaits all of them.

### 4. Route manifest generation — how does the production build map routes to chunks?

The production build uses `Bun.build({ splitting: true })`. Each dynamic `import()` in the source code produces a separate chunk with a content-hashed filename. The build pipeline needs to map route patterns to chunk filenames.

**Resolution:** Needs POC. After `Bun.build()`, inspect `result.outputs` to correlate chunk files with their original import paths. Build a `route-manifest.json` from this. If `Bun.build` doesn't expose source→chunk mappings, a fallback is to parse the entry chunk's import statements to extract chunk URLs.

## Type Flow Map

No new generic type parameters introduced. The changes are purely runtime behavior:

- `CompiledRoute.component` type unchanged: `() => Node | Promise<{ default: () => Node }>`
- `ResolvedRouteComponent.factory` is `() => Node` (the unwrapped sync factory)
- `SSRRenderContext.resolvedComponents` is `Map<string, () => Node>`

No type flow tracing needed — the generic route types (`TypedRoutes<T>`, `Router<T>`) are unaffected.

## Timeout and Diagnostics

**Default route resolution timeout:** 5000ms. Server-side `import()` of bundled modules should resolve in <1ms (module registry lookup). The generous default exists only as a safety net for edge cases (modules with heavy top-level side effects, cold starts).

**Diagnostic logging:** When any route component resolution exceeds 100ms, emit a warning:

```
[vertz] Slow route component resolution: /manifesto (152ms) — check for heavy top-level side effects
```

When all lazy route components time out, emit:

```
[vertz] All lazy route components timed out during SSR — pages will render client-side only
```

**Graceful degradation:** Timed-out components are not stored in `resolvedComponents`. Pass 2's `RouterView` falls back to the original `route.component` (async), producing an empty container in SSR HTML. The client resolves the import and renders content. This matches the current behavior for lazy routes — no regression, just no improvement for that specific slow route.

## E2E Acceptance Test

```ts
describe('Feature: SSR lazy route resolution', () => {
  describe('Given routes with lazy components', () => {
    const routes = defineRoutes({
      '/': { component: () => import('./HomePage') },
      '/about': { component: () => import('./AboutPage') },
    });

    describe('When SSR renders the /about URL', () => {
      it('Then the HTML contains the AboutPage content', async () => {
        const { html } = await ssrRenderToString(appModule, '/about');
        expect(html).toContain('About Us');
        // Not an empty container — the lazy component was resolved
        expect(html).not.toMatch(/<div><\/div>/);
      });
    });

    describe('When SSR renders the / URL', () => {
      it('Then the HTML contains only HomePage content (AboutPage not loaded)', async () => {
        const { html } = await ssrRenderToString(appModule, '/');
        expect(html).toContain('Welcome');
        expect(html).not.toContain('About Us');
      });
    });
  });

  describe('Given a route with nested lazy layouts', () => {
    const routes = defineRoutes({
      '/docs': {
        component: () => import('./DocsLayout'),
        children: {
          '/': { component: () => import('./DocsIndex') },
          '/:slug': { component: () => import('./DocsDetail') },
        },
      },
    });

    describe('When SSR renders /docs/getting-started', () => {
      it('Then the HTML contains both layout and page content', async () => {
        const { html } = await ssrRenderToString(appModule, '/docs/getting-started');
        expect(html).toContain('DocsLayout');
        expect(html).toContain('Getting Started');
      });
    });
  });

  describe('Given a lazy route component that times out', () => {
    describe('When SSR renders the route', () => {
      it('Then SSR falls back to empty container (client hydration will resolve)', async () => {
        // Lazy component takes 5 seconds, SSR timeout is 300ms
        const { html } = await ssrRenderToString(appModule, '/slow-page', {
          ssrTimeout: 300,
        });
        // SSR produces the container but no content — client will resolve
        expect(html).toBeDefined();
      });
    });
  });

  describe('Given production build with splitting enabled', () => {
    describe('When building the app', () => {
      it('Then lazy route components produce separate chunks', async () => {
        const result = await Bun.build({
          entrypoints: ['src/entry-client.ts'],
          splitting: true,
          outdir: 'dist',
        });
        // Multiple output files — not a single monolithic bundle
        expect(result.outputs.length).toBeGreaterThan(1);
      });
    });

    describe('When the client navigates to a lazy route', () => {
      it('Then the chunk is loaded on demand (not in initial bundle)', () => {
        // The route chunk is fetched only on navigation
        // Initial page load does not include /about chunk
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: Self-registration and resolution of lazy components in SSR pipeline

Add lazy component self-registration during Pass 1 and resolution between passes.

**Changes:**
- `packages/ui/src/ssr/ssr-render-context.ts` — Add `pendingRouteComponents` and `resolvedComponents` fields to `SSRRenderContext`
- `packages/ui/src/router/router-view.ts` — In `buildInsideOutFactory()`, during SSR Pass 1, register lazy component Promises into `ctx.pendingRouteComponents` instead of calling `.then()`
- `packages/ui-server/src/ssr-render.ts` — After Pass 1 `createApp()`, await all `ctx.pendingRouteComponents` and populate `ctx.resolvedComponents` before Pass 2

**Acceptance Criteria:**

```ts
describe('Phase 1: Resolve lazy components during SSR Pass 1', () => {
  describe('Given a matched route chain with lazy components', () => {
    describe('When resolveRouteComponents() is called', () => {
      it('Then all Promise-returning components are resolved to sync factories', async () => {
        const resolved = await resolveRouteComponents(matched);
        for (const entry of resolved) {
          const result = entry.factory();
          expect(result).toBeInstanceOf(Node); // Not a Promise
        }
      });
    });
  });

  describe('Given a matched chain with mixed sync and async components', () => {
    describe('When resolveRouteComponents() is called', () => {
      it('Then sync components pass through unchanged', async () => {
        const resolved = await resolveRouteComponents(matched);
        expect(resolved.length).toBe(matched.length);
      });
    });
  });

  describe('Given a lazy component that exceeds the timeout', () => {
    describe('When resolveRouteComponents() is called with timeout', () => {
      it('Then the timed-out component is skipped (not stored in resolved map)', async () => {
        const resolved = await resolveRouteComponents(matched, { timeout: 10 });
        // Timed-out entries are excluded
        expect(resolved.length).toBeLessThan(matched.length);
      });
    });
  });

  describe('Given resolvedComponents stored in SSRRenderContext', () => {
    describe('When SSR Pass 2 renders', () => {
      it('Then the resolved factories are available via getSSRContext()', () => {
        const ctx = getSSRContext();
        expect(ctx?.resolvedComponents).toBeInstanceOf(Map);
      });
    });
  });
});
```

### Phase 2: RouterView uses pre-resolved components during SSR Pass 2

Modify `buildInsideOutFactory()` to check the SSR context for pre-resolved factories during Pass 2.

**Changes:**
- `packages/ui/src/router/router-view.ts` — In `buildInsideOutFactory()`, for every level in the matched chain, check `getSSRContext()?.resolvedComponents.get(route)` before using `route.component`. This is the single modification point — `Outlet` doesn't need changes because it reads from the `childSignal` that `buildInsideOutFactory` populates.

**Note:** The `getComponentFactory(route)` helper introduced in Phase 1 (for Pass 1 registration) is extended here to also check `resolvedComponents` during Pass 2. The same function handles both passes: Pass 1 registers, Pass 2 reads.

**Acceptance Criteria:**

```ts
describe('Phase 2: RouterView uses pre-resolved components during SSR', () => {
  describe('Given a lazy route with a pre-resolved component in SSR context', () => {
    describe('When RouterView renders during SSR Pass 2', () => {
      it('Then the route content appears in the SSR HTML output', async () => {
        const { html } = await ssrRenderToString(lazyApp, '/lazy-page');
        expect(html).toContain('Lazy Page Content');
      });
    });
  });

  describe('Given nested lazy routes (layout + page)', () => {
    describe('When RouterView renders during SSR', () => {
      it('Then both layout and page content appear in the HTML', async () => {
        const { html } = await ssrRenderToString(nestedApp, '/docs/intro');
        expect(html).toContain('Docs Layout');
        expect(html).toContain('Introduction');
      });
    });
  });

  describe('Given a sync route component', () => {
    describe('When RouterView renders during SSR', () => {
      it('Then the existing sync path works unchanged', async () => {
        const { html } = await ssrRenderToString(syncApp, '/');
        expect(html).toContain('Home Page');
      });
    });
  });

  describe('Given a client-side navigation to a lazy route', () => {
    describe('When RouterView renders in the browser', () => {
      it('Then the existing .then() async path works unchanged', async () => {
        // Existing IT-6-5 behavior preserved
        const router = createRouter(routes, '/');
        await router.navigate({ to: '/lazy' });
        expect(router.current.value?.route.pattern).toBe('/lazy');
      });
    });
  });
});
```

### Phase 3: Client hydration, route manifest, and nav prefetch

Handle the client-side hydration mismatch and wire lazy resolution into nav prefetch.

**Changes:**
- `packages/cli/src/production-build/ui-build-pipeline.ts` — After `Bun.build()`, generate `route-manifest.json` mapping route patterns to chunk filenames by correlating `result.outputs` with import paths
- `packages/ui-server/src/ssr-handler.ts` — Read `route-manifest.json`, inject `<link rel="modulepreload">` and route chunk `await import(...)` before the main entry script for SSR'd lazy routes
- `packages/ui-server/src/ssr-render.ts` — Wire lazy component resolution into `ssrStreamNavQueries()` and `ssrDiscoverQueries()` so nav prefetch discovers queries inside lazy route components
- Integration tests (unit-level, no browser needed):
  - SSR HTML contains lazy route content (mock app with lazy routes + `ssrRenderToString`)
  - `route-manifest.json` is generated correctly
  - `<link rel="modulepreload">` is injected for the correct chunks
  - Nav prefetch discovers queries inside lazy route components

**Acceptance Criteria:**

```ts
describe('Phase 3: Client hydration and route manifest', () => {
  describe('Given a production build with lazy routes', () => {
    describe('When the build completes', () => {
      it('Then route-manifest.json maps route patterns to chunk filenames', () => {
        const manifest = JSON.parse(readFileSync('dist/route-manifest.json', 'utf-8'));
        expect(manifest['/manifesto']).toMatch(/ManifestoPage-[a-f0-9]+\.js/);
      });
    });
  });

  describe('Given SSR renders a lazy route', () => {
    describe('When the HTML is generated', () => {
      it('Then it includes <link rel="modulepreload"> for the route chunk', () => {
        expect(html).toContain('<link rel="modulepreload"');
        expect(html).toContain('ManifestoPage-');
      });

      it('Then the entry script awaits the route chunk before mounting', () => {
        expect(html).toMatch(/await import.*ManifestoPage/);
      });
    });
  });

  describe('Given nav prefetch for a lazy route', () => {
    describe('When ssrDiscoverQueries runs for /manifesto', () => {
      it('Then queries inside ManifestoPage are discovered', async () => {
        const result = await ssrDiscoverQueries(appModule, '/manifesto');
        expect(result.resolved).toContainEqual(
          expect.objectContaining({ key: expect.stringContaining('manifesto') }),
        );
      });
    });
  });

  describe('Given a client loading SSR HTML for a lazy route', () => {
    describe('When hydration runs after chunk preload', () => {
      it('Then route.component() resolves synchronously from module cache', () => {
        // After await import('./ManifestoPage'), the module is cached
        // route.component() returns the cached module, not a new Promise
      });

      it('Then RouterView enters the sync path and claims SSR nodes', () => {
        // No duplicate content, no flash
      });
    });
  });
});
```

### Phase 4: Landing page conversion, E2E verification, and measurement

Convert the landing page's ManifestoPage to a lazy import, run E2E tests (browser-based), and measure bundle size reduction.

**Changes:**
- `sites/landing/src/app.tsx` — Change `import { ManifestoPage } from './pages/manifesto'` to `component: () => import('./pages/manifesto')`
- Measure **current** baseline bundle size before conversion (the 70.6 KiB number from `reduce-unused-client-js.md` predates PR #1153)
- Build, measure after, calculate delta
- E2E browser tests (Playwright) for hydration and client-side navigation

**Acceptance Criteria:**

```ts
describe('Phase 4: Landing page lazy route conversion', () => {
  describe('Given ManifestoPage converted to lazy import', () => {
    describe('When building the landing page', () => {
      it('Then the entry bundle is smaller by at least the ManifestoPage chunk size', () => {
        // Step 1: Measure current baseline (before conversion)
        // Step 2: Convert to lazy import
        // Step 3: Measure after — entry bundle should shrink by >= ManifestoPage size
        // ManifestoPage chunk exists as a separate file in dist/
      });
    });

    describe('When visiting / (home page)', () => {
      it('Then Lighthouse unused JS metric improves', () => {
        // Measure current unused JS baseline first
        // After conversion, unused JS should decrease by ManifestoPage size
      });

      it('Then SSR still renders the home page correctly', () => {});

      it('Then ManifestoPage JS is NOT loaded (network tab)', () => {
        // Playwright: verify no request for ManifestoPage chunk on /
      });
    });

    describe('When visiting /manifesto directly (SSR)', () => {
      it('Then SSR renders full manifesto content (SEO: no regression)', () => {
        // Playwright: verify initial HTML contains manifesto headings
      });

      it('Then hydration completes without content flash', () => {
        // Playwright: verify no layout shift, no empty container
      });
    });

    describe('When navigating from / to /manifesto client-side', () => {
      it('Then the ManifestoPage chunk is fetched on navigation', () => {
        // Playwright: verify network request for the chunk
      });

      it('Then the manifesto content renders after chunk loads', () => {
        // Playwright: verify manifesto headings visible after navigation
      });
    });
  });
});
```

## Review Sign-offs

### DX Review
- **Verdict:** APPROVED WITH CHANGES (Rev 1) → APPROVED (Rev 2)
- **Blocking (resolved):** Sequencing of `resolveRouteComponents()` vs `createApp()` was ambiguous → Rev 2 adds explicit control flow diagram showing Pass 1 self-registration pattern
- **Non-blocking (addressed):**
  - Map key collision risk → switched to `CompiledRoute` object identity
  - Timeout behavior should be documented → added Timeout and Diagnostics section
  - `buildInsideOutFactory` needs per-level SSR resolution → clarified as the single modification point
  - Hydration mental model should be documented → added Client-side hydration strategy section

### Product/Scope Review
- **Verdict:** APPROVED WITH CHANGES (Rev 1) → APPROVED (Rev 2)
- **Non-blocking (addressed):**
  - AsyncComponent non-goal boundary → added forward-looking note about refactoring relationship
  - Phase 4 needs current baseline and concrete reduction target → updated to measure current baseline before conversion
  - Default timeout should be specified → added 5000ms default with diagnostic logging at >100ms
  - Phase 3 scope clarification → split browser testing into Phase 4 (Playwright), Phase 3 uses unit-level tests

### Technical Review
- **Verdict:** APPROVED WITH CHANGES (Rev 1) → APPROVED (Rev 2)
- **Blocking (resolved):**
  - Route matching timing gap → redesigned to self-registration pattern (RouterView registers during Pass 1, pipeline resolves between passes)
  - Hydration mismatch → added modulepreload + await-before-mount strategy with route-manifest.json
  - Map key collision → switched to `CompiledRoute` object identity
- **Non-blocking (addressed):**
  - Modification point is `buildInsideOutFactory`, not Outlet → clarified
  - `ssrDiscoverQueries`/`ssrStreamNavQueries` need resolution → added to Phase 3
  - Timeout under-specified → added Timeout and Diagnostics section with 5000ms default
