# Full-Stack Audit Log

> Unified timeline of all server-side events, exposed via MCP tool and diagnostics endpoint.
> GitHub: #2048

## Context

The Vertz dev server already captures events in several places: `ConsoleLog` (100-entry ring buffer with source tags), `ErrorBroadcaster` (priority-based error state), `McpEventHub` (real-time WebSocket push), and `DiagnosticsSnapshot` (health endpoint). But these are disconnected — when an LLM debugs a data-fetching issue, it needs to correlate an SSR render with the API request it triggered, the compilation that preceded it, and the file change that kicked everything off. Today that means calling three different MCP tools and mentally joining the timelines.

The audit log is a single, typed, chronological ring buffer that captures every server-side event and exposes it through one query interface.

## API Surface

### MCP Tool: `vertz_get_audit_log`

```json
{
  "name": "vertz_get_audit_log",
  "description": "Get the server audit log — a unified timeline of API requests, SSR renders, compilations, file changes, and errors. Events are chronological with nanosecond-precision timestamps. Filters (type, since) are applied first, then the last N events are returned from the filtered set. Event data fields by type: api_request has method/path/status; ssr_render has url/status/query_count/is_ssr; compilation has file/cached/css_extracted; file_change has path/kind; error has category/severity/message/file/line/column. duration_ms is present on api_request, ssr_render, and compilation events.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "last": {
        "type": "number",
        "description": "Number of most recent events to return after applying type and since filters (default: 100, max: 1000)"
      },
      "type": {
        "type": "string",
        "description": "Filter by event type. Comma-separated for multiple. Values: api_request, ssr_render, compilation, file_change, error. Unknown types return an error listing valid values."
      },
      "since": {
        "type": "string",
        "description": "ISO 8601 timestamp. Only return events after this time. Additive to #2048 requirements — included for LLM debugging of recent time windows."
      }
    },
    "required": []
  }
}
```

**Response shape** (returned as MCP `text` content):

```json
{
  "events": [
    {
      "timestamp": "2026-04-05T14:32:01.123456789Z",
      "type": "file_change",
      "data": {
        "path": "src/components/TaskCard.tsx",
        "kind": "modify"
      }
    },
    {
      "timestamp": "2026-04-05T14:32:01.250000000Z",
      "type": "compilation",
      "duration_ms": 12.3,
      "data": {
        "file": "src/components/TaskCard.tsx",
        "cached": false,
        "css_extracted": true
      }
    },
    {
      "timestamp": "2026-04-05T14:32:01.400000000Z",
      "type": "ssr_render",
      "duration_ms": 45.7,
      "data": {
        "url": "/tasks",
        "status": 200,
        "query_count": 2,
        "is_ssr": true
      }
    },
    {
      "timestamp": "2026-04-05T14:32:02.100000000Z",
      "type": "api_request",
      "duration_ms": 8.2,
      "data": {
        "method": "GET",
        "path": "/api/tasks",
        "status": 200
      }
    },
    {
      "timestamp": "2026-04-05T14:32:03.000000000Z",
      "type": "error",
      "data": {
        "category": "build",
        "severity": "error",
        "message": "Expected ';' but found '}'",
        "file": "src/components/TaskCard.tsx",
        "line": 42,
        "column": 10
      }
    }
  ],
  "count": 5,
  "total": 312,
  "truncated": false
}
```

### HTTP Endpoint: `GET /__vertz_diagnostics`

The existing diagnostics endpoint gains an `audit_log` field:

```json
{
  "uptime_secs": 120,
  "cache": { "entries": 42 },
  "module_graph": { "node_count": 15 },
  "websocket": { "hmr_clients": 1, "error_clients": 0 },
  "errors": [],
  "version": "0.1.0",
  "audit_log": {
    "total_events": 312,
    "capacity": 1000,
    "oldest_timestamp": "2026-04-05T14:30:00.000000000Z",
    "newest_timestamp": "2026-04-05T14:32:03.000000000Z",
    "events_by_type": {
      "api_request": 45,
      "ssr_render": 12,
      "compilation": 120,
      "file_change": 100,
      "error": 35
    }
  }
}
```

### ConsoleLog Replacement

`ConsoleLog` is fully replaced by the audit log. The existing `vertz_get_console` MCP tool becomes a thin adapter that queries the audit log, filtering for events that map to the old console log entries and formatting them as the existing `LogEntry` shape for backward compatibility. The `vertz_get_console` tool description is updated with a deprecation notice: `"[Deprecated: use vertz_get_audit_log instead] ..."` so LLMs prefer the canonical tool. `vertz_get_audit_log` is the single interface for "what happened?" (Principle 2).

**Adapter mapping** (audit event → `LogEntry`):

| `AuditEventType` | `LogLevel` | `source` |
|---|---|---|
| `Compilation` | `Info` | `"compiler"` |
| `SsrRender` | `Info` | `"ssr"` |
| `FileChange` | `Info` | `"watcher"` |
| `Error` | `Error` | `<error category>` |
| `ApiRequest` | `Info` | `"api"` |

The adapter truncates nanosecond timestamps to Unix seconds (`u64`) to match the existing `LogEntry.timestamp` field.

## Rust Types

### Event Schema

```rust
/// Audit event types.
#[derive(Debug, Clone, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AuditEventType {
    ApiRequest,
    SsrRender,
    Compilation,
    FileChange,
    Error,
}

/// A single audit log event.
///
/// `timestamp` is stored as `SystemTime` internally and formatted to
/// ISO 8601 with nanosecond precision only at serialization/query time.
/// This avoids per-event String allocations on the hot path and enables
/// numeric comparison for `since` filtering.
#[derive(Debug, Clone)]
pub struct AuditEvent {
    /// Wall-clock time when the event was recorded.
    pub timestamp: SystemTime,
    /// Event type discriminant.
    pub event_type: AuditEventType,
    /// Duration in milliseconds (where applicable).
    pub duration_ms: Option<f64>,
    /// Type-specific payload.
    pub data: serde_json::Value,
}

// Custom Serialize formats timestamp as ISO 8601 string at serialization time.
// AuditFilter::since is also stored as SystemTime (parsed from ISO 8601 input once).

/// Typed constructors enforce the data contract per event type.
/// Capture sites call these instead of building serde_json::json!({}) manually.
impl AuditEvent {
    pub fn api_request(method: &str, path: &str, status: u16, duration_ms: f64) -> Self;
    pub fn ssr_render(url: &str, status: u16, query_count: usize, is_ssr: bool, duration_ms: f64) -> Self;
    pub fn compilation(file: &str, cached: bool, css_extracted: bool, duration_ms: f64) -> Self;
    pub fn file_change(path: &str, kind: &str) -> Self;
    pub fn error(category: &str, severity: &str, message: &str, file: Option<&str>, line: Option<u32>, column: Option<u32>) -> Self;
}

/// Thread-safe ring buffer of audit events.
#[derive(Clone)]
pub struct AuditLog {
    entries: Arc<RwLock<VecDeque<AuditEvent>>>,
    capacity: usize,
}
```

### AuditLog Public Interface

```rust
impl AuditLog {
    /// Create a new audit log with the given capacity.
    pub fn new(capacity: usize) -> Self;

    /// Record an event. Evicts oldest if at capacity.
    pub fn record(&self, event: AuditEvent);

    /// Query events with optional filters.
    pub fn query(&self, filter: AuditFilter) -> AuditQueryResult;

    /// Summary stats (for diagnostics endpoint).
    pub fn summary(&self) -> AuditSummary;
}

/// Filter parameters for audit log queries.
///
/// Query semantics: filter by event_types → filter by since → take last N.
/// Filtering always precedes truncation.
pub struct AuditFilter {
    /// Max events to return (after filtering).
    pub last: usize,
    /// Optional type filter (multiple allowed). Unknown types are rejected
    /// with an error listing valid values.
    pub event_types: Option<Vec<AuditEventType>>,
    /// Optional time lower bound (parsed from ISO 8601 input).
    pub since: Option<SystemTime>,
}

/// Query result.
pub struct AuditQueryResult {
    pub events: Vec<AuditEvent>,
    pub count: usize,
    pub total: usize,
    pub truncated: bool,
}

/// Summary stats for the diagnostics endpoint.
/// Timestamps are formatted to ISO 8601 at serialization time.
pub struct AuditSummary {
    pub total_events: usize,
    pub capacity: usize,
    pub oldest_timestamp: Option<SystemTime>,
    pub newest_timestamp: Option<SystemTime>,
    pub events_by_type: HashMap<AuditEventType, usize>,
}
```

### Capture Points

| Event Type | Capture Location | Data Fields |
|---|---|---|
| `api_request` | `http.rs` → `handle_api_request()` | method, path, status, duration_ms |
| `ssr_render` | `http.rs` → `page_render_handler()` | url, status, query_count, is_ssr, duration_ms |
| `compilation` | `http.rs` / `module_server.rs` → call site around `pipeline.compile_for_browser()` | file, cached, css_extracted, duration_ms |
| `file_change` | watcher event loop in `http.rs` | path (relative), kind (create/modify/remove) |
| `error` | `ErrorBroadcaster::report_error()` | category, severity, message, file, line, column |

**Note on compilation capture:** `CompilationPipeline::compile_for_browser()` is a sync `fn` that does not have access to `DevServerState`. The audit event is recorded at the **call site** (in `http.rs` or `module_server.rs`) by wrapping the call with `Instant::now()` timing — not inside the pipeline itself. This matches the existing pattern where `console_log.push()` calls happen at the call site, not inside the pipeline.

### Integration with DevServerState

```rust
pub struct DevServerState {
    // ... existing fields ...
    pub audit_log: AuditLog,
    // console_log removed — AuditLog replaces it
}
```

## Manifesto Alignment

### Principles Applied

1. **AI agents are first-class users** (Principle 3) — The audit log's primary consumer is an LLM. The unified timeline eliminates the need for LLMs to call multiple tools and correlate results manually. One tool, one chronological view, structured data.

2. **One way to do things** (Principle 2) — Today there are three overlapping event systems: `ConsoleLog`, `McpEventHub`, `ErrorBroadcaster`. The audit log consolidates the *historical query* path into one interface. `McpEventHub` remains for *real-time push* (different use case — live stream vs. historical query). `ErrorBroadcaster` remains for its priority-based suppression logic and WebSocket overlay delivery. But for "what happened?" the answer is always `vertz_get_audit_log`.

3. **Performance is not optional** (Principle 7) — Ring buffer with pre-allocated capacity, `RwLock` for concurrent reads, `SystemTime` stored raw (no per-event string formatting). Zero allocations on the hot path beyond the event and its `serde_json::Value` data. ISO 8601 formatting and full serialization deferred to query time.

### Tradeoffs

- **Explicit over implicit** — Events are recorded by explicit `audit_log.record()` calls at each capture point, not by intercepting I/O. This means adding a new event type requires code at the capture site. We accept this cost because it makes the event schema self-documenting and avoids magic.

- **Compile-time over runtime** — Event types are an enum, not arbitrary strings. Adding a new event type requires a code change and recompile. This prevents typo bugs and ensures the schema is always known.

### What Was Rejected

- **Tracing/spans model** (OpenTelemetry-style) — Too heavy for a dev server. We don't need distributed tracing, span parents, or trace IDs. A flat chronological log with type filters is the right abstraction for "show me what happened."

- **Database-backed storage** — SQLite or similar for queryable audit history. Overkill for a dev tool. A ring buffer with 1000 events covers the useful debugging window. If the dev server restarts, the audit log starts fresh — this is expected behavior.

- **Streaming audit via WebSocket** — Already covered by `McpEventHub`. The audit log is for historical queries. Adding another WebSocket channel would duplicate `McpEventHub` with a different shape.

## Non-Goals

1. **DB query capture** — The roadmap (Section 2.3 of `plans/vertz-dev-server/next-steps.md`) mentions "database queries (if using `@vertz/db`)" in the motivating example. However, the acceptance criteria in #2048 do not include database queries, and `@vertz/db` does not yet have a query hook/middleware to emit events. This is a separate feature that can be added later as a new `AuditEventType::DbQuery` variant. The audit log design accommodates this (the enum is extensible), but implementation is out of scope for this ticket.

2. **Persistent storage** — The audit log is in-memory only. It does not survive server restarts. For a dev server, this is acceptable — the debugging context resets with the server.

3. **Audit log UI** — No browser-side visualization. The audit log is consumed via MCP tools (LLMs) and the diagnostics endpoint (automation). A future browser DevTools panel could render it, but that's not this feature.

4. **Access control** — The dev server is localhost-only. No authentication or authorization on audit log queries.

5. **Configurable retention** — The capacity is fixed at 1000 events (hardcoded constant). Making it configurable via `vertz.config.ts` is a follow-up if needed.

## Unknowns

1. **Nanosecond timestamp source** — `std::time::Instant` provides monotonic nanosecond precision but no wall-clock time.

   **Resolution:** Store `SystemTime` directly in each `AuditEvent`. The `SystemTime::now()` syscall overhead (~20ns via VDSO on Linux, similar on macOS) is negligible at dev-server throughput (dozens/sec, not thousands). ISO 8601 string formatting is deferred to query/serialization time — avoiding per-event heap allocations on the hot path. The `since` filter uses numeric `SystemTime` comparison, not string lexicographic ordering. Monotonic ordering within the ring buffer is guaranteed by the `RwLock` write guard.

2. **ConsoleLog removal migration** — Several places in the codebase call `state.console_log.push()`. These all need to be migrated to `state.audit_log.record()`. The `vertz_get_console` tool needs a compatibility adapter.

   **Resolution:** Phase 1 adds `AuditLog` alongside `ConsoleLog`. Phase 2 migrates all capture points. Phase 3 removes `ConsoleLog` and adds the `vertz_get_console` compatibility adapter.

## POC Results

No POC required. The architecture is a straightforward ring buffer (same pattern as the existing `ConsoleLog`) with a richer event schema. The capture points all exist and are already instrumented with `ConsoleLog::push()` calls or timing measurements. The MCP tool pattern is well-established with 7 existing tools.

## Type Flow Map

This is a Rust-only feature with no TypeScript generics. The type flow is:

```
Capture site (http.rs, module_server.rs, ErrorBroadcaster)
  → AuditEvent::api_request() / ::compilation() / etc. (typed constructors)
    → AuditEvent { timestamp: SystemTime, event_type: AuditEventType, data: serde_json::Value }
      → AuditLog::record() — stores in VecDeque<AuditEvent>
      → AuditLog::query(AuditFilter) → AuditQueryResult { events: Vec<AuditEvent> }
        → execute_tool("vertz_get_audit_log") → serde_json::to_string_pretty()
          → MCP JSON-RPC response → LLM

Diagnostics path:
  AuditLog::summary() → AuditSummary
    → collect_diagnostics() → DiagnosticsSnapshot { audit_log: AuditSummary }
      → GET /__vertz_diagnostics → JSON response
```

All intermediate types are concrete (no generics). `serde_json::Value` is used for the type-specific `data` field because each event type has a different payload shape — this is intentional: it avoids a complex enum of data variants while still being fully serializable and queryable.

## E2E Acceptance Test

### BDD Scenarios

```rust
#[cfg(test)]
mod acceptance {
    // ── Core ring buffer ──

    describe!("Feature: Audit log ring buffer", {
        describe!("Given an audit log with capacity 1000", {
            describe!("When 5 events are recorded", {
                it!("Then query({ last: 100 }) returns all 5 in chronological order");
                it!("Then each event has a valid ISO 8601 timestamp");
                it!("Then each event has a type discriminant");
            });
            describe!("When 1001 events are recorded", {
                it!("Then the oldest event is evicted");
                it!("Then query returns exactly 1000 events");
            });
        });
    });

    // ── Type filtering ──

    describe!("Feature: Audit log type filtering", {
        describe!("Given a log with api_request, ssr_render, and compilation events", {
            describe!("When querying with type='api_request'", {
                it!("Then only api_request events are returned");
            });
            describe!("When querying with type='api_request,ssr_render'", {
                it!("Then both api_request and ssr_render events are returned");
            });
            describe!("When querying with type='nonexistent'", {
                it!("Then returns an error listing valid event types");
            });
        });
    });

    // ── Time filtering ──

    describe!("Feature: Audit log time filtering", {
        describe!("Given a log with events spanning 10 seconds", {
            describe!("When querying with since='<5 seconds ago>'", {
                it!("Then only events after that timestamp are returned");
            });
        });
    });

    // ── MCP tool ──

    describe!("Feature: vertz_get_audit_log MCP tool", {
        describe!("Given a running dev server with recorded events", {
            describe!("When calling vertz_get_audit_log({ last: 100 })", {
                it!("Then returns chronological array of typed events");
                it!("Then each event has timestamp, type, and data fields");
                it!("Then duration_ms is present for api_request, ssr_render, compilation");
                it!("Then duration_ms is absent for file_change and error events");
            });
            describe!("When calling vertz_get_audit_log({ type: 'api_request', last: 50 })", {
                it!("Then returns at most 50 api_request events");
            });
            describe!("When calling vertz_get_audit_log({})", {
                it!("Then defaults to last 100 events, no type filter");
            });
        });
    });

    // ── Capture points ──

    describe!("Feature: Event capture at each source", {
        describe!("Given the dev server is running", {
            describe!("When an API request completes", {
                it!("Then an api_request event is recorded with method, path, status, duration_ms");
            });
            describe!("When an SSR render completes", {
                it!("Then an ssr_render event is recorded with url, status, is_ssr, duration_ms");
            });
            describe!("When a file is compiled", {
                it!("Then a compilation event is recorded with file, cached, css_extracted, duration_ms");
            });
            describe!("When a source file changes", {
                it!("Then a file_change event is recorded with path and kind");
            });
            describe!("When an error is reported", {
                it!("Then an error event is recorded with category, severity, message, file, line, column");
            });
        });
    });

    // ── ConsoleLog replacement ──

    describe!("Feature: ConsoleLog backward compatibility", {
        describe!("Given audit log has replaced ConsoleLog", {
            describe!("When calling vertz_get_console({ last: 50 })", {
                it!("Then returns entries formatted as the old LogEntry shape");
                it!("Then entries are derived from audit log events");
            });
        });
    });

    // ── Diagnostics integration ──

    describe!("Feature: Diagnostics endpoint audit_log field", {
        describe!("Given the dev server has recorded events", {
            describe!("When GET /__vertz_diagnostics", {
                it!("Then response includes audit_log.total_events");
                it!("Then response includes audit_log.events_by_type counts");
                it!("Then response includes audit_log.oldest_timestamp and newest_timestamp");
            });
        });
    });
}
```

## Implementation Plan

### Phase 1: AuditLog Core + MCP Tool

Build the ring buffer, add it to `DevServerState`, wire up `vertz_get_audit_log` MCP tool. No capture points yet — the tool returns an empty log. This validates the query interface end-to-end.

**Acceptance criteria:**
- `AuditLog::new()`, `record()`, `query()`, `summary()` work with all filter combinations
- `vertz_get_audit_log` MCP tool is registered and returns the correct JSON shape
- Diagnostics endpoint includes `audit_log` summary
- 95%+ test coverage on `audit_log.rs`

### Phase 2: Capture Points

Wire up all 5 event types at their capture sites. Also add `audit_log.record()` calls at every existing `console_log.push()` call site to prepare for Phase 3 migration.

**Existing `console_log.push()` call sites** (all must get equivalent audit events):
- `mcp.rs`: 2 calls (MCP render success, MCP render error)
- `http.rs`: ~5 calls (SSR render, file change, API request handling, navigation)

**Capture points:**
- `api_request` — in `http.rs` around `handle_api_request()`, wrap with `Instant::now()` timing
- `ssr_render` — in `http.rs` around `page_render_handler()`, wrap with `Instant::now()` timing
- `compilation` — in `http.rs` / `module_server.rs` at the call site around `pipeline.compile_for_browser()`, wrap with `Instant::now()` timing
- `file_change` — in the watcher event loop in `http.rs`
- `error` — in `ErrorBroadcaster::report_error()`

**Acceptance criteria:**
- Each event type is recorded with correct data fields via typed constructors
- Duration is measured with `Instant::now()` elapsed for timed events
- File paths in events are relative to project root (not absolute)
- Events appear in chronological order in query results
- All existing `console_log.push()` call sites have equivalent `audit_log.record()` calls

### Phase 3: ConsoleLog Replacement

Remove `ConsoleLog` from `DevServerState`. Migrate all `console_log.push()` call sites to `audit_log.record()`. Add backward-compatible adapter for `vertz_get_console`.

**Acceptance criteria:**
- `ConsoleLog` struct is deleted
- `vertz_get_console` returns entries derived from audit log
- No compilation warnings about unused code
- All existing MCP tool tests still pass
