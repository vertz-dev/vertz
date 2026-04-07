# Phases 0-2: Desktop IPC Bridge

- **Author:** Claude Opus 4.6
- **Reviewer:** Claude Opus 4.6 (adversarial review agent)
- **Date:** 2026-04-06

## Changes

- `native/vtz/src/webview/ipc_dispatcher.rs` (modified — typed dispatch, JS client with category timeouts)
- `native/vtz/src/webview/ipc_method.rs` (new — IpcMethod enum, params/response structs)
- `native/vtz/src/webview/ipc_handlers/mod.rs` (new)
- `native/vtz/src/webview/ipc_handlers/fs.rs` (new — all 8 fs handlers with 26 tests)
- `native/vtz/src/webview/mod.rs` (modified — module declarations, run() accepts dispatcher)
- `native/vtz/src/main.rs` (modified — tokio handle channel, IpcDispatcher wiring)
- `native/vtz/examples/webview_poc.rs` (modified — updated run() call)
- `packages/desktop/package.json` (new)
- `packages/desktop/src/types.ts` (new — all type definitions)
- `packages/desktop/src/ipc.ts` (new — typed IPC invoke wrapper)
- `packages/desktop/src/fs.ts` (new — 8 fs method wrappers)
- `packages/desktop/src/index.ts` (new — barrel exports)
- `packages/desktop/src/__tests__/fs.test-d.ts` (new — type-level tests)
- `packages/desktop/tsconfig.json` (new)
- `packages/desktop/tsconfig.typecheck.json` (new)
- `packages/desktop/bunup.config.ts` (new)

## CI Status

- [x] Quality gates passed: cargo test (46 IPC tests), cargo clippy, cargo fmt, tsc typecheck, oxlint

## Findings

### Blockers (all fixed)

- **B1 (FIXED):** serde snake_case/camelCase mismatch on `FileStatResponse` and `DirEntryResponse` — added `#[serde(rename_all = "camelCase")]`
- **B3 (FIXED):** `getIpc()` threw Error instead of returning Result — changed to return `err()` with EXECUTION_FAILED code
- **B4 (FIXED):** unsafe `as DesktopError` cast — now uses explicit `as DesktopErrorCode` on the code field

### Should-fix (fixed)

- **S4 (FIXED):** TOCTOU race in `write_text_file` parent dir check — removed `exists()` check, always call `create_dir_all`

### Acknowledged (not blocking)

- S1: No runtime TS tests — package is thin wrappers, type tests cover the API surface
- S2: bridge.rs truncate is pre-existing, not in scope
- S3: `fs.remove` only handles empty dirs — documented in JSDoc
- S5: parse_params uses IoError — acceptable for now, can add InvalidParams later
- S6: expand_tilde doesn't handle ~user — non-goal per design doc
- S7/S8: JS number overflow — practically impossible (requires 2^53 IPC calls)

## Resolution

All blockers fixed. Quality gates re-run and passing.
