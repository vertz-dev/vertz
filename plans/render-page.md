# renderPage API — @vertz/ui-server

## Overview

`renderPage` abstracts the HTML shell (doctype, head, meta, OG tags, scripts, styles) so developers never write boilerplate HTML. Returns a full `Response` object.

## API

### Level 1: renderPage (returns Response)

```typescript
import { renderPage } from '@vertz/ui-server'

// Minimal
const response = renderPage(App)

// With options
const response = renderPage(App, {
  title: 'My App',
  description: 'Built with vertz',
  lang: 'en',               // default: 'en'

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
  head: '<link rel="icon" href="/favicon.ico">',
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
- Status: 200
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

### Defaults
- `lang`: `'en'`
- `og.type`: `'website'`
- `og.title`: falls back to `title`
- `og.description`: falls back to `description`
- Viewport and charset: always included, not configurable
- Scripts use `type="module"` by default

### Component Input
- Accepts a VNode (from JSX/createElement) or a component function
- Passed directly to renderToStream internally

## Design Decisions

1. **renderPage returns Response, not stream** — covers 90% of cases with zero boilerplate. Drop to renderToStream for custom headers.
2. **OG falls back to title/description** — no duplication for simple cases
3. **Viewport + charset not configurable** — there's no valid reason to omit these
4. **Scripts at end of body** — better loading performance, standard practice
5. **head escape hatch** — raw HTML string for anything not yet typed (favicons, preloads, structured data)
6. **Cloud-agnostic** — returns web-standard Response. Works on Cloudflare, Deno, AWS, Node, Bun.

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
