# @vertz/ui-server

Server-side rendering (SSR) for `@vertz/ui`.

## Installation

```bash
bun add @vertz/ui-server
```

`vite` is a peer dependency (required for the dev server):

```bash
bun add -d vite
```

## Quick Start

### Render to HTML

The simplest way to server-render a Vertz app:

```typescript
import { renderToHTML } from '@vertz/ui-server';

function App() {
  return <h1>Hello, SSR!</h1>;
}

const html = await renderToHTML(App, {
  url: '/',
  head: { title: 'My App' },
});

return new Response(html, {
  headers: { 'content-type': 'text/html; charset=utf-8' },
});
```

`renderToHTML` handles the DOM shim, theme compilation, styles, and head management automatically.

### Dev Server

For local development with Vite HMR:

```typescript
import { createDevServer } from '@vertz/ui-server';

const server = createDevServer({
  entry: './src/entry-server.ts',
  port: 5173,
});

await server.listen();
```

---

## Rendering APIs

### `renderToHTML(app, options)`

Renders a component to a complete HTML document string. Handles DOM shim setup/teardown, theme compilation, style injection, and head management automatically.

```typescript
import { renderToHTML } from '@vertz/ui-server';
import { defineTheme } from '@vertz/ui';

const theme = defineTheme({
  colors: { primary: { DEFAULT: '#3b82f6' } },
});

const html = await renderToHTML(App, {
  url: '/dashboard',
  theme,
  styles: ['body { margin: 0; }'],
  head: {
    title: 'Dashboard',
    meta: [{ name: 'description', content: 'App dashboard' }],
    links: [{ rel: 'stylesheet', href: '/styles.css' }],
  },
  container: '#app',
});
```

**Options:**

| Option | Type | Description |
|---|---|---|
| `app` | `() => VNode` | App component function |
| `url` | `string` | Request URL for SSR routing |
| `theme` | `Theme` | Theme definition for CSS vars |
| `styles` | `string[]` | Global CSS strings to inject |
| `head` | `object` | Head config: `title`, `meta[]`, `links[]` |
| `container` | `string` | Container selector (default `'#app'`) |

### `renderPage(vnode, options?)`

Renders a VNode to a full HTML `Response` with doctype, head (meta, OG, Twitter, favicon, styles), body, and scripts.

```typescript
import { renderPage } from '@vertz/ui-server';

return renderPage(<App />, {
  title: 'My App',
  description: 'Built with Vertz',
  og: { image: '/og.png', url: 'https://example.com' },
  twitter: { card: 'summary_large_image' },
  scripts: ['/app.js'],
  styles: ['/app.css'],
});
```

**Options:**

| Option | Type | Description |
|---|---|---|
| `status` | `number` | HTTP status code (default `200`) |
| `title` | `string` | Page title |
| `description` | `string` | Meta description |
| `lang` | `string` | HTML lang attribute (default `'en'`) |
| `favicon` | `string` | Favicon URL |
| `og` | `object` | Open Graph: `title`, `description`, `image`, `url`, `type` |
| `twitter` | `object` | Twitter card: `card`, `site` |
| `scripts` | `string[]` | Script URLs for end of body |
| `styles` | `string[]` | Stylesheet URLs for head |
| `head` | `string` | Raw HTML escape hatch for head |

### `renderToStream(tree, options?)`

Low-level streaming renderer. Returns a `ReadableStream<Uint8Array>` that emits HTML as it's generated, including out-of-order Suspense resolution.

```typescript
import { renderToStream } from '@vertz/ui-server';
import type { VNode } from '@vertz/ui-server';

const tree: VNode = {
  tag: 'div',
  attrs: { id: 'app' },
  children: ['Hello, SSR!'],
};

const stream = renderToStream(tree);

return new Response(stream, {
  headers: { 'content-type': 'text/html; charset=utf-8' },
});
```

**Options:**
- `nonce?: string` — CSP nonce for inline scripts

### `serializeToHtml(node)`

Synchronously serialize a VNode tree to an HTML string:

```typescript
import { serializeToHtml } from '@vertz/ui-server';

const html = serializeToHtml({
  tag: 'div',
  attrs: { class: 'card' },
  children: ['Hello'],
});
// '<div class="card">Hello</div>'
```

### `rawHtml(html)`

Create a raw HTML string that bypasses escaping:

```typescript
import { rawHtml } from '@vertz/ui-server';

const node = rawHtml('<p>This HTML is <strong>not</strong> escaped.</p>');
```

**Warning:** Only use `rawHtml()` with trusted content.

---

## DOM Shim

Import from `@vertz/ui-server/dom-shim`:

The DOM shim provides `document.createElement`, `createTextNode`, etc. for SSR — allowing `@vertz/ui` components to work on the server without modification.

```typescript
import { installDomShim, removeDomShim, toVNode } from '@vertz/ui-server/dom-shim';

// Install before rendering
installDomShim();

// Your component code can use document.createElement, etc.
const element = App();

// Convert SSR elements to VNodes for serialization
const vnode = toVNode(element);

// Clean up after rendering
removeDomShim();
```

**Note:** `renderToHTML` handles DOM shim setup and teardown automatically. You only need these when using lower-level rendering APIs.

| Export | Description |
|---|---|
| `installDomShim()` | Install the minimal DOM shim on `globalThis` |
| `removeDomShim()` | Remove the DOM shim from `globalThis` |
| `toVNode(element)` | Convert an SSR element to a VNode |

---

## Head Management

Collect `<title>`, `<meta>`, and `<link>` tags during render:

```typescript
import { HeadCollector, renderHeadToHtml, rawHtml } from '@vertz/ui-server';

const headCollector = new HeadCollector();
headCollector.addTitle('My SSR App');
headCollector.addMeta({ charset: 'utf-8' });
headCollector.addMeta({ name: 'viewport', content: 'width=device-width, initial-scale=1' });
headCollector.addLink({ rel: 'stylesheet', href: '/styles.css' });

const headHtml = renderHeadToHtml(headCollector.getEntries());
```

**`HeadCollector` methods:**
- `addTitle(text)` — Add a `<title>` tag
- `addMeta(attrs)` — Add a `<meta>` tag
- `addLink(attrs)` — Add a `<link>` tag
- `getEntries()` — Get all collected `HeadEntry[]`
- `clear()` — Clear all entries

---

## Hydration Markers

Interactive components get hydration markers so the client knows where to attach event handlers:

```typescript
import { wrapWithHydrationMarkers } from '@vertz/ui-server';
import type { VNode } from '@vertz/ui-server';

const counterNode: VNode = {
  tag: 'div',
  attrs: {},
  children: [
    { tag: 'span', attrs: {}, children: ['Count: 0'] },
    { tag: 'button', attrs: {}, children: ['+'] },
  ],
};

const hydratedNode = wrapWithHydrationMarkers(counterNode, {
  componentName: 'Counter',
  key: 'counter-0',
  props: { initial: 0 },
});
```

**Output:**

```html
<div data-v-id="Counter" data-v-key="counter-0">
  <span>Count: 0</span>
  <button>+</button>
  <script type="application/json">{"initial":0}</script>
</div>
```

---

## Assets

### `renderAssetTags(assets)`

Render asset descriptors to HTML tags:

```typescript
import { renderAssetTags } from '@vertz/ui-server';
import type { AssetDescriptor } from '@vertz/ui-server';

const assets: AssetDescriptor[] = [
  { type: 'stylesheet', src: '/styles/main.css' },
  { type: 'script', src: '/js/runtime.js', defer: true },
  { type: 'script', src: '/js/app.js', defer: true },
];

const html = renderAssetTags(assets);
```

### `inlineCriticalCss(css)`

Inline above-the-fold CSS as a `<style>` tag with injection prevention:

```typescript
import { inlineCriticalCss } from '@vertz/ui-server';

const styleTag = inlineCriticalCss('body { margin: 0; font-family: system-ui; }');
// '<style>body { margin: 0; font-family: system-ui; }</style>'
```

---

## Streaming & Suspense

### Out-of-Order Streaming

Suspense boundaries emit placeholders immediately. When the async content resolves, a replacement chunk is streamed:

```typescript
const suspenseNode = {
  tag: '__suspense',
  attrs: {},
  children: [],
  _fallback: { tag: 'div', attrs: { class: 'skeleton' }, children: ['Loading...'] },
  _resolve: fetchUserData().then((user) => ({
    tag: 'div',
    attrs: { class: 'user-profile' },
    children: [user.name],
  })),
};

const stream = renderToStream(suspenseNode as VNode);
```

The stream first emits the fallback, then streams a `<template>` + `<script>` that swaps in the resolved content.

### CSP Nonce Support

All inline scripts support Content Security Policy nonces:

```typescript
const nonce = crypto.randomUUID();
const stream = renderToStream(tree, { nonce });

return new Response(stream, {
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `script-src 'nonce-${nonce}'`,
  },
});
```

---

## Dev Server

`createDevServer` provides a turnkey Vite SSR development server with HMR, module invalidation, and error stack fixing.

```typescript
import { createDevServer } from '@vertz/ui-server';

const server = createDevServer({
  entry: './src/entry-server.ts',
  port: 5173,
});

await server.listen();
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `entry` | `string` | (required) | Path to the SSR entry module |
| `port` | `number` | `5173` | Port to listen on |
| `host` | `string` | `'0.0.0.0'` | Host to bind to |
| `viteConfig` | `InlineConfig` | `{}` | Custom Vite configuration |
| `middleware` | `function` | — | Custom middleware before SSR handler |
| `skipModuleInvalidation` | `boolean` | `false` | Skip invalidating modules on each request |
| `logRequests` | `boolean` | `true` | Log requests to console |

**`DevServer` interface:**

| Property/Method | Description |
|---|---|
| `listen()` | Start the server |
| `close()` | Stop the server |
| `vite` | The underlying `ViteDevServer` |
| `httpServer` | The underlying `http.Server` |

The entry module should export a `renderToString(url: string)` function that returns HTML.

---

## JSX Runtime

The `@vertz/ui-server/jsx-runtime` subpath provides a server-side JSX factory that produces VNode trees compatible with `renderToStream`. During SSR, Vite's `ssrLoadModule` swaps this in automatically.

| Export | Description |
|---|---|
| `jsx` | JSX factory for single-child elements |
| `jsxs` | JSX factory for multi-child elements |
| `Fragment` | Fragment component |

---

## Types

```typescript
import type {
  // Core
  VNode,
  RawHtml,

  // Rendering
  RenderToHTMLOptions,
  RenderToStreamOptions,
  PageOptions,

  // Dev Server
  DevServerOptions,
  DevServer,

  // Head
  HeadEntry,

  // Hydration
  HydrationOptions,

  // Assets
  AssetDescriptor,
} from '@vertz/ui-server';
```

---

## Utilities

| Export | Description |
|---|---|
| `streamToString(stream)` | Convert a `ReadableStream<Uint8Array>` to a string |
| `collectStreamChunks(stream)` | Collect stream chunks as a `string[]` |
| `encodeChunk(html)` | Encode a string to a `Uint8Array` chunk |

---

## License

MIT
