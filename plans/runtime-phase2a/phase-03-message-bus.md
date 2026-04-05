# Phase 3: Message Bus + Cross-Isolate Protocol

## Context

With multiple Isolates spawned (Phase 2), entities in different groups need to communicate. This phase implements the message bus — the Rust-native channel layer that routes messages between Isolates with serialization boundary enforcement.

Design doc: `plans/vertz-runtime.md` (Phase 2 Architecture Summary, item 2 and 3)

## Tasks

### Task 1: Message bus core — channel management + message types

**Files:**
- `native/vtz/src/runtime/message_bus.rs` (new)
- `native/vtz/src/runtime/mod.rs` (modified — add `pub mod message_bus`)

**What to implement:**

```rust
use tokio::sync::{mpsc, oneshot};

/// A message sent between Isolates
pub struct BusMessage {
    pub source_entity: String,
    pub target_entity: String,
    pub operation: String,              // e.g. "list", "get", "create"
    pub payload: Vec<u8>,               // V8-serialized data
    pub response_tx: oneshot::Sender<BusResponse>,
    pub trace_id: String,               // for request tracing
}

pub struct BusResponse {
    pub payload: Vec<u8>,               // V8-serialized response
    pub error: Option<BusError>,
}

pub enum BusError {
    SerializationError { path: String, value_desc: String, hint: String },
    EntityNotFound { entity: String },
    Timeout { entity: String, operation: String, timeout_ms: u64 },
    DeadlockDetected { cycle: Vec<String> },
}

/// The message bus routes messages to the correct Isolate
pub struct MessageBus {
    /// One sender per Isolate — bus sends to the right one based on entity_to_isolate
    isolate_inboxes: HashMap<usize, mpsc::Sender<BusMessage>>,
    entity_to_isolate: HashMap<String, usize>,
}

impl MessageBus {
    pub fn new(graph: &EntityGraphResult) -> (Self, Vec<mpsc::Receiver<BusMessage>>);
    pub async fn send(&self, msg: BusMessage) -> Result<(), BusError>;
    pub fn has_entity(&self, name: &str) -> bool;
}
```

The `new()` constructor creates bounded `mpsc` channels (capacity: 256) for each Isolate group and returns the receivers (one per Isolate, to be polled on the Isolate's thread).

**Acceptance criteria:**
- [ ] `MessageBus::new()` creates one channel per entity group
- [ ] `send()` routes message to correct Isolate based on `target_entity`
- [ ] `send()` returns `EntityNotFound` for unknown entities
- [ ] Channel backpressure: `send()` awaits when Isolate inbox is full (bounded channel)
- [ ] `BusError::SerializationError` includes path, value description, and hint

---

### Task 2: V8 serialization ops — `op_vertz_send` / `op_vertz_recv`

**Files:**
- `native/vtz/src/runtime/ops/isolate_messaging.rs` (new)
- `native/vtz/src/runtime/ops/mod.rs` (modified — add module)
- `native/vtz/src/runtime/js_runtime.rs` (modified — register new ops)

**What to implement:**

Two new deno_core ops that bridge JS ↔ Rust message bus:

```rust
/// Called from JS: ctx.entities.task.list(params)
/// Serializes `params` via V8 ValueSerializer, sends to message bus, awaits response
#[op2(async)]
async fn op_vertz_send(
    state: &mut OpState,
    #[string] target_entity: String,
    #[string] operation: String,
    #[serde] payload: serde_json::Value, // or raw V8 value
) -> Result<serde_json::Value, AnyError>;

/// Called on the receiving Isolate's event loop
/// Polls the inbox channel, deserializes payload, dispatches to entity handler
#[op2(async)]
async fn op_vertz_recv(
    state: &mut OpState,
) -> Result<Option<IncomingMessage>, AnyError>;
```

For serialization: leverage the existing `structured_clone` implementation in `ops/clone.rs`. The sender serializes via V8 `ValueSerializer` → `Vec<u8>`, the bus transports the bytes, and the receiver deserializes via V8 `ValueDeserializer`.

Register ops in `VertzJsRuntime::all_op_decls()` and add bootstrap JS that wires them into the entity context.

**Acceptance criteria:**
- [ ] `op_vertz_send` serializes JS value to bytes, sends via bus, returns deserialized response
- [ ] `op_vertz_recv` polls inbox and returns next message (or None if empty)
- [ ] Non-serializable values (functions, Symbols, WeakRef) produce `SerializationError` with path info
- [ ] Round-trip: JS object → serialize → bus → deserialize → identical JS object
- [ ] Ops registered and available in runtime bootstrap

---

### Task 3: Integration test — cross-Isolate message round-trip

**Files:**
- `native/vtz/tests/message_bus.rs` (new)
- `native/vtz/tests/fixtures/cross-entity-app/` (new — two entities that communicate)

**What to implement:**

End-to-end test: Entity A sends a message to Entity B via the bus, Entity B responds.

```rust
#[tokio::test]
async fn cross_isolate_message_roundtrip() {
    // 1. Create two entity nodes in separate groups
    // 2. Create MessageBus + IsolateSupervisor
    // 3. Entity A calls op_vertz_send targeting Entity B
    // 4. Entity B receives via op_vertz_recv, processes, responds
    // 5. Entity A receives response
    // 6. Verify data integrity (no corruption in serialization)
}

#[tokio::test]
async fn non_serializable_data_produces_error() {
    // 1. Entity A tries to send a function/Symbol via op_vertz_send
    // 2. Verify SerializationError is returned with path and hint
}

#[tokio::test]
async fn unknown_entity_produces_error() {
    // 1. Send to non-existent entity
    // 2. Verify EntityNotFound error
}
```

**Acceptance criteria:**
- [ ] Cross-Isolate round-trip succeeds with correct data
- [ ] Non-serializable data produces actionable SerializationError
- [ ] Unknown entity target produces EntityNotFound error
- [ ] Message bus handles concurrent sends from multiple Isolates
- [ ] Performance: simple scalar round-trip < 100μs (generous bound for test stability)
