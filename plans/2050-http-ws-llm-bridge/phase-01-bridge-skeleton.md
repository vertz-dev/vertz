# Phase 1: Bridge Skeleton + Health Endpoint

## Context

HTTP-to-WebSocket LLM Bridge (#2050). This phase establishes the bridge module, CLI flag, config integration, startup wiring with graceful shutdown, and the `/health` endpoint. After this phase, `vtz dev --bridge-port 3001` starts a second HTTP server that responds to `GET /health`.

Design doc: `plans/2050-http-ws-llm-bridge.md`

## Tasks

### Task 1: Add `--bridge-port` CLI flag and config field

**Files:**
- `native/vtz/src/cli.rs` (modified)
- `native/vtz/src/config.rs` (modified)

**What to implement:**

1. Add `bridge_port: Option<u16>` field to `DevArgs` in `cli.rs`:
   ```rust
   /// Start an HTTP-to-WebSocket bridge for LLMs on this port
   #[arg(long)]
   pub bridge_port: Option<u16>,
   ```

2. Add `bridge_port: Option<u16>` field to `ServerConfig` in `config.rs`.

3. Wire `DevArgs.bridge_port` → `ServerConfig.bridge_port` in `main.rs` where `build_dev_config` constructs the config.

4. Initialize the new field to `None` in both `ServerConfig::new()` and `ServerConfig::with_root()`.

**Acceptance criteria:**
- [ ] `vtz dev --help` shows `--bridge-port` flag with description
- [ ] `DevArgs` and `ServerConfig` have the `bridge_port` field
- [ ] Existing tests still pass (no breakage from new optional field)

---

### Task 2: Create bridge module with health endpoint

**Files:**
- `native/vtz/src/bridge/mod.rs` (new)
- `native/vtz/src/bridge/health.rs` (new)
- `native/vtz/src/lib.rs` (modified — add `pub mod bridge;`)

**What to implement:**

1. Create `bridge/mod.rs` with:
   ```rust
   pub mod health;

   pub struct BridgeConfig {
       pub port: u16,
       pub host: String,
   }

   pub async fn start_bridge(
       config: BridgeConfig,
       state: Arc<DevServerState>,
       mut shutdown_rx: tokio::sync::watch::Receiver<()>,
   ) -> io::Result<tokio::task::JoinHandle<()>>
   ```

   The function:
   - Binds a `TcpListener` to `config.host:config.port`
   - Builds an axum `Router` with `GET /health` → `health::health_handler`
   - Serves with `with_graceful_shutdown` using the watch receiver
   - Returns the spawned `JoinHandle`
   - On bind failure, returns `Err` (caller handles gracefully)

2. Create `bridge/health.rs` with the health handler:
   ```rust
   pub async fn health_handler(
       State(state): State<Arc<DevServerState>>,
   ) -> impl IntoResponse
   ```
   Returns JSON: `{"status":"ok","dev_server_port":<port>,"uptime_secs":<secs>,"available_event_types":[...]}`

   The `available_event_types` list is the `KNOWN_EVENTS` constant from `mcp_events.rs` (make it `pub(crate)` if needed).

3. Add `pub mod bridge;` to `lib.rs`.

**Acceptance criteria:**
- [ ] `BridgeConfig` struct exists with `port` and `host` fields
- [ ] `start_bridge` function compiles and returns `io::Result<JoinHandle<()>>`
- [ ] `GET /health` returns 200 with correct JSON shape
- [ ] Health response includes `available_event_types` array
- [ ] Health response includes `dev_server_port` from state
- [ ] Health response includes `uptime_secs` computed from `state.start_time`

---

### Task 3: Wire bridge startup into dev server lifecycle

**Files:**
- `native/vtz/src/server/http.rs` (modified)

**What to implement:**

1. In `start_server_with_lifecycle`, after `build_router` returns, check `config.bridge_port`:
   - If `Some(port)`, create a `watch::channel<()>` for shutdown coordination
   - Call `bridge::start_bridge(BridgeConfig { port, host: config.host.clone() }, state.clone(), shutdown_rx)`
   - If `start_bridge` returns `Err`, log warning `[Bridge] Failed to bind to port {port}: {err}` and continue (do NOT fail the main server)
   - If successful, log the bridge banner (see below) and hold the `JoinHandle`

2. Modify the shutdown logic:
   - Create a `watch::channel::<()>` before the bridge and main server start
   - When `shutdown_signal()` fires, send on the watch channel — this notifies both the bridge and optionally the main server
   - The bridge's graceful shutdown is driven by the watch receiver

3. Print bridge banner after successful bind:
   ```
     Bridge → http://{host}:{port}
       GET  /events    SSE event stream
       GET  /tools     Available tool list
       GET  /health    Bridge health check
       POST /command   Tool invocation
   ```

**Acceptance criteria:**
- [ ] Bridge starts when `--bridge-port` is specified
- [ ] Bridge does NOT start when `--bridge-port` is omitted
- [ ] Bridge bind failure logs a warning but main server continues
- [ ] Ctrl+C shuts down both main server and bridge
- [ ] Bridge banner is printed to terminal

---

### Task 4: Tests for bridge health endpoint and startup

**Files:**
- `native/vtz/src/bridge/mod.rs` (modified — add `#[cfg(test)] mod tests`)

**What to implement:**

Unit tests using `tower::ServiceExt::oneshot` (same pattern as `server/http.rs` tests):

1. `test_health_returns_ok` — Build bridge router with test state, send `GET /health`, verify 200 + JSON shape
2. `test_health_includes_event_types` — Verify `available_event_types` contains known event names
3. `test_health_includes_uptime` — Verify `uptime_secs` is a number >= 0
4. `test_health_includes_dev_server_port` — Verify `dev_server_port` matches state port

Reuse the `make_test_router` / test state pattern from `server/http.rs` tests.

**Acceptance criteria:**
- [ ] All 4 tests pass
- [ ] Tests use `tower::ServiceExt` pattern (no real TCP binding needed)
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
