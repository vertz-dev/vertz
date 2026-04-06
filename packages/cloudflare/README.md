# @vertz/cloudflare

Cloudflare Workers adapter for Vertz — deploy full-stack Vertz apps to the edge with SSR, caching, image optimization, and traffic-aware pre-rendering.

## Features

- **Zero-boilerplate SSR** — Pass your app module and get server-side rendering on Workers
- **ISR caching** — Incremental Static Regeneration via Cloudflare KV with stale-while-revalidate
- **Edge image optimization** — Resize and compress images at the edge with SSRF protection
- **Traffic-aware pre-rendering** — Analyze Cloudflare Analytics to pre-render your hottest pages
- **Security headers** — Automatic CSP nonce injection and security headers
- **Lazy initialization** — App factory receives env bindings, called once on first request

## Installation

```bash
vtz add @vertz/cloudflare
```

## Quick Start

```typescript
import { createHandler } from '@vertz/cloudflare';

const app = createApp({
  /* ... */
});

export default createHandler(app, { apiPrefix: '/api' });
```

## Full-Stack with SSR and Caching

```typescript
import { createHandler } from '@vertz/cloudflare';
import { imageOptimizer } from '@vertz/cloudflare/image';

export default createHandler({
  app: (env) =>
    createServer({
      entities: schema,
      db: createDb({ d1: env.DB }),
    }),
  apiPrefix: '/api',
  ssr: {
    module: appModule,
    clientScript: '/assets/entry-client.js',
    title: 'My App',
  },
  cache: {
    kv: (env) => env.CACHE_KV,
    ttl: 3600,
    staleWhileRevalidate: true,
  },
  securityHeaders: true,
  imageOptimizer: imageOptimizer({
    allowedDomains: ['images.example.com'],
  }),
});
```

## Image Optimization

Optimize images at the edge via `/_vertz/image`:

```typescript
import { imageOptimizer } from '@vertz/cloudflare/image';

const optimizer = imageOptimizer({
  allowedDomains: ['cdn.example.com'],
  maxWidth: 3840,
  defaultQuality: 80,
  cacheTtl: 31536000, // 1 year
});
```

Query params: `url`, `w` (width), `h` (height), `q` (quality), `fit` (cover/contain/scale-down).

## Traffic-Aware Pre-Rendering

Pre-render your most visited pages based on real traffic data:

```typescript
import { analyzeTraffic, preRenderPages } from '@vertz/cloudflare/tpr';

// Find hot pages from Cloudflare Analytics
const hotPaths = await analyzeTraffic({
  zoneId: env.ZONE_ID,
  apiToken: env.CF_TOKEN,
  lookback: '24h',
  threshold: 0.8, // Cover 80% of traffic
  maxPages: 100,
});

// Pre-render and cache them in KV
await preRenderPages({
  paths: hotPaths,
  kvNamespace: env.CACHE_KV,
  renderFn: (path) => renderPageToHtml(path),
  concurrency: 10,
});
```

## ISR Cache Utilities

Fine-grained control over the cache layer:

```typescript
import { lookupCache, storeCache, normalizeCacheKey } from '@vertz/cloudflare';

const cached = await lookupCache(env.CACHE_KV, '/products', 3600);

if (cached.status === 'HIT') {
  return new Response(cached.html, { headers: { 'Content-Type': 'text/html' } });
}

// Render and store
const html = await renderPage('/products');
await storeCache(env.CACHE_KV, '/products', html, 3600);
```

## Entry Points

| Import                    | Purpose                                |
| ------------------------- | -------------------------------------- |
| `@vertz/cloudflare`       | Main handler, ISR cache, HTML template |
| `@vertz/cloudflare/image` | Edge image optimization                |
| `@vertz/cloudflare/tpr`   | Traffic-aware pre-rendering            |

## License

MIT
