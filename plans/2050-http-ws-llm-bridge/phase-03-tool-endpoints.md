# Phase 3: Tool Endpoints + CORS

## Context

HTTP-to-WebSocket LLM Bridge (#2050). Phases 1-2 established the bridge skeleton with `/health` and `/events`. This phase adds `POST /command` (tool invocation), `GET /tools` (tool discovery), and CORS middleware. After this phase, the bridge is fully functional per the design doc.

Design doc: `plans/2050-http-ws-llm-bridge.md`

## Tasks

### Task 1: Make `execute_tool` and `tool_definitions` callable from bridge

**Files:**
- `native/vtz/src/server/mcp.rs` (modified)

**What to implement:**

1. Change `execute_tool` visibility from `async fn` to `pub(crate) async fn`. No signature changes needed — it already takes `&Arc<DevServerState>`, `&str`, `&serde_json::Value` and returns `Result<serde_json::Value, String>`.

2. Change `tool_definitions` visibility from `fn` to `pub(crate) fn`. Returns `serde_json::Value`.

3. Verify no side effects or safety issues (there are none — function takes immutable borrows and returns owned values).

**Acceptance criteria:**
- [ ] `execute_tool` is `pub(crate)`
- [ ] `tool_definitions` is `pub(crate)`
- [ ] All existing MCP tests still pass
- [ ] No clippy warnings

---

### Task 2: Implement `POST /command` handler

**Files:**
- `native/vtz/src/bridge/command.rs` (new)
- `native/vtz/src/bridge/mod.rs` (modified — add `pub mod command;` and wire route)

**What to implement:**

1. Create `bridge/command.rs` with types:
   ```rust
   #[derive(Deserialize)]
   pub struct CommandRequest {
       tool: String,
       #[serde(default = "default_args")]
       args: serde_json::Value,
   }

   fn default_args() -> serde_json::Value {
       serde_json::Value::Object(serde_json::Map::new())
   }

   #[derive(Serialize)]
   pub struct CommandResponse {
       ok: bool,
       #[serde(skip_serializing_if = "Option::is_none")]
       result: Option<serde_json::Value>,
       #[serde(skip_serializing_if = "Option::is_none")]
       error: Option<String>,
   }
   ```

2. Handler:
   ```rust
   pub async fn command_handler(
       State(state): State<Arc<DevServerState>>,
       Json(req): Json<CommandRequest>,
   ) -> impl IntoResponse
   ```
   - Call `crate::server::mcp::execute_tool(&state, &req.tool, &req.args).await`
   - On `Ok(result)`: return 200 with `CommandResponse { ok: true, result: Some(result), error: None }`
   - On `Err(msg)`: return 200 with `CommandResponse { ok: false, result: None, error: Some(msg) }`

3. axum's `Json` extractor automatically returns 400 for malformed JSON / missing required fields. The default rejection includes the serde error message. This satisfies the "HTTP 400 for transport-level failures" requirement.

4. Wire `POST /command` route in `bridge/mod.rs`.

**Acceptance criteria:**
- [ ] `POST /command` with valid tool returns 200 + `{"ok":true,"result":{...}}`
- [ ] `POST /command` with unknown tool returns 200 + `{"ok":false,"error":"Unknown tool: ..."}`
- [ ] `POST /command` with malformed JSON returns 400
- [ ] `POST /command` with missing `tool` field returns 400
- [ ] `args` defaults to empty object when omitted

---

### Task 3: Implement `GET /tools` handler

**Files:**
- `native/vtz/src/bridge/tools.rs` (new)
- `native/vtz/src/bridge/mod.rs` (modified — add `pub mod tools;` and wire route)

**What to implement:**

1. Create `bridge/tools.rs`:
   ```rust
   pub async fn tools_handler() -> impl IntoResponse {
       Json(crate::server::mcp::tool_definitions())
   }
   ```

2. Wire `GET /tools` route in `bridge/mod.rs`.

**Acceptance criteria:**
- [ ] `GET /tools` returns 200 with JSON containing `tools` array
- [ ] Each tool has `name`, `description`, and `inputSchema` fields
- [ ] Tool list matches the MCP tool definitions exactly

---

### Task 4: Add CORS middleware

**Files:**
- `native/vtz/src/bridge/mod.rs` (modified)

**What to implement:**

1. Add CORS layer to the bridge router using `tower_http::cors::CorsLayer` (or manual middleware if `tower_http` is not a dependency — check `Cargo.toml`).

   If `tower_http` is available:
   ```rust
   use tower_http::cors::{CorsLayer, Any};

   let cors = CorsLayer::new()
       .allow_origin(Any)
       .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
       .allow_headers([header::CONTENT_TYPE]);
   ```

   If not, add manual CORS headers via an axum middleware layer or response headers on each handler.

2. The CORS layer handles preflight `OPTIONS` requests automatically.

**Acceptance criteria:**
- [ ] All responses include `Access-Control-Allow-Origin: *`
- [ ] `OPTIONS /command` returns 200 with correct CORS headers
- [ ] `Access-Control-Allow-Methods` includes `GET, POST, OPTIONS`
- [ ] `Access-Control-Allow-Headers` includes `Content-Type`

---

### Task 5: Tests for command, tools, and CORS

**Files:**
- `native/vtz/src/bridge/command.rs` (modified — add tests)
- `native/vtz/src/bridge/tools.rs` (modified — add tests)

**What to implement:**

Tests using `tower::ServiceExt::oneshot`:

**Command tests:**
1. `test_command_valid_tool` — `POST /command` with `vertz_get_errors`, verify `ok: true`
2. `test_command_unknown_tool` — `POST /command` with `bogus`, verify `ok: false` and error message
3. `test_command_missing_tool_field` — `POST /command` with `{"args":{}}`, verify HTTP 400
4. `test_command_malformed_json` — `POST /command` with `not json`, verify HTTP 400
5. `test_command_omitted_args_defaults_to_object` — `POST /command` with `{"tool":"vertz_get_errors"}` (no args), verify `ok: true`

**Tools tests:**
6. `test_tools_returns_tool_list` — `GET /tools`, verify JSON has `tools` array with expected names
7. `test_tools_each_has_schema` — Verify each tool in the list has `name`, `description`, `inputSchema`

**CORS tests:**
8. `test_cors_headers_present` — `GET /health`, verify `access-control-allow-origin: *`
9. `test_options_preflight` — `OPTIONS /command`, verify 200 with CORS headers

**Acceptance criteria:**
- [ ] All 9 tests pass
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
