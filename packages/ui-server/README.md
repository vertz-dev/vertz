# @vertz/ui-server

Server-side rendering (SSR) for `@vertz/ui`.

## Features

- **Streaming HTML** — `renderToStream()` returns a `ReadableStream<Uint8Array>`
- **Out-of-order streaming** — Suspense boundaries emit placeholders immediately, resolved content later
- **Atomic hydration markers** — Interactive components get `data-v-id` attributes; static components ship zero JS
- **Head management** — Collect `<title>`, `<meta>`, and `<link>` tags during render
- **Asset injection** — Script and stylesheet helpers for the HTML head
- **Critical CSS inlining** — Inline above-the-fold CSS with injection prevention
- **CSP nonce support** — All inline scripts support Content Security Policy nonces

## Installation

```bash
bun add @vertz/ui-server
```

## Usage

### Basic SSR

```typescript
import { renderToStream } from '@vertz/ui-server';
import type { VNode } from '@vertz/ui-server';

const tree: VNode = {
  tag: 'html',
  attrs: { lang: 'en' },
  children: [
    {
      tag: 'head',
      attrs: {},
      children: [{ tag: 'title', attrs: {}, children: ['My App'] }],
    },
    {
      tag: 'body',
      attrs: {},
      children: [
        {
          tag: 'div',
          attrs: { id: 'app' },
          children: ['Hello, SSR!'],
        },
      ],
    },
  ],
};

const stream = renderToStream(tree);

// Return as HTTP response
return new Response(stream, {
  headers: { 'content-type': 'text/html; charset=utf-8' },
});
```

### Streaming with Suspense

```typescript
import { renderToStream } from '@vertz/ui-server';
import type { VNode } from '@vertz/ui-server';

// Create a Suspense boundary
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

const tree: VNode = {
  tag: 'div',
  attrs: { id: 'app' },
  children: [
    { tag: 'h1', attrs: {}, children: ['User Profile'] },
    suspenseNode as VNode,
  ],
};

const stream = renderToStream(tree);
```

**How out-of-order streaming works:**

1. The initial stream contains the placeholder: `<div id="v-slot-0"><div class="skeleton">Loading...</div></div>`
2. When `_resolve` completes, a replacement chunk is streamed:
   ```html
   <template id="v-tmpl-0"><div class="user-profile">Alice</div></template>
   <script>
     (function(){
       var s=document.getElementById("v-slot-0");
       var t=document.getElementById("v-tmpl-0");
       if(s&&t){s.replaceWith(t.content.cloneNode(true));t.remove()}
     })()
   </script>
   ```

### CSP Nonce Support

For sites with strict Content Security Policies:

```typescript
import { renderToStream } from '@vertz/ui-server';

const nonce = crypto.randomUUID();

const stream = renderToStream(tree, { nonce });

return new Response(stream, {
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `script-src 'nonce-${nonce}'`,
  },
});
```

All inline `<script>` tags (Suspense replacement scripts) will include `nonce="..."`.

### Hydration Markers

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

const stream = renderToStream(hydratedNode);
```

**Output:**

```html
<div data-v-id="Counter" data-v-key="counter-0">
  <span>Count: 0</span>
  <button>+</button>
  <script type="application/json">{"initial":0}</script>
</div>
```

The hydration runtime on the client reads `data-v-id` and `data-v-key` to restore interactivity.

### Head Management

Collect `<title>`, `<meta>`, and `<link>` tags during render:

```typescript
import { HeadCollector, renderHeadToHtml, rawHtml } from '@vertz/ui-server';

const headCollector = new HeadCollector();
headCollector.addTitle('My SSR App');
headCollector.addMeta({ charset: 'utf-8' });
headCollector.addMeta({ name: 'viewport', content: 'width=device-width, initial-scale=1' });
headCollector.addLink({ rel: 'stylesheet', href: '/styles.css' });

const headHtml = renderHeadToHtml(headCollector.getEntries());

const tree: VNode = {
  tag: 'html',
  attrs: { lang: 'en' },
  children: [
    {
      tag: 'head',
      attrs: {},
      children: [rawHtml(headHtml)],
    },
    {
      tag: 'body',
      attrs: {},
      children: [{ tag: 'div', attrs: { id: 'app' }, children: ['Content'] }],
    },
  ],
};

const stream = renderToStream(tree);
```

### Asset Injection

Inject scripts and stylesheets into the HTML head:

```typescript
import { renderAssetTags } from '@vertz/ui-server';
import type { AssetDescriptor } from '@vertz/ui-server';

const assets: AssetDescriptor[] = [
  { type: 'stylesheet', src: '/styles/main.css' },
  { type: 'script', src: '/js/runtime.js', defer: true },
  { type: 'script', src: '/js/app.js', defer: true },
];

const assetHtml = renderAssetTags(assets);
// <link rel="stylesheet" href="/styles/main.css">
// <script src="/js/runtime.js" defer></script>
// <script src="/js/app.js" defer></script>
```

### Critical CSS Inlining

Inline above-the-fold CSS for faster First Contentful Paint:

```typescript
import { inlineCriticalCss, rawHtml } from '@vertz/ui-server';

const criticalCss = `
  body { margin: 0; font-family: system-ui, sans-serif; }
  .hero { padding: 2rem; background: linear-gradient(to right, #667eea, #764ba2); }
`;

const styleTag = inlineCriticalCss(criticalCss);
// <style>body { margin: 0; font-family: system-ui, sans-serif; } ...</style>

const tree: VNode = {
  tag: 'html',
  attrs: {},
  children: [
    {
      tag: 'head',
      attrs: {},
      children: [rawHtml(styleTag)],
    },
    {
      tag: 'body',
      attrs: {},
      children: [{ tag: 'div', attrs: { class: 'hero' }, children: ['Hero Section'] }],
    },
  ],
};

const stream = renderToStream(tree);
```

The `inlineCriticalCss()` function escapes any `</style>` sequences in the CSS to prevent injection attacks.

### Raw HTML

Embed pre-rendered HTML without escaping:

```typescript
import { rawHtml } from '@vertz/ui-server';
import type { VNode } from '@vertz/ui-server';

const tree: VNode = {
  tag: 'div',
  attrs: {},
  children: [
    rawHtml('<p>This HTML is <strong>not</strong> escaped.</p>'),
    'This text is escaped.',
  ],
};

const stream = renderToStream(tree);
// <div><p>This HTML is <strong>not</strong> escaped.</p>This text is escaped.</div>
```

**Warning:** Only use `rawHtml()` with trusted content. Embedding user-generated content without escaping is a security risk.

## API Reference

### `renderToStream(tree, options?)`

Render a VNode tree to a `ReadableStream<Uint8Array>`.

- **Parameters:**
  - `tree: VNode | string | RawHtml` — The virtual tree to render
  - `options?: RenderToStreamOptions` — Optional configuration
    - `nonce?: string` — CSP nonce for inline scripts
- **Returns:** `ReadableStream<Uint8Array>`

### `wrapWithHydrationMarkers(node, options)`

Wrap a VNode with hydration markers for interactive components.

- **Parameters:**
  - `node: VNode` — The component's root VNode
  - `options: HydrationOptions`
    - `componentName: string` — Component name for `data-v-id`
    - `key: string` — Unique key for `data-v-key`
    - `props?: Record<string, unknown>` — Serialized props
- **Returns:** `VNode` — A new VNode with hydration attributes

### `HeadCollector`

Collects `<head>` metadata during SSR.

- **Methods:**
  - `addTitle(text: string)` — Add a `<title>` tag
  - `addMeta(attrs: Record<string, string>)` — Add a `<meta>` tag
  - `addLink(attrs: Record<string, string>)` — Add a `<link>` tag
  - `getEntries(): HeadEntry[]` — Get all collected entries
  - `clear()` — Clear all entries

### `renderHeadToHtml(entries)`

Render head entries to an HTML string.

- **Parameters:**
  - `entries: HeadEntry[]` — Collected head entries
- **Returns:** `string` — HTML string

### `renderAssetTags(assets)`

Render asset descriptors to HTML tags.

- **Parameters:**
  - `assets: AssetDescriptor[]` — Script/stylesheet descriptors
- **Returns:** `string` — HTML string

### `inlineCriticalCss(css)`

Inline critical CSS as a `<style>` tag.

- **Parameters:**
  - `css: string` — CSS content
- **Returns:** `string` — `<style>...</style>` or empty string

### `rawHtml(html)`

Create a raw HTML string that bypasses escaping.

- **Parameters:**
  - `html: string` — Pre-rendered HTML
- **Returns:** `RawHtml` — Raw HTML object

### `serializeToHtml(node)`

Serialize a VNode tree to an HTML string (synchronous).

- **Parameters:**
  - `node: VNode | string | RawHtml` — The virtual tree to serialize
- **Returns:** `string` — HTML string

### Utilities

- `streamToString(stream: ReadableStream<Uint8Array>): Promise<string>` — Convert stream to string (for testing)
- `collectStreamChunks(stream: ReadableStream<Uint8Array>): Promise<string[]>` — Collect stream chunks as array (for testing)
- `encodeChunk(html: string): Uint8Array` — Encode string to UTF-8 chunk

## Types

### `VNode`

Virtual node representing an HTML element.

```typescript
interface VNode {
  tag: string;
  attrs: Record<string, string>;
  children: (VNode | string | RawHtml)[];
}
```

### `RawHtml`

Raw HTML that bypasses escaping.

```typescript
interface RawHtml {
  __raw: true;
  html: string;
}
```

### `HydrationOptions`

Options for hydration marker generation.

```typescript
interface HydrationOptions {
  componentName: string;
  key: string;
  props?: Record<string, unknown>;
}
```

### `HeadEntry`

Metadata entry for the HTML head.

```typescript
interface HeadEntry {
  tag: 'title' | 'meta' | 'link';
  attrs?: Record<string, string>;
  textContent?: string;
}
```

### `AssetDescriptor`

Asset descriptor for script/stylesheet injection.

```typescript
interface AssetDescriptor {
  type: 'script' | 'stylesheet';
  src: string;
  async?: boolean; // scripts only
  defer?: boolean; // scripts only
}
```

### `RenderToStreamOptions`

Options for `renderToStream()`.

```typescript
interface RenderToStreamOptions {
  nonce?: string; // CSP nonce for inline scripts
}
```

## Testing

Run the test suite:

```bash
bun run test
```

Run tests in watch mode:

```bash
bun run test:watch
```

Type check:

```bash
bun run typecheck
```

## License

MIT
