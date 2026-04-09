# Phase 1: Filter Asset/Internal Requests from Console Logs

- **Author:** claude
- **Reviewer:** claude (adversarial)
- **Date:** 2026-04-08

## Changes

- `native/vtz/src/server/logging.rs` (modified)
- `native/vtz/src/server/http.rs` (modified)

## CI Status

- [x] Quality gates passed (cargo test --all, cargo clippy, cargo fmt)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc (N/A — internal change)

## Findings

### BLOCKER: Duplicate audit log recording for /api/* (FIXED)

`handle_api_request` in http.rs already recorded `AuditEvent::api_request` for `/api/*` routes. With the middleware also recording, these would be double-counted. Removed the handler-level recording — the middleware is the single source of truth.

### SHOULD-FIX: Missing /node_modules/ paths (FIXED)

Added `/node_modules/` to noise path prefixes.

### SHOULD-FIX: API routes with file extensions (FIXED)

`/api/bundle.js` would have been incorrectly classified as noise due to the `.js` extension. Added an early return for `/api/*` paths before the extension check.

### NIT: pub visibility narrowed (FIXED)

Changed `is_noise_path` from `pub` to `pub(crate)`.

### NIT: Added missing edge case tests (FIXED)

Added tests for: bare `/__vertz` prefix, `/node_modules/` paths, API routes with file extensions, trailing slashes.

## Resolution

All blocker and should-fix findings addressed. 21 logging tests pass. Quality gates clean.
