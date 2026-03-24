# Progressive HTML Streaming

> **Rev 2** — Updated after DX, Product/Scope, and Technical design reviews.

## Context

Benchmark analysis against TanStack Start revealed that Vertz's SSR pipeline has two fundamental architectural bottlenecks:

1. **Two-pass rendering:** The component tree is executed twice per request — once for query discovery, once for rendering with data. TanStack renders once using React's streaming renderer with Suspense boundaries.

2. **Full buffering:** Even though `renderToStream()` exists, the result is immediately collected into a single string via `streamToString()`, then `injectIntoTemplate()` does 4-5 string `.replace()` operations on the full HTML, and the whole string is passed to `new Response(html)`. Zero bytes reach the client until the entire page is rendered.

These two issues combine: the client waits for two full tree traversals PLUS string buffering before receiving any content.

**This design focuses on bottleneck #2: progressive streaming.** The two-pass → single-pass transition is already partially addressed by `ssr-single-pass.ts` (discovery pass + render pass) and the zero-discovery fast path (manifest-driven prefetch). True single-pass rendering with Suspense-like boundaries is a separate, larger effort tracked in #1813.

### Current pipeline (per request)

```
createApp()          → Pass 1: discover queries
await queries        → resolve data
createApp()          → Pass 2: render to stream
streamToString()     → collect entire stream into string
injectIntoTemplate() → 4-5 string.replace() on full HTML
new Response(html)   → send entire page at once
```

### Target pipeline (per request)

```
discovery pass       → capture queries + detect redirects + match routes
await queries        → resolve data (unchanged)
render pass          → render to stream
                     → stream <head> immediately (CSS, preloads, theme, per-route modulepreload)
                     → stream app HTML chunks as they're rendered
                     → stream <script> tags with SSR data
                     → stream closing </body></html>
                     → (if pending queries) stream component data chunks
```

The client receives `<head>` content (stylesheets, preloads, fonts) while `<body>` is still rendering. The browser begins parsing CSS, fetching fonts, and setting up the CSSOM before app HTML arrives. This directly improves TTFB and FCP.

## API Surface

### No public API change for most users

The `createSSRHandler()` function already returns `(Request) => Promise<Response>`. The change is internal — the Response body becomes a `ReadableStream` instead of a buffered string.

```typescript
// Production handler — opt in to progressive streaming
import { createSSRHandler } from '@vertz/ui-server';

const handler = createSSRHandler({
  module,
  template,
  ssrTimeout: 300,
  // NEW: opt in to progressive HTML streaming (default: false)
  progressiveHTML: true,
});

// handler(request) now returns a streaming Response
```

### New option: `progressiveHTML`

```typescript
export interface SSRHandlerOptions {
  // ...existing fields
  /**
   * Enable progressive HTML streaming. Default: false.
   *
   * When true, the Response body is a ReadableStream that sends
   * <head> content (CSS, preloads, fonts) before <body> rendering
   * is complete. This improves TTFB and FCP.
   *
   * When false, the existing buffered behavior is used (entire HTML
   * generated before any bytes are sent).
   *
   * Note: this is distinct from *component streaming* (streaming slow
   * query data via <script> chunks after initial HTML). Both compose
   * together — progressive HTML streams the initial page structure,
   * component streaming streams late-arriving data.
   */
  progressiveHTML?: boolean;
}
```

**Why `progressiveHTML` instead of `streaming`:** The name `streaming` is ambiguous — Vertz already has "component streaming" (streaming slow query *data* via `<script>` tags). `progressiveHTML` clearly describes what this option does: progressively stream the HTML document structure. This avoids confusion in docs, error messages, and stack traces.

**Why `false` by default:** This is a behavioral change — the response body type changes from string to ReadableStream. Middleware that calls `response.text()` or inspects the body as a string would break. Defaulting to `false` lets users opt in when ready. We can flip the default in a future release after ecosystem adoption.

### No new public lower-level API

The existing `renderToHTMLStream()` in `render-to-html.ts` handles **component streaming** (streaming slow query data after initial HTML). Progressive HTML streaming is an internal optimization within `createSSRHandler()` — it doesn't need a separate public function.

The progressive streaming logic lives in a new internal module (`ssr-progressive-response.ts`) that `ssr-handler.ts` calls when `progressiveHTML: true`. Users who need the lower-level API continue using `renderToHTMLStream()` for component streaming or `renderToHTML()` for buffered output.

### `renderToHTML()` — unchanged

```typescript
// Existing API — still returns Promise<string>, buffered
const html = await renderToHTML(module, url, options);
```

## Architecture

### Template splitting

The HTML template is split at the `<!--ssr-outlet-->` marker (or `<div id="app">`) into:

```
┌─ headChunk ──────────────────────────────┐
│ <!DOCTYPE html><html><head>              │
│   <meta charset="utf-8">                 │
│   {theme CSS}                            │
│   {component CSS from getInjectedCSS()}  │
│   {font preloads}                        │
│   {per-route modulepreload links}        │
│   {session script}                       │
│ </head><body><div id="app">              │
└──────────────────────────────────────────┘
┌─ appChunks (streamed) ───────────────────┐
│   {app HTML from renderToStream()}       │
└──────────────────────────────────────────┘
┌─ tailChunk ──────────────────────────────┐
│ </div>                                   │
│   {SSR data script}                      │
│ </body></html>                           │
└──────────────────────────────────────────┘
┌─ componentStreamChunks (if pending) ─────┐
│   {<script> tags for late query data}    │
│   (appended after </html> — valid HTML)  │
└──────────────────────────────────────────┘
```

The `headChunk` is sent immediately after discovery + prefetch complete (but before render starts). App HTML chunks are piped through as they come from `renderToStream()`. The `tailChunk` is sent after the render stream closes. If component streaming has pending queries, those `<script>` chunks are appended after the tail — the stream stays open until all pending queries resolve or time out.

### Component CSS injection timing

Component-level CSS from `css()` calls is collected via `getInjectedCSS()`. Since Vertz SSR uses a discovery pass before rendering, CSS from module-level `css()` calls (which execute during import/discovery) is available before the head chunk is sent. Per-render CSS (from `css()` calls inside component bodies) is also available because the discovery pass exercises the component tree.

**Edge case:** If a component's `css()` call is conditional (only runs in certain branches), the CSS may not be discovered. This is an existing limitation of the discovery pass, not introduced by progressive streaming. The mitigation is unchanged: module-level `css()` calls are always discovered; conditional `css()` within components should be avoided.

### Template pre-processing (at handler creation, not per-request)

At `createSSRHandler()` time:
1. Split template at the outlet marker
2. Pre-inject CSS inlining into the head portion (link → style replacement)
3. Pre-compute theme CSS and font preloads (already cached via `compileThemeCached`)
4. Pre-compute static modulepreload tags (all-routes fallback)
5. Store `headTemplate` and `tailTemplate` as strings

Per-request:
1. Run discovery pass → detect redirects, match routes, capture queries
2. If redirect detected → return 302 immediately (no streaming)
3. Prefetch discovered queries
4. Resolve per-route modulepreload tags from discovery's matched route patterns
5. Inject session script + per-route modulepreload into `headTemplate`
6. Send `headChunk` immediately
7. Run render pass → pipe app HTML chunks from `renderToStream()`
8. Build `tailChunk` with SSR data script
9. Send `tailChunk`
10. If pending queries → keep stream open, send component data chunks as they resolve
11. Close stream

### Avoiding string.replace() per request

Today `injectIntoTemplate()` does 4-5 `.replace()` calls on the full HTML string. With progressive streaming, we pre-split the template once and compose the response from pre-computed parts + dynamic data.

Static parts (computed once at handler creation):
- Theme CSS `<style>` tag
- Font preload `<link>` tags
- Static modulepreload `<link>` tags (all-routes fallback)
- Inlined CSS (link → style replacement)

Dynamic parts (per-request):
- Session script (depends on request cookies)
- Per-route modulepreload (depends on matched route — resolved after discovery, before head is sent)
- Component CSS from `getInjectedCSS()` (collected during discovery)
- App HTML (from render)
- SSR data script (from resolved queries)

### CSS link → async loading

Currently `injectIntoTemplate()` converts `<link rel="stylesheet">` to async-loading pattern when inline CSS is present. With streaming, this conversion happens once during template pre-processing, not per-request.

### Per-route modulepreload placement (Unknown #3 — resolved)

**Resolution: option (b) — route matching before render.**

The discovery pass already exercises the router, which matches the URL to route patterns. `ssrRenderSinglePass()` returns `matchedRoutePatterns` after the discovery phase. Since progressive streaming sends the head chunk *after* discovery (when queries are prefetching / already resolved), the matched route patterns are available.

The flow:
1. Discovery pass runs → `matchedRoutePatterns` captured
2. Queries prefetch
3. Per-route modulepreload tags computed from `routeChunkManifest[pattern]`
4. Head chunk assembled with per-route modulepreload
5. Head chunk sent
6. Render pass starts

This gives the browser the most targeted preload hints as early as possible — better than deferring to the tail.

### Redirect handling

Redirects are detected during the **discovery pass** (before render and before streaming begins). The `ssrRenderSinglePass()` function checks `discoveryCtx.ssrRedirect` after running the component tree for discovery. If a redirect is detected, a `302 Response` is returned immediately — no head chunk is sent, no stream is created.

**Zero-discovery fast path:** When using a prefetch manifest with `routeEntries`, there is no discovery pass — the render is the first (and only) pass. In this case, redirects cannot be detected before rendering starts. To avoid sending a partial head followed by a redirect:
- The zero-discovery path always uses **buffered rendering** (not progressive streaming), even when `progressiveHTML: true`.
- This is safe because zero-discovery is already the fastest path — the render produces HTML in a single pass with pre-populated data, so the buffering overhead is minimal.
- If the buffered render detects a redirect, a 302 is returned as usual.

This means `progressiveHTML` has no effect on zero-discovery routes. Progressive streaming benefits the discovery-based paths (where the discovery → prefetch → render pipeline has natural latency that progressive streaming hides).

### Error handling

**After head is sent, the HTTP status code is already 200.** Errors must be communicated in-band. This matches React's streaming SSR behavior.

**Production behavior:**
If the render crashes after `headChunk` has been sent:
1. The error is caught by `buildProgressiveResponse()`'s stream controller
2. An error script chunk is enqueued: `<script nonce="...">document.dispatchEvent(new CustomEvent('vertz:ssr-error',{detail:{message:'...'}}))</script>`
3. The stream is closed (tail chunk is still sent to produce valid HTML structure)
4. The client-side error handler (installed by the hydration runtime) listens for `vertz:ssr-error` and shows a fallback UI
5. Error is logged to the server console: `[SSR] Render error after head sent: <message>`

**Development behavior:**
Same as production, plus:
1. The error chunk includes the full stack trace in `detail.stack`
2. The dev error overlay (WebSocket-based) also receives the error via the `/__vertz_errors` channel with category `ssr`
3. The dev server's `generateSSRPageHtml` falls back to the existing buffered path (no streaming in dev initially — see Phase 4)

**If the render crashes before head is sent** (during discovery or prefetch):
- A standard `500 Internal Server Error` response is returned (same as current behavior)
- No stream is created

### Link header (Early Hints)

The `Link` header with font preload hints is set before streaming begins (it's part of the Response headers). This enables the browser to start fetching fonts even before parsing the HTML.

### Interaction with component streaming

Progressive HTML streaming and component streaming are orthogonal features that compose naturally:

1. **Progressive HTML streaming** (this design): Streams `<head>` before `<body>` rendering completes. Improves TTFB/FCP.
2. **Component streaming** (existing `renderToHTMLStream`): Streams late-arriving query data as `<script>` chunks after initial HTML. Improves perceived loading for slow queries.

When both are active:
- The progressive stream sends head → app HTML → tail (with SSR data for resolved queries)
- If there are pending queries (timed out during prefetch), the stream stays open after the tail
- Component streaming `<script>` chunks are appended after `</html>` as the pending queries resolve
- The stream closes when all pending queries resolve or the hard timeout fires

The tail chunk includes the component streaming runtime script (from `getStreamingRuntimeScript()`) when there are pending queries, so the client is ready to receive late data chunks.

## Manifesto Alignment

- **Principle 7 (Performance is not optional):** Progressive streaming directly improves TTFB and FCP. The browser starts work sooner — parsing CSS, fetching fonts, constructing CSSOM — instead of waiting for the full page.
- **Principle 1 (If it builds, it works):** No type-level changes. The Response type is the same; the body changes from string to stream internally.
- **Principle 2 (One way to do things):** Progressive streaming is opt-in via `progressiveHTML: true`. Once ecosystem adoption confirms stability, the default can be flipped. The `progressiveHTML: false` path preserves the existing buffered behavior.

## Non-Goals

- **Single-pass rendering / Suspense boundaries:** This design keeps the existing two-pass (or single-pass where available) render. Eliminating the discovery pass entirely requires Suspense-like boundaries (tracked in #1813).
- **HTML chunk streaming for slow queries:** The existing component streaming design handles streaming *data* for slow queries via `<script>` tags. This design is about streaming the *initial HTML document structure* progressively. They compose well (see "Interaction with component streaming" above).
- **Node adapter optimization:** The report identified Web API conversion overhead on Node. That's an adapter concern, not a rendering concern.
- **AOT string-template rendering:** The AOT pipeline already skips the DOM shim for matched routes. Progressive streaming benefits AOT too (the AOT-rendered string is sent as the app chunk).
- **Dev server streaming (Phase 4):** The dev server uses `generateSSRPageHtml()`, not `injectIntoTemplate()`. Phase 4 is scoped to preparing the dev server for streaming but may initially keep buffered rendering for stability. Streaming in dev can follow once production is validated.

## Unknowns

1. **`injectIntoTemplate` consumers beyond the handler:** Need to audit all callers. Pre-render/SSG pipeline, dev server — do they need the full string? If so, they can continue using `renderToHTML()` which buffers internally. **Resolution: audit in Phase 1. Known consumers: `ssr-handler.ts` (replaced by streaming path), `bun-dev-server.ts` (uses `generateSSRPageHtml` — separate code path, not affected).**

2. **Bun.serve() streaming behavior:** Bun's HTTP server must handle `ReadableStream` response bodies correctly with proper backpressure. Need to verify chunked transfer encoding works as expected. **Resolution: POC in Phase 2. The existing component streaming (`renderToHTMLStream` in `render-to-html.ts`) already uses ReadableStream responses, so Bun's streaming support is exercised. This POC validates the specific chunked head→body→tail pattern.**

## Type Flow Map

No new generics introduced. The key type changes:

```
SSRHandlerOptions.progressiveHTML: boolean
  → createSSRHandler() reads it at creation time
    → handleHTMLRequest() branches: progressive path vs buffered path
      → progressive: sends head before render, pipes render stream, appends tail
      → buffered: existing injectIntoTemplate() path (unchanged)

buildProgressiveResponse() → ReadableStream<Uint8Array>  [internal, not exported]
  chunk 1: headChunk (pre-computed template head + per-request session + per-route modulepreload)
  chunk 2..N: app HTML from renderToStream()
  chunk N+1: tailChunk (SSR data script + template tail)
  chunk N+2..M: component streaming <script> chunks (if pending queries)
```

## E2E Acceptance Test

```typescript
describe('Feature: Progressive HTML streaming', () => {
  describe('Given a handler with progressiveHTML: true', () => {
    describe('When a page request is made', () => {
      it('Then the response body is a ReadableStream, not a buffered string', async () => {
        const handler = createSSRHandler({ module, template, progressiveHTML: true });
        const response = await handler(new Request('http://localhost/'));
        expect(response.body).toBeInstanceOf(ReadableStream);
      });

      it('Then the first chunk contains <head> with theme CSS and preloads', async () => {
        const handler = createSSRHandler({ module, template, progressiveHTML: true });
        const response = await handler(new Request('http://localhost/'));
        const reader = response.body!.getReader();
        const { value } = await reader.read();
        const firstChunk = new TextDecoder().decode(value);
        expect(firstChunk).toContain('<head>');
        expect(firstChunk).toContain('data-vertz-css');
        expect(firstChunk).toContain('<div id="app">');
        reader.releaseLock();
      });

      it('Then the last chunk contains SSR data script and </body>', async () => {
        const handler = createSSRHandler({ module, template, progressiveHTML: true });
        const response = await handler(new Request('http://localhost/'));
        const chunks = await collectStreamChunks(response);
        const lastChunk = chunks[chunks.length - 1];
        expect(lastChunk).toContain('__VERTZ_SSR_DATA__');
        expect(lastChunk).toContain('</body>');
      });

      it('Then per-route modulepreload tags are in the head chunk', async () => {
        const handler = createSSRHandler({
          module, template, progressiveHTML: true,
          routeChunkManifest: { routes: { '/': ['chunk-abc.js'] } },
        });
        const response = await handler(new Request('http://localhost/'));
        const reader = response.body!.getReader();
        const { value } = await reader.read();
        const firstChunk = new TextDecoder().decode(value);
        expect(firstChunk).toContain('modulepreload');
        expect(firstChunk).toContain('chunk-abc.js');
        reader.releaseLock();
      });
    });
  });

  describe('Given a handler with default options (progressiveHTML not set)', () => {
    describe('When a page request is made', () => {
      it('Then the response is a buffered string (backward compatible)', async () => {
        const handler = createSSRHandler({ module, template });
        const response = await handler(new Request('http://localhost/'));
        const html = await response.text();
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('</html>');
      });
    });
  });

  describe('Given a redirect during SSR discovery', () => {
    describe('When progressiveHTML is enabled', () => {
      it('Then returns 302 without streaming partial HTML', async () => {
        const handler = createSSRHandler({ module: redirectModule, template, progressiveHTML: true });
        const response = await handler(new Request('http://localhost/protected'));
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('/login');
      });
    });
  });

  describe('Given a zero-discovery manifest route', () => {
    describe('When progressiveHTML is enabled', () => {
      it('Then falls back to buffered rendering (no progressive stream)', async () => {
        const handler = createSSRHandler({
          module, template, progressiveHTML: true,
          manifest: { routePatterns: ['/'], routeEntries: { '/': { queries: [] } } },
        });
        const response = await handler(new Request('http://localhost/'));
        // Zero-discovery always buffers — response is complete string
        const html = await response.text();
        expect(html).toContain('<!DOCTYPE html>');
      });
    });
  });

  describe('Given a render error after head is sent', () => {
    describe('When progressiveHTML is enabled', () => {
      it('Then emits an error script chunk and closes the stream', async () => {
        const handler = createSSRHandler({ module: errorModule, template, progressiveHTML: true });
        const response = await handler(new Request('http://localhost/'));
        const chunks = await collectStreamChunks(response);
        const allHtml = chunks.join('');
        expect(allHtml).toContain('vertz:ssr-error');
        expect(allHtml).toContain('</body>');
      });
    });
  });

  // @ts-expect-error — progressiveHTML: 'invalid' is not boolean
  createSSRHandler({ module, template, progressiveHTML: 'invalid' });
});
```

## Implementation Plan

### Phase 1: Template splitter and pre-processor

Extract the template splitting logic into a dedicated module that runs once at handler creation time.

**Files:** `packages/ui-server/src/template-split.ts` (new)

**Acceptance criteria:**
```typescript
describe('Given an HTML template with <!--ssr-outlet-->', () => {
  describe('When splitTemplate() is called', () => {
    it('Then returns headTemplate ending at the outlet marker', () => {});
    it('Then returns tailTemplate starting after the outlet marker', () => {});
  });
});

describe('Given an HTML template with <div id="app">', () => {
  describe('When splitTemplate() is called', () => {
    it('Then returns headTemplate ending after the div opening tag', () => {});
    it('Then returns tailTemplate starting with </div>', () => {});
  });
});

describe('Given a template with neither ssr-outlet nor div#app', () => {
  describe('When splitTemplate() is called', () => {
    it('Then throws a descriptive error', () => {});
  });
});

describe('Given inlineCSS options', () => {
  describe('When splitTemplate() is called', () => {
    it('Then link tags in headTemplate are replaced with inline styles', () => {});
    it('Then linked stylesheets are converted to async loading', () => {});
  });
});
```

### Phase 2: Progressive response builder

Build the `ReadableStream` from pre-computed head + render stream + tail.

**Files:** `packages/ui-server/src/ssr-progressive-response.ts` (new)

**Acceptance criteria:**
```typescript
describe('Given head, render stream, and tail chunks', () => {
  describe('When buildProgressiveResponse() is called', () => {
    it('Then first readable chunk is the head', () => {});
    it('Then middle chunks come from the render stream', () => {});
    it('Then final chunk is the tail with SSR data', () => {});
    it('Then the stream is closed after the tail', () => {});
  });
});

describe('Given a render stream that errors mid-way', () => {
  describe('When the error occurs after head is sent', () => {
    it('Then an error script chunk is emitted', () => {});
    it('Then the tail chunk is still sent (valid HTML structure)', () => {});
    it('Then the stream is closed', () => {});
    it('Then the error is logged to console', () => {});
  });
});

describe('Given a render stream with pending component streaming queries', () => {
  describe('When the render completes', () => {
    it('Then the tail includes the streaming runtime script', () => {});
    it('Then component data chunks are appended after the tail', () => {});
    it('Then the stream closes after all pending queries resolve', () => {});
  });
});

describe('Given a nonce option', () => {
  describe('When an error script is emitted', () => {
    it('Then the script tag includes the nonce attribute', () => {});
  });
});
```

### Phase 3: Wire into createSSRHandler

Add the `progressiveHTML` option to `createSSRHandler` and branch in `handleHTMLRequest()`.

**Files:** `packages/ui-server/src/ssr-handler.ts` (modified)

**Acceptance criteria:**
```typescript
describe('Given createSSRHandler with progressiveHTML: true', () => {
  describe('When handling a page request', () => {
    it('Then returns a streaming Response with ReadableStream body', () => {});
    it('Then Link header includes font preloads', () => {});
    it('Then first chunk contains <head> with CSS', () => {});
    it('Then per-route modulepreload is in the head chunk', () => {});
  });
});

describe('Given createSSRHandler without progressiveHTML (default)', () => {
  describe('When handling a page request', () => {
    it('Then returns a buffered Response (existing behavior)', () => {});
  });
});

describe('Given a redirect during discovery', () => {
  describe('When progressiveHTML is enabled', () => {
    it('Then returns 302 without any streamed content', () => {});
  });
});

describe('Given a session resolver', () => {
  describe('When progressiveHTML is enabled', () => {
    it('Then session script is in the head chunk', () => {});
  });
});

describe('Given a zero-discovery manifest route', () => {
  describe('When progressiveHTML is enabled', () => {
    it('Then falls back to buffered rendering', () => {});
  });
});
```

### Phase 4: Dev server preparation

The dev server uses `generateSSRPageHtml()` (which builds the HTML string directly, not via `injectIntoTemplate`). This phase prepares the dev server for progressive streaming but **keeps buffered rendering as the default in dev**.

**Files:** `packages/ui-server/src/bun-dev-server.ts` (modified)

**Scope:**
1. Refactor `generateSSRPageHtml()` to use `splitTemplate()` internally (shared template splitting logic)
2. Add a `progressiveHTML` option to `BunDevServerOptions` (default: `false`)
3. When enabled, the dev server uses `buildProgressiveResponse()` for SSR requests
4. HMR error overlay script, reload guard, and build error loader must be in the head chunk
5. Dev-specific scripts (source map resolver, editor integration) go in the head chunk

**Acceptance criteria:**
```typescript
describe('Given the dev server with progressiveHTML: false (default)', () => {
  describe('When a page request is made', () => {
    it('Then the response is buffered (existing behavior)', () => {});
  });
});

describe('Given the dev server with progressiveHTML: true', () => {
  describe('When a page request is made', () => {
    it('Then the response is streamed progressively', () => {});
    it('Then HMR error overlay script is in the head chunk', () => {});
    it('Then reload guard script is in the head chunk', () => {});
    it('Then build error loader script is in the head chunk', () => {});
  });
});
```

### Phase 5: Benchmark validation

Run the SSR benchmarks with progressive streaming enabled and measure TTFB/FCP improvements.

**Test scenario:** The entity-todo example app with 50 pre-seeded tasks, measuring against:
- Baseline: `progressiveHTML: false` (buffered, current behavior)
- Progressive: `progressiveHTML: true`
- Each measured over 100 requests after 10 warmup requests
- Bun.serve() on localhost, single worker

**Acceptance criteria:**
- TTFB improves measurably vs buffered (head is sent before body renders — improvement depends on page complexity and is proportional to render time)
- Total response time has no significant regression from streaming overhead (< 5% increase acceptable)
- All existing SSR tests pass with `progressiveHTML: true`
- All existing SSR tests pass with `progressiveHTML: false` (backward compat)
- Memory profile: peak RSS is not higher with streaming (avoids full-string buffering)

**Note on memory:** Progressive streaming avoids building the complete HTML string in memory before sending. However, the individual chunks (head, render stream, tail) still exist in memory. The benefit is that the head chunk can be GC'd while the render is still producing HTML, reducing peak memory for large pages. This is not truly incremental rendering (that requires Suspense-like boundaries — #1813).

## Key Files

| File | Change |
|------|--------|
| `packages/ui-server/src/template-split.ts` | **New:** Pre-split template into head/tail at handler creation |
| `packages/ui-server/src/ssr-progressive-response.ts` | **New:** Build ReadableStream from head + render stream + tail |
| `packages/ui-server/src/ssr-handler.ts` | Add `progressiveHTML` option, wire progressive path into `handleHTMLRequest()` |
| `packages/ui-server/src/template-inject.ts` | Unchanged (still used by `progressiveHTML: false` path, `renderToHTML()`, dev server) |
| `packages/ui-server/src/bun-dev-server.ts` | Refactor `generateSSRPageHtml` to use shared template splitting; optional progressive mode |
| `packages/ui-server/src/ssr-single-pass.ts` | Minor: expose matched route patterns earlier for head chunk assembly |
| `packages/ui-server/src/render-to-html.ts` | Unchanged — `renderToHTMLStream()` remains the component streaming API |

## Reusable Infrastructure

- `renderToStream()` in `render-to-stream.ts` — already produces a `ReadableStream<Uint8Array>` from vnodes
- `encodeChunk()` in `streaming.ts` — string → Uint8Array
- `compileThemeCached()` in `ssr-render.ts` — cached theme compilation
- `safeSerialize()` in `ssr-streaming-runtime.ts` — XSS-safe JSON serialization
- `getStreamingRuntimeScript()` in `ssr-streaming-runtime.ts` — component streaming bootstrap
- `buildModulepreloadTags()` in `ssr-handler.ts` — modulepreload link generation (already exists)

## Verification

1. `bun test packages/ui-server/` — all server tests pass
2. `bunx tsc --noEmit -p packages/ui-server/tsconfig.json` — typecheck clean
3. `bunx biome check packages/ui-server/src/` — lint clean
4. Benchmark: TTFB measurement with progressive vs buffered (scenario defined in Phase 5)
5. Manual: `cd examples/entity-todo && bun run dev` — SSR works, page loads correctly

## Review Resolution Log

| Finding | Source | Resolution |
|---------|--------|------------|
| `renderToHTMLStream()` naming collision | DX, Technical | No new public API. Progressive streaming is internal to `ssr-handler.ts`. Existing `renderToHTMLStream()` in `render-to-html.ts` is unchanged (component streaming). |
| `streaming: true` default is breaking | DX, Technical | Renamed to `progressiveHTML`, default `false`. Explicit opt-in. |
| `streaming` name ambiguous with component streaming | DX | Renamed to `progressiveHTML`. |
| Unknown #3: per-route modulepreload placement | Product, DX, Technical | Option (b): route matching during discovery, before render. Matched patterns available before head is sent. |
| Redirect detection for zero-discovery path | Technical | Zero-discovery always uses buffered rendering, even with `progressiveHTML: true`. Redirects handled by checking after render. |
| Component streaming + tail chunk interaction | Technical | Clarified: component streaming `<script>` chunks append after tail. Stream stays open for pending queries. |
| Phase 4 uses `generateSSRPageHtml`, not `injectIntoTemplate` | Technical | Phase 4 updated: refactor `generateSSRPageHtml` to share template splitting logic, optional progressive mode. |
| Error handling needs more detail | Technical | Expanded: dev vs prod behavior, nonce on error scripts, logging, tail still sent for valid HTML. |
| Benchmark metrics need qualification | Technical | Added: specific test scenario (entity-todo, 50 tasks, 100 requests), qualified improvement claims. |
| Memory claims need qualification | Technical | Clarified: benefit is avoiding full-string buffering, not truly incremental rendering. |
| Phase 2 acceptance criteria incomplete | Technical | Added: error handling, component streaming, nonce scenarios. |
| CSS injection timing for per-render CSS | DX | Added: "Component CSS injection timing" section explaining discovery pass collects CSS. |
