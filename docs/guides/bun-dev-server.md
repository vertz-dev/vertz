# Bun Dev Server — Setup & Usage

Run `@vertz/ui` apps with a single Bun server. No Vite, no webpack — just `bun run dev`.

The Bun dev server provides two modes from one entry point:

| Mode | Command | What it does |
|------|---------|--------------|
| **HMR** | `bun run dev` | Client-only with CSS Hot Reload + Fast Refresh |
| **SSR** | `bun run dev:ssr` | Server-rendered HTML + client hydration |

Both use `@vertz/bun-plugin` for compiler transforms (reactive signals, JSX, CSS extraction).

---

## Prerequisites

- [Bun](https://bun.sh) v1.2+ (uses HTML imports, `Bun.serve()` routes API)
- A `@vertz/ui` app with a `src/index.ts` entry point

---

## Setup

### 1. Install the plugin

```bash
bun add -d @vertz/bun-plugin
```

### 2. Create the plugin shim

Bun's `bunfig.toml` requires plugins to export a default. `@vertz/bun-plugin` exports a factory function, so create a thin shim:

**`bun-plugin-shim.ts`**
```ts
import { createVertzBunPlugin } from '@vertz/bun-plugin';

const { plugin } = createVertzBunPlugin();

export default plugin;
```

### 3. Configure `bunfig.toml`

Add the plugin to `[serve.static]` so Bun's HTML import runs your `.tsx` files through the compiler:

```toml
[serve.static]
plugins = ["./bun-plugin-shim.ts"]
```

### 4. Update `index.html`

Two changes from a Vite-based setup:

1. **Add the Fast Refresh runtime** before your app entry (it must load first to populate `globalThis`)
2. **Use relative paths** (Bun resolves `./src/...`, not `/src/...`)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="./public/favicon.svg" />
    <title>My App</title>
  </head>
  <body>
    <div id="app"></div>
    <!-- Fast Refresh runtime MUST load before app -->
    <script type="module" src="./node_modules/@vertz/bun-plugin/dist/fast-refresh-runtime.js"></script>
    <script type="module" src="./src/index.ts"></script>
  </body>
</html>
```

### 5. Create `dev-server.ts`

**Minimal HMR-only server:**

```ts
// @ts-ignore — Bun HTML import
import homepage from './index.html';

const server = Bun.serve({
  port: 5173,
  routes: { '/*': homepage },
  development: { hmr: true, console: true },
});

console.log(`Dev server at http://localhost:${server.port}`);
```

### 6. Add scripts to `package.json`

```json
{
  "scripts": {
    "dev": "bun run dev-server.ts",
    "dev:ssr": "bun --watch run dev-server.ts --ssr"
  }
}
```

---

## HMR Mode

```bash
bun run dev
```

This uses Bun's native HTML import (`import page from './index.html'`), which gives you:

- **Module-level HMR** — Bun watches your source files and pushes updates over WebSocket
- **CSS sidecar HMR** — The plugin extracts `css()` calls into `.css` sidecar files in `.vertz/css/`. Bun hot-swaps `<link>` tags natively — no flash, no JS involved
- **Fast Refresh** — The plugin wraps component functions with tracking code. When a module updates, only the changed components re-mount in place — state is preserved by position (same strategy as React Fast Refresh)

### How it works

```
index.html
  → Bun resolves ./src/index.ts
  → bunfig.toml plugin transforms .tsx files:
      1. Hydration markers (data-v-id)
      2. Reactive transforms (let → signal, const → computed)
      3. JSX → DOM helpers
      4. CSS extraction → .vertz/css/*.css sidecar files
      5. Fast Refresh wrappers
      6. import.meta.hot.accept()
  → Bun serves the bundled page with HMR WebSocket
```

---

## SSR Mode

```bash
bun run dev:ssr
```

This uses a custom `fetch` handler with:

- **`Bun.build()`** for the client bundle (browser target, inline source maps)
- **`ssrRenderToString()`** from `@vertz/ui-server` for server rendering
- **`bun --watch`** for SSR module freshness (restarts server on file changes, ~200ms)
- **Nav pre-fetch** via `X-Vertz-Nav: 1` header → SSE response with pre-fetched query data

### Adding SSR to `dev-server.ts`

Detect a `--ssr` flag and branch:

```ts
const SSR_MODE = process.argv.includes('--ssr');

if (SSR_MODE) {
  await startSSRServer();
} else {
  startHMRServer();
}
```

The SSR server:
1. Registers `@vertz/bun-plugin` via `Bun.plugin()` for server-side `.tsx` transforms
2. Registers a JSX runtime swap (`@vertz/ui/jsx-runtime` → `@vertz/ui-server/jsx-runtime`)
3. Builds the client bundle with `Bun.build()`
4. Loads the SSR module via `await import('./src/index.ts')`
5. Watches `src/` for changes → rebuilds client bundle
6. Serves HTML via `ssrRenderToString()` with the client bundle inlined

See the [task-manager dev-server.ts](../../examples/task-manager/dev-server.ts) for the full implementation.

### SSR module freshness

Bun caches `import()` results — you can't re-import a module to get fresh code. The solution: run with `bun --watch`, which restarts the entire server on file changes (~200ms). The client-side Fast Refresh still handles component-level updates in HMR mode.

---

## Production Build

Create a `build.ts` script that uses `Bun.build()`:

```ts
import { createVertzBunPlugin } from '@vertz/bun-plugin';

const { plugin, fileExtractions } = createVertzBunPlugin({
  hmr: false,
  fastRefresh: false,
});

// Client build → dist/client/assets/
await Bun.build({
  entrypoints: ['./src/index.ts'],
  plugins: [plugin],
  target: 'browser',
  minify: true,
  sourcemap: 'external',
  splitting: true,
  outdir: './dist/client/assets',
  naming: '[name]-[hash].[ext]',
});

// Server build → dist/server/
// (register JSX swap plugin first, then build with target: 'bun')
```

### HTML template processing

`Bun.build()` doesn't process HTML like Vite does. Your build script must:

1. Build JS → collect output filenames with hashes
2. Read `index.html`
3. Replace `<script src="./src/index.ts">` with `<script src="/assets/index-[hash].js">`
4. Inject `<link>` tags for extracted CSS
5. Remove the Fast Refresh runtime script
6. Write to `dist/client/index.html`
7. Copy `public/` → `dist/client/`

See the [task-manager build.ts](../../examples/task-manager/build.ts) for a complete example.

### Production server

The production server uses `createSSRHandler()` from `@vertz/ui-server` — same as before:

```ts
import { createSSRHandler } from '@vertz/ui-server';

const ssrModule = await import('./dist/server/index.js');
const template = await Bun.file('./dist/client/index.html').text();

const handler = createSSRHandler({ module: ssrModule, template });

Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/' && !url.pathname.endsWith('.html')) {
      const file = Bun.file(`./dist/client${url.pathname}`);
      if (await file.exists()) return new Response(file);
    }
    return handler(request);
  },
});
```

---

## Adding API Routes

If your app has a `@vertz/server` backend, compose it into the same server:

### HMR mode — route-based

```ts
import { createServer } from '@vertz/server';
const apiApp = createServer({ entities: [...], db });

Bun.serve({
  routes: {
    '/api/*': { async fetch(req) { return apiApp.handler(req); } },
    '/*': homepage,
  },
  development: { hmr: true },
});
```

The `/api/*` route is declared before `/*` so it takes precedence.

### SSR mode — fetch-based

```ts
Bun.serve({
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/api/')) return apiApp.handler(request);
    // ... SSR rendering
  },
});
```

---

## Migrating from Vite

| Before (Vite) | After (Bun) |
|----------------|-------------|
| `vite.config.ts` with `vertzPlugin()` | `bunfig.toml` with `[serve.static] plugins` |
| `vite` dependency | `@vertz/bun-plugin` dev dependency |
| `vite dev` | `bun run dev-server.ts` |
| `vite build` | `bun run build.ts` |
| `/src/index.ts` (absolute path) | `./src/index.ts` (relative path) |
| Vite HMR | Bun native HMR + CSS sidecar + Fast Refresh |
| Vite SSR middleware | `ssrRenderToString()` + `Bun.build()` |

### Steps

1. Delete `vite.config.ts`
2. Remove `vite` from `devDependencies`
3. Add `@vertz/bun-plugin` to `devDependencies`
4. Create `bun-plugin-shim.ts` and update `bunfig.toml`
5. Update `index.html` (relative paths + Fast Refresh runtime)
6. Create `dev-server.ts` and `build.ts`
7. Update `package.json` scripts

---

## Troubleshooting

### Build error: "Could not resolve: /favicon.svg"

Bun's HTML import resolves all paths in the HTML. Use relative paths (`./public/favicon.svg`) instead of absolute (`/favicon.svg`).

### Fast Refresh not working — full page reloads

Ensure the Fast Refresh runtime script loads **before** the app entry in `index.html`. The runtime must populate `globalThis` before any component modules execute.

### CSS changes don't hot-reload

Check that `.vertz/css/` exists and contains `.css` sidecar files. The plugin extracts `css()` calls to disk-based files that Bun watches for CSS HMR.

### SSR mode: "Failed to load SSR module"

The JSX runtime swap plugin must be registered before importing the app entry. Make sure `Bun.plugin()` for the JSX swap runs before `await import('./src/index.ts')`.

### `bunfig.toml` plugin not loading

The plugin file must export a `BunPlugin` as the default export. If using `@vertz/bun-plugin` (which uses named exports), create a shim file — see [Setup step 2](#2-create-the-plugin-shim).
