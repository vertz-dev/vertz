# Vertz Dev Server

Run your `@vertz/ui` app with a single Bun server — server-rendered by default, with API routes built in.

```bash
bun run dev
```

Your app is server-rendered, hydrated on the client, and rebuilt on every file change. The compiler handles everything — what runs on the server vs. the client, reactive transforms, CSS extraction — so you write components once and they work everywhere.

---

## Quick Start

### 1. Install dependencies

```bash
bun add @vertz/ui @vertz/ui-server
```

If your app has API routes (entities + database):

```bash
bun add @vertz/server @vertz/db
```

### 2. Create your project files

**`src/index.ts`** — App entry point:

```ts
import { globalCss, mount } from '@vertz/ui';
import { App } from './app';

export { App };
export default App;

const globalStyles = globalCss({
  '*, *::before, *::after': { boxSizing: 'border-box', margin: '0', padding: '0' },
  body: { fontFamily: 'system-ui, sans-serif', minHeight: '100vh', lineHeight: '1.5' },
});

export const styles = [globalStyles.css];

// Mount on the client — the compiler skips this during SSR
const isSSR = typeof (globalThis as any).__SSR_URL__ !== 'undefined' || typeof document === 'undefined';
if (!isSSR) {
  mount(App, '#app', { styles: [globalStyles.css] });
}
```

**`index.html`** — HTML shell:

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
    <script type="module" src="./src/index.ts"></script>
  </body>
</html>
```

**`bunfig.toml`** — Register the compiler plugin:

```toml
[serve.static]
plugins = ["./bun-plugin-shim.ts"]
```

**`bun-plugin-shim.ts`** — Plugin shim (Bun requires a default export):

```ts
import { createVertzBunPlugin } from '@vertz/ui-server/bun-plugin';

const { plugin } = createVertzBunPlugin();

export default plugin;
```

### 3. Create the dev server

**`dev-server.ts`** — This is your entire dev server:

```ts
import { createVertzBunPlugin } from '@vertz/ui-server/bun-plugin';
import { ssrRenderToString, ssrDiscoverQueries, safeSerialize } from '@vertz/ui-server';
import { resolve } from 'node:path';
import { watch } from 'node:fs';

const PORT = Number(process.env.PORT) || 5173;
const ENTRY = resolve(import.meta.dir, 'src', 'index.ts');

// ── Register compiler plugins ────────────────────────────────────

// JSX runtime swap: use server JSX during SSR
Bun.plugin({
  name: 'vertz-ssr-jsx-swap',
  setup(build) {
    build.onResolve({ filter: /^@vertz\/ui\/jsx(-dev)?-runtime$/ }, () => ({
      path: '@vertz/ui-server/jsx-runtime',
      external: false,
    }));
  },
});

// Vertz compiler for server-side transforms
const { plugin: serverPlugin } = createVertzBunPlugin({ hmr: false, fastRefresh: false });
Bun.plugin(serverPlugin);

// ── Build client bundle ──────────────────────────────────────────

const { plugin: clientPlugin } = createVertzBunPlugin({ hmr: false, fastRefresh: false });

let clientBundle = '';

async function buildClient() {
  const start = performance.now();
  const result = await Bun.build({
    entrypoints: [ENTRY],
    plugins: [clientPlugin],
    target: 'browser',
    minify: false,
    sourcemap: 'inline',
  });

  if (!result.success) {
    console.error('Client build failed:');
    for (const log of result.logs) console.error(' ', log.message);
    return false;
  }

  for (const output of result.outputs) clientBundle = await output.text();
  console.log(`Client built in ${(performance.now() - start).toFixed(0)}ms`);
  return true;
}

if (!await buildClient()) process.exit(1);

// ── Load SSR module ──────────────────────────────────────────────

const ssrModule = await import(ENTRY);
const indexHtml = await Bun.file(resolve(import.meta.dir, 'index.html')).text();

// ── Watch for changes ────────────────────────────────────────────

let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;
watch(resolve(import.meta.dir, 'src'), { recursive: true }, (_event, filename) => {
  if (!filename) return;
  if (rebuildTimeout) clearTimeout(rebuildTimeout);
  rebuildTimeout = setTimeout(async () => {
    console.log(`\nFile changed: ${filename}`);
    await buildClient();
  }, 100);
});

// ── Start server ─────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,

  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Serve static files from public/
    if (pathname !== '/' && !pathname.endsWith('.html')) {
      const publicFile = Bun.file(resolve(import.meta.dir, `public${pathname}`));
      if (await publicFile.exists()) return new Response(publicFile);
    }

    // Nav pre-fetch (SSE)
    if (request.headers.get('x-vertz-nav') === '1') {
      const result = await ssrDiscoverQueries(ssrModule, pathname, { ssrTimeout: 300 });
      let body = '';
      for (const entry of result.resolved) body += `event: data\ndata: ${safeSerialize(entry)}\n\n`;
      body += 'event: done\ndata: {}\n\n';
      return new Response(body, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    // SSR render
    const result = await ssrRenderToString(ssrModule, pathname, { ssrTimeout: 300 });
    let html = indexHtml
      .replace(/<script type="module" src="\.\/src\/index\.ts"><\/script>/,
        `<script type="module">\n${clientBundle}\n</script>`)
      .replace(/(<div[^>]*id="app"[^>]*>)([\s\S]*?)(<\/div>)/, `$1${result.html}$3`);

    if (result.css) html = html.replace('</head>', `${result.css}\n</head>`);
    if (result.ssrData.length > 0) {
      html = html.replace('</body>',
        `<script>window.__VERTZ_SSR_DATA__=${safeSerialize(result.ssrData)};</script>\n</body>`);
    }

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
});

console.log(`\nDev server at http://localhost:${server.port}`);
```

### 4. Add scripts to `package.json`

```json
{
  "scripts": {
    "dev": "bun --watch run dev-server.ts"
  }
}
```

`bun --watch` restarts the server on file changes so the SSR module always reflects your latest code.

### 5. Run it

```bash
bun run dev
```

Open `http://localhost:5173`. Your app is server-rendered and hydrates on the client.

---

## Adding API Routes

If your app has entities and a database, the API handler composes into the same server. One port, one process.

### Define your schema and entities

**`src/schema.ts`**:

```ts
import { d } from '@vertz/db';

export const tasksTable = d.table('tasks', {
  id: d.uuid().primary({ generate: 'uuid' }),
  title: d.text(),
  status: d.text().default('todo'),
  createdAt: d.timestamp().default('now').readOnly(),
});

export const tasksModel = d.model(tasksTable);
```

**`src/entities.ts`**:

```ts
import { entity } from '@vertz/server';
import { tasksModel } from './schema';

export const tasks = entity('tasks', {
  model: tasksModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
});
```

### Wire into the dev server

Add the API handler before the SSR rendering in `dev-server.ts`:

```ts
import { createDbProvider } from '@vertz/db';
import { createServer } from '@vertz/server';
import { tasks } from './src/entities';
import { tasksTable } from './src/schema';

// Set up the database
const db = await createDbProvider({
  dialect: 'sqlite',
  schema: tasksTable,
  migrations: { autoApply: true },
});

// Create the API handler
const apiApp = createServer({ entities: [tasks], db });

// In Bun.serve() fetch handler, before SSR rendering:
async fetch(request) {
  const pathname = new URL(request.url).pathname;

  // API routes
  if (pathname.startsWith('/api/')) {
    return apiApp.handler(request);
  }

  // ... static files, nav pre-fetch, SSR render
}
```

This gives you a full REST API:

```
GET    /api/tasks        → list all tasks
GET    /api/tasks/:id    → get one task
POST   /api/tasks        → create a task
PATCH  /api/tasks/:id    → update a task
DELETE /api/tasks/:id    → delete a task
```

All from the same `bun run dev` command, same port, same server.

---

## Production Build

Create a `build.ts` script for production bundles:

```ts
import { createVertzBunPlugin } from '@vertz/ui-server/bun-plugin';

const { plugin, fileExtractions } = createVertzBunPlugin({
  hmr: false,
  fastRefresh: false,
});

// Client build
const clientResult = await Bun.build({
  entrypoints: ['./src/index.ts'],
  plugins: [plugin],
  target: 'browser',
  minify: true,
  sourcemap: 'external',
  splitting: true,
  outdir: './dist/client/assets',
  naming: '[name]-[hash].[ext]',
});

// Process index.html — inject hashed assets, extracted CSS
// Server build — target: 'bun' with JSX runtime swap
```

See the [task-manager build.ts](../../examples/task-manager/build.ts) for the complete implementation including HTML template processing and server builds.

### Production server

```ts
import { createSSRHandler } from '@vertz/ui-server';

const ssrModule = await import('./dist/server/index.js');
const template = await Bun.file('./dist/client/index.html').text();
const handler = createSSRHandler({ module: ssrModule, template });

Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);

    // Static assets
    if (url.pathname !== '/' && !url.pathname.endsWith('.html')) {
      const file = Bun.file(`./dist/client${url.pathname}`);
      if (await file.exists()) return new Response(file);
    }

    // SSR
    return handler(request);
  },
});
```

Add to `package.json`:

```json
{
  "scripts": {
    "dev": "bun --watch run dev-server.ts",
    "build": "bun run build.ts",
    "start": "bun run server.ts"
  }
}
```

---

## How It Works

The compiler (`@vertz/ui-server/bun-plugin`) transforms your `.tsx` files at build time:

1. **Reactive transforms** — `let` declarations become signals, `const` derivations become computed values
2. **JSX** — JSX expressions compile to efficient DOM helpers
3. **CSS extraction** — `css()` calls are extracted to static CSS
4. **Hydration markers** — `data-v-id` attributes enable client-side hydration of server-rendered HTML
5. **JSX runtime swap** — During SSR, `@vertz/ui/jsx-runtime` is replaced with `@vertz/ui-server/jsx-runtime`, so the same components render to strings on the server and DOM nodes on the client

You don't need to think about what runs where. Write components, and the compiler handles the rest.

### Dev server flow

```
bun run dev
  → Registers compiler plugins (JSX swap + transforms)
  → Builds client bundle via Bun.build() (browser target)
  → Loads SSR module via import('./src/index.ts')
  → Watches src/ for changes → rebuilds client bundle
  → bun --watch restarts server → fresh SSR module
  → Bun.serve():
      /api/*  → entity handler (REST API)
      static  → public/ files
      HTML    → ssrRenderToString() → inject into template
```

---

## Troubleshooting

### Build error: "Could not resolve: /favicon.svg"

Use relative paths in `index.html` (`./public/favicon.svg`, not `/favicon.svg`). Bun resolves all paths relative to the HTML file.

### SSR module fails to load

The JSX runtime swap plugin must be registered **before** importing the app entry. Make sure `Bun.plugin()` runs before `await import('./src/index.ts')`.

### Changes not reflected after saving

Make sure you're running with `bun --watch run dev-server.ts`. Without `--watch`, Bun caches the SSR module and won't pick up changes.

### `bunfig.toml` plugin not loading

The plugin file must export a `BunPlugin` as the default export. `@vertz/ui-server/bun-plugin` uses named exports, so the shim file (`bun-plugin-shim.ts`) bridges the gap.
