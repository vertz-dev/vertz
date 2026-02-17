# renderPage API — @vertz/ui-server

## Overview

`renderPage` abstracts the HTML shell (doctype, head, meta, OG tags, scripts, styles) so developers never write boilerplate HTML. Returns a full `Response` object.

## API

### Level 1: renderPage (returns Response)

```typescript
import { renderPage } from '@vertz/ui-server'

// Minimal
const response = renderPage(<App />)

// With options
const response = renderPage(App, {
  // Status code (e.g., 404 for not found, 500 for errors)
  status: 200,  // default: 200

  // Page metadata
  title: 'My App',
  description: 'Built with vertz',
  lang: 'en',               // default: 'en'

  // Favicon — most apps have one, so it's typed
  favicon: '/favicon.ico',

  // Open Graph
  og: {
    title: 'My App',        // falls back to title
    description: '...',      // falls back to description
    image: '/og.png',
    url: 'https://myapp.com',
    type: 'website',         // default: 'website'
  },

  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    site: '@vertzdev',
  },

  // Assets
  scripts: ['/app.js'],
  styles: ['/app.css'],

  // Escape hatch — raw HTML injected into <head>
  head: '<link rel="preconnect" href="https://fonts.googleapis.com">',
})
```

### Level 2: renderToStream (returns ReadableStream)

For users who need custom Response headers or full control:

```typescript
import { renderToStream } from '@vertz/ui-server'

const stream = renderToStream(vnode)
new Response(stream, {
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'x-custom': 'value',
  }
})
```

## Behavior

### renderPage returns Response
- Status: configurable via `status` option (default: 200)
- Content-Type: `text/html; charset=utf-8`
- Body: streaming ReadableStream of the full HTML document

### HTML Output Structure
```html
<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{description}">
  <meta property="og:title" content="{og.title || title}">
  <meta property="og:description" content="{og.description || description}">
  <meta property="og:image" content="{og.image}">
  <meta property="og:url" content="{og.url}">
  <meta property="og:type" content="{og.type}">
  <meta name="twitter:card" content="{twitter.card}">
  <meta name="twitter:site" content="{twitter.site}">
  {styles as <link rel="stylesheet" href="...">}
  {head — raw HTML escape hatch}
</head>
<body>
  {streamed component content via renderToStream}
  {scripts as <script type="module" src="...">}
</body>
</html>
```

### HeadCollector Integration

`renderPage` options set **default** head values. Components using `HeadCollector` can **override** these defaults.

**Precedence: Component HeadCollector > renderPage options**

This means:
- A layout can set default title/description/OG tags
- Individual pages override only what they need
- renderPage internally creates a HeadCollector context, renders the component, then merges — component values win over option values

### Rendering Strategy: Two-Pass

renderPage uses a two-pass approach:

1. **Pass 1 (Head Collection):** Render the component tree in memory. Collect all HeadCollector values (title, meta, OG tags set by components). This is fast — the component tree is small relative to the stream.
2. **Pass 2 (Stream):** Build the `<head>` with the correct merged values (component overrides > renderPage defaults), flush it, then stream the `<body>` content.

**Why two-pass?**
- In streaming SSR, `<head>` is flushed before the body. If a component sets `<Head title="About">` mid-render, it's too late — the old title was already sent.
- Two-pass ensures `<head>` is always correct, which matters for SEO (crawlers read title/OG from HTML).
- The head collection pass is negligible in cost — `<head>` is a few hundred bytes.

**Alternative considered:** One-pass streaming with client-side `<script>` injection to patch `<head>`. Rejected — adds complexity, worse for SEO, unnecessary given the low cost of two-pass.

### Defaults
- `lang`: `'en'`
- `og.type`: `'website'`
- `og.title`: falls back to `title`
- `og.description`: falls back to `description`
- Viewport and charset: always included, not configurable
- Scripts use `type="module"` by default

### Component Input
- Accepts VNodes only (from JSX/createElement): `renderPage(<App user={user} />, { title: 'Home' })`
- Component functions are NOT accepted directly — use JSX to create the VNode first
- This keeps props handling natural (baked into JSX) and avoids inventing a separate `props` option

## Design Decisions

1. **renderPage returns Response, not stream** — covers 90% of cases with zero boilerplate. Drop to renderToStream for custom headers.
2. **OG falls back to title/description** — no duplication for simple cases
3. **Viewport + charset not configurable** — there's no valid reason to omit these
4. **Scripts at end of body** — better loading performance, standard practice
5. **head escape hatch** — raw HTML string for anything not yet typed (preloads, structured data, custom meta tags)
6. **Cloud-agnostic** — returns web-standard Response. Works on Cloudflare, Deno, AWS, Node, Bun.
7. **Component HeadCollector overrides renderPage defaults** — components know their context better (e.g., a /about page knows its own title)
8. **favicon is typed because 95%+ of apps have one** — common enough to warrant a dedicated option, not an escape hatch
9. **status option enables error pages without dropping to renderToStream** — 404/500 pages are common, no need to abandon the simple API
10. **VNode-only input** — no bare component functions. JSX naturally handles props; a `props` option would be awkward and redundant.
11. **Two-pass rendering** — collect head values first, then stream body. Correctness over micro-optimization. Head is tiny; the delay is negligible.

## Integration with Cloudflare Example

Before:
```typescript
.get('/', {
  handler: async () => {
    const html = `<!DOCTYPE html>...50 lines of boilerplate...`
    return new Response(html, { headers: { 'Content-Type': 'text/html' } })
  }
})
```

After:
```typescript
.get('/*', {
  handler: async () => renderPage(App, { title: 'Vertz SSR Demo' })
})
```

## Existing Infrastructure

- `renderToStream()` — already exists, renders VNodes to ReadableStream
- `HeadCollector` + `renderHeadToHtml()` — already exists, manages head tags
- `wrapWithHydrationMarkers()` — already exists for client hydration

renderPage wraps these together into one clean API.

## Non-Goals

- Per-route head management (future — React Helmet-like component API)
- Automatic asset injection from build manifest (future)
- Partial hydration (future)
