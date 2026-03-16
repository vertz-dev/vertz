# Traffic-Aware Pre-Rendering (TPR) for Cloudflare Workers

## Overview

Instead of pre-rendering every page at build time (like `generateStaticParams()`), TPR queries Cloudflare zone analytics at deploy time and only pre-renders pages that actually receive traffic. Combined with ISR (Incremental Static Regeneration) for on-demand caching, this gives optimal performance with minimal deploy-time work.

## API Surface

### Phase 1: ISR — KV-backed SSR caching

```ts
// worker.ts
import { createHandler } from '@vertz/cloudflare';

interface Env {
  DB: D1Database;
  PAGE_CACHE: KVNamespace;
}

export default createHandler({
  app: (env) => createServer({ entities, db: createDb({ d1: env.DB }) }),
  basePath: '/api',
  ssr: { module: app, title: 'My App' },
  cache: {
    kv: (env) => env.PAGE_CACHE,
    ttl: 3600,             // Seconds before revalidation (default: 3600)
    staleWhileRevalidate: true,  // Serve stale while refreshing (default: true)
  },
});
```

**How it works:**
1. Request arrives → check KV for cached HTML
2. **Cache HIT + fresh** → serve from KV (no SSR)
3. **Cache HIT + stale** → serve stale HTML, revalidate in background via `ctx.waitUntil()`
4. **Cache MISS** → SSR on demand, store result in KV
5. Cache key: `tpr:<path>` (normalized, no query string for page routes)

### Phase 2: TPR — Analytics-driven deploy-time pre-rendering

```ts
// worker.ts — same handler, add tpr config
export default createHandler({
  app: (env) => createServer({ entities, db: createDb({ d1: env.DB }) }),
  basePath: '/api',
  ssr: { module: app, title: 'My App' },
  cache: {
    kv: (env) => env.PAGE_CACHE,
    ttl: 3600,
  },
  tpr: {
    enabled: true,
    threshold: 0.9,        // Pre-render pages covering 90% of traffic
    lookback: '24h',       // Traffic window to analyze
    maxPages: 500,         // Safety cap
  },
});
```

**Deploy-time CLI:**
```bash
vertz deploy --target cloudflare
# or standalone:
vertz tpr --zone-id <id> --api-token <token>
```

**Standalone TPR module** (for use in CI/deploy scripts):
```ts
import { analyzeTraffic, preRenderPages } from '@vertz/cloudflare/tpr';

// 1. Fetch analytics
const hotPaths = await analyzeTraffic({
  zoneId: 'abc123',
  apiToken: process.env.CF_API_TOKEN!,
  lookback: '24h',
  threshold: 0.9,
  maxPages: 500,
});
// Returns: ['/products/widget-a', '/products/gadget-b', '/about', ...]

// 2. Pre-render and store in KV
await preRenderPages({
  paths: hotPaths,
  ssrModule: app,
  kvNamespace: env.PAGE_CACHE,
  template: htmlTemplate,
});
```

### Phase 3: Compiler-assisted TPR

No new API — this is an optimization within the existing TPR pipeline. The compiler already tracks which routes are fully static (no signals, no data fetching). At deploy time:

1. **Fully static routes** → always pre-render (regardless of traffic data)
2. **Dynamic routes with traffic** → pre-render via TPR
3. **Dynamic routes without traffic** → on-demand SSR + ISR

Detection uses the existing `prerender` flag on route definitions + `generateParams`.

## Manifesto Alignment

- **If it builds, it works** — TPR configuration is type-safe. The `cache.kv` function is typed to the Worker `Env`, so TypeScript catches misconfigured KV bindings.
- **One way to do things** — ISR + TPR is THE caching strategy for Cloudflare. No competing patterns (no manual cache headers, no separate static generation).
- **AI agents are first-class** — Zero config default (ISR works with just `cache: { kv: (env) => env.CACHE }`). LLMs don't need to learn cache invalidation strategies.
- **Performance is not optional** — Hot pages served from KV in <1ms. Cold pages SSR'd once, then cached. Analytics-driven pre-rendering means deploy-time work is proportional to actual traffic.
- **No ceilings** — Custom `threshold`, `lookback`, `maxPages` for teams that need control.

## Non-Goals

- **Purge API integration** — We don't build a cache purge mechanism. Deploy-versioned keys (like the landing site) or KV TTL handle invalidation.
- **Per-route TTL** — All cached pages share the same TTL. Per-route caching is a future enhancement.
- **R2 or Cache API storage** — Phase 1 uses KV only. Cache API is ephemeral (per-colo), R2 is overkill. KV is the right balance of global, persistent, and fast.
- **Automatic deploy integration** — TPR is a standalone step. We provide the `analyzeTraffic()` + `preRenderPages()` functions; wiring them into CI is the user's responsibility (or they use `vertz tpr` CLI).
- **Real-time analytics streaming** — We query analytics at deploy time, not continuously.

## Unknowns

1. **Cloudflare Zone Analytics API availability** — The API endpoint `GET /zones/{zone_id}/analytics/dashboard` is deprecated. Need to verify the GraphQL Analytics API (`/graphql`) is the right replacement and what permissions are required. **Resolution: needs POC.**

2. **KV write latency for pre-rendering** — Writing 500 HTML pages to KV at deploy time. KV writes are ~500ms per key. 500 pages = ~4 minutes sequential. Need to parallelize (KV supports concurrent writes). **Resolution: parallelize with limit.**

3. **SSR in deploy context** — Pre-rendering requires running SSR outside a Worker (e.g., in a Node.js/Bun deploy script). The SSR module needs access to the app's data layer, which may need the Worker env (D1, etc.). **Resolution: TPR pre-rendering runs inside a Cloudflare Worker (via `ctx.waitUntil()` on first deploy request, or via a separate Worker triggered by deploy hook). For Phase 1, ISR doesn't need deploy-time pre-rendering.**

## Type Flow Map

```
CloudflareHandlerConfig.cache.kv: (env: Env) => KVNamespace
  → createFullStackHandler() stores kvFactory
    → fetch() calls kvFactory(env) to get KVNamespace
      → lookupCache(kv, path) → string | null
      → storeCache(kv, path, html, ttl) → void

TPRConfig.threshold: number (0-1)
  → analyzeTraffic() uses threshold to filter paths
    → returns string[] (hot paths)
      → preRenderPages() iterates paths
        → ssrRenderToString() per path → html string
          → kv.put(key, html) per path
```

## E2E Acceptance Test

### Phase 1: ISR

```ts
describe('Feature: ISR with KV caching', () => {
  describe('Given a Cloudflare handler with cache config', () => {
    describe('When a page is requested for the first time', () => {
      it('Then SSR renders the page and stores it in KV', () => {
        // SSR handler called, KV.put called with rendered HTML
      });
      it('Then the response includes X-Vertz-Cache: MISS header', () => {});
    });

    describe('When the same page is requested again within TTL', () => {
      it('Then serves from KV without calling SSR', () => {
        // SSR handler NOT called, KV.get returns cached HTML
      });
      it('Then the response includes X-Vertz-Cache: HIT header', () => {});
    });

    describe('When a cached page is requested after TTL expires', () => {
      it('Then serves stale HTML immediately', () => {});
      it('Then revalidates in background via waitUntil', () => {
        // ctx.waitUntil called with SSR + KV.put
      });
      it('Then the response includes X-Vertz-Cache: STALE header', () => {});
    });
  });
});
```

### Phase 2: TPR

```ts
describe('Feature: Traffic-aware pre-rendering', () => {
  describe('Given Cloudflare zone analytics with traffic data', () => {
    describe('When analyzeTraffic is called with threshold 0.9', () => {
      it('Then returns paths covering 90% of total requests', () => {});
      it('Then respects maxPages cap', () => {});
      it('Then excludes non-page paths (assets, API)', () => {});
    });
  });

  describe('Given a list of hot paths from analyzeTraffic', () => {
    describe('When preRenderPages is called', () => {
      it('Then SSR renders each path and stores in KV', () => {});
      it('Then parallelizes KV writes (max 10 concurrent)', () => {});
      it('Then reports progress (paths rendered, duration)', () => {});
    });
  });
});
```

### Invalid usage (type-level):

```ts
// @ts-expect-error — cache.kv must be a function returning KVNamespace
cache: { kv: 'not-a-function' }

// @ts-expect-error — ttl must be a number
cache: { kv: (env) => env.CACHE, ttl: '3600' }

// @ts-expect-error — threshold must be 0-1 range (runtime check)
tpr: { threshold: 90 }
```

## Implementation Plan

### Phase 1: ISR (KV-backed SSR caching)

**Scope:** `@vertz/cloudflare` package only

1. Add `CacheConfig` type to handler config
2. Add KV lookup/store logic to the full-stack handler's SSR path
3. Add `X-Vertz-Cache` response header (MISS/HIT/STALE)
4. Add stale-while-revalidate via `ctx.waitUntil()`
5. Cache key normalization (strip query params, trailing slashes)

**Acceptance criteria:**
- Cache MISS → SSR + KV store + serve
- Cache HIT (fresh) → serve from KV, no SSR
- Cache HIT (stale) → serve stale + background revalidate
- `X-Vertz-Cache` header on all cached responses
- API routes are never cached (only SSR routes)
- Cache key normalization handles `/path` and `/path/` identically

### Phase 2: TPR (Analytics + deploy-time pre-rendering)

**Scope:** New `@vertz/cloudflare/tpr` export

1. `analyzeTraffic()` — Cloudflare GraphQL Analytics API client
2. `preRenderPages()` — SSR + KV store with concurrency control
3. Path filtering (exclude assets, API routes, non-page paths)
4. Progress reporting callback

**Acceptance criteria:**
- `analyzeTraffic()` returns paths sorted by traffic, capped by threshold + maxPages
- `preRenderPages()` renders and stores with parallelism limit
- Non-page paths (starting with `/api`, `/assets`, `/_`) are filtered out
- Lookback periods: '1h', '6h', '12h', '24h', '48h', '7d'

### Phase 3: Compiler-assisted TPR

**Scope:** Integration between `@vertz/cloudflare/tpr` and route metadata

1. `classifyRoutes()` — reads compiled routes and classifies as static/dynamic
2. Static routes always pre-rendered (no analytics needed)
3. Dynamic routes filtered through analytics data
4. Combined list passed to `preRenderPages()`

**Acceptance criteria:**
- Routes with `prerender: true` and no `:params` are classified as static
- Static routes are always included in pre-render set
- Dynamic routes require traffic data to be included
- `generateParams` routes are expanded before pre-rendering
