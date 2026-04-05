# Phase 1: AuditLog Core + MCP Tool

## Context

Build the audit log ring buffer, add it to `DevServerState`, wire up the `vertz_get_audit_log` MCP tool, and extend the diagnostics endpoint. No capture points yet — the tool returns an empty log. This validates the query interface end-to-end.

Design doc: `plans/2048-audit-log.md`
GitHub issue: #2048

## Tasks

### Task 1: AuditLog ring buffer and types

**Files:**
- `native/vtz/src/server/audit_log.rs` (new)
- `native/vtz/src/server/mod.rs` (modified — add `pub mod audit_log;`)

**What to implement:**

Create `audit_log.rs` with:

1. `AuditEventType` enum — `ApiRequest`, `SsrRender`, `Compilation`, `FileChange`, `Error`. Derives: `Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash`. `#[serde(rename_all = "snake_case")]`.

2. `AuditEvent` struct — fields: `timestamp: SystemTime`, `event_type: AuditEventType`, `duration_ms: Option<f64>`, `data: serde_json::Value`. Custom `Serialize` impl that formats `timestamp` as ISO 8601 with nanosecond precision and renames `event_type` to `"type"` in JSON output. `skip_serializing_if` on `duration_ms`.

3. Typed constructors on `AuditEvent`:
   - `pub fn api_request(method: &str, path: &str, status: u16, duration_ms: f64) -> Self`
   - `pub fn ssr_render(url: &str, status: u16, query_count: usize, is_ssr: bool, duration_ms: f64) -> Self`
   - `pub fn compilation(file: &str, cached: bool, css_extracted: bool, duration_ms: f64) -> Self`
   - `pub fn file_change(path: &str, kind: &str) -> Self`
   - `pub fn error(category: &str, severity: &str, message: &str, file: Option<&str>, line: Option<u32>, column: Option<u32>) -> Self`
   Each constructor sets `timestamp: SystemTime::now()` and builds the appropriate `serde_json::json!({})` for `data`.

4. `AuditFilter` struct — `last: usize`, `event_types: Option<Vec<AuditEventType>>`, `since: Option<SystemTime>`.

5. `AuditQueryResult` struct — `events: Vec<AuditEvent>`, `count: usize`, `total: usize`, `truncated: bool`. Derives `Serialize`.

6. `AuditSummary` struct — `total_events: usize`, `capacity: usize`, `oldest_timestamp: Option<SystemTime>`, `newest_timestamp: Option<SystemTime>`, `events_by_type: HashMap<AuditEventType, usize>`. Custom `Serialize` for timestamps.

7. `AuditLog` struct — `entries: Arc<RwLock<VecDeque<AuditEvent>>>`, `capacity: usize`. Methods:
   - `pub fn new(capacity: usize) -> Self`
   - `pub fn record(&self, event: AuditEvent)` — push to back, evict from front if at capacity
   - `pub fn query(&self, filter: AuditFilter) -> AuditQueryResult` — filter by event_types, filter by since, take last N, set truncated if filtered count > last
   - `pub fn summary(&self) -> AuditSummary` — count per type, oldest/newest timestamps
   - Implement `Default` (capacity = `DEFAULT_CAPACITY`)

8. `const DEFAULT_CAPACITY: usize = 1000;`

**Acceptance criteria:**
- [ ] `AuditLog::new(5)` creates an empty log with capacity 5
- [ ] `record()` adds events, evicts oldest at capacity
- [ ] `query()` with no filters returns last 100 (or all if fewer)
- [ ] `query()` with `event_types` filter returns only matching types
- [ ] `query()` with `since` filter returns only events after that time
- [ ] `query()` applies filters first, then truncates to `last`
- [ ] `summary()` returns correct counts per type
- [ ] Typed constructors produce correct JSON data shapes
- [ ] `AuditEvent` serializes with ISO 8601 timestamp and `"type"` field name
- [ ] `duration_ms` is omitted from JSON when `None`

---

### Task 2: Add AuditLog to DevServerState and wire MCP tool

**Files:**
- `native/vtz/src/server/module_server.rs` (modified — add `audit_log` field)
- `native/vtz/src/server/mcp.rs` (modified — add tool definition + execute handler)
- `native/vtz/src/server/http.rs` (modified — construct `AuditLog` in state init)

**What to implement:**

1. Add `pub audit_log: AuditLog` to `DevServerState` in `module_server.rs`.

2. In `http.rs` where `DevServerState` is constructed (in `start_server_with_lifecycle`), add `audit_log: AuditLog::new(audit_log::DEFAULT_CAPACITY)`.

3. In `mcp.rs` `tool_definitions()`, add the `vertz_get_audit_log` tool definition matching the design doc schema.

4. In `mcp.rs` `execute_tool()`, add the `"vertz_get_audit_log"` match arm:
   - Parse `last` (default 100, max 1000), `type` (comma-separated, validate against `AuditEventType`), `since` (parse ISO 8601 to `SystemTime`)
   - On invalid type name: return `isError: true` with valid types listed
   - Call `state.audit_log.query(filter)`
   - Return result as pretty-printed JSON text content

**Acceptance criteria:**
- [ ] `DevServerState` has `audit_log` field
- [ ] `vertz_get_audit_log` appears in MCP tool list
- [ ] Calling the tool with `{}` returns `{ "events": [], "count": 0, "total": 0, "truncated": false }`
- [ ] Calling with `{ "type": "invalid" }` returns an error with valid type names
- [ ] Calling with `{ "last": 50 }` sets the filter correctly

---

### Task 3: Diagnostics endpoint integration

**Files:**
- `native/vtz/src/server/diagnostics.rs` (modified — add `audit_log` field to `DiagnosticsSnapshot`)
- `native/vtz/src/server/http.rs` (modified — pass `audit_log` to `collect_diagnostics`)

**What to implement:**

1. Add `AuditLogStats` struct to `diagnostics.rs`:
   ```rust
   pub struct AuditLogStats {
       pub total_events: usize,
       pub capacity: usize,
       pub oldest_timestamp: Option<String>,  // formatted ISO 8601
       pub newest_timestamp: Option<String>,  // formatted ISO 8601
       pub events_by_type: HashMap<String, usize>,  // serialized type names
   }
   ```

2. Add `pub audit_log: AuditLogStats` to `DiagnosticsSnapshot`.

3. Update `collect_diagnostics()` to accept `&AuditLog` and call `summary()` to populate the field.

4. Update the call site in `http.rs` to pass `&state.audit_log`.

**Acceptance criteria:**
- [ ] `GET /__vertz_diagnostics` response includes `audit_log` field
- [ ] `audit_log.total_events` is 0 for a fresh server
- [ ] `audit_log.events_by_type` is an object with type names as keys
- [ ] Existing diagnostics tests still pass
