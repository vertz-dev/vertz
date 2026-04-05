# Phase 5: strictSerialization + Deadlock Detection + Kill Gate Validation

## Context

The final phase of Phase 2a adds safety features (strict serialization mode, deadlock detection) and validates the implementation against the kill gate criteria using the linear-clone example app.

Design doc: `plans/vertz-runtime.md` (Phase 2a acceptance criteria and kill gate)

## Tasks

### Task 1: strictSerialization mode

**Files:**
- `native/vtz/src/runtime/message_bus.rs` (modified)
- `native/vtz/src/runtime/isolate_supervisor.rs` (modified — config propagation)

**What to implement:**

When `strictSerialization: true` (default in CI, opt-in otherwise), ALL cross-entity calls go through serialization — even calls between entities in the same Isolate group. This catches parity bugs where code works locally because entities share an Isolate but would fail in production where they're separate Workers.

```rust
pub struct MessageBusConfig {
    pub strict_serialization: bool,    // default: false (true in CI via env var)
    pub channel_capacity: usize,       // default: 256
}

impl MessageBus {
    /// In strict mode: serialize/deserialize even for same-group calls
    /// In normal mode: same-group calls skip serialization (direct in-process)
    pub async fn send(&self, msg: BusMessage) -> Result<BusResponse, BusError>;
}
```

Detect CI via `std::env::var("CI")` and default `strict_serialization` to `true` when CI is set. Also support explicit `VERTZ_STRICT_SERIALIZATION=1` env var.

**Acceptance criteria:**
- [ ] With `strictSerialization: false`, same-group calls skip serialization (direct)
- [ ] With `strictSerialization: true`, same-group calls go through serialization
- [ ] Non-serializable data caught in strict mode even for same-group calls
- [ ] `CI=true` env var automatically enables strict serialization
- [ ] `VERTZ_STRICT_SERIALIZATION=1` env var explicitly enables it

---

### Task 2: Deadlock detection for circular cross-entity reads

**Files:**
- `native/vtz/src/runtime/message_bus.rs` (modified)

**What to implement:**

Detect circular synchronous cross-entity reads and produce a clear error:

```
DeadlockDetected: Circular cross-entity read detected
  Cycle: task → comment → task
  Hint: Entity 'task' is waiting for 'comment', which is waiting for 'task'.
        Break the cycle by making one of these calls asynchronous or
        restructuring your entity relationships.
```

Implementation: maintain a per-request call chain (thread-local or passed through BusMessage). When `op_vertz_send` is called, check if the target entity is already in the current call chain. If so, return `DeadlockDetected` immediately.

```rust
pub struct BusMessage {
    // ... existing fields ...
    pub call_chain: Vec<String>,        // entities in the current call path
}
```

**Acceptance criteria:**
- [ ] A→B→A circular call produces `DeadlockDetected` with correct cycle
- [ ] A→B→C→A three-hop cycle detected
- [ ] Non-circular calls (A→B, A→C independently) succeed normally
- [ ] Error message includes the full cycle path and actionable hint

---

### Task 3: Memory benchmarks + kill gate validation

**Files:**
- `native/vtz/tests/kill_gate.rs` (new)
- `native/vtz/tests/fixtures/kill-gate-app/` (new — linear-clone-like fixture)

**What to implement:**

A test that validates all Phase 2a kill gate criteria:

```rust
#[tokio::test]
async fn kill_gate_linear_clone() {
    // Kill gate: "The linear-clone example app's task and comment entities
    // run in separate Isolates, communicating through the message bus."

    // 1. Start supervisor with task + comment entities in separate groups
    let supervisor = IsolateSupervisor::new(config)?;

    // 2. Cross-entity reads succeed
    // "task fetches comment count" via message bus
    let response = supervisor.handle_api_request("task", list_request).await?;
    assert!(response.body.contains("commentCount"));

    // 3. Non-serializable payloads produce SerializationError
    // Send a function reference across the bus
    let err = supervisor.handle_api_request("task", bad_request).await;
    assert!(matches!(err, Err(e) if e.contains("SerializationError")));

    // 4. Memory per Isolate under 30MB
    let mem = measure_isolate_rss(&supervisor);
    assert!(mem.max_per_isolate_mb < 30.0);

    // 5. Cold start with 5+ Isolates under 3 seconds
    let start = std::time::Instant::now();
    let supervisor = IsolateSupervisor::new(five_entity_config)?;
    let cold_start = start.elapsed();
    assert!(cold_start < Duration::from_secs(3));
}
```

Also add a memory benchmark that measures RSS with 10, 25, and 50 entities to validate the <500MB target.

**Acceptance criteria:**
- [ ] Linear-clone entities run in separate Isolates
- [ ] Cross-entity reads through message bus succeed with correct data
- [ ] Non-serializable payloads produce SerializationError
- [ ] Memory per Isolate < 30MB
- [ ] Cold start with 5+ Isolates < 3 seconds
- [ ] 50 entities + queues/durables < 500MB RSS (or documents why and proposes fix)
