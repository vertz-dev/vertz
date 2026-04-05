# Phase 2: SSE Event Stream

## Context

HTTP-to-WebSocket LLM Bridge (#2050). Phase 1 established the bridge skeleton with `/health`. This phase adds `GET /events` — the SSE stream that relays `McpEventHub` events to HTTP-only LLM clients. After this phase, LLMs can connect via `curl -N http://localhost:3001/events` and receive real-time dev server events.

Design doc: `plans/2050-http-ws-llm-bridge.md`

## Tasks

### Task 1: Implement SSE event handler

**Files:**
- `native/vtz/src/bridge/events.rs` (new)
- `native/vtz/src/bridge/mod.rs` (modified — add `pub mod events;` and wire route)

**What to implement:**

1. Create `bridge/events.rs` with the SSE handler:
   ```rust
   pub async fn events_handler(
       State(state): State<Arc<DevServerState>>,
       Query(params): Query<EventsParams>,
   ) -> Sse<impl Stream<Item = Result<Event, Infallible>>>
   ```

2. `EventsParams` struct:
   ```rust
   #[derive(Deserialize)]
   pub struct EventsParams {
       #[serde(default)]
       subscribe: Option<String>,  // comma-separated event names
   }
   ```

3. Handler logic:
   - Subscribe to `state.mcp_event_hub.subscribe()` to get a `broadcast::Receiver<McpEvent>`
   - Build the initial `server_status` event from state (same logic as `mcp_events.rs` `handle_connection`)
   - Send `server_status` as the first SSE event
   - If `subscribe` param is provided, parse comma-separated names into a `HashSet<String>`, validate against `KNOWN_EVENTS`, send a `subscribed` ack event as the second event (echoing active filter + unknown names)
   - Stream events from the broadcast receiver, filtering by the subscribe set if present
   - Each SSE event: `id: <monotonic_counter>`, `data: <event_json>`
   - On `RecvError::Lagged(n)`: log `[Bridge] SSE client lagged, dropped {n} events` and continue
   - Keep-alive: `KeepAlive::new().interval(Duration::from_secs(15))`

4. Wire `GET /events` route in `bridge/mod.rs` router.

5. Make `KNOWN_EVENTS` in `mcp_events.rs` `pub(crate)` so the bridge can use it.

**Acceptance criteria:**
- [ ] `GET /events` returns `Content-Type: text/event-stream`
- [ ] First event is `server_status` with correct shape
- [ ] Each event has an `id:` field (monotonic counter)
- [ ] Keep-alive comments sent every 15 seconds
- [ ] Broadcast receiver lag is logged, not fatal

---

### Task 2: Implement subscription filtering

**Files:**
- `native/vtz/src/bridge/events.rs` (modified)

**What to implement:**

1. When `?subscribe=error_update,file_change` is present:
   - Parse into `HashSet<String>`
   - Validate each name against `KNOWN_EVENTS`
   - Send `subscribed` ack event after `server_status`:
     ```json
     {"event":"subscribed","timestamp":"...","data":{"active_filter":["error_update","file_change"],"unknown_events":[]}}
     ```
   - Filter subsequent events: only relay events whose `event_name()` is in the subscribe set
   - `server_status` is always sent (not filtered)

2. When `?subscribe` is absent or empty, relay all events (no filtering).

**Acceptance criteria:**
- [ ] `GET /events?subscribe=error_update` only receives `server_status`, `subscribed`, and `error_update` events
- [ ] Unknown event names are reported in `subscribed.data.unknown_events`
- [ ] Empty `?subscribe=` relays all events
- [ ] `server_status` is always sent regardless of filter

---

### Task 3: Tests for SSE event stream

**Files:**
- `native/vtz/src/bridge/events.rs` (modified — add tests)

**What to implement:**

Tests using `tower::ServiceExt::oneshot`:

1. `test_events_returns_sse_content_type` — Verify Content-Type is `text/event-stream`
2. `test_events_first_event_is_server_status` — Parse first SSE data line, verify `event` is `server_status`
3. `test_events_with_subscribe_sends_ack` — `GET /events?subscribe=error_update`, verify second event is `subscribed` with correct filter
4. `test_events_subscribe_unknown_events_reported` — `GET /events?subscribe=bogus`, verify `unknown_events` contains `"bogus"`
5. `test_events_broadcasts_are_relayed` — Broadcast an event via `mcp_event_hub`, verify it appears in the SSE stream

For tests that need to read the SSE stream, use `axum::body::to_bytes` with a small limit or read chunks manually. The broadcast test may need a small `tokio::time::sleep` to allow the stream to forward the event.

**Acceptance criteria:**
- [ ] All 5 tests pass
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
