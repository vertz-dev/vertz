---
'@vertz/cloudflare': patch
---

feat: traffic-aware pre-rendering (TPR) for Cloudflare Workers

Adds ISR (Incremental Static Regeneration) and TPR support:

- **ISR caching**: Cache SSR responses in Cloudflare KV with TTL-based revalidation and stale-while-revalidate via `ctx.waitUntil()`
- **TPR analytics**: Query Cloudflare GraphQL Analytics API to identify hot pages by traffic
- **Pre-rendering**: Render and store hot pages in KV at deploy time with concurrency control
- **Route classification**: Compiler-assisted classification of static vs dynamic routes for optimal pre-rendering

New `cache` config on `createHandler()`:
```ts
createHandler({
  cache: {
    kv: (env) => env.PAGE_CACHE,
    ttl: 3600,
    staleWhileRevalidate: true,
  },
});
```

New `@vertz/cloudflare/tpr` export for deploy-time pre-rendering.
