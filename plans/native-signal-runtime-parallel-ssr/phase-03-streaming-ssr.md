# Sub-Phase 4.3: Streaming SSR

## Context

This is the third sub-phase of Phase 4 (Native Signal Runtime + Parallel SSR) in the Vertz Runtime. It adds progressive HTML streaming with Suspense-aware boundaries, so the shell (`<head>` + layout) arrives immediately while async data resolves out-of-order.

**Hard gate:** POC 3 (Streaming Hydration) must pass before this sub-phase begins — verifying that the `__vtz_swap` protocol + hydration walker work correctly for at least one Suspense boundary.

Design doc: `plans/native-signal-runtime-parallel-ssr.md`

**Current state:** There is existing streaming infrastructure in the JS packages:
- `packages/ui-server/src/render-to-stream.ts` — `renderToStream()` producing a `ReadableStream<Uint8Array>` with Suspense boundaries using `<div id="v-slot-N">` placeholders and `<template id="v-tmpl-N">` swap chunks (per-boundary inline scripts)
- `packages/ui-server/src/slot-placeholder.ts` — Placeholder generation with `v-slot-N` IDs
- `packages/ui-server/src/template-chunk.ts` — Template chunk with inline IIFE swap script per boundary
- `packages/ui-server/src/ssr-streaming-runtime.ts` — `__VERTZ_SSR_PUSH__` for streaming query data to the client
- `packages/ui/src/hydrate/hydration-context.ts` — Cursor-based DOM walker (`claimElement`, `claimText`, `enterChildren`, `exitChildren`)
- `packages/ui/src/component/suspense.ts` — Client-side Suspense with Promise-based suspension
- `packages/ui/src/query/ssr-hydration.ts` — Client-side `hydrateQueryFromSSR()` with `vertz:ssr-data` CustomEvent listener

**What changes:** The design doc specifies a unified protocol:
- Placeholders become `<template id="B:N">` (boundary marker) + `<div data-suspense-fallback="B:N">fallback</div>`
- Resolved content becomes `<template id="S:N">resolved</template><script>__vtz_swap("B:N","S:N")</script>`
- `__vtz_swap` is defined **once** in `<head>` (not repeated per boundary as an IIFE)
- The Rust server sends chunks via HTTP chunked transfer encoding
- The hydration walker skips `<template>` nodes

**Dependencies:** Sub-Phase 4.1 (SSR Isolate Pool) must be complete — streaming dispatches through the pool.

## Tasks

### Task 1: Streaming config + Rust chunked response infrastructure

**Files:**
- `native/vtz/src/ssr/streaming.rs` (new)
- `native/vtz/src/ssr/mod.rs` (modified — add `pub mod streaming;`)
- `native/vtz/src/config.rs` (modified — add streaming fields to `ServerConfig`)
- `native/vtz/src/runtime/persistent_isolate.rs` (modified — add streaming SSR message variant)

**What to implement:**

Add the Rust infrastructure for receiving HTML chunks from V8 and forwarding them as a stream. The V8 render produces chunks via a `tokio::sync::mpsc` channel — each chunk is a `String` of HTML. The Rust side wraps this into an `axum::body::Body` streaming response.

```rust
// native/vtz/src/ssr/streaming.rs

use tokio::sync::mpsc;
use std::time::Duration;

/// A single chunk of streamed SSR HTML.
#[derive(Debug)]
pub enum StreamChunk {
    /// Shell: <!DOCTYPE html> through the opening <body> and layout content.
    Shell(String),
    /// A resolved Suspense boundary: <template id="S:N">...</template><script>__vtz_swap(...)</script>
    Boundary(String),
    /// Query data push: <script>__VERTZ_SSR_PUSH__(...)</script>
    QueryData(String),
    /// Tail: SSR data script, client scripts, closing </body></html>
    Tail(String),
    /// Stream error — sends error chunk and closes.
    Error(String),
}

/// Streaming SSR response — a receiver of HTML chunks.
pub struct SsrStreamResponse {
    pub rx: mpsc::Receiver<StreamChunk>,
    pub status_code: u16,
    pub headers: Vec<(String, String)>,
}

/// Configuration for streaming SSR.
#[derive(Debug, Clone)]
pub struct StreamingConfig {
    pub enabled: bool,                       // default: false
    pub boundary_timeout: Duration,          // default: uses query ssrTimeout
    pub max_streaming_time: Duration,        // default: 30s (overall stream timeout)
}

impl Default for StreamingConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            boundary_timeout: Duration::from_millis(300), // matches default ssrTimeout
            max_streaming_time: Duration::from_secs(30),
        }
    }
}
```

In `config.rs`, add to `ServerConfig`:
```rust
pub ssr_streaming: bool,                    // default: false
pub ssr_streaming_max_time_ms: u64,         // default: 30000
```

In `persistent_isolate.rs`, add a new `IsolateRequest` variant:
```rust
IsolateRequest::SsrStream {
    request: SsrRequest,
    chunk_tx: mpsc::Sender<StreamChunk>,
}
```

The Isolate's message loop handles `SsrStream` by calling a JS function (`globalThis.__vertz_ssr_render_stream`) that pushes chunks through a Rust op (`op_ssr_stream_chunk`). The op sends each chunk through `chunk_tx`.

**Acceptance criteria:**
- [ ] `StreamChunk` enum and `SsrStreamResponse` types compile
- [ ] `StreamingConfig` has sensible defaults
- [ ] `ServerConfig` parses `ssr.streaming` from config
- [ ] `IsolateRequest::SsrStream` variant added to persistent isolate
- [ ] Unit test: `StreamChunk` variants serialize correctly
- [ ] `op_ssr_stream_chunk` deno_core op registered and callable from JS

---

### Task 2: `__vtz_swap` protocol + streaming render orchestration

**Files:**
- `packages/ui-server/src/slot-placeholder.ts` (modified — change to `<template id="B:N">` + fallback div)
- `packages/ui-server/src/template-chunk.ts` (modified — change to `<template id="S:N">` + `__vtz_swap()` call)
- `packages/ui-server/src/ssr-streaming-runtime.ts` (modified — add `__vtz_swap` head script)
- `packages/ui-server/src/render-to-stream.ts` (modified — emit chunks incrementally, not via Promise.all)

**What to implement:**

Update the streaming protocol from `v-slot-N`/`v-tmpl-N` with per-boundary IIFEs to the design doc's `B:N`/`S:N` protocol with a shared `__vtz_swap` function.

In `ssr-streaming-runtime.ts`, add the `__vtz_swap` function that's injected once in `<head>`:
```typescript
export function getSwapScript(nonce?: string): string {
  const nonceAttr = nonce != null ? ` nonce="${escapeAttr(nonce)}"` : '';
  return (
    `<script${nonceAttr}>` +
    'function __vtz_swap(b,s){' +
    'var be=document.getElementById(b);' +    // boundary marker <template id="B:N">
    'var se=document.getElementById(s);' +    // resolved content <template id="S:N">
    'var fb=document.querySelector("[data-suspense-fallback=\\""+b+"\\"]");' + // fallback div
    'if(se&&fb){' +
    'var c=se.content.cloneNode(true);' +
    'fb.replaceWith(c);' +                   // replace fallback with resolved content
    'se.remove()' +                           // clean up template
    '}' +
    'if(be)be.remove()' +                     // clean up boundary marker
    '}' +
    '</script>'
  );
}
```

In `slot-placeholder.ts`, change placeholder format:
```typescript
// Before: <div id="v-slot-0">fallback</div>
// After:  <template id="B:0"></template><div data-suspense-fallback="B:0">fallback</div>
```

In `template-chunk.ts`, change resolved chunk format:
```typescript
// Before: <template id="v-tmpl-0">resolved</template><script>(function(){...})()</script>
// After:  <template id="S:0">resolved</template><script>__vtz_swap("B:0","S:0")</script>
```

In `render-to-stream.ts`, change from `Promise.all` (waits for all boundaries, then emits all) to incremental emission (each boundary emits as it resolves):
```typescript
// Before: const chunks = await Promise.all(resolutions); for (const chunk of chunks) { ... }
// After: each boundary resolution enqueues its chunk immediately via controller.enqueue()
```

This enables true out-of-order streaming — each boundary flushes as soon as its data arrives, not after all boundaries resolve.

**Acceptance criteria:**
- [ ] `getSwapScript()` returns minified `__vtz_swap` function
- [ ] Placeholders use `<template id="B:N">` + `<div data-suspense-fallback="B:N">` format
- [ ] Resolved chunks use `<template id="S:N">` + `__vtz_swap("B:N","S:N")` format
- [ ] Boundaries flush incrementally (not batched via Promise.all)
- [ ] Existing `render-to-stream.test.ts` updated and passing with new protocol
- [ ] `slot-placeholder.test.ts` updated and passing with new IDs
- [ ] `template-chunk.test.ts` updated and passing with new format
- [ ] Test: two boundaries with different resolve times — first-to-resolve flushes first

---

### Task 3: HTTP streaming response + pool integration

**Files:**
- `native/vtz/src/server/http.rs` (modified — streaming response path)
- `native/vtz/src/ssr/pool.rs` (modified — `handle_ssr_stream()` method)
- `native/vtz/src/ssr/html_document.rs` (modified — `assemble_ssr_shell()` for streaming)

**What to implement:**

Wire the streaming path through the SSR pool to the HTTP handler. When `ssr.streaming` is enabled, the HTTP handler returns an `axum::body::Body` built from a `tokio_stream` that reads from the `mpsc::Receiver<StreamChunk>`.

In `pool.rs`, add `handle_ssr_stream()`:
```rust
impl SsrPool {
    pub async fn handle_ssr_stream(
        &self,
        request: SsrRequest,
    ) -> Result<SsrStreamResponse, SsrPoolError> {
        // Same admission control as handle_ssr()
        let permit = tokio::time::timeout(
            self.queue_timeout,
            self.admission.acquire(),
        ).await
        .map_err(|_| SsrPoolError::QueueTimeout)?
        .map_err(|_| SsrPoolError::PoolClosed)?;

        let isolate = self.pick_isolate();
        let (chunk_tx, chunk_rx) = mpsc::channel::<StreamChunk>(32);

        // Send streaming request to isolate
        isolate.inner.send(IsolateRequest::SsrStream {
            request,
            chunk_tx,
        }).await?;

        Ok(SsrStreamResponse {
            rx: chunk_rx,
            status_code: 200,
            headers: vec![
                ("Content-Type".into(), "text/html; charset=utf-8".into()),
                ("Transfer-Encoding".into(), "chunked".into()),
            ],
        })
        // Note: permit is held until the stream completes (moved into stream future)
    }
}
```

In `http.rs`, add streaming response construction:
```rust
// When ssr.streaming is enabled:
let stream_response = pool.handle_ssr_stream(ssr_req).await?;
let body_stream = ReceiverStream::new(stream_response.rx)
    .map(|chunk| Ok::<_, std::convert::Infallible>(Bytes::from(chunk.into_html())));
let body = Body::from_stream(body_stream);

Response::builder()
    .status(stream_response.status_code)
    .header("Content-Type", "text/html; charset=utf-8")
    .header("Transfer-Encoding", "chunked")
    .body(body)
```

In `html_document.rs`, add `assemble_ssr_shell()` — a variant of `assemble_ssr_document()` that produces only the opening HTML through end of `<head>` plus the start of `<body>`:
```rust
pub fn assemble_ssr_shell(options: &SsrShellOptions<'_>) -> String {
    // <!DOCTYPE html><html><head>...__vtz_swap script...__VERTZ_SSR_PUSH__ script...</head>
    // <body><div id="app">
    // (no closing tags — content will be streamed)
}
```

**Acceptance criteria:**
- [ ] `handle_ssr_stream()` dispatches streaming request to pool isolate
- [ ] HTTP handler returns chunked `Transfer-Encoding` response when streaming enabled
- [ ] Shell chunk arrives before any boundary resolution
- [ ] `assemble_ssr_shell()` produces valid opening HTML with swap + push scripts in `<head>`
- [ ] Non-streaming requests still use the buffered `handle_ssr()` path (no regression)
- [ ] Test: streaming response has correct HTTP headers
- [ ] Test: shell chunk contains `__vtz_swap` function definition

---

### Task 4: Hydration walker update for streamed content

**Files:**
- `packages/ui/src/hydrate/hydration-context.ts` (modified — skip `<template>` nodes)
- `packages/ui/src/component/suspense.ts` (modified — streaming-aware hydration path)
- `packages/ui/src/query/ssr-hydration.ts` (modified — integrate with streaming push)

**What to implement:**

Update the cursor-based hydration walker to handle DOM that was produced by streaming SSR + `__vtz_swap`.

In `hydration-context.ts`, update `advanceCursor()` and claim functions to skip `<template>` elements:
```typescript
// When advancing the cursor, skip over <template> nodes.
// After __vtz_swap executes, most templates are removed from the DOM.
// But if a boundary hasn't resolved yet (fallback visible), the
// <template id="B:N"> marker may still be present.
function shouldSkipNode(node: Node): boolean {
  return node.nodeName === 'TEMPLATE';
}

// In advanceCursor():
export function advanceCursor(node: Node | null): void {
  if (!node) return;
  let next = node.nextSibling;
  while (next && shouldSkipNode(next)) {
    next = next.nextSibling;
  }
  cursor = next;
}
```

In `suspense.ts`, add a streaming-aware hydration path:
- During hydration, if the Suspense fallback is visible (swap hasn't happened), hydrate the fallback content normally
- When the Suspense boundary's data arrives (via `vertz:ssr-data` event), re-render with real content — this matches the existing client-side Suspense behavior
- If `__vtz_swap` already executed (resolved content in DOM), hydrate the resolved content directly

In `ssr-hydration.ts`, the existing `__VERTZ_SSR_PUSH__` + `vertz:ssr-data` event system already supports streaming data delivery. Verify that:
- Late-arriving data (streamed after hydration starts) triggers re-render via the event listener
- Early-arriving data (streamed before hydration) is buffered in `__VERTZ_SSR_DATA__` and consumed synchronously

**Acceptance criteria:**
- [ ] `advanceCursor()` skips `<template>` nodes during hydration walk
- [ ] `claimElement()` never claims a `<template>` element
- [ ] Hydration succeeds when `__vtz_swap` has already executed (resolved content in DOM)
- [ ] Hydration succeeds when fallback is still visible (swap hasn't happened yet)
- [ ] Late-arriving streamed data triggers Suspense re-render on client
- [ ] Test: hydration with 0 templates in DOM (all boundaries resolved before hydration)
- [ ] Test: hydration with 1 unresolved boundary (fallback visible, template marker present)
- [ ] Test: `advanceCursor` skips template nodes and lands on next sibling

---

### Task 5: Per-boundary streaming timeout + graceful degradation

**Files:**
- `packages/ui-server/src/render-to-stream.ts` (modified — per-boundary timeout)
- `packages/ui-server/src/ssr-streaming-runtime.ts` (modified — timeout-aware data chunks)
- `native/vtz/src/ssr/streaming.rs` (modified — overall stream timeout)

**What to implement:**

Add per-boundary timeout and graceful degradation to the streaming renderer.

In `render-to-stream.ts`, wrap each boundary's resolution in a timeout:
```typescript
const resolutions = pendingBoundaries.map(async (boundary) => {
  try {
    const resolved = await Promise.race([
      boundary.resolve,
      rejectAfterTimeout(boundary.timeout ?? defaultTimeout),
    ]);
    const resolvedHtml = serializeToHtml(resolved);
    controller.enqueue(encodeChunk(
      createTemplateChunk(boundary.slotId, resolvedHtml, nonce)
    ));
    // Also push query data for this boundary
    if (boundary.queryData) {
      controller.enqueue(encodeChunk(
        createSSRDataChunk(boundary.queryKey, boundary.queryData, nonce)
      ));
    }
  } catch (_err: unknown) {
    // Timeout or error: leave fallback visible, push no data.
    // Client-side Suspense will trigger its own query fetch.
    // Optionally push a "timed-out" marker so the client knows not to wait:
    controller.enqueue(encodeChunk(
      createSSRDataChunk(boundary.queryKey, { __timedOut: true }, nonce)
    ));
  }
});
```

The per-boundary timeout defaults to the query's `ssrTimeout` (300ms). If a boundary times out:
1. No swap chunk is emitted — the fallback stays visible
2. A `{ __timedOut: true }` data entry is pushed so the client doesn't wait for SSR data
3. The client-side Suspense component triggers a normal client-side fetch

In `streaming.rs`, add overall stream timeout enforcement:
```rust
// The overall stream has a max_streaming_time (default 30s).
// If the stream hasn't closed after this time, emit a Tail chunk
// and force-close the stream. This prevents indefinitely open connections.
tokio::select! {
    _ = stream_complete => {},
    _ = tokio::time::sleep(config.max_streaming_time) => {
        chunk_tx.send(StreamChunk::Tail(tail_html)).await.ok();
        // Stream will close when chunk_tx is dropped
    }
}
```

**Graceful degradation:** If ALL boundaries timeout, the output is equivalent to buffered SSR with fallback content — no regression. The client hydrates with fallbacks and fetches data normally.

**Acceptance criteria:**
- [ ] Per-boundary timeout fires after configured `ssrTimeout` duration
- [ ] Timed-out boundaries leave fallback visible (no swap chunk emitted)
- [ ] `{ __timedOut: true }` data entry pushed for timed-out boundaries
- [ ] Overall stream timeout force-closes after `max_streaming_time`
- [ ] When all boundaries timeout, output matches buffered SSR behavior
- [ ] Test: boundary with 100ms timeout, data arrives at 50ms — resolves normally
- [ ] Test: boundary with 100ms timeout, data arrives at 200ms — times out, fallback stays
- [ ] Test: overall stream timeout closes connection after configured duration
- [ ] Test: mixed timeouts — some boundaries resolve, some timeout, output is valid HTML

---

### Task 6: E2E streaming validation + TTFB benchmark

**Files:**
- `native/vtz/src/ssr/streaming_test.rs` (new)
- `native/vtz/benches/ssr_streaming.rs` (new)
- `packages/ui-server/src/__tests__/streaming-e2e.test.ts` (new)

**What to implement:**

End-to-end validation that streaming SSR delivers the expected performance and correctness guarantees.

**Rust integration test** (`streaming_test.rs`):
```rust
#[tokio::test]
async fn test_streaming_shell_arrives_before_data() {
    // Start pool with streaming enabled
    // Send SSR request for page with slow query (500ms)
    // Assert: first chunk (shell) arrives within 10ms
    // Assert: second chunk (boundary) arrives after ~500ms
    // Assert: final chunk (tail) closes the stream
}

#[tokio::test]
async fn test_streaming_multiple_boundaries_out_of_order() {
    // Page has 3 Suspense boundaries with different resolve times
    // Assert: boundaries flush in resolution order, not DOM order
    // Assert: all __vtz_swap calls reference correct B:/S: IDs
}

#[tokio::test]
async fn test_streaming_disabled_uses_buffered() {
    // ssr.streaming = false
    // Assert: response is a single complete HTML document (not chunked)
}
```

**JS E2E test** (`streaming-e2e.test.ts`):
```typescript
describe('Feature: Streaming SSR E2E', () => {
  describe('Given a page with Suspense wrapping a 500ms query', () => {
    describe('When streaming is enabled', () => {
      it('Then shell HTML arrives within 10ms', async () => {
        // Verify TTFB
      });

      it('Then resolved content arrives with valid __vtz_swap call', async () => {
        // Verify swap protocol
      });

      it('Then final HTML is valid and complete', async () => {
        // Verify no unclosed tags, valid structure
      });
    });
  });

  describe('Given streaming disabled', () => {
    describe('When rendering the same page', () => {
      it('Then output matches buffered SSR exactly', async () => {
        // Compare streaming (all resolved) vs buffered output
      });
    });
  });
});
```

**Benchmark** (`ssr_streaming.rs`):
```rust
// Compare: streaming vs buffered SSR for page with 3 slow queries (100ms each)
// Metric: TTFB (time to first byte of response body)
// Target: streaming TTFB < 10ms, buffered TTFB > 100ms (waiting for queries)
// Also measure: total response time (should be similar for both)
```

**Acceptance criteria:**
- [ ] Shell (head + layout) arrives within 10ms regardless of data fetch time
- [ ] TTFB improvement: >= 50% reduction vs buffered SSR for pages with slow queries
- [ ] All Suspense boundaries swap correctly (no flash, valid HTML)
- [ ] Hydration succeeds after streaming completes (both swapped and fallback paths)
- [ ] Graceful degradation: if all boundaries timeout, output matches buffered SSR
- [ ] Cursor-based hydration walker handles `<template>` elements without errors
- [ ] Benchmark shows measurable TTFB improvement with streaming enabled
- [ ] Pool metrics correctly track streaming requests (active/queued/completed)
