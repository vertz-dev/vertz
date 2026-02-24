# SSR + Tolerant Hydration Guide

Server-Side Rendering (SSR) in vertz sends pre-rendered HTML to the browser so users see content instantly. **Tolerant hydration** then attaches reactivity to that existing DOM — no re-render, no flash, no content loss.

This guide covers the full SSR-to-hydration pipeline using `@vertz/ui-server` and `@vertz/ui`.

---

## How SSR Works

The `@vertz/ui-server` package provides two main rendering functions:

### `renderToStream(vnode, options?)`

Renders a VNode tree to a `ReadableStream<Uint8Array>` of HTML chunks. This is the low-level SSR primitive.

- Walks the virtual tree and serializes synchronous content immediately
- Defers Suspense boundaries: emits a placeholder inline, then streams the resolved content once ready
- Enables **out-of-order streaming** — the browser paints fallback content first, then swaps in resolved content

```ts
import { renderToStream } from '@vertz/ui-server';

const stream = renderToStream(App());
```

### `renderPage(vnode, options?)`

High-level helper that wraps `renderToStream` in a full HTML document and returns a `Response` object — ready to send from any server or edge runtime.

```ts
import { renderPage } from '@vertz/ui-server';

const response = renderPage(App(), {
  title: 'My App',
  description: 'Built with vertz',
  lang: 'en',
  scripts: ['/assets/entry-client.js'],
  styles: ['/assets/app.css'],
  og: { image: '/og.png' },
});
```

`renderPage` handles:
- `<!DOCTYPE html>` and `<html lang="...">` wrapper
- `<head>` with charset, viewport, title, meta description, OG tags, Twitter cards, stylesheets
- `<body>` with streamed component content + script tags
- Returns a `Response` with `text/html; charset=utf-8` content type

---

## How Tolerant Hydration Works

After SSR HTML arrives in the browser, you need to "hydrate" — attach event handlers and reactivity to the existing DOM. Vertz provides **tolerant hydration** via the `mount()` function:

```ts
import { mount } from '@vertz/ui';

mount(App, '#root', { hydration: 'tolerant' });
```

### What happens under the hood

1. **`startHydration(root)`** — Enters hydration mode. Sets a cursor to the first child of the root element. A global `isHydrating` flag is flipped on.

2. **`app()` runs** — Your app function executes normally, but the DOM helpers (`el()`, `text()`, etc.) check the hydration flag. Instead of creating new DOM nodes, they **claim existing SSR nodes** by matching tag names and advancing the cursor. This is how event handlers, reactive bindings, and effects get attached to the server-rendered DOM.

3. **`endHydration()`** — Exits hydration mode. Resets the cursor and clears the hydration state.

### The cursor-based walker

The hydration context maintains:
- A **current node pointer** that advances through siblings
- A **cursor stack** for entering/exiting child trees (`enterChildren` / `exitChildren`)
- **Claim functions** (`claimElement`, `claimText`, `claimComment`) that match nodes by type and tag

Key behaviors:
- `claimElement(tag)` scans siblings for a matching `<TAG>` element, skipping non-matching nodes (e.g., browser extension injections)
- `claimText()` scans for the next text node
- `claimComment()` scans for comment nodes (used for conditional anchors like `<!-- conditional -->`)
- Foreign nodes injected by browser extensions are **gracefully skipped** — they don't break hydration

### Error recovery

If hydration fails for any reason (DOM mismatch, missing nodes, unexpected errors), `mount()` automatically **falls back to client-side rendering**:

```
[mount] Hydration failed — re-rendering from scratch (no data loss): <error>
```

The fallback:
1. Catches the error from the hydration attempt
2. Calls `endHydration()` to clean up hydration state
3. Runs cleanup on the disposed scope
4. Falls through to **replace mode** — clears the root and re-renders from scratch

This means tolerant hydration is truly "tolerant": the worst case is a brief flash while the app re-renders client-side, never a broken page.

### Empty root detection

If `mount()` is called with `hydration: 'tolerant'` but the root has no children (no SSR content), it logs a dev warning and falls through to replace mode automatically:

```
[mount] hydration: "tolerant" has no effect on an empty root (no SSR content found). Using replace mode.
```

---

## Cloudflare Workers Pattern

Here's the recommended file structure for SSR with Cloudflare Workers:

```
src/
├── App.ts          # Shared app component
├── entry-server.ts # SSR entry point
├── entry-client.ts # Client hydration entry point
└── worker.ts       # Cloudflare Worker handler
```

### `entry-server.ts` — Server rendering

```ts
import { renderPage } from '@vertz/ui-server';
import { App } from './App';

export function render(url: string): Response {
  return renderPage(App({ url }), {
    title: 'My App',
    description: 'Built with vertz',
    scripts: ['/assets/entry-client.js'],
    styles: ['/assets/app.css'],
  });
}
```

### `entry-client.ts` — Client hydration

```ts
import { mount } from '@vertz/ui';
import { App } from './App';

mount(App, '#root', { hydration: 'tolerant' });
```

That's it. One line to hydrate the entire app. The `mount()` function handles:
- Walking the SSR DOM
- Attaching all event handlers and reactive bindings
- Falling back to CSR if anything goes wrong

### `worker.ts` — Route splitting

```ts
import { render } from './entry-server';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request);
    }

    // Static assets (served by Cloudflare)
    if (url.pathname.startsWith('/assets/')) {
      return new Response('Not found', { status: 404 });
    }

    // All other routes — SSR
    return render(url.pathname);
  },
};

function handleApi(request: Request): Response {
  // Your API logic here
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
  });
}
```

The pattern is simple:
- `/api/*` → API handlers
- `/assets/*` → Static files (served by Cloudflare's asset pipeline)
- `/*` → SSR via `renderPage()`

---

## Common Mistakes

### ❌ DON'T reimplement `mount.ts`

The hydration logic in `mount()` handles scope management, cursor walking, error recovery, and cleanup. Don't try to call `startHydration()` / `endHydration()` manually or build your own hydration wrapper.

```ts
// ❌ Wrong — reimplementing mount internals
import { startHydration, endHydration } from '@vertz/ui/hydrate';
startHydration(root);
App();
endHydration();

// ✅ Right — use mount with tolerant mode
import { mount } from '@vertz/ui';
mount(App, '#root', { hydration: 'tolerant' });
```

### ❌ DON'T use plain `mount()` after SSR

Calling `mount()` without `hydration: 'tolerant'` uses **replace mode** by default. Replace mode clears the root element (`root.textContent = ''`) before rendering. This destroys all SSR content, causing a flash of empty content.

```ts
// ❌ Wrong — SSR content gets cleared, user sees a flash
mount(App, '#root');

// ✅ Right — SSR content is preserved and hydrated in place
mount(App, '#root', { hydration: 'tolerant' });
```

### ❌ DON'T pass an empty registry to `hydrate()`

The `hydrate()` function with a component registry is for **island/per-component hydration** — selectively hydrating specific components on the page. For **full-app hydration** after SSR, use `mount()` with tolerant mode instead.

```ts
// ❌ Wrong — hydrate() with empty registry does nothing useful
import { hydrate } from '@vertz/ui';
hydrate({});

// ✅ Right — mount() with tolerant mode for full-app hydration
import { mount } from '@vertz/ui';
mount(App, '#root', { hydration: 'tolerant' });
```

### ❌ DON'T manually pick a hydration strategy

`hydrate()` uses an automatic strategy based on viewport proximity (IntersectionObserver with 200px rootMargin). Above-fold components hydrate immediately; below-fold components hydrate when scrolled near. No `hydrate` attribute needed on elements.

```html
<!-- ❌ Wrong — manual strategy selection (no longer supported) -->
<div data-v-id="Counter" hydrate="eager">...</div>
<div data-v-id="Chart" hydrate="lazy">...</div>

<!-- ✅ Right — zero-config, framework picks the right timing -->
<div data-v-id="Counter">...</div>
<div data-v-id="Chart">...</div>
```

---

## Summary

| What | How |
|------|-----|
| Server-side render | `renderPage(App(), { ... })` from `@vertz/ui-server` |
| Stream raw HTML | `renderToStream(vnode)` from `@vertz/ui-server` |
| Client hydration | `mount(App, '#root', { hydration: 'tolerant' })` from `@vertz/ui` |
| Error recovery | Automatic — falls back to CSR on mismatch |
| Island hydration | Use `hydrate(registry)` — auto strategy via IntersectionObserver |
