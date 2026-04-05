# Phase 1 Review: AuditLog Core + MCP Tool

- **Author:** claude
- **Reviewer:** review-agent
- **Commits:** f4d5ce726
- **Date:** 2026-04-05

## Changes

- `native/vtz/src/server/audit_log.rs` (new) -- Core ring buffer, types, serialization, 28 tests
- `native/vtz/src/server/mod.rs` (modified) -- Added `pub mod audit_log;`
- `native/vtz/src/server/module_server.rs` (modified) -- Added `audit_log: AuditLog` field to `DevServerState`
- `native/vtz/src/server/mcp.rs` (modified) -- Added `vertz_get_audit_log` tool definition and execute handler
- `native/vtz/src/server/diagnostics.rs` (modified) -- Added `AuditSummary` to `DiagnosticsSnapshot`, updated `collect_diagnostics` signature
- `native/vtz/src/server/http.rs` (modified) -- Initialized `audit_log` in state construction, passed to diagnostics handler
- `native/vtz/tests/error_overlay.rs` (modified) -- Updated integration tests to pass `&audit_log` to `collect_diagnostics`
- `plans/2048-audit-log.md` (new) -- Design doc
- `plans/2048-audit-log/phase-01-core-and-mcp-tool.md` (new) -- Phase 1 plan
- `plans/2048-audit-log/phase-02-capture-points.md` (new) -- Phase 2 plan
- `plans/2048-audit-log/phase-03-consolelog-replacement.md` (new) -- Phase 3 plan

## CI Status

- [x] Quality gates passed at f4d5ce726

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (see findings B1)
- [x] No type gaps or missing edge cases (minor observations)
- [x] No security issues
- [x] Public API matches design doc

## Findings

### Blockers

**B1: No MCP handler-level tests for `vertz_get_audit_log`**

The `mcp.rs` `execute_tool` handler for `"vertz_get_audit_log"` has zero tests. The existing tests only verify the tool appears in `tool_definitions()`. But the actual handler logic -- parsing `last`, validating `type` comma-separated values, parsing `since`, constructing the filter, returning the correct JSON shape, and returning `isError: true` for invalid types -- is completely untested at the handler level.

**Fix:** Add handler-level tests covering argument parsing, error cases, and the empty result shape.

**B2: Invalid `since` timestamp silently ignored**

When the LLM provides a malformed `since` parameter, the handler silently falls back to `None` (no time filter). This is inconsistent with the `type` parameter handling which returns `isError: true` for invalid values.

**Fix:** If `args.get("since")` returns `Some` but `parse_timestamp` returns `None`, return an `isError: true` response explaining the expected ISO 8601 format.

### Should Fix

**S1: `query()` allocates a full filtered Vec before truncating** -- iterate from back for O(last) clones instead of O(total). Can be a follow-up.

**S2: Diagnostics serialization test does not verify `audit_log` field** -- Add assertions for `parsed["audit_log"]` fields.

**S3: `last: 0` allows empty result silently from MCP handler** -- Consider clamping to `max(1, min(n, 1000))`.

### Observations

- Solid ring buffer implementation with correct thread safety
- Good LLM-friendly error messages for invalid types
- Forward-looking legacy adapter (`to_legacy_log_entries`)
- Clean serialization with consistent field ordering

## Resolution

- B1: Fixed -- added 5 MCP handler-level tests
- B2: Fixed -- invalid `since` now returns `isError: true`
- S2: Fixed -- added audit_log assertions to diagnostics test
