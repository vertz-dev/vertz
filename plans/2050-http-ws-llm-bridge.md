# HTTP-to-WebSocket LLM Bridge

**Issue:** #2050
**Status:** Draft — Rev 2 (addressing DX, Product, Technical reviews)
**Author:** viniciusdacal

## Description

Build a lightweight bridge HTTP server inside the `vtz` runtime that converts the dev server's WebSocket-based event stream (`/__vertz_mcp/events`) and MCP tool interface (`/__vertz_mcp`) into plain HTTP endpoints. This enables LLMs that lack native WebSocket support (Kimi, MiniMax, custom wrappers) to consume real-time dev server events via SSE and invoke MCP tools via `POST`.

The bridge is an **in-process axum server** on a separate port, **not** a standalone binary. It shares the same `DevServerState` as the main dev server, avoiding network hops and reconnection complexity. The in-process architecture supersedes the original plan's `--dev-server-url` flag — the bridge has direct access to `DevServerState` and does not need to discover or connect to the dev server over the network.

## API Surface

### CLI

```bash
# Bridge disabled (default — no change to existing behavior)
vtz dev

# Bridge enabled on port 3001
vtz dev --bridge-port 3001
```

Terminal output when bridge starts:

```
  Bridge → http://localhost:3001
    GET  /events    SSE event stream
    GET  /tools     Available tool list
    GET  /health    Bridge health check
    POST /command   Tool invocation
```

### HTTP Endpoints

#### `GET /events` — SSE event stream

Subscribes to the `McpEventHub` broadcast channel and relays events as SSE.

```
GET http://localhost:3001/events
Accept: text/event-stream

< HTTP/1.1 200 OK
< Content-Type: text/event-stream
< Cache-Control: no-cache
< Connection: keep-alive
< Access-Control-Allow-Origin: *
<
< data: {"event":"server_status","timestamp":"...","data":{"protocol_version":1,"status":"running","uptime_secs":42,"port":3000,...}}
<
< data: {"event":"error_update","timestamp":"...","data":{"category":"build","errors":[...],"total_count":1}}
<
< data: {"event":"file_change","timestamp":"...","data":{"path":"src/app.tsx","kind":"modify"}}
<
```

- First event is always `server_status` (handshake, same as WebSocket endpoint).
- Events are JSON-serialized `McpEvent` values, one per `data:` line.
- SSE `id:` field set to a monotonic counter per connection (useful for client-side dedup and ordering). **No replay on reconnect** — the broadcast channel does not support seeking by ID. On reconnect, the client receives a fresh `server_status` handshake with current state.
- Keep-alive comments (`: keepalive\n\n`) every 15 seconds.
- Supports optional query parameter `?subscribe=error_update,file_change` for filtering (same filter semantics as the WebSocket endpoint). Default: all events.
- When a `?subscribe` filter is provided, a `subscribed` event is sent as the second event (after `server_status`), echoing back the active filter and any unknown event names — same feedback as the WebSocket endpoint.
- On slow clients: if the broadcast receiver lags (channel capacity 128), events are dropped and logged. The connection is **not** terminated. This matches the existing WebSocket behavior.

#### `GET /events?subscribe=error_update,file_change` — Filtered SSE

```
GET http://localhost:3001/events?subscribe=error_update,file_change
Accept: text/event-stream

< data: {"event":"server_status",...}
< data: {"event":"subscribed","timestamp":"...","data":{"active":["error_update","file_change"],"unknown":[]}}
< (only error_update and file_change events from this point)
```

#### `POST /command` — MCP tool invocation

Accepts a simplified JSON body (not full JSON-RPC) and proxies to the internal `execute_tool` function.

```
POST http://localhost:3001/command
Content-Type: application/json

{"tool": "vertz_get_errors", "args": {}}

< HTTP/1.1 200 OK
< Content-Type: application/json
<
< {"ok": true, "result": {"content": [{"type": "text", "text": "..."}]}}
```

Tool execution error (tool ran but returned an error):

```
POST http://localhost:3001/command
Content-Type: application/json

{"tool": "nonexistent_tool", "args": {}}

< HTTP/1.1 200 OK
< Content-Type: application/json
<
< {"ok": false, "error": "Unknown tool: nonexistent_tool"}
```

Malformed request (not valid JSON or missing `tool` field):

```
POST http://localhost:3001/command
Content-Type: application/json

{"args": {}}

< HTTP/1.1 400 Bad Request
< Content-Type: application/json
<
< {"ok": false, "error": "missing field `tool`"}
```

**HTTP status code convention:** All successful tool calls (including tool-level errors) return HTTP 200. Application-level errors are communicated via `{"ok": false, "error": "..."}`. HTTP 400 is reserved for transport-level failures (malformed JSON, missing required fields). This is intentional — LLM clients handle JSON envelopes more reliably than HTTP status code semantics. The endpoint name is `/command` (not `/tool` or `/invoke`) because the target audience is LLMs that do NOT understand MCP terminology — "command" is a more natural mental model for "do something and get a result."

#### `GET /tools` — Tool discovery

Returns the list of available MCP tools with their descriptions and argument schemas. Enables LLM clients to discover capabilities without prior knowledge.

```
GET http://localhost:3001/tools

< HTTP/1.1 200 OK
< Content-Type: application/json
<
< {
<   "tools": [
<     {"name": "vertz_get_errors", "description": "Get current compilation and runtime errors...", "inputSchema": {"type": "object", "properties": {}, "required": []}},
<     {"name": "vertz_render_page", "description": "Server-side render a page URL...", "inputSchema": {"type": "object", "properties": {"url": {"type": "string", ...}}, "required": ["url"]}},
<     ...
<   ]
< }
```

This is the HTTP equivalent of MCP's `tools/list`. An LLM can call `GET /tools`, see what's available, and start using `POST /command` autonomously.

#### `GET /health` — Bridge health check

```
GET http://localhost:3001/health

< HTTP/1.1 200 OK
< Content-Type: application/json
<
< {
<   "status": "ok",
<   "dev_server_port": 3000,
<   "uptime_secs": 42,
<   "available_event_types": ["server_status", "error_update", "file_change", "hmr_update", "ssr_refresh", "typecheck_update"]
< }
```

The `available_event_types` field enables LLM clients to discover valid values for the `?subscribe=` filter parameter without needing documentation.

### Rust Types

```rust
// In native/vtz/src/bridge/mod.rs

/// Configuration for the HTTP-to-WebSocket bridge.
pub struct BridgeConfig {
    /// Port to listen on for the bridge HTTP server.
    pub port: u16,
    /// Host to bind to (same as dev server host).
    pub host: String,
}

/// Start the bridge HTTP server. Returns the JoinHandle for the server task.
///
/// The bridge shares `DevServerState` with the main dev server — no network
/// hops, no reconnection logic. It's an in-process axum server on a separate port.
///
/// The bridge participates in the same graceful shutdown as the main server
/// via `shutdown_rx`. When the watch channel fires, all SSE connections are
/// drained and the server stops accepting new connections.
pub async fn start_bridge(
    config: BridgeConfig,
    state: Arc<DevServerState>,
    shutdown_rx: tokio::sync::watch::Receiver<()>,
) -> io::Result<tokio::task::JoinHandle<()>>
```

```rust
// POST /command request body
#[derive(Deserialize)]
struct CommandRequest {
    tool: String,
    #[serde(default = "default_args")]
    args: serde_json::Value,
}

fn default_args() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

// POST /command response body
#[derive(Serialize)]
struct CommandResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}
```

## Manifesto Alignment

### Principle 3: AI agents are first-class users

This feature exists entirely to serve LLMs. The bridge makes the dev server accessible to any LLM client, regardless of protocol support. The simplified `POST /command` endpoint is designed so an LLM can call tools without understanding JSON-RPC framing. The `GET /tools` and `GET /health` endpoints make the bridge self-describing — an LLM can discover tools and event types without documentation.

### Principle 2: One way to do things

The bridge is a **protocol adapter**, not an alternative API. The canonical interface remains MCP over WebSocket on the main dev server port. The bridge just translates HTTP → internal state. No new tool definitions, no divergent behavior.

### Principle 7: Performance is not optional

In-process design (shared `Arc<DevServerState>`) eliminates network overhead. SSE events are relayed directly from the broadcast channel — no intermediate buffering. The bridge adds zero overhead when `--bridge-port` is not specified.

### What was rejected

- **Standalone binary**: Would require WebSocket client → dev server, reconnection logic, and maintaining a separate connection lifecycle. In-process is simpler and more reliable.
- **`--dev-server-url` flag**: The original plan (Section 2.5) proposed auto-discovery or a `--dev-server-url` flag for connecting to the dev server. The in-process architecture eliminates this entirely — the bridge shares `Arc<DevServerState>` directly. Issue acceptance criterion #3 ("bridge auto-discovers the dev server port or accepts `--dev-server-url`") is satisfied by architectural design, not a CLI flag.
- **HTTP long-polling instead of SSE**: SSE is strictly superior — native browser/curl support, standard framing. Long-polling would require custom framing.
- **Full JSON-RPC on the bridge**: Over-engineering. LLMs that need full MCP should connect to the main port. The bridge is for simple HTTP-only clients.
- **Auto-start bridge**: Should be opt-in. Most developers use Claude Code (which connects via MCP directly) and don't need the bridge overhead.
- **`Last-Event-ID` replay**: The `tokio::sync::broadcast` channel does not support seeking by message ID — new subscribers receive events from the point of subscription forward. Implementing replay would require a per-connection bounded buffer or shared ring buffer, which adds complexity for a dev-time feature where missed events during brief reconnections are non-critical. The `server_status` handshake on connect already gives the client a fresh state snapshot. SSE `id:` fields are still emitted (monotonic counter) for client-side dedup/ordering.

## Non-Goals

- **Authentication/authorization on the bridge**: This is a local dev tool. No auth needed.
- **WebSocket support on the bridge port**: Clients that support WebSocket should connect to the main dev server port directly.
- **Custom event filtering beyond subscribe**: No per-field filtering, no regex matching. Simple category-level subscribe is sufficient.
- **Bridge for production use**: This is strictly a dev-time feature. No production deployment story.
- **Bidirectional streaming on POST /command**: Tool calls are request/response. No streaming tool results.
- **SSE transport on the main dev server port**: The bridge exists as a separate port specifically for protocol-limited LLM clients. Adding SSE to the main `:3000` port would clutter the route table and conflate two audiences (MCP-aware clients vs. simple HTTP clients).

## Unknowns

None identified. The architecture is straightforward:
- `McpEventHub` already has a broadcast channel — the bridge subscribes to it.
- `execute_tool` is currently module-private in `server/mcp.rs` — will be made `pub(crate)` so the bridge module can call it. The function is stateless (reads from shared state, no exclusive mutations) and safe for concurrent use.
- axum's SSE support (`axum::response::sse`) is well-tested in the existing MCP SSE transport.
- Running two axum servers in the same tokio runtime is well-supported. Both share the thread pool. All `DevServerState` fields are designed for concurrent access (`Arc`, `RwLock`, broadcast channels).

## POC Results

No POC needed. All building blocks already exist:
- SSE transport: `mcp_sse_handler` in `server/mcp.rs` proves axum SSE works.
- Broadcast subscription: `McpEventHub` in `server/mcp_events.rs` proves multi-consumer event distribution works.
- Tool execution: `execute_tool` in `server/mcp.rs` proves MCP tool invocation from HTTP works.

## Type Flow Map

This is a Rust-only feature with no generic type parameters that flow to consumers. The types are concrete structs (`CommandRequest`, `CommandResponse`, `BridgeConfig`). No type flow map needed — there are no generics to trace.

## E2E Acceptance Test

### 1. SSE event stream receives file change events

```bash
# Terminal 1: start dev server with bridge
vtz dev --bridge-port 3001

# Terminal 2: connect to SSE stream
curl -N http://localhost:3001/events

# Expected: first event is server_status
# data: {"event":"server_status","timestamp":"...","data":{...}}

# Terminal 3: touch a source file
touch src/app.tsx

# Terminal 2 should receive:
# data: {"event":"file_change","timestamp":"...","data":{"path":"src/app.tsx","kind":"modify"}}
```

### 2. POST /command returns tool results

```bash
curl -X POST http://localhost:3001/command \
  -H 'Content-Type: application/json' \
  -d '{"tool": "vertz_get_errors", "args": {}}'

# Expected:
# {"ok":true,"result":{"content":[{"type":"text","text":"{\"errors\":[],\"count\":0}"}]}}
```

### 3. POST /command rejects unknown tools

```bash
curl -X POST http://localhost:3001/command \
  -H 'Content-Type: application/json' \
  -d '{"tool": "nonexistent", "args": {}}'

# Expected:
# {"ok":false,"error":"Unknown tool: nonexistent"}
```

### 4. Bridge does not start without --bridge-port

```bash
vtz dev
# No bridge server started, port 3001 is not bound
curl http://localhost:3001/health
# Expected: connection refused
```

### 5. Filtered SSE stream with subscription ack

```bash
curl -N 'http://localhost:3001/events?subscribe=error_update'

# Expected: server_status first, then subscribed ack, then only error_update events
# data: {"event":"server_status",...}
# data: {"event":"subscribed","timestamp":"...","data":{"active":["error_update"],"unknown":[]}}
```

### 6. Health endpoint with event types

```bash
curl http://localhost:3001/health

# Expected:
# {"status":"ok","dev_server_port":3000,"uptime_secs":...,"available_event_types":["server_status","error_update","file_change","hmr_update","ssr_refresh","typecheck_update"]}
```

### 7. Tool discovery

```bash
curl http://localhost:3001/tools

# Expected: JSON with tools array containing name, description, inputSchema for each tool
```

### 8. Malformed POST /command returns 400

```bash
curl -X POST http://localhost:3001/command \
  -H 'Content-Type: application/json' \
  -d '{"args": {}}'

# Expected: HTTP 400
# {"ok":false,"error":"missing field `tool`"}
```

### 9. Bridge port conflict does not block main server

```bash
# Start something on port 3001 first
python3 -m http.server 3001 &

vtz dev --bridge-port 3001
# Expected: main dev server starts normally on :3000
# Terminal shows warning: "[Bridge] Failed to bind to port 3001: address already in use"
```

## Implementation Notes

### Architecture

```
┌──────────────┐                    ┌──────────────────┐
│ LLM Client   │──── HTTP SSE ────→│  Bridge Server    │
│ (Kimi, etc.) │                    │  :3001            │
│              │──── POST /cmd ───→│                    │
│              │──── GET /tools ──→│  Shared State ────┼──→ Arc<DevServerState>
└──────────────┘                    │  (in-process)     │         │
                                    └──────────────────┘         │
                                                                  │
                                    ┌──────────────────┐         │
                                    │  Dev Server       │←────────┘
                                    │  :3000            │
                                    │  (MCP, HMR, SSR)  │
                                    └──────────────────┘
```

### Key design decisions

1. **In-process, shared state**: The bridge is a second axum server in the same tokio runtime. It receives `Arc<DevServerState>` from `build_router()` and uses the same `McpEventHub`, `execute_tool`, etc. No WebSocket client code needed. Both servers share the tokio thread pool — for typical dev workloads this has no impact on the main server's responsiveness.

2. **`execute_tool` visibility**: Currently `async fn execute_tool(...)` (module-private) in `server/mcp.rs`. Will be made `pub(crate)` so the bridge can call it. The function takes immutable borrows (`&Arc<DevServerState>`, `&str`, `&serde_json::Value`) and returns owned values — safe for concurrent use. Some tools (e.g., `vertz_render_page`) acquire the `api_isolate` read lock, but this is already concurrent-safe.

3. **SSE from broadcast channel**: The bridge subscribes to `McpEventHub`'s broadcast sender. Each SSE client gets its own `broadcast::Receiver`. Event filtering is done in the bridge's SSE handler (same logic as the WebSocket handler in `mcp_events.rs`). On lag (`RecvError::Lagged`), events are dropped and logged — the connection stays open, matching WebSocket behavior.

4. **Monotonic event IDs (no replay)**: Each SSE event gets an `id:` field (monotonic counter per connection) for client-side dedup/ordering. No `Last-Event-ID` replay — the broadcast channel cannot seek by index. On reconnect, clients get a fresh `server_status` handshake.

5. **CORS headers**: The bridge adds permissive CORS headers: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Content-Type`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`. An `OPTIONS` handler is included for preflight requests from browser-based clients.

6. **Graceful shutdown**: The bridge accepts a `tokio::sync::watch::Receiver<()>` shutdown signal, shared with the main dev server. When shutdown fires, the bridge stops accepting new connections and drains active SSE streams. The caller in `start_server_with_lifecycle` forks the shutdown signal to both servers. No independent signal handlers — Ctrl+C triggers shutdown for both servers simultaneously.

7. **Port conflict handling**: If `--bridge-port` is specified but the port is already in use, the bridge logs a warning (`[Bridge] Failed to bind to port <N>: address already in use`) and the main dev server continues running normally. The bridge failure does not prevent the main server from starting. No auto-increment — the bridge port is explicitly specified by the user.

8. **`args` default**: `CommandRequest.args` defaults to `Value::Object(Map::new())` (empty object) instead of `Value::Null` when `args` is omitted. This matches JSON-RPC convention and ensures `execute_tool` receives a consistent `Value::Object`.

## Review Resolution

### Technical Review (Rev 1 → Rev 2)

| Finding | Severity | Resolution |
|---------|----------|------------|
| `Last-Event-ID` replay infeasible | BLOCKER | Removed replay claim. SSE `id:` emitted for dedup only. Documented in "What was rejected" and decision #4. |
| Graceful shutdown coordination | BLOCKER | `start_bridge` now accepts `watch::Receiver<()>` shutdown signal. Documented in decision #6. |
| SSE lag behavior | should-fix | Documented in "GET /events" spec and decision #3. |
| Bridge port conflict handling | should-fix | Documented in decision #7 and E2E test #9. |
| `execute_tool` visibility claim | should-fix | Fixed — doc now correctly says "module-private, will be made pub(crate)". Decision #2. |
| CORS preflight (OPTIONS) | should-fix | Added OPTIONS handler and full CORS headers. Decision #5. |

### DX Review (Rev 1 → Rev 2)

| Finding | Severity | Resolution |
|---------|----------|------------|
| Subscribe filter discoverability | should-fix | Added `available_event_types` to `/health` response. Added `subscribed` ack as second SSE event. |
| HTTP 200 for errors documentation | should-fix | Added explicit HTTP status code convention section under `POST /command`. |
| Tool discovery endpoint | should-fix | Added `GET /tools` endpoint returning tool names, descriptions, and schemas. |
| CLI startup output | nit | Added terminal output example showing bridge URL and endpoints. |

### Product/Scope Review (Rev 1 → Rev 2)

| Finding | Severity | Resolution |
|---------|----------|------------|
| Close acceptance criterion #3 | should-fix | Added explicit paragraph in Description + "What was rejected" explaining how in-process design supersedes `--dev-server-url`. |
| Add "SSE on main port" non-goal | should-fix | Added as the 6th non-goal with rationale. |
