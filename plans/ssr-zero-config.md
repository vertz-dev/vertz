# Plan: Zero-Config SSR — 10/10 DX

**Status:** Draft  
**Priority:** Launch-blocking (LW1)  
**Owner:** TBD  

## Problem

SSR in vertz today requires developers to:

1. Write a custom `entry-server.ts` (~100 lines) with DOM shim installation, VNode conversion, manual router wiring, URL matching
2. Write a custom `server.ts` that creates Vite in middleware mode
3. Write a separate JSX runtime for the server (`jsx-runtime-server.ts`)
4. Wire package.json exports to conditionally resolve the right JSX runtime
5. Know to run `bun src/server.ts` instead of `vite dev` — running the wrong one silently serves an empty SPA shell with zero indication that SSR isn't working

This is **unacceptable DX**. Compare:

| Framework | SSR setup |
|-----------|-----------|
| Next.js | Zero config. `next dev` just works. |
| Nuxt | Zero config. `nuxt dev` just works. |
| SvelteKit | Zero config. `vite dev` just works. |
| Remix | Minimal config. `remix dev` just works. |
| **vertz** | ~200 lines of boilerplate across 3+ files, easy to run the wrong server |

## Goal

```ts
// vite.config.ts — this is ALL a developer should need
import vertz from '@vertz/ui-compiler';

export default defineConfig({
  plugins: [vertz({ ssr: true })],
});
```

Then `vite dev` serves SSR'd HTML. View source shows the full rendered page. No entry-server, no DOM shim, no separate server command.

## Design

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  vite dev                                           │
│  ┌───────────────────────────────────────────────┐  │
│  │  vertzPlugin({ ssr: true })                   │  │
│  │                                               │  │
│  │  1. Intercepts HTML requests                  │  │
│  │  2. Finds the app root component              │  │
│  │  3. Installs DOM shim (internal)              │  │
│  │  4. Calls component → SSRElement tree         │  │
│  │  5. Converts to VNode → HTML string           │  │
│  │  6. Injects into HTML template                │  │
│  │  7. Adds hydration script + Vite HMR client   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Phase 1: Framework-owned SSR (the MVP)

**Move all SSR plumbing into the framework. Zero app-level boilerplate.**

#### 1.1 — SSR mode in vertzPlugin

Extend `@vertz/ui-compiler`'s Vite plugin to accept `ssr: true | SSROptions`:

```ts
export interface SSROptions {
  /**
   * Path to the root component. Auto-detected from index.html if omitted.
   * @default auto-detect from <script type="module" src="..."> in index.html
   */
  entry?: string;

  /**
   * Streaming SSR vs buffered.
   * @default 'buffered'
   */
  mode?: 'buffered' | 'streaming';

  /**
   * Port override for the dev server (uses Vite's default if unset).
   */
  port?: number;
}
```

When `ssr: true`, the plugin:

1. **Hooks into `configureServer`** — adds middleware *before* Vite's SPA fallback
2. **Intercepts HTML requests** (non-asset, non-HMR, `Accept: text/html`)
3. **SSR-loads the app entry** via `vite.ssrLoadModule()`
4. **Renders to HTML** using the framework's internal SSR pipeline
5. **Injects into the HTML template** (reads `index.html`, replaces `<!--ssr-outlet-->` or `<div id="app">` content)
6. **Transforms HTML** via `vite.transformIndexHtml()` (adds HMR client)

```ts
// Inside the plugin
configureServer(server) {
  if (!ssrEnabled) return;

  server.middlewares.use(async (req, res, next) => {
    const url = req.url || '/';

    // Skip non-HTML requests
    if (!isHtmlRequest(req)) return next();
    // Skip Vite internals
    if (url.startsWith('/@') || url.startsWith('/node_modules')) return next();

    try {
      // 1. Read the HTML template
      let template = fs.readFileSync(resolve('index.html'), 'utf-8');
      template = await server.transformIndexHtml(url, template);

      // 2. SSR-load the app entry
      const entry = await server.ssrLoadModule(resolvedEntry);

      // 3. Render
      const appHtml = await entry.renderToString(url);

      // 4. Inject
      const html = template.replace(
        /(<div id="app">)(<\/div>)/,
        `$1${appHtml}$2`
      );

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      server.ssrFixStacktrace(err as Error);
      next(err);
    }
  });
}
```

#### 1.2 — Auto-generated entry-server

The framework generates the SSR entry internally. The developer never sees it.

When `ssr: true`, the plugin:
1. Reads `index.html` to find the client entry (`<script type="module" src="/src/index.ts">`)
2. Resolves the app's root component from the client entry
3. Generates a virtual SSR entry module (via Vite's virtual module system) that:
   - Installs the DOM shim
   - Imports the root component
   - Exports `renderToString(url: string): Promise<string>`

```ts
// Virtual module: \0vertz:ssr-entry
import { installDomShim, toVNode } from '@vertz/ui-server/internal/dom-shim';
import { renderToStream, streamToString } from '@vertz/ui-server';

export async function renderToString(url) {
  globalThis.__SSR_URL__ = url;
  installDomShim();

  // Dynamic import to get fresh module state per request
  const { default: createApp } = await import(/* user's entry */);
  const app = createApp();
  const vnode = toVNode(app);
  const stream = renderToStream(vnode);
  return streamToString(stream);
}
```

#### 1.3 — DOM shim moves into `@vertz/ui-server`

The DOM shim currently lives in the task-manager example. It belongs in the framework:

```
packages/ui-server/src/
  dom-shim/
    index.ts          # installDomShim(), removeDomShim(), toVNode()
    ssr-element.ts    # SSRElement class
    ssr-text-node.ts  # SSRTextNode class
    ssr-fragment.ts   # SSRDocumentFragment class
```

Exported from `@vertz/ui-server/dom-shim` (internal subpath, not in the public API docs but available for advanced users).

#### 1.4 — JSX runtime resolution

The Vite plugin handles JSX runtime swapping automatically during SSR:

```ts
// In the plugin's config hook
config(userConfig, { ssrBuild }) {
  if (ssrEnabled || ssrBuild) {
    return {
      resolve: {
        alias: {
          // Swap client JSX runtime for server VNode runtime during SSR
          '@vertz/ui/jsx-runtime': '@vertz/ui-server/jsx-runtime',
          '@vertz/ui/jsx-dev-runtime': '@vertz/ui-server/jsx-runtime',
        },
      },
    };
  }
}
```

This means `@vertz/ui` needs to export a `./jsx-runtime` subpath (client-side, DOM-based), and `@vertz/ui-server` exports a `./jsx-runtime` subpath (server-side, VNode-based).

#### 1.5 — Router SSR integration

The router needs to accept an initial URL from the SSR context without relying on `window.location`:

```ts
// @vertz/ui/router — already mostly works, but needs:
// 1. Auto-detect SSR context and use __SSR_URL__
// 2. Skip popstate listener setup in SSR
// 3. Ensure route match is synchronous (no lazy loading during SSR — 
//    components must be eagerly available, or we await them)
```

**Key decision: lazy routes in SSR.** Two options:
- **Option A**: All routes are eagerly loaded during SSR (simplest, works today)
- **Option B**: Framework awaits lazy route resolution before serialization (better, but more complex)

Recommend **Option A for MVP**, Option B as follow-up.

### Phase 2: Conventions & Ergonomics

#### 2.1 — App entry convention

Define a convention for the SSR-compatible app export:

```ts
// src/app.tsx — the user's root component
export default function App() {
  return <div>...</div>;
}
```

The framework looks for:
1. `export default` function/component in the entry file
2. Named export `App` or `createApp`
3. Falls back to the module's default export

#### 2.2 — `<!--ssr-outlet-->` marker

If `index.html` contains `<!--ssr-outlet-->`, the framework injects SSR HTML there. Otherwise, it injects inside `<div id="app">`:

```html
<!-- Option 1: explicit marker -->
<div id="app"><!--ssr-outlet--></div>

<!-- Option 2: auto-detect (replace innerHTML of #app) -->
<div id="app"></div>
```

#### 2.3 — SSR-safe APIs in `@vertz/ui`

Some APIs are browser-only. The framework should:
- **Silently no-op** event listeners, `startViewTransition`, `history.pushState` during SSR
- **Warn in dev** if a component accesses `window.localStorage`, `fetch` (without a server polyfill), etc. during SSR
- **Never crash** — graceful degradation is non-negotiable

This is partially done (the DOM shim stubs `addEventListener`), but needs to be systematic.

### Phase 3: Production SSR

#### 3.1 — SSR build

`vite build --ssr` should produce a Node.js server bundle that:
1. Imports the SSR entry
2. Renders requests to HTML
3. Serves static assets from the client build
4. Supports streaming (optional)

The plugin should generate a production server entry:

```ts
// Generated: dist/server/entry.js
import { createServer } from 'node:http';
import { renderToString } from './ssr-entry.js';
import { serveStatic } from './static.js';

const server = createServer(async (req, res) => {
  if (serveStatic(req, res)) return;
  const html = await renderToString(req.url);
  res.end(html);
});

server.listen(3000);
```

#### 3.2 — Adapter system (future)

For deployment to various platforms:

```ts
vertz({
  ssr: true,
  adapter: 'node' | 'cloudflare' | 'vercel' | 'bun',
})
```

This is **post-launch**. For now, Node.js/Bun only.

### Phase 4: Hydration

#### 4.1 — Client-side hydration

The client entry needs to hydrate rather than full-render when SSR HTML is present:

```ts
// src/index.ts (client entry)
import { hydrate, render } from '@vertz/ui';
import App from './app';

const root = document.getElementById('app')!;

if (root.hasChildNodes()) {
  hydrate(App, root);  // Attach event listeners to existing DOM
} else {
  render(App, root);   // Full client-side render (no SSR)
}
```

`hydrate()` needs to:
1. Walk the existing DOM
2. Match it against the component tree
3. Attach event listeners and reactive subscriptions
4. **Not** re-create DOM nodes

This is the hardest part and can be a follow-up (after LW1). For LW1, we can ship SSR that does a full client re-render on load (not ideal but functional — same as what the task-manager does now).

## Implementation Order

### Milestone 1: `vite dev` with SSR (LW1 target) 🎯

| Step | Task | Package | Effort |
|------|------|---------|--------|
| 1 | Move DOM shim into `@vertz/ui-server` | `ui-server` | S |
| 2 | Add VNode-based JSX runtime to `@vertz/ui-server` | `ui-server` | S |
| 3 | Add `./jsx-runtime` subpath export to `@vertz/ui` (client) | `ui` | XS |
| 4 | Add `ssr` option to `vertzPlugin` with `configureServer` hook | `ui-compiler` | M |
| 5 | Auto-generate virtual SSR entry module | `ui-compiler` | M |
| 6 | JSX runtime alias swap for SSR modules | `ui-compiler` | S |
| 7 | Router SSR detection (use `__SSR_URL__`, skip popstate) | `ui` | S |
| 8 | Update task-manager to use zero-config SSR | `examples` | S |
| 9 | Delete all SSR boilerplate from task-manager | `examples` | XS |
| 10 | E2E test: `vite dev` → view source shows rendered HTML | `examples` | S |

**Total: ~3-4 days of focused work**

### Milestone 2: Production SSR build

| Step | Task | Effort |
|------|------|--------|
| 11 | `vite build` produces client + server bundles | M |
| 12 | Generated production server entry | M |
| 13 | Static asset serving in production | S |
| 14 | Streaming SSR option | M |

### Milestone 3: Hydration

| Step | Task | Effort |
|------|------|--------|
| 15 | `hydrate()` API in `@vertz/ui` | L |
| 16 | Hydration markers (already exists in compiler) | S |
| 17 | Mismatch detection & dev warnings | M |

## Developer Experience After This Plan

### Before (today):
```
├── src/
│   ├── app.tsx
│   ├── server.ts              ← custom server (50 lines)
│   ├── entry-server.ts        ← SSR entry (100 lines)
│   ├── entry-client.ts        ← client entry
│   ├── dom-shim.ts            ← DOM shim (250 lines!)
│   ├── jsx-runtime.ts         ← client JSX
│   └── jsx-runtime-server.ts  ← server JSX (100 lines)
├── vite.config.ts
└── package.json               ← conditional exports for JSX
```

**Dev command:** `bun src/server.ts` (NOT `vite dev` — easy to get wrong)

### After (goal):
```
├── src/
│   ├── app.tsx
│   └── index.ts
├── index.html
└── vite.config.ts             ← just add ssr: true
```

**Dev command:** `vite dev` (SSR just works)

**~400 lines of boilerplate eliminated. One config flag. Zero footguns.**

## Open Questions

1. **Module invalidation strategy** — Vite's `ssrLoadModule` caches modules. The current task-manager invalidates ALL SSR modules per request. This is correct for dev (hot reload) but we need to be smarter for production. The plugin should handle this.

2. **Client entry auto-detection** — How reliably can we parse `index.html` to find the entry? What if there are multiple scripts? Convention: first `<script type="module" src="...">` inside `<body>`.

3. **Head management** — `@vertz/ui-server` has `HeadCollector`. Should the plugin auto-inject collected head tags? Yes, but this can be Milestone 2.

4. **Error overlay** — When SSR crashes, should we show an error overlay in the browser (like Vite does for HMR errors)? Yes, and Vite's `ssrFixStacktrace` already helps.

5. **`createApp` vs `App` convention** — Some frameworks (Vue) use `createApp()`, others use `App` component directly. We should support both: if the export is a function that returns an element, call it. If it's a class/component, instantiate it.

## Non-Goals (for now)

- **ISR / SSG** — Static site generation is a different feature
- **Edge runtime** — Cloudflare Workers / Deno Deploy support is post-launch  
- **React Server Components-style architecture** — We're doing traditional SSR with hydration
- **Partial hydration / Islands** — Future optimization, not MVP
