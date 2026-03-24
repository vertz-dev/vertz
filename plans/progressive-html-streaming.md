# Progressive HTML Streaming

## Context

Benchmark analysis against TanStack Start revealed that Vertz's SSR pipeline has two fundamental architectural bottlenecks:

1. **Two-pass rendering:** The component tree is executed twice per request — once for query discovery, once for rendering with data. TanStack renders once using React's streaming renderer with Suspense boundaries.

2. **Full buffering:** Even though `renderToStream()` exists, the result is immediately collected into a single string via `streamToString()`, then `injectIntoTemplate()` does 4-5 string `.replace()` operations on the full HTML, and the whole string is passed to `new Response(html)`. Zero bytes reach the client until the entire page is rendered.

These two issues combine: the client waits for two full tree traversals PLUS string buffering before receiving any content.

**This design focuses on bottleneck #2: progressive streaming.** The two-pass → single-pass transition is already partially addressed by `ssr-single-pass.ts` (discovery pass + render pass) and the zero-discovery fast path (manifest-driven prefetch). True single-pass rendering with Suspense-like boundaries is a separate, larger effort.

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
createApp()          → Pass 1: discover queries
await queries        → resolve data (unchanged)
createApp()          → Pass 2: render to stream
                     → stream <head> immediately (CSS, preloads, theme)
                     → stream app HTML chunks as they're rendered
                     → stream <script> tags with SSR data
                     → stream closing </body></html>
```

The client receives `<head>` content (stylesheets, preloads, fonts) while `<body>` is still rendering. The browser begins parsing CSS, fetching fonts, and setting up the CSSOM before app HTML arrives. This directly improves TTFB and FCP.

## API Surface

### No public API change for most users

The `createSSRHandler()` function already returns `(Request) => Promise<Response>`. The change is internal — the Response body becomes a `ReadableStream` instead of a buffered string.

```typescript
// Production handler — no API change
import { createSSRHandler } from '@vertz/ui-server';

const handler = createSSRHandler({
  module,
  template,
  ssrTimeout: 300,
  // NEW: opt out of streaming if needed (default: true)
  streaming: true,
});

// handler(request) now returns a streaming Response
```

### New option: `streaming`

```typescript
export interface SSRHandlerOptions {
  // ...existing fields
  /**
   * Enable progressive HTML streaming. Default: true.
   *
   * When true, the Response body is a ReadableStream that sends
   * <head> content before <body> rendering is complete.
   *
   * Set to false to restore the previous buffered behavior
   * (entire HTML generated before any bytes are sent).
   */
  streaming?: boolean;
}
```

### `renderToHTMLStream()` — lower-level API

For users building custom server adapters:

```typescript
import { renderToHTMLStream } from '@vertz/ui-server';

const response = await renderToHTMLStream(module, url, {
  template,
  ssrTimeout: 300,
  nonce: 'abc123',
  fallbackMetrics,
});
// response.body is a ReadableStream<Uint8Array>
```

### `renderToHTML()` — unchanged

```typescript
// Existing API — still returns Promise<string>, uses streaming internally
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
│   {font preloads}                        │
│   {modulepreload links}                  │
│   {session script}                       │
│ </head><body><div id="app">              │
└──────────────────────────────────────────┘
┌─ appChunks (streamed) ───────────────────┐
│   {app HTML from renderToStream()}       │
└──────────────────────────────────────────┘
┌─ tailChunk ──────────────────────────────┐
│ </div>                                   │
│   {SSR data script}                      │
│   {component streaming runtime}          │
│ </body></html>                           │
└──────────────────────────────────────────┘
```

The `headChunk` is sent immediately. App HTML chunks are piped through as they come from `renderToStream()`. The `tailChunk` is sent after the render stream closes.

### Template pre-processing (at handler creation, not per-request)

At `createSSRHandler()` time:
1. Split template at the outlet marker
2. Pre-inject CSS inlining into the head portion
3. Pre-compute theme CSS and font preloads (already cached via `compileThemeCached`)
4. Pre-compute modulepreload tags
5. Store `headTemplate` and `tailTemplate` as strings

Per-request:
1. Inject session script into `headTemplate` (if sessionResolver)
2. Send `headChunk` immediately
3. Pipe app HTML chunks from `renderToStream()`
4. Build `tailChunk` with SSR data script
5. Send `tailChunk` and close

### Avoiding string.replace() per request

Today `injectIntoTemplate()` does 4-5 `.replace()` calls on the full HTML string. With streaming, we pre-split the template once and compose the response from pre-computed parts + dynamic data.

Static parts (computed once at handler creation):
- Theme CSS `<style>` tag
- Font preload `<link>` tags
- Modulepreload `<link>` tags
- Inlined CSS (link → style replacement)

Dynamic parts (per-request):
- Session script (depends on request cookies)
- Per-route modulepreload (depends on matched route — BUT can be deferred to tail)
- App HTML (from render)
- SSR data script (from resolved queries)

### CSS link → async loading

Currently `injectIntoTemplate()` converts `<link rel="stylesheet">` to async-loading pattern when inline CSS is present. With streaming, this conversion happens once during template pre-processing, not per-request.

### Redirect handling

If SSR detects a redirect (e.g., `ProtectedRoute` writes `ssrRedirect`), the render is aborted and a `302 Response` is returned instead of the stream. Since redirects are detected during Pass 1 (discovery) before streaming begins, no partial HTML has been sent.

### Error handling

If the render crashes after `headChunk` has been sent:
- The stream is closed with an error chunk: `<script>document.dispatchEvent(new Event('vertz:ssr-error'))</script>`
- The client error handler shows a fallback
- HTTP status is already 200 (sent with headChunk), so the error is in-band

This matches React's streaming SSR behavior — once bytes are on the wire, you can't change the status code.

### Link header (Early Hints)

The `Link` header with font preload hints is set before streaming begins (it's part of the Response headers). This enables the browser to start fetching fonts even before parsing the HTML.

## Manifesto Alignment

- **Principle 7 (Performance is not optional):** Progressive streaming directly improves TTFB and FCP. The browser starts work sooner — parsing CSS, fetching fonts, constructing CSSOM — instead of waiting for the full page.
- **Principle 1 (If it builds, it works):** No type-level changes. The Response type is the same; the body changes from string to stream internally.
- **Principle 2 (One way to do things):** Streaming is the default. The `streaming: false` escape hatch exists for edge cases (e.g., middleware that needs the full HTML string) but is not the recommended path.

## Non-Goals

- **Single-pass rendering / Suspense boundaries:** This design keeps the existing two-pass (or single-pass where available) render. Eliminating the discovery pass entirely requires Suspense-like boundaries (a separate design effort).
- **HTML chunk streaming for slow queries:** The existing `component-streaming.md` design handles streaming *data* for slow queries via `<script>` tags. This design is about streaming the *initial HTML* progressively. They compose well — the component streaming `<script>` tags would be appended to the tail.
- **Node adapter optimization:** The report identified Web API conversion overhead on Node. That's an adapter concern, not a rendering concern.
- **AOT string-template rendering:** The AOT pipeline already skips the DOM shim for matched routes. Progressive streaming benefits AOT too (the AOT-rendered string is sent as the app chunk).

## Unknowns

1. **`injectIntoTemplate` consumers beyond the handler:** Need to audit all callers. Pre-render/SSG pipeline, dev server — do they need the full string? If so, they can continue using `renderToHTML()` which buffers internally.

2. **Bun.serve() streaming behavior:** Bun's HTTP server must handle `ReadableStream` response bodies correctly with proper backpressure. Need to verify chunked transfer encoding works as expected. **Resolution: needs POC.**

3. **Per-route modulepreload in head vs tail:** Currently, per-route modulepreload tags require knowing the matched route pattern, which is only available after rendering. Options: (a) put them in the tail chunk, (b) move route matching before render, (c) use the static (all-routes) modulepreload in head and per-route in tail. **Resolution: discuss in design review.**

## Type Flow Map

No new generics introduced. The key type changes:

```
SSRHandlerOptions.streaming: boolean
  → createSSRHandler() reads it
    → handleHTMLRequest() branches: streaming path vs buffered path
      → streaming: returns Response with ReadableStream body
      → buffered: existing injectIntoTemplate() path (unchanged)

renderToHTMLStream() → Promise<Response>
  body: ReadableStream<Uint8Array>
    chunk 1: headChunk (pre-computed template head + per-request session)
    chunk 2..N: app HTML from renderToStream()
    chunk N+1: tailChunk (SSR data script + template tail)
```

## E2E Acceptance Test

```typescript
describe('Feature: Progressive HTML streaming', () => {
  describe('Given a handler with streaming enabled (default)', () => {
    describe('When a page request is made', () => {
      it('Then the response body is a ReadableStream, not a buffered string', async () => {
        const handler = createSSRHandler({ module, template, streaming: true });
        const response = await handler(new Request('http://localhost/'));
        expect(response.body).toBeInstanceOf(ReadableStream);
      });

      it('Then the first chunk contains <head> with theme CSS and preloads', async () => {
        const handler = createSSRHandler({ module, template });
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
        const chunks = await collectStreamChunks(response);
        const lastChunk = chunks[chunks.length - 1];
        expect(lastChunk).toContain('__VERTZ_SSR_DATA__');
        expect(lastChunk).toContain('</body>');
      });
    });
  });

  describe('Given a handler with streaming: false', () => {
    describe('When a page request is made', () => {
      it('Then the response is a buffered string (existing behavior)', async () => {
        const handler = createSSRHandler({ module, template, streaming: false });
        const response = await handler(new Request('http://localhost/'));
        const html = await response.text();
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('</html>');
      });
    });
  });

  describe('Given a redirect during SSR', () => {
    describe('When the page renders', () => {
      it('Then returns 302 without streaming partial HTML', async () => {
        const response = await handler(new Request('http://localhost/protected'));
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('/login');
      });
    });
  });

  // @ts-expect-error — streaming: 'invalid' is not boolean
  createSSRHandler({ module, template, streaming: 'invalid' });
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
    it('Then returns headTemplate ending at the div opening', () => {});
    it('Then returns tailTemplate starting with </div>', () => {});
  });
});

describe('Given inlineCSS options', () => {
  describe('When splitTemplate() is called', () => {
    it('Then link tags in headTemplate are replaced with inline styles', () => {});
    it('Then linked stylesheets are converted to async loading', () => {});
  });
});
```

### Phase 2: Streaming response builder

Build the `ReadableStream` from pre-computed head + render stream + tail.

**Files:** `packages/ui-server/src/ssr-streaming-response.ts` (new)

**Acceptance criteria:**
```typescript
describe('Given head, render stream, and tail chunks', () => {
  describe('When buildStreamingResponse() is called', () => {
    it('Then first readable chunk is the head', () => {});
    it('Then middle chunks come from the render stream', () => {});
    it('Then final chunk is the tail with SSR data', () => {});
  });
});

describe('Given a render stream that errors mid-way', () => {
  describe('When the error occurs after head is sent', () => {
    it('Then an error script chunk is emitted before closing', () => {});
  });
});
```

### Phase 3: Wire into createSSRHandler

Replace the buffered `injectIntoTemplate` path with the streaming path in `handleHTMLRequest()`.

**Files:** `packages/ui-server/src/ssr-handler.ts` (modified)

**Acceptance criteria:**
```typescript
describe('Given createSSRHandler with default options', () => {
  describe('When handling a page request', () => {
    it('Then returns a streaming Response', () => {});
    it('Then Link header includes font preloads', () => {});
    it('Then first chunk contains <head> with CSS', () => {});
  });
});

describe('Given createSSRHandler with streaming: false', () => {
  describe('When handling a page request', () => {
    it('Then returns a buffered Response (existing behavior)', () => {});
  });
});

describe('Given a redirect during render', () => {
  describe('When streaming is enabled', () => {
    it('Then returns 302 without any streamed content', () => {});
  });
});

describe('Given a session resolver', () => {
  describe('When streaming is enabled', () => {
    it('Then session script is in the head chunk', () => {});
  });
});
```

### Phase 4: Dev server integration

Wire the streaming response into the Bun dev server's SSR handler.

**Files:** `packages/ui-server/src/bun-dev-server.ts` (modified)

**Acceptance criteria:**
```typescript
describe('Given the dev server with streaming enabled', () => {
  describe('When a page request is made', () => {
    it('Then the response is streamed progressively', () => {});
    it('Then HMR error overlay script is in the head chunk', () => {});
  });
});
```

### Phase 5: Benchmark validation

Run the SSR benchmarks with streaming enabled and measure TTFB/FCP improvements.

**Acceptance criteria:**
- TTFB improves by 15-20% vs buffered (head is sent before body renders)
- Total response time is equivalent (no regression from streaming overhead)
- All existing SSR tests pass with streaming enabled
- All existing SSR tests pass with streaming: false (backward compat)

## Key Files

| File | Change |
|------|--------|
| `packages/ui-server/src/template-split.ts` | **New:** Pre-split template into head/tail at handler creation |
| `packages/ui-server/src/ssr-streaming-response.ts` | **New:** Build ReadableStream from head + render stream + tail |
| `packages/ui-server/src/ssr-handler.ts` | Wire streaming path into `handleHTMLRequest()` |
| `packages/ui-server/src/template-inject.ts` | Unchanged (still used by `streaming: false` path and `renderToHTML()`) |
| `packages/ui-server/src/bun-dev-server.ts` | Dev server streaming support |
| `packages/ui-server/src/ssr-render.ts` | Minor: export `renderToStream` result without `streamToString` |

## Reusable Infrastructure

- `renderToStream()` in `render-to-stream.ts` — already produces a `ReadableStream<Uint8Array>` from vnodes
- `encodeChunk()` in `streaming.ts` — string → Uint8Array
- `compileThemeCached()` in `ssr-render.ts` — cached theme compilation (just added)
- `safeSerialize()` in `ssr-streaming-runtime.ts` — XSS-safe JSON serialization
- `getStreamingRuntimeScript()` in `ssr-streaming-runtime.ts` — component streaming bootstrap

## Verification

1. `bun test packages/ui-server/` — all server tests pass
2. `bunx tsc --noEmit -p packages/ui-server/tsconfig.json` — typecheck clean
3. `bunx biome check packages/ui-server/src/` — lint clean
4. Benchmark: TTFB measurement with streaming vs buffered
5. Manual: `cd examples/entity-todo && bun run dev` — SSR works, page loads progressively
