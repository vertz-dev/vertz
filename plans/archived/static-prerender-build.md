# Plan: Static Pre-rendering in `vertz build`

**Status:** Draft (Rev 2 — post-review)
**Priority:** P1
**Owner:** TBD

## Problem

Building a production-ready Vertz site requires a 290-line custom build script. The landing site (`sites/landing/scripts/build.ts`) manually orchestrates: Bun.build, CSS extraction, dev server spawning, SSR fetching, dev script stripping, HTML injection, and output writing. None of this is reusable.

`vertz build` already handles the **dynamic SSR** path well — it produces `dist/client/` (HTML shell + assets) and `dist/server/` (SSR module), and `vertz start` serves pages with runtime SSR. But there's no **static export** path — pre-rendering routes to standalone HTML files deployable to any CDN without a runtime server.

This violates multiple manifesto principles:

- **"One command. Full stack. Running."** — but only if you write hundreds of lines of build glue
- **"Convention over configuration"** — but users must hand-wire the entire production pipeline
- **"AI agents are first-class users"** — an LLM can't reliably produce the landing site's build script from scratch

### The gap

| What exists | What's missing |
|---|---|
| `vertz build` → HTML shell + SSR module | Pre-rendering routes to complete static HTML |
| `ssrRenderToString(module, url)` | Route discovery (which URLs to pre-render) |
| `buildUI()` client + server bundling | Wiring SSR render into the build pipeline |
| `createSSRHandler` for runtime SSR | Injecting SSR output into template at build time |
| Landing site build script (manual) | Framework-level equivalent (automatic) |

## API Surface

### For static sites (landing pages, docs)

Zero config. `vertz build` detects static routes and pre-renders them.

```bash
vertz build
```

Output:

```
dist/client/
├── _shell.html             # SSR template (used by vertz start for dynamic routes)
├── index.html              # pre-rendered /
├── manifesto/
│   └── index.html          # pre-rendered /manifesto
├── pricing/
│   └── index.html          # pre-rendered /pricing
├── assets/
│   ├── entry-client-[hash].js
│   ├── chunk-[hash].js     # lazy route chunks
│   └── vertz.css
└── public/
    └── ...
```

Deploy anywhere: `wrangler deploy`, `vercel deploy`, `netlify deploy`, or any static host.

### For SaaS apps (dynamic + static routes)

Pre-rendering is an optimization. SaaS apps always require `vertz start` for runtime SSR of authenticated/dynamic routes. Pre-rendered pages are served from disk to avoid redundant SSR computation for pages that don't change per-request.

```ts
// src/app.tsx — no config needed, the framework figures it out
const routes = defineRoutes({
  '/':           { component: () => import('./pages/home') },        // static ✓
  '/pricing':    { component: () => import('./pages/pricing') },     // static ✓
  '/login':      { component: () => import('./pages/login') },       // static ✓
  '/dashboard':  { component: () => import('./pages/dashboard') },   // static ✓
  '/users/:id':  { component: () => import('./pages/user-detail') }, // dynamic — needs server
  '/posts/*':    { component: () => import('./pages/post') },        // dynamic — needs server
});
```

```bash
vertz build
# Pre-renders: /, /pricing, /login, /dashboard
# Skips: /users/:id, /posts/* (dynamic segments)

vertz start
# Serves pre-rendered HTML for /, /pricing, /login, /dashboard (from disk)
# Runtime SSR for /users/:id, /posts/* (on-the-fly)
# Nav pre-fetch (X-Vertz-Nav: 1) still goes through query discovery for all routes
```

### Route discovery — zero config

Routes are discovered automatically. The build:

1. Imports the built SSR module (`dist/server/app.js`)
2. Runs Pass 1 of SSR render for `/` — this executes `createRouter(defineRoutes({...}))`, which registers the route patterns
3. Extracts all route patterns from the router (recursive walk of nested children)
4. Filters to pre-renderable routes (no `:param`, no `*`, no `prerender: false`)
5. SSR-renders each route and writes the complete HTML

No config file. No route manifest. No `getStaticPaths()`. The framework reads the routes the developer already defined.

### Opt-out for specific routes

For cases where a static route shouldn't be pre-rendered (e.g., it requires auth at render time, or its loader needs a runtime API):

```ts
const routes = defineRoutes({
  '/':          { component: () => import('./pages/home') },
  '/dashboard': { component: () => import('./pages/dashboard'), prerender: false },
});
```

The `prerender` property is added to `RouteConfig`, `RouteConfigLike`, and carried through to `CompiledRoute`.

### Loader behavior during pre-rendering

Route loaders **run during pre-rendering** — they are part of SSR. This means:

- A route with a loader that calls `fetch('/api/pricing')` will execute that fetch at build time
- If the API isn't available at build time, the loader throws and **the build fails** with a clear error:
  ```
  ✗ Pre-render failed for /pricing
    Loader error: fetch failed (ECONNREFUSED localhost:3000)
    Hint: If this route requires runtime data, add `prerender: false` to its route config.
  ```
- Developers opt out with `prerender: false` for routes whose loaders need runtime APIs

This aligns with "if it builds, it works" — a successful build guarantees all pre-rendered pages are complete.

## How it works internally

### Current `buildUI` pipeline (steps 1-5 unchanged)

1. **Client build** → `Bun.build()` with Vertz plugin → `dist/client/assets/`
2. **CSS extraction** → component `css()` calls → `dist/client/assets/vertz.css`
3. **HTML shell** → programmatic template → `dist/client/_shell.html`
4. **Public assets** → copy `public/` → `dist/client/`
5. **Server build** → SSR module → `dist/server/app.js`

Note: Step 3 writes to `_shell.html` (not `index.html`) to avoid conflict with the pre-rendered root route.

### New step 6: Static pre-rendering

6. **Import SSR module** → `import('dist/server/app.js')`
7. **Discover routes** → render `/`, intercept `createRouter()`, extract patterns via recursive walk
8. **Filter pre-renderable** → exclude `:param` and `*` patterns, respect `prerender: false`
9. **Render each route** → `ssrRenderToString(module, routePath)` for each (sequentially — see "Sequential rendering" below)
10. **Inject into template** → use shared `injectIntoTemplate()` utility, passing empty string for CSS (template already has `<link>` to `vertz.css`)
11. **Write per-route HTML** → `dist/client/index.html` for `/`, `dist/client/about/index.html` for `/about`, etc.

The pre-rendering reuses `ssrRenderToString` directly — no dev server spawning, no HTTP fetching, no dev script stripping. The SSR module is already built for Bun; we just import and call it.

### Shell vs pre-rendered `index.html`

- The HTML shell (SSR template) is written to `dist/client/_shell.html`
- The pre-rendered root (`/`) is written to `dist/client/index.html`
- `vertz start` loads `_shell.html` as the SSR template for dynamic routes
- For a fully static site (no dynamic routes), `_shell.html` is unused but harmless
- Pre-rendered `/` overwrites the previous `index.html` location — the pre-rendered version is strictly better (has content AND the client JS bundle)

### CSS handling

The client build (step 2) extracts all component CSS into `vertz.css`. The HTML template already contains `<link rel="stylesheet" href="/assets/vertz.css">`.

During pre-rendering, `ssrRenderToString()` also returns CSS from `collectCSS()`. To avoid duplication (inline `<style>` tags on top of the linked file), the pre-render pipeline passes an **empty string** for the CSS parameter when calling `injectIntoTemplate()`:

```ts
injectIntoTemplate(template, appHtml, /* css: */ '', ssrData, nonce, headTags)
```

This ensures pre-rendered pages reference the CSS file via `<link>` (cacheable by the browser) rather than duplicating CSS inline.

### `vertz start` serving pre-rendered HTML

The `fetch` handler in `start.ts` gains a new early check before the SSR fallback:

```ts
async fetch(req) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Nav pre-fetch still goes through SSR query discovery (even for pre-rendered routes)
  if (req.headers.get('x-vertz-nav') === '1') {
    return ssrHandler(req);
  }

  // Serve static assets (JS, CSS, images)
  const staticResponse = serveStaticFile(clientDir, pathname);
  if (staticResponse) return staticResponse;

  // Check for pre-rendered HTML: /about → dist/client/about/index.html
  const prerenderResponse = servePrerenderHTML(clientDir, pathname);
  if (prerenderResponse) return prerenderResponse;

  // Fallback: runtime SSR (dynamic routes, or routes with prerender: false)
  return ssrHandler(req);
}
```

`servePrerenderHTML` checks for `dist/client/<pathname>/index.html` (or `dist/client/index.html` for `/`). It serves with `Cache-Control: public, max-age=0, must-revalidate` (pre-rendered HTML should be fresh on each deploy, unlike hashed assets which are immutable).

### Sequential rendering

Routes are rendered sequentially, not in parallel. This is a deliberate constraint:

The DOM shim (`installDomShim()`) sets process-global `document` and `window`. Concurrent SSR renders would interleave DOM operations on the shared `document.head` (e.g., `<style>` injection). While `ssrStorage` (AsyncLocalStorage) isolates the SSR *context* per-render, the DOM globals are not isolated.

For a typical site with 5-20 static routes at ~200-500ms per render, this adds 1-10 seconds to build time — acceptable. Parallel rendering is a future optimization that requires per-render DOM isolation.

## Route discovery mechanism

### Approach: SSR context interception (zero-config)

`createRouter()` already reads the SSR context for URL matching. We extend it to *write* the route patterns back:

```ts
// In createRouter(), when SSR context exists:
const ssrCtx = getSSRContext();
if (ssrCtx) {
  // Register all route patterns for discovery (recursive walk of nested children)
  ssrCtx.discoveredRoutes = collectRoutePatterns(routes);
}

/** Recursively collect all route patterns, concatenating parent + child paths. */
function collectRoutePatterns(routes: CompiledRoute[], prefix = ''): string[] {
  const patterns: string[] = [];
  for (const route of routes) {
    const fullPattern = joinPatterns(prefix, route.pattern);
    patterns.push(fullPattern);
    if (route.children) {
      patterns.push(...collectRoutePatterns(route.children, fullPattern));
    }
  }
  return patterns;
}

/** Join parent and child route patterns, handling trailing/leading slashes. */
function joinPatterns(parent: string, child: string): string {
  if (!parent || parent === '/') return child;
  if (child === '/') return parent;
  return `${parent.replace(/\/$/, '')}/${child.replace(/^\//, '')}`;
}
```

The build pipeline:
1. Creates an SSR context with `url: '/'`
2. Calls `ssrRenderToString(module, '/')` — which runs the app
3. Reads `ctx.discoveredRoutes` after render
4. Has the complete route pattern list (flat, with full paths)

This is zero-config, works with any router definition, handles nested routes, and requires minimal changes to `createRouter()`.

### Filtering pre-renderable routes

```ts
function filterPrerenderableRoutes(
  patterns: string[],
  compiledRoutes: CompiledRoute[],
): string[] {
  return patterns.filter(pattern => {
    // Skip dynamic segments
    if (pattern.includes(':') || pattern.includes('*')) return false;
    // Skip routes with prerender: false
    const route = findCompiledRoute(compiledRoutes, pattern);
    if (route?.prerender === false) return false;
    return true;
  });
}
```

### Rejected alternatives

- **Static analysis of route definitions** — parse `defineRoutes({...})` at build time. Brittle — breaks with computed keys, dynamic imports, spread operators. Not recommended.
- **Explicit route manifest export** — require the app to export a route list. Adds boilerplate. Not the default path.

## Manifesto Alignment

| Principle | How this design aligns |
|---|---|
| **One way to do things** | `vertz build` handles both static and dynamic. No separate `export` command. No manual build scripts. |
| **Convention over configuration** | Static routes pre-rendered by default. No config file needed. |
| **AI agents are first-class** | An LLM can produce a deployable site with `defineRoutes()` + `vertz build`. No build script knowledge needed. |
| **If it builds, it works** | Pre-render failure = build failure. A successful build guarantees all pre-rendered pages are complete and correct. |
| **Production-ready by default** | Pre-rendering is the default, not an opt-in. Static routes get the performance benefit automatically. |
| **Performance is not optional** | Pre-rendered HTML = zero server compute, instant TTFB from CDN edge. |

## Non-Goals

- **Full static site generator (SSG) with content pipeline** — this is route pre-rendering, not a content framework. No markdown processing, no content collections, no build-time data fetching from CMS APIs.
- **Incremental Static Regeneration (ISR)** — on-demand re-rendering at the edge. Future work.
- **Dynamic route pre-rendering** (`/users/:id`) — requires knowing the parameter space (like Next.js `getStaticPaths`). Deferred. `vertz start` handles these with runtime SSR.
- **Per-route head/meta customization in the build** — SEO meta tags are a component-level concern (e.g., a `<Head>` component), not a build concern.
- **Adapter-specific output optimization** — the `dist/client/` structure works as-is for static hosts (Cloudflare Workers Sites, Vercel static, Netlify). Per-platform optimizations (edge functions, serverless) are a separate concern.
- **Additional static paths config** (`additionalPaths` in `vertz.config.ts`) — pre-rendering CMS-driven paths not in the router requires a `getStaticPaths`-like mechanism. Deferred to the dynamic route pre-rendering design.
- **Parallel route rendering** — requires per-render DOM isolation (the current DOM shim uses process globals). Future optimization.

## Unknowns

### 1. SSR module import in build context

**Question:** Can we `import()` the built SSR module (`dist/server/app.js`) from within the `vertz build` process?

**Resolution approach:** POC — the module is built with `target: 'bun'` and externals `['@vertz/ui', '@vertz/ui-server', '@vertz/ui-primitives']`. The build process runs under Bun, so externals resolve from `node_modules`.

**Risk:** Low. `vertz start` already does exactly this — `startUIOnly` imports `dist/server/app.js` and passes it to `createSSRHandler`. The pre-render pipeline does the same thing at build time.

### 2. Hydration mismatch for pre-rendered pages

**Question:** Pre-rendered HTML is produced at build time. The client hydrates at request time. Components that render differently based on `Date.now()`, `Math.random()`, or request-time data will produce hydration mismatches.

**Resolution:** This is a known constraint shared by all SSG frameworks (Next.js, Astro, etc.). The existing Vertz hydration system is tolerant (cursor-based DOM walking, skips mismatches). The pre-render pipeline doesn't introduce new mismatch risks — it produces the same HTML as runtime SSR would. Routes with request-time dependencies should use `prerender: false`.

## Type Flow Map

No new generics introduced. The pre-render pipeline operates on `SSRModule` (existing type from `@vertz/ui-server`) and `CompiledRoute` (existing type from `@vertz/ui`). The only type change is adding `prerender?: boolean` to `RouteConfig`/`RouteConfigLike`/`CompiledRoute` — a simple optional boolean, no generic flow needed.

## E2E Acceptance Test

### Test 1: Static site (landing page pattern)

```ts
describe('Feature: vertz build pre-renders static routes', () => {
  describe('Given a UI app with two static routes (/ and /about)', () => {
    describe('When running vertz build', () => {
      it('Then dist/client/index.html contains SSR content for /', () => {
        // HTML contains the homepage component's rendered output
        // Not just an empty <div id="app"></div> shell
      });
      it('Then dist/client/about/index.html contains SSR content for /about', () => {
        // HTML contains the about page's rendered output
      });
      it('Then dist/client/_shell.html exists as the SSR template', () => {
        // Contains empty <div id="app"></div> for runtime SSR
      });
      it('Then both pre-rendered files include the client JS bundle script tag', () => {
        // <script type="module" src="/assets/entry-client-[hash].js">
      });
      it('Then both pre-rendered files reference CSS via <link>, not inline <style>', () => {
        // <link rel="stylesheet" href="/assets/vertz.css">
        // No duplicate <style data-vertz-css> tags
      });
    });
  });

  describe('Given a UI app with a dynamic route (/users/:id)', () => {
    describe('When running vertz build', () => {
      it('Then /users/:id is NOT pre-rendered (no dist/client/users/ directory)', () => {});
      it('Then dist/client/_shell.html exists for runtime SSR fallback', () => {});
    });
  });

  describe('Given a UI app with prerender: false on a static route', () => {
    describe('When running vertz build', () => {
      it('Then the route is NOT pre-rendered', () => {});
    });
  });

  describe('Given a route whose loader throws during pre-rendering', () => {
    describe('When running vertz build', () => {
      it('Then the build fails with a clear error message', () => {
        // "✗ Pre-render failed for /pricing"
        // "Hint: add prerender: false to its route config"
      });
    });
  });
});
```

### Test 2: Hybrid app — vertz start serves both pre-rendered and dynamic

```ts
describe('Feature: vertz start serves pre-rendered and dynamic pages', () => {
  describe('Given a built app with pre-rendered / and /about, and dynamic /users/:id', () => {
    describe('When GET /about is requested', () => {
      it('Then responds with the pre-rendered HTML from disk', () => {
        // Response content matches dist/client/about/index.html
        // No ssrRenderToString call — served as static file
      });
    });
    describe('When GET /users/123 is requested (dynamic route)', () => {
      it('Then responds with runtime SSR output', () => {
        // Falls back to ssrRenderToString using _shell.html as template
      });
    });
    describe('When GET /about with X-Vertz-Nav: 1 header is requested', () => {
      it('Then responds with SSE query data (not the pre-rendered HTML)', () => {
        // Nav pre-fetch bypasses static serving for query discovery
      });
    });
  });
});
```

### Test 3: Route discovery

```ts
describe('Feature: Route discovery from SSR module', () => {
  describe('Given routes: / (static), /about (static), /users/:id (dynamic)', () => {
    describe('When the build discovers routes', () => {
      it('Then discovers ["/", "/about", "/users/:id"]', () => {});
      it('Then filters to pre-renderable: ["/", "/about"]', () => {});
      it('Then excludes dynamic: ["/users/:id"]', () => {});
    });
  });

  describe('Given nested routes: /docs with children / and /:slug', () => {
    describe('When the build discovers routes', () => {
      it('Then discovers ["/docs", "/docs/:slug"]', () => {});
      it('Then pre-renders /docs but not /docs/:slug', () => {});
    });
  });
});
```

## Implementation Plan

### Phase 1: Route Discovery + `prerender` Type

**Goal:** `createRouter()` registers route patterns with the SSR context. The `prerender` opt-out property is available on route configs.

**Changes:**
- `packages/ui/src/router/define-routes.ts` — add `prerender?: boolean` to `RouteConfig`, `RouteConfigLike`, and `CompiledRoute`. Propagate in `defineRoutes()`.
- `packages/ui/src/ssr/ssr-render-context.ts` — add `discoveredRoutes?: string[]` to `SSRRenderContext`
- `packages/ui/src/router/navigate.ts` — in `createRouter()`, when SSR context exists, call `collectRoutePatterns()` (recursive walk) and write to `ssrCtx.discoveredRoutes`
- `packages/ui-server/src/ssr-render.ts` — include `discoveredRoutes` in `SSRRenderResult`

**Acceptance criteria:**
```ts
describe('Given an SSR render of an app with defineRoutes', () => {
  describe('When ssrRenderToString is called', () => {
    it('Then the render result includes discoveredRoutes with all patterns', () => {});
    it('Then nested children patterns are included as full paths (e.g., /docs/:slug)', () => {});
    it('Then dynamic patterns (:param, *) are included (filtering is the caller\'s job)', () => {});
  });
});

describe('Given a route with prerender: false', () => {
  it('Then CompiledRoute.prerender is false', () => {});
  it('Then TypeScript accepts prerender: false in defineRoutes()', () => {});
});
```

### Phase 2: Pre-render Pipeline + CLI Integration

**Goal:** `vertz build` automatically pre-renders static routes after the UI build.

**Changes:**
- `packages/ui-server/src/template-inject.ts` — extract `injectIntoTemplate()` from `ssr-handler.ts` into a shared utility. Export from `@vertz/ui-server/ssr` barrel.
- `packages/ui-server/src/ssr-handler.ts` — import `injectIntoTemplate` from the new shared location (no behavior change)
- `packages/ui-server/src/prerender.ts` — new module, exported from `@vertz/ui-server/ssr`:
  - `discoverRoutes(module)` — render `/`, extract `discoveredRoutes`
  - `filterPrerenderableRoutes(patterns, routes)` — exclude `:param`, `*`, and `prerender: false`
  - `prerenderRoutes(module, template, options)` — render each route sequentially, inject into template (with empty CSS string to avoid duplication), return per-route HTML
- `packages/cli/src/production-build/ui-build-pipeline.ts`:
  - Step 3: write shell to `dist/client/_shell.html` (instead of `index.html`)
  - New step 6: import SSR module from `dist/server/app.js`, call `prerenderRoutes()`, write HTML files to `dist/client/`
  - Build failure if any route's SSR render throws (with hint about `prerender: false`)
  - Build summary lists pre-rendered routes
- `packages/cli/src/commands/start.ts`:
  - New `servePrerenderHTML(clientDir, pathname)` function: checks `dist/client/<pathname>/index.html`
  - Load SSR template from `_shell.html` (not `index.html`)
  - `X-Vertz-Nav` requests bypass pre-rendered HTML (go through SSR handler for query discovery)
  - Pre-rendered HTML served with `Cache-Control: public, max-age=0, must-revalidate`

**Acceptance criteria:**
```ts
describe('Given a Vertz UI app with static and dynamic routes', () => {
  describe('When running vertz build', () => {
    it('Then pre-rendered HTML files are written to dist/client/', () => {});
    it('Then dist/client/_shell.html exists as the SSR template', () => {});
    it('Then the build summary lists pre-rendered routes', () => {});
    it('Then pre-rendered HTML references CSS via <link>, not inline', () => {});
    it('Then a route whose loader throws fails the build with a hint', () => {});
  });
  describe('When running vertz start after build', () => {
    it('Then pre-rendered routes are served from static HTML', () => {});
    it('Then dynamic routes fall back to runtime SSR using _shell.html', () => {});
    it('Then X-Vertz-Nav requests go through SSR handler (not static)', () => {});
  });
});
```

### Phase 3: Dogfood — Migrate Landing Site

**Goal:** Replace `sites/landing/scripts/build.ts` with `vertz build`.

**Changes:**
- `sites/landing/package.json` — change `"build"` script to `vertz build`
- `sites/landing/scripts/build.ts` — delete (or keep for OG image generation only)
- `sites/landing/wrangler.toml` — update `directory` to `./dist/client`
- Verify the landing site builds and deploys correctly

**Acceptance criteria:**
- `vertz build` in `sites/landing/` produces the same output as the custom build script
- `vertz.dev` and `vertz.dev/manifesto` serve correct pre-rendered HTML
- No custom build script needed (except OG image generation, which is site-specific)

### Future work (not in scope)

- **Dynamic route pre-rendering** — `getStaticPaths()` equivalent for `:param` routes. This also subsumes the `additionalPaths` config concept.
- **Per-route metadata** — `<Head>` component for title/meta tags per page
- **Build hooks** — pre-build/post-build hooks for custom steps (OG images, sitemaps, etc.)
- **Adapter output** — Cloudflare/Vercel/Netlify-specific output optimization
- **Incremental builds** — only re-render changed routes
- **Parallel route rendering** — requires per-render DOM isolation (current DOM shim uses process globals)
- **Build dry-run** — `vertz build --dry-run` to list discovered routes without rendering
