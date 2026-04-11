# Phase 2: Buffered Write + Streaming Read/Write

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Date:** 2026-04-10

## Changes

- `native/vtz/src/server/binary_fs.rs` (modified) — added `handle_binary_write`, `handle_binary_stream_read`, `handle_binary_stream_write` handlers with atomic temp-file+rename, streaming via `ReaderStream`/`into_data_stream`, permission checks, and comprehensive tests
- `native/vtz/Cargo.toml` (modified) — added `tokio-util` and `futures-util` dependencies
- `packages/desktop/src/fs.ts` (modified) — added `writeBinaryFile`, `readBinaryStream`, `writeBinaryStream` functions
- `packages/desktop/src/internal/binary-fetch.ts` (modified) — added `binaryStreamFetch` for streaming writes, refactored shared logic into `internalFetch`
- `packages/desktop/src/__tests__/fs.test-d.ts` (modified) — type tests for all new functions

## CI Status

- [x] Quality gates passed (cargo test, clippy, fmt, tsc typecheck)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### Should-Fix

1. **Predictable temp file names** — `format!("{}.vtz-tmp", expanded)` is predictable and can race with concurrent writes to the same path. Should add a random suffix.
   - **Resolution:** Fixed — added `rand::random::<u64>()` hex suffix to temp file names in both `handle_binary_write` and `handle_binary_stream_write`.

2. **Missing ArrayBuffer rejection type test** — `writeBinaryFile` should reject `ArrayBuffer` (not just `string`) since developers might confuse `Uint8Array` and `ArrayBuffer`.
   - **Resolution:** Fixed — added `@ts-expect-error` test for `ArrayBuffer` argument.

### Nice-to-Have

1. **`expand_tilde` duplication** — The function is inlined from `webview/ipc_handlers/fs.rs` since that module is feature-gated. Acceptable for now; could be factored into a shared utility later.

### Approved

All blockers resolved. Implementation matches design doc.
