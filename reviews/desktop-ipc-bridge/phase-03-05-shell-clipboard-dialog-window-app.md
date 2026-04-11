# Phase 3-5: Shell, Clipboard, Dialog, Window, and App APIs

- **Author:** Claude Opus 4.6
- **Reviewer:** Claude Opus 4.6 (adversarial review agent)
- **Commits:** 3991f28a7..3a4c6c4f4
- **Date:** 2026-04-10

## Changes

### Rust (native/vtz/src/webview/)
- `ipc_method.rs` (modified) — 16 new IpcMethod enum variants + param/response structs
- `ipc_dispatcher.rs` (modified) — wired all 16 new handlers, passes proxy for window ops
- `ipc_handlers/mod.rs` (modified) — added 5 new modules
- `ipc_handlers/shell.rs` (new) — shell.execute via tokio::process::Command
- `ipc_handlers/clipboard.rs` (new) — read/write via arboard in spawn_blocking
- `ipc_handlers/app.rs` (new) — platform dirs + package.json version
- `ipc_handlers/dialog.rs` (new) — native dialogs via rfd AsyncFileDialog/AsyncMessageDialog
- `ipc_handlers/window.rs` (new) — main-thread dispatch via UserEvent::WindowOp
- `mod.rs` (modified) — WindowOp enum + UserEvent::WindowOp + event loop handler

### TypeScript (packages/desktop/src/)
- `shell.ts`, `clipboard.ts`, `app.ts`, `dialog.ts`, `window.ts` (new)
- `index.ts` (modified) — namespace exports
- `__tests__/shell.test-d.ts`, `clipboard.test-d.ts`, `app.test-d.ts`, `dialog.test-d.ts`, `window.test-d.ts` (new)

### Dependencies
- `native/vtz/Cargo.toml` — added `arboard = "3"` and `rfd = "0.15"` (optional, desktop feature)

## CI Status

- [x] Quality gates passed at 3a4c6c4f4
  - 3185 Rust tests pass (130 webview-specific)
  - clippy: 0 warnings
  - rustfmt: clean
  - TS typecheck: 0 errors
  - oxlint: 0 warnings
  - oxfmt: clean

## Review Checklist

- [x] Delivers what the ticket asks for — all 5 namespaces implemented
- [x] TDD compliance — tests written for all handlers
- [x] No type gaps — all TS methods return exact `Result<T, DesktopError>` types
- [x] No security issues — shell.execute uses Command::new (not shell), no injection
- [x] Public API matches design doc — all method signatures verified

## Findings

### Adversarial Review (2 blockers, 4 should-fix)

**BLOCKER 1 (fixed):** `dialog.open()` accepted `multiple` and `directory` options that were silently ignored. Removed from both Rust `DialogOpenParams` and TS `OpenDialogOptions` at 3a4c6c4f4.

**BLOCKER 2 (fixed):** `CANCELLED` in `DesktopErrorCode` was never produced by any code path. Removed at 3a4c6c4f4.

**SHOULD-FIX 1 (deferred):** `app.dataDir`/`cacheDir` have no Windows handling — #2486
**SHOULD-FIX 2 (deferred):** `shell.execute` has no Rust-side timeout (zombie process risk) — #2485
**SHOULD-FIX 3 (deferred):** `shell.execute` has no `cwd` parameter — #2484
**SHOULD-FIX 4 (deferred):** `ipc.ts` uses `as DesktopErrorCode` without runtime validation — #2487

### Informational Notes

1. **Window close via IPC** — `WindowOp::Close` triggers shutdown (sends shutdown signal + ControlFlow::Exit). This is correct behavior but means `appWindow.close()` exits the entire application, not just the window. Documented in JSDoc.

2. **Clipboard in headless CI** — The clipboard test gracefully skips when clipboard is unavailable (headless environments). Good pattern.

3. **`app.version()` CWD dependency** — The handler walks CWD ancestors for package.json. In desktop mode, CWD is where `vtz dev --desktop` was run, which is the app root. Correct for the use case.

## Resolution

Both blockers resolved at 3a4c6c4f4. Four should-fix items deferred with GitHub issues created. Approved.
