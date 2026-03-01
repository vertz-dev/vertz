# Cloudflare Workers + D1 Deployment Guide

How to deploy a vertz full-stack app (SSR + API) to Cloudflare Workers with D1.

## Architecture

The deployed Worker handles two concerns:

- **`/api/*`** — JSON API (entity CRUD routes, backed by D1 database)
- **`/*`** — SSR HTML render (server-side rendering via `@vertz/ui-server`)

Cloudflare's `[assets]` directive serves static files (JS, CSS) from `dist/client/` before the Worker runs. The Worker only handles dynamic requests.

## Prerequisites

- `wrangler` CLI installed (`bun add -D wrangler`)
- Cloudflare account with Workers and D1 access

## Project Setup

### 1. Dependencies

Your `package.json` must include all packages that the server build references:

```json
{
  "dependencies": {
    "@vertz/cloudflare": "workspace:*",
    "@vertz/db": "workspace:*",
    "@vertz/server": "workspace:*",
    "@vertz/ui": "workspace:*",
    "@vertz/ui-primitives": "workspace:*",
    "@vertz/ui-server": "workspace:*",
    "@vertz/theme-shadcn": "workspace:*"
  }
}
```

`@vertz/ui-primitives` is required because the server build externalizes UI packages. Wrangler's esbuild re-resolves them when bundling the Worker — if a package is missing, the build fails.

### 2. Worker Entry (`src/worker.ts`)

```typescript
import { createHandler } from '@vertz/cloudflare';
import { createDb } from '@vertz/db';
import { createServer, type ServerConfig } from '@vertz/server';
import * as app from '../dist/server/app';  // ← pre-built server module
import { todos } from './entities';
import { todosModel } from './schema';

interface Env {
  DB: D1Database;
}

export default createHandler({
  app: (env) => {
    const typedEnv = env as Env;
    const db = createDb({
      models: { todos: todosModel },
      dialect: 'sqlite',
      d1: typedEnv.DB as any,
    });

    return createServer({
      basePath: '/api',
      entities: [todos],
      db: db as any as ServerConfig['db'],
    });
  },
  basePath: '/api',
  ssr: {
    module: app,
    clientScript: '/assets/entry-client.js',
    title: 'Entity Todo — vertz full-stack demo',
  },
  securityHeaders: true,
});
```

**Critical: import the pre-built server module, not the source.**

```typescript
// WRONG — wrangler's esbuild doesn't apply vertz compiler transforms
import * as app from './app';

// RIGHT — pre-built module has vertz transforms (__element, __append, __attr)
import * as app from '../dist/server/app';
```

The vertz compiler transforms JSX into internal function calls (`__element()`, `__append()`, `__attr()`). The SSR DOM shim intercepts these calls to produce HTML instead of DOM nodes. Without the transforms, the app module is just raw JSX that wrangler can't process.

### 3. Wrangler Configuration (`wrangler.toml`)

```toml
name = "entity-todo"
compatibility_date = "2025-12-01"
compatibility_flags = ["nodejs_compat"]
main = "src/worker.ts"

[[d1_databases]]
binding = "DB"
database_name = "entity-todo-db"
database_id = "<your-database-id>"

[assets]
directory = "dist/client"

[observability]
enabled = true
```

**`nodejs_compat`** is required because `@vertz/ui-server` uses `node:async_hooks` for SSR context tracking. Note: `@vertz/db`'s main entry is platform-agnostic and does NOT require this flag — it's purely for the SSR pipeline.

### 4. `[assets]` and SSR — removing `index.html`

The `[assets]` directive tells Cloudflare to serve static files from `dist/client/` **before** the Worker runs. This is great for JS/CSS assets, but creates a problem:

The vertz UI build generates `dist/client/index.html` as a client-only SPA fallback. If this file exists, Cloudflare serves it for `/` requests, completely bypassing the Worker's SSR handler. The user sees a loading spinner instead of server-rendered content.

**Fix:** Remove `index.html` from `dist/client/` after build, before deploy:

```bash
rm -f dist/client/index.html
```

### 5. Entry Client Script Naming

The vertz build produces a hashed client entry file (e.g., `entry-client-xh011edw.js`), but the SSR handler references `/assets/entry-client.js` (unhashed). Copy the hashed file to the expected name:

```bash
cp dist/client/assets/entry-client-*.js dist/client/assets/entry-client.js
```

## Deploy Script

The full deploy pipeline in `package.json`:

```json
{
  "scripts": {
    "deploy": "bun run build && cp dist/client/assets/entry-client-*.js dist/client/assets/entry-client.js && rm -f dist/client/index.html && wrangler deploy"
  }
}
```

Steps:
1. `bun run build` — Full-stack build (API codegen + UI client/server bundles)
2. `cp entry-client-*.js entry-client.js` — Unhash the client entry filename
3. `rm -f dist/client/index.html` — Remove SPA fallback so SSR handles `/`
4. `wrangler deploy` — Upload to Cloudflare Workers

## D1 Database Setup

### First-time setup

```bash
# Create the database
wrangler d1 create entity-todo-db

# Update wrangler.toml with the returned database_id

# Run migrations
wrangler d1 execute entity-todo-db --remote --file=migrations/0000_initial.sql
```

### Local development with D1

```bash
# Run migrations locally
wrangler d1 execute entity-todo-db --local --file=migrations/0000_initial.sql

# Start local dev server
wrangler dev
```

## SSR: How It Works

The SSR flow in a Cloudflare Worker:

1. Request hits `/` → Worker's `createHandler` matches the SSR route
2. `@vertz/ui-server/ssr` is dynamically imported
3. `installDomShim()` replaces `globalThis.document` with an SSR adapter
4. `globalThis.fetch` is patched to intercept local API calls (e.g. `/api/todos`) and route them through `app.handler()` directly — Workers can't fetch from themselves
5. The pre-built app module runs — its `__element()`, `__append()`, `__attr()` calls hit the DOM shim
6. **Pass 1 (Discovery):** The app creates `query()` calls which register SSR promises via `__VERTZ_SSR_REGISTER_QUERY__`
7. The SSR pipeline awaits all registered query promises (with configurable timeout, default 5s for Cloudflare)
8. **Pass 2 (Render):** The app runs again with pre-fetched data in cache, producing HTML with actual content
9. `collectCSS()` gathers all injected CSS from the bundled `@vertz/ui` instance
10. The HTML, CSS, and serialized SSR data are injected into the template
11. Client-side hydration picks up from the server-rendered HTML using `window.__VERTZ_SSR_DATA__`

### SSR Fetch Interception

Workers cannot fetch from themselves (infinite loop). The `@vertz/cloudflare` handler patches `globalThis.fetch` during SSR to intercept requests matching the API `basePath`. These requests are routed directly through the in-memory `app.handler()`, bypassing the network entirely.

The `@vertz/fetch` FetchClient uses a lazy fetch getter (not eagerly bound at construction time) so that SSR fetch patches take effect even for clients created at module load time.

### SSR Query Timeout

The default SSR query timeout in `@vertz/cloudflare` is 5000ms (5 seconds). This accounts for D1 cold starts which can exceed the 300ms default. Configure via `ssrTimeout` in the SSR module config:

```typescript
export default createHandler({
  // ...
  ssr: {
    module: app,
    ssrTimeout: 3000, // 3 seconds
  },
});
```

## `@vertz/db` and Tree-Shaking

The root `@vertz/db` export is dialect-agnostic — it doesn't pull in postgres, sqlite, or D1 drivers. Use sub-path imports for specific dialects:

```typescript
// Dialect-agnostic (safe for Workers — no CJS, no createRequire)
import { createDb } from '@vertz/db';

// Dialect-specific (import only what you need)
import { createD1Adapter } from '@vertz/db/d1';
import { createSqliteDriver } from '@vertz/db/sqlite';
import { createPostgresDriver } from '@vertz/db/postgres';
```

This matters for Cloudflare Workers because the postgres driver depends on the `postgres` npm package (CJS), which triggers `createRequire(import.meta.url)` — a call that fails in Workers where `import.meta.url` is undefined. By keeping the root export dialect-agnostic, Workers deployments avoid pulling in CJS infrastructure.

## Troubleshooting

### "Could not resolve @vertz/ui-primitives"

Add `@vertz/ui-primitives` to your `dependencies`. The server build externalizes UI packages; wrangler needs to resolve them.

### SSR returns empty `<div id="app"></div>`

Two common causes:

1. **Wrong import path** — Worker imports source (`./app`) instead of pre-built (`../dist/server/app`). Wrangler's esbuild doesn't apply vertz compiler transforms.

2. **`index.html` in static assets** — `dist/client/index.html` exists, so Cloudflare serves it for `/` before the Worker runs. Remove it before deploying.

### "createRequire is not a function" or "import.meta.url is undefined"

A CJS dependency is being bundled. Check that you import `@vertz/db` from the root (dialect-agnostic) and dialect-specific drivers from sub-paths. The root export has no `require()` calls.

### Missing component CSS (layout shift / FOUC)

Two separate root causes can cause this:

**1. Tree-shaking drops CSS infrastructure.** `"sideEffects": false` in `@vertz/ui/package.json` causes wrangler's esbuild to drop bare imports to shared chunks. These chunks contain the `injectedCSS` Set and CSS runtime infrastructure.

**Fix:** `@vertz/ui` declares shared chunks as side-effectful:

```json
{
  "sideEffects": ["dist/shared/*.js"]
}
```

**2. CSS cleared between requests.** Wrangler's esbuild may deduplicate `@vertz/ui` into a single module instance (instead of the two separate instances Vite SSR creates). When this happens, `resetInjectedStyles()` from `@vertz/ui-server` clears the SAME `injectedCSS` Set that the app's `getInjectedCSS()` reads. Module-level `css()` calls only run once at import time, so after the first request clears the Set, subsequent requests have no component CSS.

**Fix:** `@vertz/ui-server` does NOT call `resetInjectedStyles()` in the SSR render pipeline. The `injectedCSS` Set naturally deduplicates (it's a Set), so CSS from previous renders doesn't leak.

### SSR data not loading (shows "Loading..." instead of content)

Two common causes:

1. **Relative URL failure in Workers.** `FetchClient` constructs requests using `new Request('/api/todos')`. In Cloudflare Workers, `new Request()` with relative URLs throws. The `@vertz/fetch` FetchClient handles this by using a placeholder origin for the Request constructor and passing the relative URL string directly to `fetch()`.

2. **SSR query timeout too short.** D1 cold starts can exceed the default timeout. Check Worker logs (`wrangler tail`) for `[SSR] query timed out` messages. Increase `ssrTimeout` in the SSR config.

3. **FetchClient eagerly binding fetch.** If `FetchClient` captures `globalThis.fetch` at construction time (in the constructor), SSR fetch patches applied later have no effect. The fix: `FetchClient` uses a getter that reads `globalThis.fetch` at call time when no custom fetch was provided.
