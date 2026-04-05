# API Route Delegation in Rust Dev Server (#2304)

## Problem

The Rust dev server (`vtz dev`) returns `500 Internal Server Error` with `{"error":"Handler error: No handler"}` for all `/api/*` requests. The infrastructure for V8-based API dispatch exists (`handle_api_request` in `http.rs`, `API_DISPATCH_JS` in `persistent_isolate.rs`) but has three gaps that prevent it from working reliably.

## Root Cause Analysis

### Gap 1: Incomplete server entry detection

`detect_server_entry()` in `config.rs` only checks `src/server.ts` and `src/server.tsx`. The TypeScript `detectAppType()` in `app-detector.ts` also checks `src/api/server.{ts,tsx,js}` as a fallback. Apps that place their server in `src/api/server.ts` without a top-level re-export are invisible to the Rust runtime.

### Gap 2: No dispatch guard for missing handler

`handle_api_request()` in `http.rs` dispatches every `/api/*` request to V8 without checking `isolate.has_api_handler()`. When the handler wasn't extracted (server module not found, loaded but wrong shape, or evaluation error), the JS dispatch code returns `{ error: 'No handler' }`, which becomes a generic 500. The 404 path only fires when the isolate itself doesn't exist.

### Gap 3: Unhelpful error message

The 500 response `{"error":"Handler error: No handler"}` gives no guidance. The developer doesn't know whether the server entry wasn't found, failed to load, or exported the wrong shape.

## API Surface

No new public API for framework users. The changes are internal to the `vtz` Rust runtime:

```rust
// config.rs — detect_server_entry now checks src/api/ subdirectory + .js extension
fn detect_server_entry(src_dir: &Path) -> Option<PathBuf> {
    let candidates = ["server.ts", "server.tsx", "server.js"];
    // 1. Check src/server.{ts,tsx,js} (preferred)
    for candidate in &candidates {
        let path = src_dir.join(candidate);
        if path.exists() {
            return Some(path);
        }
    }
    // 2. Check src/api/server.{ts,tsx,js} (fallback — matches Bun detector)
    let api_dir = src_dir.join("api");
    for candidate in &candidates {
        let path = api_dir.join(candidate);
        if path.exists() {
            return Some(path);
        }
    }
    None
}
```

```rust
// http.rs — handle_api_request checks has_api_handler before dispatch
async fn handle_api_request(state: ..., req: ..., path: &str) -> Response {
    let isolate = match state.api_isolate... {
        Some(isolate) => isolate,
        None => return json_error(404, "No server entry configured. Create src/server.ts (or src/api/server.ts) and export a createServer() instance as default export."),
    };

    if !isolate.is_initialized() {
        return json_error(503, "API isolate is still initializing. Try again shortly.");
    }

    // NEW: Guard — return actionable 404 instead of dispatching to V8
    if !isolate.has_api_handler() {
        return json_error(404, concat!(
            "No API handler found. Ensure src/server.ts (or src/api/server.ts) ",
            "exports a createServer() instance as default export ",
            "(e.g., `export default createServer(...)`)."
        ));
    }

    // ... existing dispatch logic unchanged ...
}
```

### Developer-facing behavior

| Scenario | Before | After |
|---|---|---|
| No `src/server.ts`, no `src/api/server.ts` | 404 "No server entry configured..." (already correct when isolate is None) | 404 with improved message mentioning both paths |
| Server at `src/api/server.ts` (no top-level) | 500 "Handler error: No handler" | Handler loads successfully |
| Server loads but exports wrong shape | 500 "Handler error: No handler" | 404 "No API handler found. Ensure ... exports a createServer() instance..." |
| Server loads successfully | Works (unchanged) | Works (unchanged) |

## Manifesto Alignment

- **Principle 1 (If it builds, it works)**: The Rust runtime should detect and load server entries using the same conventions as the Bun runtime. Behavioral parity eliminates a class of "works on Bun, fails on vtz" bugs.
- **Principle 2 (One way to do things)**: Both runtimes now agree on `src/server.ts` > `src/api/server.ts` precedence. No ambiguity.
- **Principle 3 (AI agents are first-class)**: Actionable error messages tell agents exactly what to create/fix. "No handler" is opaque; "Create src/server.ts with a createServer() export" is actionable.
- **Principle 7 (Performance is not optional)**: The `has_api_handler()` guard avoids a V8 round-trip for every API request when no handler exists.

## Non-Goals

- **Configurable `serverEntry` in vertz.config.ts**: Auto-detection with the `src/api/` fallback covers all current examples. Explicit config can be added later if needed.
- **Running `initialize()` on server instances**: The `createServer()` handler is available synchronously. DB initialization happens lazily on first query. Explicit `initialize()` calls are not needed for handler extraction.
- **API proxy to external Bun process**: The V8-based handler dispatch is the right approach — it keeps the single-process model and shares module state with SSR (fetch interception).

## Known Limitation (follow-on)

**Watcher restart does not re-evaluate `server_entry`**: When the file watcher triggers an isolate restart, it reuses the original `PersistentIsolateOptions`. If a developer creates `src/api/server.ts` after `vtz dev` has started, the new file is invisible until the dev server is restarted. This is pre-existing behavior and out of scope for this PR — tracked as a follow-on improvement.

## Unknowns

None identified. The existing V8 dispatch infrastructure works correctly once the handler is extracted — the only gaps are in detection and error reporting.

## POC Results

N/A — the existing infrastructure (`handle_api_request`, `API_DISPATCH_JS`, `extract_api_handler`) proves the V8 dispatch approach works. The issue is purely in the detection and guard logic.

## Type Flow Map

N/A — this is a Rust-only change with no generic type parameters.

## E2E Acceptance Test

### Test 1: Server entry at `src/api/server.ts` is detected

```
Given: An app with src/api/server.ts (no src/server.ts)
When: vtz dev starts
Then: Terminal shows "[Server] API handler loaded (persistent isolate...)"
And: GET /api/... returns a valid response (not 500)
```

### Test 2: Missing handler returns actionable 404

```
Given: An app with NO server entry (ui-only)
When: GET /api/anything
Then: Response is 404 with helpful message mentioning src/server.ts
```

### Test 3: Server module loaded but wrong export shape

```
Given: src/server.ts exports a plain object without .handler or .requestHandler
When: vtz dev starts
Then: Terminal shows "[Server] Server module loaded but no handler found"
And: GET /api/anything returns 404 with "No API handler found..." message
```

### Test 4: Parity with Bun detector — src/server.ts preferred over src/api/server.ts

```
Given: Both src/server.ts and src/api/server.ts exist
When: vtz dev starts
Then: src/server.ts is loaded (not src/api/server.ts)
```
