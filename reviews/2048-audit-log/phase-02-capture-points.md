# Phase 2: Capture Points

- **Author:** claude-opus-4-6
- **Reviewer:** claude-opus-4-6 (automated)
- **Commits:** edb0b64cf
- **Date:** 2026-04-05

## Changes

- `native/vtz/src/server/http.rs` (modified — API request, SSR render, file watcher capture)
- `native/vtz/src/server/module_server.rs` (modified — compilation capture)
- `native/vtz/src/server/mcp.rs` (modified — MCP render success/error/fallback capture)
- `native/vtz/src/errors/broadcaster.rs` (modified — error capture via Option<AuditLog>)

## CI Status

- [x] Quality gates passed at edb0b64cf

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### Approved

All 5 event types now populate the audit log at their capture sites:
- API request: after `isolate.handle_request()` completes
- SSR render: after `isolate.handle_ssr()` completes
- Compilation: around `pipeline.compile_for_browser()` with timing
- File change: in watcher event loop after relative path computation
- Error: via `ErrorBroadcaster.with_audit_log()` pattern (Option A)

ErrorBroadcaster pattern is clean — single capture point, `AuditLog` is cheap to clone (Arc).

## Resolution

No changes needed.
