# Phase 3: ConsoleLog Replacement

## Context

Remove `ConsoleLog` from `DevServerState`. Migrate all remaining `console_log.push()` call sites to `audit_log.record()`. Add a backward-compatible adapter for `vertz_get_console` with a deprecation notice.

Design doc: `plans/2048-audit-log.md`
GitHub issue: #2048

## Tasks

### Task 1: Remove ConsoleLog and migrate call sites

**Files:**
- `native/vtz/src/server/console_log.rs` (deleted)
- `native/vtz/src/server/mod.rs` (modified — remove `pub mod console_log;`)
- `native/vtz/src/server/module_server.rs` (modified — remove `console_log` field from `DevServerState`)
- `native/vtz/src/server/http.rs` (modified — remove all `console_log.push()` calls, remove `ConsoleLog` construction)

**What to implement:**

1. Remove `pub console_log: ConsoleLog` from `DevServerState`.
2. Remove the `ConsoleLog::new()` construction in `http.rs`.
3. Remove `pub mod console_log;` from `server/mod.rs`.
4. Delete `console_log.rs`.
5. For each remaining `console_log.push()` call site that wasn't already covered by Phase 2 capture points (e.g., the AI navigate log at `http.rs:570`), either:
   - Map it to an existing audit event type, or
   - Remove it if it was purely diagnostic noise (navigation logs are not one of the 5 audit event types)
6. Fix all compilation errors from removing `console_log`.

**Acceptance criteria:**
- [ ] `console_log.rs` is deleted
- [ ] `DevServerState` has no `console_log` field
- [ ] No references to `ConsoleLog` anywhere in the codebase
- [ ] `cargo build` succeeds with no errors
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 2: vertz_get_console backward-compatible adapter

**Files:**
- `native/vtz/src/server/mcp.rs` (modified — update `vertz_get_console` handler + description)
- `native/vtz/src/server/audit_log.rs` (modified — add `to_legacy_log_entries()` adapter method)

**What to implement:**

1. Add a method to `AuditLog` that converts audit events to legacy `LogEntry`-like format:
   ```rust
   pub fn to_legacy_log_entries(&self, last: usize) -> Vec<serde_json::Value> {
       // Query all events, take last N
       // Map each to: { level, message, source, timestamp }
       // level: Info for most, Error for error events
       // source: "compiler"/"ssr"/"watcher"/"api" based on event type
       // timestamp: SystemTime truncated to Unix seconds (u64)
       // message: human-readable string built from event data
   }
   ```

   Mapping:
   | `AuditEventType` | `level` | `source` | `message` format |
   |---|---|---|---|
   | `Compilation` | `"info"` | `"compiler"` | `"Compiled {file} ({duration}ms, {cached/fresh})"` |
   | `SsrRender` | `"info"` | `"ssr"` | `"SSR: {url} ({duration}ms, {ssr/client-only})"` |
   | `FileChange` | `"info"` | `"watcher"` | `"File changed: {path}"` |
   | `Error` | `"error"` | `"{category}"` | `"{message}"` |
   | `ApiRequest` | `"info"` | `"api"` | `"API {method} {path} → {status} ({duration}ms)"` |

2. Update `vertz_get_console` tool description to include deprecation notice:
   `"[Deprecated: use vertz_get_audit_log instead] Get recent console log entries from the dev server..."`

3. Update the `vertz_get_console` handler to call `state.audit_log.to_legacy_log_entries(n)` instead of `state.console_log.last_n(n)`.

**Acceptance criteria:**
- [ ] `vertz_get_console({ last: 50 })` returns entries in the old `LogEntry` shape
- [ ] Each entry has `level`, `message`, `source`, `timestamp` fields
- [ ] `timestamp` is Unix seconds (integer), not ISO 8601
- [ ] Tool description starts with `[Deprecated: use vertz_get_audit_log instead]`
- [ ] Entries are sorted chronologically (oldest first)

---

### Task 3: Remove stale imports and ensure clean build

**Files:**
- `native/vtz/src/server/mcp.rs` (modified — remove `use crate::server::console_log::LogLevel`)
- Any other files with stale `console_log` imports

**What to implement:**

1. Search for all remaining `use.*console_log` imports and remove them.
2. Search for all remaining `LogLevel` references and remove or replace.
3. Run `cargo build`, `cargo test --all`, `cargo clippy --all-targets --release -- -D warnings`, `cargo fmt --all -- --check`.
4. Ensure zero warnings, zero errors.

**Acceptance criteria:**
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
- [ ] No dead code warnings related to audit log or console log
- [ ] All existing MCP tool tests still pass
