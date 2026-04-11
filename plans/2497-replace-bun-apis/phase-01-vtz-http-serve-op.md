# Phase 1: vtz HTTP Serve Op + Server Adapter + Runtime Marker

## Context

Issue #2497 — replace Bun-specific APIs with vtz-native equivalents. This phase implements the HTTP server foundation: a native Rust op that lets JavaScript code create HTTP servers, a TypeScript adapter for `@vertz/core`'s `ServerAdapter` interface, and a runtime identity marker for auto-detection.

Design doc: `plans/2497-replace-bun-apis.md`

## Tasks

### Task 1: Runtime Identity Marker

**Files:** (2)
- `native/vtz/src/runtime/js_runtime.rs` (modified)
- `native/vtz/tests/v8_integration.rs` (modified)

**What to implement:**
Add `globalThis.__vtz_runtime = true` to the bootstrap JS in `VertzJsRuntime::bootstrap_js()`. This is a deliberate, stable contract for runtime detection — not tied to any specific op module.

**Acceptance criteria:**
- [ ] `globalThis.__vtz_runtime === true` in any JS executed by the vtz runtime
- [ ] Rust integration test verifies the marker exists
- [ ] Marker is present in both `new()` and `new_for_test()` paths (via bootstrap JS)

---

### Task 2: `op_http_serve` Native Op (Rust)

**Files:** (4)
- `native/vtz/src/runtime/ops/http_serve.rs` (new)
- `native/vtz/src/runtime/ops/mod.rs` (modified)
- `native/vtz/src/runtime/js_runtime.rs` (modified)
- `native/vtz/tests/v8_integration.rs` (modified)

**What to implement:**

Create a new op module `http_serve` that exposes two ops:

1. `op_http_serve(port: u16, hostname: String)` — async op that:
   - Spawns a Tokio task running an Axum HTTP server on the given port/hostname
   - Binds to the port (supports port 0 for OS-assigned)
   - Returns `{ id: u32, port: u16, hostname: String }` (actual bound port)
   - The server stores incoming requests in a channel/queue

2. `op_http_serve_accept(server_id: u32)` — async op that:
   - Waits for the next incoming request on the server
   - Converts the Axum request to a serialized form: `{ id: u32, method: String, url: String, headers: Vec<(String, String)>, body: Option<Vec<u8>> }`
   - Returns the request to JS

3. `op_http_serve_respond(request_id: u32, status: u16, headers: Vec<(String, String)>, body: Vec<u8>)` — sync op that:
   - Sends the response back to the waiting Axum handler
   - Uses a oneshot channel per request

4. `op_http_serve_close(server_id: u32)` — sync op that shuts down the server

**Architecture:** Use a request/response channel pattern:
- Server spawns Axum, each incoming request gets a `oneshot::Sender<Response>`
- `op_http_serve_accept` polls a `mpsc::Receiver<(Request, oneshot::Sender<Response>)>`
- JS receives the request, processes it, calls `op_http_serve_respond` to send back the response
- This avoids passing JS functions into Rust ops (which deno_core doesn't support for async ops)

**Bootstrap JS:** Expose a high-level `__vtz_http.serve(port, hostname, handler)` that:
- Calls `op_http_serve` to create the server
- Runs an accept loop: `while (true) { const req = await accept(); const res = await handler(new Request(...)); respond(req.id, res); }`
- Returns `{ port, hostname, close() }`

**Acceptance criteria:**
- [ ] `op_http_serve` binds a port and returns actual port number (including port 0)
- [ ] `op_http_serve_accept` receives incoming HTTP requests
- [ ] `op_http_serve_respond` sends response back to client
- [ ] `op_http_serve_close` shuts down the server cleanly
- [ ] Bootstrap JS exposes `__vtz_http.serve(port, hostname, handler)`
- [ ] Rust integration test: create server, send fetch request, verify response
- [ ] Supports both text and binary response bodies

---

### Task 3: `createVtzAdapter` + `detectAdapter` Update (TypeScript)

**Files:** (5)
- `packages/core/src/app/vtz-adapter.ts` (new)
- `packages/core/src/app/detect-adapter.ts` (modified)
- `packages/core/src/app/vtz-adapter.test.ts` (new)
- `packages/core/src/app/detect-adapter.test.ts` (modified or new)
- `packages/core/src/types/server-adapter.ts` (check — may need no changes)

**What to implement:**

1. `vtz-adapter.ts` — `createVtzAdapter(): ServerAdapter` that:
   - Calls `globalThis.__vtz_http.serve(port, hostname, handler)` inside `listen()`
   - Returns `{ port, hostname, close() }` matching `ServerHandle`
   - Handler is the standard `(request: Request) => Promise<Response>` fetch handler

2. `detect-adapter.ts` — Update to:
   - Add `hasVtz: '__vtz_runtime' in globalThis` to `RuntimeHints`
   - Make `detectAdapter` async (returns `Promise<ServerAdapter>`)
   - Use `await import('./vtz-adapter')` for vtz, `await import('./bun-adapter')` for Bun
   - Prefer vtz over Bun when both are present (vtz is more specific)

3. Update `app-builder.ts` if needed — `listen()` already returns `Promise<ServerHandle>`, but `detectAdapter()` changing to async may require a small update.

**Acceptance criteria:**
- [ ] `createVtzAdapter()` returns a valid `ServerAdapter`
- [ ] `detectAdapter()` returns vtz adapter when `__vtz_runtime` is present
- [ ] `detectAdapter()` returns Bun adapter when only Bun is present
- [ ] `detectAdapter()` throws when neither runtime is detected
- [ ] `app.listen(0)` works with vtz adapter (OS-assigned port)
- [ ] Typecheck passes: `vtz run typecheck` on `packages/core`
