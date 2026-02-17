# @vertz/cloudflare Adapter Design

## Overview

Thin Cloudflare Workers adapter for vertz SSR. ~50 lines. Ships as `@vertz/cloudflare`.

## API

```typescript
import { createHandler } from '@vertz/cloudflare'
import { app } from './app'

export default createHandler(app)
// or with options:
export default createHandler(app, { /* options */ })
```

`createHandler(app, options?)` returns a Cloudflare Workers fetch handler (`{ fetch: (request, env, ctx) => Response }`).

## How It Works

1. Receives Cloudflare `Request` from worker fetch event
2. Maps to vertz server request format
3. Routes through the vertz app (server router)
4. For SSR routes: calls `renderToStream()` from `@vertz/ui-server`, pipes the `ReadableStream` into `new Response(stream)`
5. For API routes: returns JSON responses as normal
6. For static assets: serves from worker assets or passes through

## Options (second argument)

- `staticAssets?: boolean` — enable static asset serving (default true)
- `basePath?: string` — base URL path prefix
- Future: caching, KV bindings, etc.

## Package Structure

```
packages/cloudflare/
  src/
    index.ts        — exports createHandler
    handler.ts      — fetch handler implementation
    request.ts      — Cloudflare Request → vertz request mapping
    response.ts     — vertz response → Cloudflare Response mapping
  package.json
  tsconfig.json
```

## Dependencies

- `@vertz/server` (router, request handling)
- `@vertz/ui-server` (renderToStream for SSR)
- `@cloudflare/workers-types` (dev dependency)

## Key Constraints

- Adapter must be <50 lines of actual logic (excluding types)
- No Node.js APIs — Workers runtime only
- Stream-first: use ReadableStream, not string concatenation
- Must work with `wrangler dev` for local development

## Phases

1. Phase 1: API routes only (wire request/response, no SSR)
2. Phase 2: SSR with renderToStream
3. Phase 3: Static assets, caching, preview links on PRs

## Non-Goals

- KV/D1/R2 integration (future)
- Edge-side rendering with partial hydration (future)
