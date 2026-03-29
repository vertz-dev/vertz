# Persistent V8 Isolate — Unified API + SSR Execution

**Issue:** #2068
**Status:** Draft (Rev 2 — post-review)
**Author:** Vinicius Dacal + Claude
**Blocks:** #2044 (inspector), #2056 (OpenAPI spec), #2051 (linear-clone validation)
**Prerequisite for:** Runtime Phase 2 (Multi-Isolate Entity Workers)

## Summary

Replace the current per-request V8 isolate model with a single **persistent V8 isolate** that handles both API route delegation and SSR rendering. The persistent isolate loads the server module once, caches compiled routes/auth/DB connections, and serves all requests through `handler(request) → Response` — exactly like Cloudflare Workers' execution model.

This design **completes Phase 1 of the Vertz Runtime plan** (Single-Isolate Dev Server) and is the critical-path prerequisite for Phase 2 (Multi-Isolate Entity Workers + Message Bus). Without a working persistent isolate, the multi-isolate vision cannot proceed.

Additionally, redesign the HMR pipeline to eliminate the 50ms+ debounce overhead, targeting sub-5ms HMR notification and sub-20ms end-to-end client updates.

---

## API Surface

### Rust-side: Request dispatch

```rust
// Persistent V8 isolate created once at server startup
let isolate = PersistentIsolate::new(PersistentIsolateOptions {
    root_dir: config.root_dir.clone(),
    server_entry: config.server_entry.clone(),  // server.ts
    ui_entry: config.ui_entry.clone(),           // src/App.tsx
})?;

// Load server module + UI entry once
isolate.initialize().await?;  // runs createServer(), caches handler

// Per-request dispatch (no isolate creation)
let response = isolate.handle_request(request).await?;
```

### V8-side: Module lifecycle

```typescript
// server.ts — loaded ONCE in persistent isolate
export default createServer({
  entities: [task, project],
  db: createDb({ ... }),
  auth: createAuth({ ... }),
});

// The handler closure captures all pre-built state:
// - Trie router with compiled entity routes
// - Auth instance with JWT verifier
// - DB adapter with connection pool
// - Entity operations with access rules
//
// Each request calls: handler(request) → Response
// No re-initialization, no re-compilation
```

### SSR in the persistent isolate

```typescript
// Conceptual: SSR uses the SAME isolate, scoped DOM per request
async function handleSSR(request: Request): Promise<Response> {
  // Request-scoped DOM (not global)
  const dom = createScopedDOM();
  const cssCollector = new CSSCollector();

  // Render with scoped context — same isolate, clean state
  const html = await renderWithScope({
    dom,
    cssCollector,
    url: request.url,
    session: extractSession(request),
    fetchInterceptor: (input, init) => {
      // In-memory API delegation — no HTTP self-fetch
      if (matchesApiRoute(input)) {
        return server.handler(new Request(input, init));
      }
      return globalFetch(input, init);
    },
  }, () => renderApp(App));

  return new Response(assembleDocument(html, cssCollector.collect()), {
    headers: { 'content-type': 'text/html' },
  });
}
```

### HMR: Module hot-swap via cache-busted dynamic import

```rust
// File change detected → immediate notification (no debounce for single files)
// 1. Invalidate Rust compilation cache (so next HTTP request gets fresh code)
pipeline.cache().invalidate("src/components/TaskCard.tsx");

// 2. Client notified via WebSocket (< 1ms) — lazy, no compilation yet
hmr_hub.broadcast(HmrMessage::Update {
    modules: vec!["src/components/TaskCard.tsx"],
    timestamp: now(),
});

// Server module change → isolate restart (see "Module Invalidation Strategy")
// V8 ES modules are immutable once loaded — cannot invalidate individual modules.
// Server changes trigger a fast isolate restart: new JsRuntime, re-import server.ts.
isolate.restart().await?;
// Handler reference updated, next request uses new code
```

### Client-side fast refresh (unchanged)

```typescript
// These mechanisms are PRESERVED as-is:
// 1. Signal state snapshot via _hmrKey (named) or position (unnamed)
// 2. Context scope snapshot + restoration
// 3. DOM state capture (scroll, focus, selection, checkbox, dialog)
// 4. Factory re-execution with restored signals
// 5. DOM node replacement with state restoration
//
// What changes: notification arrives 50-100ms faster (no debounce)
```

---

## Manifesto Alignment

### Principle 7: Performance is not optional

The current per-request V8 model spends 20-85ms on isolate creation + bootstrap + module loading before any rendering. The persistent model amortizes this to zero per-request overhead. API responses go from ~25-90ms to ~1-5ms (handler execution only).

### Principle 8: No ceilings

Cloudflare Workers use persistent isolates. Bun uses a persistent JS heap. Our per-request model was a correctness-first implementation that we're now optimizing. The persistent model matches or beats both: Rust handles HTTP/routing/static files natively, V8 only executes business logic.

### Principle 1: If it builds, it works

The persistent isolate enforces the same module boundaries as production. `createServer()` runs once at startup (like Workers), not per-request. If the handler works once, it works every time.

### Principle 3: AI agents are first-class users

Sub-10ms HMR means AI agents editing code see results near-instantly. The MCP event hub and LLM inspection endpoints benefit from the persistent isolate's stable state — no need to recreate context for each AI query.

---

## Non-Goals

1. **Multi-isolate worker simulation** — The vision doc describes simulating production's distributed topology with multiple V8 isolates (one per entity/service). That's Runtime Phase 2. This design covers the dev server's single-process model where one persistent isolate serves everything.

2. **Production runtime** — This design targets the dev server (`vertz dev`). Production deployment (Cloudflare Workers, standalone binary) has different constraints and is out of scope.

3. **Moving DB connections to Rust** — DB connections are created by `@vertz/db` inside V8 via `createServer()` and persist for the isolate's lifetime. We don't move the connection pool implementation to Rust. However, the **lifecycle** of these connections during isolate restart is explicitly addressed (see "Resource Lifecycle During Hot-Swap").

4. **Changing the client-side fast refresh** — Signal preservation, DOM state capture/restore, context scope restoration all remain as-is. We only change how fast the server notifies the client.

5. **Isolate pool for production** — The single-isolate model is for the dev server. The `PersistentIsolate` abstraction is designed to be poolable — production deployment can run N pre-warmed isolates behind a request router (same pattern as Cloudflare Workers/workerd). This is Runtime Phase 2+ scope and is not precluded by this design.

---

## Unknowns

### 1. Isolate restart speed under real-world module graphs

**Question:** Server module HMR uses full isolate restart (see "Module Invalidation Strategy"). How fast is `JsRuntime::new()` + bootstrap + module loading for a real-world app with 50+ entity/service modules?

**Resolution approach:** POC benchmark. Measure isolate restart time for the linear-clone app. If restart exceeds 100ms, investigate V8 snapshots (`JsRuntime::new` with `startup_snapshot`) to skip bootstrap JS execution. Target: < 50ms for server module HMR restart.

### 2. `notify` crate event coalescing for single-file detection

**Question:** The `notify` crate often delivers multiple events for a single file save (write + modify + rename for atomic saves). Will the "single file → immediate, multi-file → batched" split misclassify single saves as multi-file bursts?

**Resolution approach:** Classify by unique file path, not by event count. If all events within a 5ms window share the same path, treat as single-file. Multiple distinct paths → multi-file burst with 20ms debounce.

### Resolved (promoted to Design Decisions)

- **Module hot-swap atomicity** — V8 is single-threaded. Swap happens between event loop ticks. No drain mechanism needed. (Was Unknown #3 in Rev 1.)
- **DOM shim scoping** — Reset-between-requests for Phase 2. SSR is serialized in the persistent isolate (one render at a time). (Was Unknown #2 in Rev 1.)
- **V8 concurrency** — Async DB queries yield the event loop. V8 interleaves request processing at `await` points. Backpressure via bounded channel in the threading model. (Was Unknown #1 in Rev 1.)

---

## Type Flow Map

This feature is primarily Rust-side with JavaScript interop. No new TypeScript generics are introduced. The type flow that matters:

```
createServer() config
  → ServerInstance.handler: (request: Request) => Promise<Response>
    → Rust PersistentIsolate calls handler via V8 function reference
      → Response marshalled back to Rust via op
        → Axum Response
```

The `Request` and `Response` types are Web API standard types already implemented in `runtime/ops/web_api.rs`. No new type definitions needed.

---

## E2E Acceptance Test

```typescript
describe('Feature: Persistent V8 isolate for API + SSR', () => {
  // --- API route delegation ---
  describe('Given a full-stack Vertz app running on the Rust runtime', () => {
    describe('When GET /api/tasks is requested', () => {
      it('Then returns JSON from the entity list handler', () => {
        // const res = await fetch(`http://localhost:${port}/api/tasks`);
        // expect(res.status).toBe(200);
        // expect(res.headers.get('content-type')).toContain('application/json');
        // const data = await res.json();
        // expect(data).toHaveProperty('items');
      });

      it('Then response time is under 10ms (excluding DB)', () => {
        // const start = performance.now();
        // await fetch(`http://localhost:${port}/api/tasks`);
        // expect(performance.now() - start).toBeLessThan(10);
      });
    });

    describe('When POST /api/tasks is requested with valid body', () => {
      it('Then creates entity and returns 201', () => {});
    });
  });

  // --- SSR in persistent isolate ---
  describe('Given SSR enabled in the persistent isolate', () => {
    describe('When a page route is requested', () => {
      it('Then returns server-rendered HTML', () => {
        // const res = await fetch(`http://localhost:${port}/tasks`);
        // expect(res.headers.get('content-type')).toContain('text/html');
        // const html = await res.text();
        // expect(html).toContain('<div'); // rendered content, not empty shell
      });

      it('Then SSR does not pollute state for the next request', () => {
        // const res1 = await fetch(`http://localhost:${port}/tasks`);
        // const res2 = await fetch(`http://localhost:${port}/settings`);
        // Both should render correctly — no leaked DOM state
      });
    });
  });

  // --- Fetch interception ---
  describe('Given SSR rendering that calls fetch("/api/tasks")', () => {
    describe('When the page is server-rendered', () => {
      it('Then fetch is intercepted and routed to in-memory handler', () => {
        // No HTTP self-fetch — verified by absence of loopback request
        // in server access logs
      });
    });
  });

  // --- HMR: zero-debounce ---
  describe('Given a running dev server with HMR', () => {
    describe('When a UI component file is saved', () => {
      it('Then WebSocket update is sent within 5ms of file change', () => {
        // Measure time between fs.writeFile and WS message receipt
      });

      it('Then client fast-refresh preserves signal state', () => {
        // 1. Set counter to 5 via UI interaction
        // 2. Edit component source (e.g., change label text)
        // 3. After HMR, counter is still 5
      });

      it('Then client fast-refresh preserves DOM state (scroll, focus)', () => {
        // 1. Scroll a list to position 500px, focus an input
        // 2. Edit component source
        // 3. After HMR, scroll is at 500px, input is focused
      });
    });

    describe('When a server module file is saved', () => {
      it('Then the API handler is hot-swapped within 5ms', () => {
        // 1. GET /api/tasks → returns data
        // 2. Edit entity definition (add a field)
        // 3. GET /api/tasks → reflects new field
      });

      it('Then in-flight requests complete with old handler', () => {
        // No partial responses or errors during swap
      });
    });
  });

  // --- Error handling ---
  describe('Given an API handler that throws', () => {
    describe('When the error occurs', () => {
      it('Then returns 500 with error details', () => {});
      it('Then broadcasts error to WebSocket error channel', () => {});
      it('Then persistent isolate remains healthy for next request', () => {
        // Error in one request does NOT crash the isolate
      });
    });
  });

  // --- @ts-expect-error: invalid usage ---
  // These are runtime invariants, not type-level:
  // - Requesting an undefined API route → 404 (not crash)
  // - SSR for a route with no matching component → client-only shell (not crash)
  // - Server module with syntax error → error overlay (not crash), isolate intact
});
```

---

## Implementation Plan

### Phase 1: Persistent V8 isolate for API handlers

**Goal:** `/api/*` requests execute in a persistent V8 isolate. Server module loaded once, handler cached.

**Changes:**
- `native/vertz-runtime/src/runtime/` — new `PersistentIsolate` struct wrapping `VertzJsRuntime` with long-lived state
- `native/vertz-runtime/src/runtime/ops/` — new `request` and `response` ops for marshalling HTTP data between Rust and V8
- `native/vertz-runtime/src/server/http.rs` — route `/api/*` to persistent isolate instead of 404
- Bootstrap JS — load server module, extract handler, expose to Rust via global

**Acceptance criteria:**
```typescript
describe('Phase 1: API route delegation', () => {
  describe('Given a Vertz app with entity routes', () => {
    describe('When GET /api/tasks is requested', () => {
      it('Then returns JSON from entity list handler', () => {});
      it('Then response includes correct Content-Type', () => {});
    });
    describe('When POST /api/tasks is requested with body', () => {
      it('Then creates entity and returns 201', () => {});
    });
    describe('When requesting unknown API route', () => {
      it('Then returns 404 (not crash)', () => {});
    });
  });
  describe('Given the server started 10 seconds ago', () => {
    describe('When checking V8 isolate count', () => {
      it('Then only ONE isolate exists (persistent, not per-request)', () => {});
    });
  });
});
```

**Type flow:** `Axum Request → op_receive_request (serde) → JS Request → handler() → JS Response → op_send_response (serde) → Axum Response`

---

### Phase 2: SSR in the persistent isolate

**Goal:** SSR rendering moves from per-request isolate creation to the persistent isolate with request-scoped DOM.

**Changes:**
- `native/vertz-runtime/src/ssr/dom_shim.rs` — refactor DOM shim to support per-request scoping (reset-between-requests for Phase 2, ALS in future)
- `native/vertz-runtime/src/ssr/render.rs` — replace `VertzJsRuntime::new()` per-request with call into persistent isolate
- `native/vertz-runtime/src/ssr/css_collector.rs` — scoped CSS collection (clear before each render)
- Remove `spawn_blocking` for SSR — no longer needed since we're not creating isolates

**Acceptance criteria:**
```typescript
describe('Phase 2: SSR in persistent isolate', () => {
  describe('Given SSR enabled', () => {
    describe('When a page route is requested', () => {
      it('Then returns server-rendered HTML with components', () => {});
      it('Then CSS is collected and included in HTML', () => {});
      it('Then session data is injected for auth hydration', () => {});
    });
    describe('When two page routes are requested sequentially', () => {
      it('Then second request has clean DOM (no leaked state)', () => {});
      it('Then CSS collector is fresh for second request', () => {});
    });
    describe('When SSR fails', () => {
      it('Then falls back to client-only shell', () => {});
      it('Then isolate remains healthy', () => {});
    });
  });
});
```

**Type flow:** `Axum Request → persistent isolate → scoped DOM created → render(App, { dom, url, session }) → HTML string → Axum Response`

---

### Phase 3: Fetch interception

**Goal:** `fetch("/api/...")` calls during SSR are intercepted at the **JS level** and routed to the in-memory handler — no HTTP self-fetch.

**Changes:**
- Bootstrap JS in persistent isolate — install fetch proxy that checks `skipSSRPaths` and routes matching URLs to `server.handler()` directly in JS
- Configuration for `skipSSRPaths` (default: `['/api/']`) to control which paths are intercepted
- Store original fetch reference before proxy installation for external requests

**Note:** Fetch interception is JS-level, not Rust op-level. Rust ops cannot call back into V8 due to re-entrancy constraints (see Design Decision #4).

**Acceptance criteria:**
```typescript
describe('Phase 3: Fetch interception', () => {
  describe('Given SSR rendering a page that fetches /api/tasks', () => {
    describe('When the page renders server-side', () => {
      it('Then fetch is intercepted (no HTTP request to self)', () => {});
      it('Then the intercepted response matches direct handler call', () => {});
      it('Then server access log shows NO loopback /api/tasks request', () => {});
    });
  });
  describe('Given SSR rendering a page that fetches external API', () => {
    describe('When the page renders server-side', () => {
      it('Then external fetch proceeds normally (not intercepted)', () => {});
    });
  });
});
```

---

### Phase 4a: Server module hot-swap (isolate restart)

**Goal:** When server module files change, the persistent isolate restarts with new code. Old resources are properly disposed.

**Depends on:** Phase 1 (persistent isolate exists)

**Changes:**
- `native/vertz-runtime/src/runtime/` — `PersistentIsolate::restart()`: dispose old runtime → create new → re-load server module
- `packages/server/src/create-server.ts` — add `ServerInstance.dispose()` (drain DB pool, cancel timers)
- `native/vertz-runtime/src/server/http.rs` — detect server module graph changes, trigger restart
- Measure and log restart time: `[Server] Handler restarted in Xms`

**Acceptance criteria:**
```typescript
describe('Phase 4a: Server module hot-swap', () => {
  describe('Given a server module file change', () => {
    describe('When server.ts is saved', () => {
      it('Then isolate restarts and handler is reloaded', () => {});
      it('Then next API request uses updated handler', () => {});
      it('Then old DB connections are closed (no leak)', () => {});
      it('Then restart completes in under 50ms', () => {});
    });
    describe('When an entity definition file is saved', () => {
      it('Then entity routes are regenerated (full re-init)', () => {});
      it('Then new fields are reflected in API responses', () => {});
      it('Then access rule changes take effect immediately', () => {});
    });
    describe('When server.ts has a syntax error', () => {
      it('Then old handler continues serving requests', () => {});
      it('Then error is broadcast to WebSocket error channel', () => {});
      it('Then fixing the error and saving restores the new handler', () => {});
    });
  });
});
```

---

### Phase 4b: Zero-debounce HMR notifications

**Goal:** Eliminate the 50ms+ debounce overhead for client-side HMR. Independent of the persistent isolate.

**Changes:**
- `native/vertz-runtime/src/server/http.rs` — replace single debouncer with smart classification
- `native/vertz-runtime/src/watcher/file_watcher.rs` — immediate (single unique file path in 5ms window) vs batched (multiple paths, 20ms debounce)
- Move compilation OFF the hot path — invalidate cache, notify client, compile on-demand
- Preserve all existing client-side fast-refresh behavior (signal state, DOM state, context scope)

**Acceptance criteria:**
```typescript
describe('Phase 4b: Zero-debounce HMR', () => {
  describe('Given a UI component file change', () => {
    describe('When the file is saved', () => {
      it('Then WebSocket HMR message sent within 5ms', () => {});
      it('Then client module re-evaluated on-demand (lazy compilation)', () => {});
      it('Then signal state is preserved across refresh', () => {});
      it('Then DOM state (scroll, focus, selection) is preserved', () => {});
      it('Then context scope is preserved', () => {});
    });
  });
  describe('Given rapid multi-file changes (git checkout)', () => {
    describe('When 20 files change within 10ms', () => {
      it('Then changes are batched into single HMR update', () => {});
      it('Then no redundant recompilation for intermediate states', () => {});
    });
  });
  describe('Given atomic save (editor writes tmp + rename)', () => {
    describe('When notify delivers write + modify + rename events', () => {
      it('Then treated as single-file change (immediate, not batched)', () => {});
    });
  });
});
```

---

### Phase 5: Concurrency hardening (conditional)

**Goal:** Validate and harden concurrent request handling. **Only implement if Phase 1-4 load testing reveals bottlenecks.**

**Trigger:** Implement if benchmarking shows request queuing latency > 50ms under 10 concurrent requests, unhandled promise rejections leaking state, or V8 heap growing unboundedly.

**Changes (if triggered):**
- Bounded channel returns 503 when queue exceeds capacity (256 pending)
- V8 heap limit via `v8::Isolate::set_heap_limit()` with automatic restart on OOM
- Unhandled promise rejection handler (log + broadcast, don't crash isolate)
- Benchmark suite: throughput under concurrent load vs Bun dev server

**Acceptance criteria:**
```typescript
describe('Phase 5: Concurrency hardening', () => {
  describe('Given 10 concurrent API requests with async DB', () => {
    it('Then all complete successfully', () => {});
    it('Then no request blocks another beyond DB wait time', () => {});
  });
  describe('Given concurrent API + SSR requests', () => {
    it('Then both complete without interference', () => {});
    it('Then SSR DOM state does not leak into API response', () => {});
  });
  describe('Given queue overflow', () => {
    it('Then new requests receive 503 with retry-after', () => {});
  });
  describe('Given V8 heap exceeds limit', () => {
    it('Then isolate restarts automatically', () => {});
    it('Then next request succeeds on fresh isolate', () => {});
  });
});
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                  Axum HTTP Server                     │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ /@deps/* │  │ /@css/*  │  │  /src/* (on-demand │  │
│  │ Pure Rust│  │ Pure Rust│  │  compilation)      │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│                                                       │
│  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │ Static files │  │  HMR WebSocket               │  │
│  │ Pure Rust    │  │  (/__vertz_hmr)              │  │
│  └──────────────┘  └──────────────────────────────┘  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │          Request Queue (Rust, tokio)            │  │
│  │  /api/* requests + page route requests          │  │
│  └───────────────────┬────────────────────────────┘  │
│                      │                                │
│  ┌───────────────────▼────────────────────────────┐  │
│  │        Persistent V8 Isolate (single thread)    │  │
│  │                                                  │  │
│  │  Loaded ONCE at startup:                         │  │
│  │  ┌─────────────────────────────────────────┐    │  │
│  │  │ server.ts → createServer()               │    │  │
│  │  │  ├─ Trie router (compiled entity routes) │    │  │
│  │  │  ├─ Auth instance (JWT verifier)         │    │  │
│  │  │  ├─ DB adapter (connection pool)         │    │  │
│  │  │  └─ handler: (Request) => Response       │    │  │
│  │  └─────────────────────────────────────────┘    │  │
│  │  ┌─────────────────────────────────────────┐    │  │
│  │  │ App.tsx → component tree (cached)        │    │  │
│  │  └─────────────────────────────────────────┘    │  │
│  │                                                  │  │
│  │  Per-request (scoped, not global):               │  │
│  │  ┌─────────────┐ ┌──────────┐ ┌────────────┐   │  │
│  │  │ Scoped DOM  │ │ CSS Set  │ │ Session    │   │  │
│  │  │ (SSR only)  │ │ (SSR)    │ │ (from JWT) │   │  │
│  │  └─────────────┘ └──────────┘ └────────────┘   │  │
│  │                                                  │  │
│  │  Fetch interception:                             │  │
│  │  fetch("/api/*") → handler(req) (no HTTP)        │  │
│  │  fetch("https://ext") → real HTTP (op_fetch)     │  │
│  └──────────────────────────────────────────────────┘  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │        File Watcher (notify crate)              │  │
│  │                                                  │  │
│  │  Single file → immediate (0ms debounce)          │  │
│  │  Multi-file burst → batched (20ms debounce)      │  │
│  │                                                  │  │
│  │  UI file changed:                                │  │
│  │    1. Invalidate compilation cache               │  │
│  │    2. WebSocket: "module changed" (< 1ms)        │  │
│  │    3. Client requests new module (lazy compile)   │  │
│  │                                                  │  │
│  │  Server file changed:                            │  │
│  │    1. Re-import module in persistent isolate     │  │
│  │    2. Handler reference updated atomically       │  │
│  │    3. WebSocket: notify client for SSR refresh   │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Performance Targets

### Improvements

| Metric | Current (per-request isolate) | Target (persistent isolate) | Cloudflare Workers (ref) |
|--------|-------------------------------|----------------------------|--------------------------|
| API cold start | 20-85ms (isolate creation) | 0ms (pre-initialized) | 0ms |
| API handler latency | 25-90ms total | 1-5ms (handler + serde marshalling) | 1-5ms |
| SSR render | 20-85ms init + render time | render time only (5-30ms) | N/A |
| HMR notification | 50-110ms (debounce) | < 5ms (immediate) | N/A |
| Client fast-refresh | 5-15ms (unchanged) | 5-15ms (unchanged) | N/A |
| End-to-end HMR (client) | 75-135ms | < 20ms | N/A |
| Memory per request | Full V8 isolate (~2-5MB) | ~0 (shared isolate) | ~0 |

### Tradeoffs

| Metric | Current | After | Notes |
|--------|---------|-------|-------|
| SSR concurrency model | N parallel (spawn_blocking, each 20-85ms) | 1 event loop (cooperative, each 5-30ms) | Faster for single requests; V8 async interleaving handles the rare concurrent case. Poolable for production (Phase 2+). |
| Server HMR latency | N/A (no server HMR) | < 50ms (isolate restart) | Still faster than manual Ctrl+C → restart |
| Persistent memory footprint | ~0 (transient per-request) | ~20-50MB (persistent isolate) | Amortized, bounded, restarts on server HMR |

### Measurement methodology

- "Handler latency" includes Rust↔V8 serde marshalling for Request/Response but excludes DB I/O
- "Current" numbers are estimates based on `render_to_html()` profiling (isolate creation + bootstrap + module load). To be validated with benchmarks before Phase 1 implementation.
- All HMR measurements use `performance.now()` on both Rust side (watcher event → WS send) and client side (WS receive → DOM update)

---

## Key Design Decisions

### 1. Single isolate, not isolate pool

One V8 isolate handles all requests. V8's event loop naturally interleaves async operations (DB queries, fetch calls). No thread pool of isolates — that adds complexity without benefit for a dev server where throughput isn't the bottleneck.

**Rationale:** Matches Cloudflare Workers model. Simpler. The dev server doesn't need to handle 10k concurrent requests.

### 2. Reset-between-requests for DOM scoping (Phase 2)

Phase 2 uses `resetDOM()` before each SSR render rather than full AsyncLocalStorage scoping. SSR is serialized in the persistent isolate (V8 is single-threaded, one render at a time), so there's no concurrent-access concern.

**Rationale:** Lowest implementation effort. ALS-based scoping can be added later if we need concurrent SSR (e.g., streaming SSR with multiple in-flight renders). The current ALS polyfill (`ssr/async_local_storage.rs`) is stack-based and does NOT survive across `await` boundaries — it would break if two SSR renders interleaved at async points. Reset-between-requests avoids this entirely.

### 3. Lazy compilation on HMR (client-side modules)

File changes invalidate the Rust compilation cache and notify the client via WebSocket. Compilation happens on-demand when the client requests the updated module via HTTP. This moves the 5-10ms compilation cost off the notification hot path.

**Rationale:** Vite uses this model. The client always requests the module anyway — compile when requested, not when changed.

### 4. Fetch interception at JS level (not Rust op level)

~~REVISED from Rev 1:~~ Fetch interception happens in **JavaScript**, not in the Rust `op_fetch`. A JS-level fetch proxy (matching the existing `fetch-scope.ts` pattern in the Bun dev server) checks if the URL matches `skipSSRPaths` and calls the handler directly.

**Why not Rust op level:** `op_fetch` is a Rust async op. When V8 JS calls `fetch()`, deno_core invokes the Rust op with `OpState` — but ops cannot call back INTO V8 to invoke the JS handler. V8's `HandleScope` is already held by the calling JS frame, making re-entrant calls unsafe. The JS-level approach avoids this entirely: the fetch proxy calls `server.handler(request)` directly in JS, same isolate, same thread, no Rust round-trip.

```typescript
// Bootstrap JS installs this once in the persistent isolate:
const originalFetch = globalThis.fetch;
const serverHandler = globalThis.__vertz_api_handler; // set during server module load

globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (serverHandler && matchesApiRoute(url)) {
    return serverHandler(new Request(url, init));
  }
  return originalFetch(input, init);
};
```

### 5. Smart debounce: immediate single, batched multi

Single-file changes (the 99% case during development) fire immediately. Multi-file bursts (git checkout, branch switch, formatter running on save) are batched with a 20ms debounce window. Classification is by unique file path count within a 5ms window, not by event count (since `notify` delivers multiple events per file save).

**Rationale:** Developers save one file at a time. The 50ms debounce was penalizing the common case to handle the rare case.

### 6. Dedicated V8 thread with channel-based request dispatch

`JsRuntime` is `!Send` and `!Sync` — it must live on a single thread. Axum handlers run on tokio's thread pool. Communication uses a bounded `tokio::sync::mpsc` channel:

```
Axum handler (tokio worker thread)
  → sends (Request, oneshot::Sender<Response>) into bounded channel
  → awaits oneshot response

Dedicated V8 thread (std::thread::spawn, NOT tokio task)
  → owns JsRuntime
  → custom event loop alternates between:
      1. Poll channel for new requests (non-blocking)
      2. Run V8 event loop for pending async ops (DB, fetch)
  → when request handler resolves, sends Response via oneshot

Backpressure:
  → bounded channel capacity (e.g., 256)
  → if full, Axum handler returns 503 immediately
```

This is the same pattern Deno Deploy uses internally. The channel provides natural backpressure without complex locking.

---

## Module Invalidation Strategy

V8 ES modules are **immutable once loaded**. deno_core's `JsRuntime` caches modules by specifier URL in an internal module map. There is no `unload_module()` or `replace_module()` API. This fundamentally constrains how HMR works in a persistent isolate.

### Client-side modules (UI components): no isolate involvement

Client-side HMR doesn't touch the persistent isolate at all. When a `.tsx` file changes:
1. Rust invalidates the compilation cache entry
2. WebSocket notifies the client: "module X changed"
3. Client requests the updated module via HTTP → Rust compiles on-demand → client evaluates
4. Fast-refresh runtime handles signal/DOM state preservation

The persistent isolate never loads client modules — it only runs `server.ts` and `App.tsx` for SSR.

### Server-side modules (server.ts, entities, services): isolate restart

When a server module changes, the persistent isolate **restarts**:
1. File watcher detects change to a file in the server module graph
2. Rust drains in-flight requests (wait for current V8 tick to complete)
3. Old `JsRuntime` is dropped (DB connections closed, timers cancelled, all state released)
4. New `JsRuntime` created with fresh bootstrap
5. Server module re-loaded: `createServer()` runs, handler cached
6. New isolate accepts requests

**Why full restart, not cache-busted imports:**
- Cache-busted specifiers (`server.ts?v=2`) create new module records but the old ones are **never garbage collected** (module map holds strong references). Over a dev session with 500 saves, this leaks ~500MB.
- Cascading invalidation is fragile — if `server.ts` imports `entities/task.ts` which imports `schemas/task-schema.ts`, all three need new specifiers.
- Full restart is clean, predictable, and bounded in memory.

**Target: < 50ms restart** — `JsRuntime::new()` + bootstrap (~5ms) + module loading (~10-30ms for typical server module graphs). If this exceeds 50ms, investigate V8 startup snapshots to skip bootstrap.

### Memory management

Because server HMR does a full isolate restart, there is no unbounded memory growth from module accumulation. Each restart starts with a fresh V8 heap. Client modules are never loaded in the isolate. The only long-lived memory is between server-file saves, which is bounded by the server module graph size.

As a safety measure, monitor V8 heap size via `v8::Isolate::get_heap_statistics()`. If heap exceeds a threshold (e.g., 512MB — configurable), log a warning and suggest a manual restart.

---

## Resource Lifecycle During Hot-Swap

When the persistent isolate restarts for server module HMR, all resources initialized by `createServer()` must be properly torn down:

### DB connections

`createServer()` calls `createDb()` which opens a connection pool. On isolate restart:
1. Old `JsRuntime` is dropped → V8 GC runs finalizers → JS objects are collected
2. However, native DB connections (managed by `@vertz/db`'s Rust FFI or Bun's native sockets) may not be GC'd immediately
3. **Solution:** Before dropping the old runtime, execute a teardown script:

```javascript
// Executed in old isolate before drop:
if (globalThis.__vertz_server_instance?.dispose) {
  await globalThis.__vertz_server_instance.dispose();
}
```

`ServerInstance.dispose()` must:
- Drain and close the DB connection pool
- Cancel pending timers
- Close any open file handles
- Clear auth session state

**This requires adding a `dispose()` method to `ServerInstance`** (currently does not exist in `create-server.ts`). This is a small addition to `@vertz/server`.

### Auth state

`createAuth()` initializes JWT verifiers, session stores, and OAuth state. These are in-memory JS objects that die with the isolate. No special teardown needed unless they hold native resources (file-backed session stores, etc.).

### Idempotent re-initialization

`ServerInstance.initialize()` calls `initializeAuthTables()` which runs DDL (`CREATE TABLE IF NOT EXISTS`). This is idempotent and safe to re-run on restart.

---

## SSR State Reset Checklist

Before each SSR render in the persistent isolate, the following global state must be reset:

| State | Location | Reset mechanism |
|-------|----------|----------------|
| DOM (document, head, body) | `globalThis.document` | `__vertz_ssr.resetDocument()` — create fresh SSRDocument |
| CSS collector | `globalThis.__vertz_collected_css` | `__vertz_clear_collected_css()` (already exists) |
| SSR query tracking | `globalThis.__vertz_ssr_queries` | Reset to empty object |
| Location | `globalThis.location` | `set_ssr_location(url)` (already exists) |
| Session data | `globalThis.__vertz_ssr_session` | Set from request cookies |
| Context scope stack | `ContextScope` internal state | Reset via `__vertz_ssr.resetContextScope()` |
| Signal tracking state | Current computed/effect batch | Reset via `__vertz_ssr.resetSignalRuntime()` |

**Not reset (intentionally persistent):**
- Context registry (`globalThis.__VERTZ_CTX_REG__`) — contexts are created at module scope, their identity must survive across renders (same stableId → same object)
- Module-level variables — these persist by design (same as Cloudflare Workers)
- Server handler reference — persists until isolate restart

---

## Behavioral Change: Persistent Module State

**Important:** Moving from per-request isolates to a persistent isolate changes the semantics of module-level mutable state.

In the per-request model:
```typescript
// This counter resets to 0 for every request:
let requestCount = 0;
export function handler(req: Request) {
  requestCount++; // always 1
}
```

In the persistent model:
```typescript
// This counter accumulates across ALL requests:
let requestCount = 0;
export function handler(req: Request) {
  requestCount++; // 1, 2, 3, 4, ...
}
```

**This matches Cloudflare Workers behavior** — module-level state persists for the isolate's lifetime. Developers who rely on per-request state should use request-scoped context, not module-level variables.

For the dev server, this is the **correct** behavior because it matches production. Code that breaks in the persistent dev isolate would also break in production on Workers.

**Dev-mode guidance:** The terminal log on first startup should note: `[Server] API handler loaded (persistent isolate — module state persists across requests)`

---

## Migration Path

Primarily a Rust runtime change. Minimal `@vertz/server` addition:

**No changes to:**
- `@vertz/ui` (component model unchanged)
- `@vertz/ui-server` (Bun dev server unchanged — this is a parallel implementation)
- Client-side fast-refresh runtime (unchanged)
- Developer's application code (unchanged)

**One addition to `@vertz/server`:**
- `ServerInstance.dispose()` method — drains DB connection pool, cancels timers, cleans up resources. Called automatically by the Rust runtime before isolate restart. Not called by developer code.

**Semantic change (matches production behavior):**
- Module-level mutable state now persists across requests (same as Cloudflare Workers). Code that relies on per-request state reset should use request-scoped context instead. See "Behavioral Change: Persistent Module State" section.

The persistent isolate replaces the SSR-specific `render_to_html()` flow and adds API delegation. All existing ops (fetch, crypto, timers, etc.) work as-is in the persistent isolate.
