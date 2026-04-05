# Phase 2: Add Handler Guard and Improve Error Messages

## Context

The Rust dev server's `handle_api_request()` in `http.rs` dispatches every `/api/*` request to V8 without checking `isolate.has_api_handler()`. When the handler wasn't extracted, V8 returns `{ error: 'No handler' }`, which becomes a generic 500. This phase adds a `has_api_handler()` guard before dispatch and improves all error messages to be actionable.

Design doc: `plans/2304-api-route-delegation.md` (Gaps 2 & 3)

## Tasks

### Task 1: Add `has_api_handler()` guard and update error messages

**Files:** (2)
- `native/vtz/src/server/http.rs` (modified)
- `native/vtz/tests/parity/http_serving.rs` (modified)

**What to implement:**

In `handle_api_request()`, after the `is_initialized()` check (line ~1081), add:

```rust
if !isolate.has_api_handler() {
    return json_error(404, concat!(
        "No API handler found. Ensure src/server.ts (or src/api/server.ts) ",
        "exports a createServer() instance as default export ",
        "(e.g., `export default createServer(...)`)."
    ));
}
```

Also update the existing "No server entry configured" message (line ~1067) to mention both paths:
```
"No server entry configured. Create src/server.ts (or src/api/server.ts) and export a createServer() instance as default export."
```

For the JSON error responses, use a helper or inline the response builder — whichever is cleaner. The key requirement is that:
1. Missing isolate → 404 with message mentioning both `src/server.ts` and `src/api/server.ts`
2. Isolate initializing → 503 (unchanged behavior, message is already good)
3. Isolate ready but no handler → 404 with actionable guidance about exports
4. Isolate ready + handler → dispatch (unchanged)

Update the existing integration test in `http_serving.rs` to verify the updated error message includes the new path guidance.

**Acceptance criteria:**
- [ ] `handle_api_request()` checks `has_api_handler()` before dispatching to V8
- [ ] Missing isolate returns 404 mentioning both `src/server.ts` and `src/api/server.ts`
- [ ] Missing handler (isolate exists but no handler) returns 404 with "No API handler found" + export guidance
- [ ] Existing 503 for uninitialized isolate is preserved
- [ ] Integration test verifies the updated error message
- [ ] All existing tests pass
