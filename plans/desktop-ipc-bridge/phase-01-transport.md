# Phase 1: IPC Transport Layer

## Context

Phase 0 proved the IPC round-trip works. This phase builds the production-quality transport: typed `IpcMethod` enum with exhaustive dispatch, robust JS client with timeout handling and window-close cleanup, and the `@vertz/desktop` package skeleton.

Design doc: `plans/desktop-ipc-bridge.md`

## Tasks

### Task 1: Typed IpcMethod enum + dispatch router

**Files:**
- `native/vtz/src/webview/ipc_method.rs` (new)
- `native/vtz/src/webview/ipc_dispatcher.rs` (modified — use typed enum)
- `native/vtz/src/webview/mod.rs` (modified — add `pub mod ipc_method`)

**What to implement:**

Replace the POC's string-based dispatch with a typed `IpcMethod` enum using `#[serde(tag = "method")]`. For Phase 1, include only the `fs.readTextFile` variant (Phase 2 adds the rest). The router must match exhaustively.

Add typed params structs (e.g., `FsReadTextFileParams { path: String }`) and typed response serialization.

Add `IpcError` enum with `thiserror` for error codes: `NotFound`, `PermissionDenied`, `IoError`, `InvalidPath`, `MethodNotFound`, `ExecutionFailed`.

**Acceptance criteria:**
- [ ] `IpcMethod` enum with serde tag-based deserialization
- [ ] Unknown method string → `MethodNotFound` error (not a panic)
- [ ] Each variant has a typed params struct
- [ ] Exhaustive match in dispatch — adding a variant without a handler is a compile error
- [ ] `IpcError` maps to `DesktopErrorCode` strings
- [ ] Unit tests for deserialization of every variant
- [ ] Unit tests for error code mapping
- [ ] `cargo test` + `cargo clippy` clean

---

### Task 2: Robust JS IPC client

**Files:**
- `native/vtz/src/webview/ipc_client.js` (modified — production quality)
- `native/vtz/src/webview/ipc_dispatcher.rs` (modified — inject script)

**What to implement:**

Rewrite the POC JS client to be production-quality:
- Auto-incrementing request IDs
- Promise registry with per-request timeout (configurable via options)
- Default timeouts per method category (from design doc table)
- `beforeunload` listener that rejects all pending promises with `WINDOW_CLOSED`
- Dangling response handling: silently drop responses for unknown IDs (already timed out)
- `window.__vtz_ipc.invoke(method, params, options?)` → `Promise<{ ok, data/error }>`
- `window.__vtz_ipc_resolve(id, response)` — called by Rust

**Acceptance criteria:**
- [ ] Request IDs are monotonically increasing
- [ ] Timeout rejects with `{ ok: false, error: { code: 'TIMEOUT', message: '...' } }`
- [ ] Window close rejects all pending with `WINDOW_CLOSED`
- [ ] Dangling responses (ID not in pending map) are silently ignored
- [ ] `cargo test` clean (Rust-side injection test)

---

### Task 3: `@vertz/desktop` package skeleton

**Files:**
- `packages/desktop/package.json` (new)
- `packages/desktop/src/index.ts` (new)
- `packages/desktop/src/types.ts` (new)
- `packages/desktop/src/ipc.ts` (new)
- `packages/desktop/tsconfig.json` (new)

**What to implement:**

Create the `@vertz/desktop` TS package with:
- All type definitions from the design doc (DirEntry, FileStat, ShellOutput, WindowSize, DesktopError, DesktopErrorCode, all option types)
- `ipc.invoke<T>(method, params, options?)` — wraps `window.__vtz_ipc.invoke()` with type safety
- `fs.readTextFile(path, options?)` — first method wrapper, calls `ipc.invoke<string>('fs.readTextFile', { path })`
- Result type re-exported from `@vertz/errors`

**Acceptance criteria:**
- [ ] `@vertz/desktop` exports `fs`, `ipc`, and all types
- [ ] `fs.readTextFile('a')` returns `Promise<Result<string, DesktopError>>`
- [ ] Type-level tests (`.test-d.ts`) for `fs.readTextFile` — both positive and negative
- [ ] `vtz run typecheck` passes
- [ ] `vtz run lint` passes
