//! Message Bus — routes messages between Isolates with serialization boundary.
//!
//! All inter-Isolate communication goes through Rust-native tokio channels.
//! The bus enforces serialization via structured clone protocol to ensure
//! local-production parity.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use thiserror::Error;
use tokio::sync::{mpsc, oneshot};

/// Default send timeout (30 seconds).
const DEFAULT_SEND_TIMEOUT: Duration = Duration::from_secs(30);

/// A message sent between Isolates via the message bus
#[derive(Debug)]
pub struct BusMessage {
    /// Source entity name (sender)
    pub source_entity: String,
    /// Target entity name (receiver)
    pub target_entity: String,
    /// Operation to perform (e.g., "list", "get", "create")
    pub operation: String,
    /// Serialized payload (V8 ValueSerializer bytes)
    pub payload: Vec<u8>,
    /// Channel for the response
    pub response_tx: oneshot::Sender<Result<Vec<u8>, BusError>>,
    /// Request trace ID for cross-Isolate tracing
    pub trace_id: String,
    /// Call chain for deadlock detection (entities in the current call path).
    /// Callers MUST push `source_entity` onto the chain before sending.
    pub call_chain: Vec<String>,
}

/// Errors that can occur during message bus operations
#[derive(Debug, Clone, PartialEq, Error)]
pub enum BusError {
    /// Target entity not found in the message bus
    #[error("EntityNotFound: entity '{entity}' not registered")]
    EntityNotFound { entity: String },
    /// Non-serializable data detected
    #[error("SerializationError: cannot serialize value at '{path}' ({value_desc}): {hint}")]
    SerializationError {
        path: String,
        value_desc: String,
        hint: String,
    },
    /// Circular cross-entity call detected
    #[error("DeadlockDetected: circular cross-entity read: {}", .cycle.join(" → "))]
    DeadlockDetected { cycle: Vec<String> },
    /// Operation timed out waiting for channel space
    #[error("Timeout: entity '{entity}' operation '{operation}' exceeded {timeout_ms}ms")]
    Timeout {
        entity: String,
        operation: String,
        timeout_ms: u64,
    },
    /// Inbox channel full (backpressure)
    #[error("ChannelFull: inbox for entity '{entity}' is full (backpressure)")]
    ChannelFull { entity: String },
    /// Isolate receiver was dropped (isolate crashed or shut down)
    #[error("IsolateClosed: isolate for entity '{entity}' is no longer running")]
    IsolateClosed { entity: String },
}

/// Configuration for the message bus
#[derive(Debug, Clone)]
pub struct MessageBusConfig {
    /// Whether to serialize even same-group calls (default: false, true in CI)
    pub strict_serialization: bool,
    /// Bounded channel capacity per Isolate inbox (must be > 0)
    pub channel_capacity: usize,
}

impl MessageBusConfig {
    /// Create config from environment variables.
    ///
    /// - `CI=true` → strict_serialization enabled
    /// - `VERTZ_STRICT_SERIALIZATION=1|true` → strict_serialization enabled
    pub fn from_env() -> Self {
        let strict = std::env::var("CI").is_ok()
            || std::env::var("VERTZ_STRICT_SERIALIZATION")
                .map(|v| v == "1" || v == "true")
                .unwrap_or(false);
        Self {
            strict_serialization: strict,
            channel_capacity: 256,
        }
    }
}

impl Default for MessageBusConfig {
    fn default() -> Self {
        Self {
            strict_serialization: false,
            channel_capacity: 256,
        }
    }
}

/// The message bus routes messages to the correct Isolate's inbox channel
pub struct MessageBus {
    /// Sender for each Isolate group (indexed by group/isolate index)
    isolate_inboxes: HashMap<usize, mpsc::Sender<BusMessage>>,
    /// Maps entity names to their Isolate group index
    entity_to_isolate: HashMap<String, usize>,
    /// Configuration
    config: MessageBusConfig,
}

/// Result of creating a MessageBus — includes the receivers for each Isolate
pub struct MessageBusHandles {
    /// The message bus (shared across all Isolates)
    pub bus: MessageBus,
    /// One receiver per Isolate group (to be polled on the Isolate's thread)
    pub receivers: HashMap<usize, mpsc::Receiver<BusMessage>>,
}

impl MessageBus {
    /// Create a message bus from entity-to-isolate mapping.
    ///
    /// Returns the bus and a map of receivers (one per Isolate group).
    ///
    /// # Panics
    /// Panics if `config.channel_capacity` is 0.
    pub fn create(
        entity_to_isolate: HashMap<String, usize>,
        config: MessageBusConfig,
    ) -> MessageBusHandles {
        assert!(
            config.channel_capacity > 0,
            "MessageBusConfig::channel_capacity must be > 0"
        );

        let isolate_indices: Vec<usize> = {
            let mut indices: Vec<usize> = entity_to_isolate.values().copied().collect();
            indices.sort();
            indices.dedup();
            indices
        };

        let mut inboxes = HashMap::new();
        let mut receivers = HashMap::new();

        for &idx in &isolate_indices {
            let (tx, rx) = mpsc::channel(config.channel_capacity);
            inboxes.insert(idx, tx);
            receivers.insert(idx, rx);
        }

        MessageBusHandles {
            bus: MessageBus {
                isolate_inboxes: inboxes,
                entity_to_isolate,
                config,
            },
            receivers,
        }
    }

    /// Send a message to the target entity's Isolate.
    ///
    /// Awaits channel availability with a timeout. Returns `Err(BusError)` if:
    /// - The entity is unknown
    /// - A deadlock cycle is detected in the call chain
    /// - The channel send times out
    /// - The receiver isolate has been dropped
    pub async fn send(&self, msg: BusMessage) -> Result<(), BusError> {
        // Check for deadlock
        if let Some(err) = check_deadlock(&msg.call_chain, &msg.target_entity) {
            return Err(err);
        }

        let target_entity = msg.target_entity.clone();
        let operation = msg.operation.clone();

        let isolate_idx =
            self.entity_to_isolate
                .get(&target_entity)
                .ok_or_else(|| BusError::EntityNotFound {
                    entity: target_entity.clone(),
                })?;

        let sender =
            self.isolate_inboxes
                .get(isolate_idx)
                .ok_or_else(|| BusError::EntityNotFound {
                    entity: target_entity.clone(),
                })?;

        match tokio::time::timeout(DEFAULT_SEND_TIMEOUT, sender.send(msg)).await {
            Ok(Ok(())) => Ok(()),
            Ok(Err(_)) => Err(BusError::IsolateClosed {
                entity: target_entity,
            }),
            Err(_) => Err(BusError::Timeout {
                entity: target_entity,
                operation,
                timeout_ms: DEFAULT_SEND_TIMEOUT.as_millis() as u64,
            }),
        }
    }

    /// Check if an entity is registered in the bus
    pub fn has_entity(&self, name: &str) -> bool {
        self.entity_to_isolate.contains_key(name)
    }

    /// Check if two entities are in the same Isolate group
    pub fn same_group(&self, entity_a: &str, entity_b: &str) -> bool {
        match (
            self.entity_to_isolate.get(entity_a),
            self.entity_to_isolate.get(entity_b),
        ) {
            (Some(a), Some(b)) => a == b,
            _ => false,
        }
    }

    /// Whether strict serialization is enabled
    pub fn strict_serialization(&self) -> bool {
        self.config.strict_serialization
    }
}

/// Check if a deadlock would occur by sending to `target_entity`
/// given the current `call_chain`.
///
/// Callers must ensure `source_entity` is already in the `call_chain`
/// before calling this function.
pub fn check_deadlock(call_chain: &[String], target_entity: &str) -> Option<BusError> {
    let chain_set: HashSet<&str> = call_chain.iter().map(|s| s.as_str()).collect();
    if chain_set.contains(target_entity) {
        let mut cycle = call_chain.to_vec();
        cycle.push(target_entity.to_string());
        return Some(BusError::DeadlockDetected { cycle });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_entity_map() -> HashMap<String, usize> {
        HashMap::from([
            ("task".to_string(), 0),
            ("comment".to_string(), 0),
            ("user".to_string(), 1),
        ])
    }

    fn test_config() -> MessageBusConfig {
        MessageBusConfig {
            strict_serialization: false,
            channel_capacity: 16,
        }
    }

    #[test]
    fn creates_one_channel_per_isolate_group() {
        let handles = MessageBus::create(test_entity_map(), test_config());
        assert_eq!(handles.receivers.len(), 2); // group 0 and group 1
        assert!(handles.receivers.contains_key(&0));
        assert!(handles.receivers.contains_key(&1));
    }

    #[tokio::test]
    async fn send_routes_to_correct_isolate() {
        let mut handles = MessageBus::create(test_entity_map(), test_config());
        let (resp_tx, _resp_rx) = oneshot::channel();

        let msg = BusMessage {
            source_entity: "user".to_string(),
            target_entity: "task".to_string(),
            operation: "list".to_string(),
            payload: vec![1, 2, 3],
            response_tx: resp_tx,
            trace_id: "trace-1".to_string(),
            call_chain: vec!["user".to_string()],
        };

        handles.bus.send(msg).await.unwrap();

        // Should arrive in group 0's receiver (task is in group 0)
        let received = handles.receivers.get_mut(&0).unwrap().try_recv().unwrap();
        assert_eq!(received.target_entity, "task");
        assert_eq!(received.payload, vec![1, 2, 3]);
    }

    #[tokio::test]
    async fn send_to_unknown_entity_returns_error() {
        let handles = MessageBus::create(test_entity_map(), test_config());
        let (resp_tx, _resp_rx) = oneshot::channel();

        let msg = BusMessage {
            source_entity: "task".to_string(),
            target_entity: "nonexistent".to_string(),
            operation: "get".to_string(),
            payload: vec![],
            response_tx: resp_tx,
            trace_id: "trace-2".to_string(),
            call_chain: vec![],
        };

        let err = handles.bus.send(msg).await.unwrap_err();
        assert_eq!(
            err,
            BusError::EntityNotFound {
                entity: "nonexistent".to_string()
            }
        );
    }

    #[tokio::test]
    async fn deadlock_detected_for_circular_call() {
        let handles = MessageBus::create(test_entity_map(), test_config());
        let (resp_tx, _resp_rx) = oneshot::channel();

        // Simulate: task → comment → task (circular)
        let msg = BusMessage {
            source_entity: "comment".to_string(),
            target_entity: "task".to_string(),
            operation: "get".to_string(),
            payload: vec![],
            response_tx: resp_tx,
            trace_id: "trace-3".to_string(),
            call_chain: vec!["task".to_string(), "comment".to_string()],
        };

        let err = handles.bus.send(msg).await.unwrap_err();
        match err {
            BusError::DeadlockDetected { cycle } => {
                assert_eq!(cycle, vec!["task", "comment", "task"]);
            }
            _ => panic!("Expected DeadlockDetected, got {:?}", err),
        }
    }

    #[tokio::test]
    async fn three_hop_deadlock_detected() {
        let entity_map = HashMap::from([
            ("a".to_string(), 0),
            ("b".to_string(), 1),
            ("c".to_string(), 2),
        ]);
        let handles = MessageBus::create(entity_map, test_config());
        let (resp_tx, _resp_rx) = oneshot::channel();

        // a → b → c → a (three-hop circular)
        let msg = BusMessage {
            source_entity: "c".to_string(),
            target_entity: "a".to_string(),
            operation: "get".to_string(),
            payload: vec![],
            response_tx: resp_tx,
            trace_id: "trace-4".to_string(),
            call_chain: vec!["a".to_string(), "b".to_string(), "c".to_string()],
        };

        let err = handles.bus.send(msg).await.unwrap_err();
        match err {
            BusError::DeadlockDetected { cycle } => {
                assert_eq!(cycle, vec!["a", "b", "c", "a"]);
            }
            _ => panic!("Expected DeadlockDetected"),
        }
    }

    #[tokio::test]
    async fn non_circular_calls_succeed() {
        let entity_map = HashMap::from([
            ("a".to_string(), 0),
            ("b".to_string(), 1),
            ("c".to_string(), 2),
        ]);
        let handles = MessageBus::create(entity_map, test_config());

        // a → b (not circular with a → c)
        let (resp_tx, _) = oneshot::channel();
        let msg = BusMessage {
            source_entity: "a".to_string(),
            target_entity: "b".to_string(),
            operation: "get".to_string(),
            payload: vec![],
            response_tx: resp_tx,
            trace_id: "trace-5".to_string(),
            call_chain: vec!["a".to_string()],
        };
        assert!(handles.bus.send(msg).await.is_ok());
    }

    #[tokio::test]
    async fn closed_receiver_returns_isolate_closed() {
        let mut handles = MessageBus::create(test_entity_map(), test_config());

        // Drop the receiver for group 0 to simulate isolate crash
        handles.receivers.remove(&0);

        let (resp_tx, _) = oneshot::channel();
        let msg = BusMessage {
            source_entity: "user".to_string(),
            target_entity: "task".to_string(),
            operation: "list".to_string(),
            payload: vec![],
            response_tx: resp_tx,
            trace_id: "trace-6".to_string(),
            call_chain: vec!["user".to_string()],
        };

        let err = handles.bus.send(msg).await.unwrap_err();
        assert_eq!(
            err,
            BusError::IsolateClosed {
                entity: "task".to_string()
            }
        );
    }

    #[test]
    fn has_entity_checks_registration() {
        let handles = MessageBus::create(test_entity_map(), test_config());
        assert!(handles.bus.has_entity("task"));
        assert!(handles.bus.has_entity("comment"));
        assert!(!handles.bus.has_entity("nonexistent"));
    }

    #[test]
    fn same_group_checks_isolate_co_location() {
        let handles = MessageBus::create(test_entity_map(), test_config());
        assert!(handles.bus.same_group("task", "comment")); // both in group 0
        assert!(!handles.bus.same_group("task", "user")); // group 0 vs 1
        assert!(!handles.bus.same_group("task", "nonexistent"));
    }

    #[test]
    fn strict_serialization_default_off() {
        let handles = MessageBus::create(test_entity_map(), MessageBusConfig::default());
        assert!(!handles.bus.strict_serialization());
    }

    #[test]
    fn strict_serialization_explicit_on() {
        let handles = MessageBus::create(
            test_entity_map(),
            MessageBusConfig {
                strict_serialization: true,
                channel_capacity: 16,
            },
        );
        assert!(handles.bus.strict_serialization());
    }

    #[test]
    #[should_panic(expected = "channel_capacity must be > 0")]
    fn zero_channel_capacity_panics() {
        MessageBus::create(
            test_entity_map(),
            MessageBusConfig {
                strict_serialization: false,
                channel_capacity: 0,
            },
        );
    }

    #[test]
    fn check_deadlock_detects_self_loop() {
        // Entity "task" is in its own call chain — calling itself
        let result = check_deadlock(&["task".to_string()], "task");
        assert!(result.is_some());
        match result.unwrap() {
            BusError::DeadlockDetected { cycle } => {
                assert_eq!(cycle, vec!["task", "task"]);
            }
            _ => panic!("Expected DeadlockDetected"),
        }
    }

    #[test]
    fn check_deadlock_empty_chain_succeeds() {
        assert!(check_deadlock(&[], "task").is_none());
    }

    #[test]
    fn bus_error_display_entity_not_found() {
        let err = BusError::EntityNotFound {
            entity: "task".to_string(),
        };
        assert!(err.to_string().contains("task"));
        assert!(err.to_string().contains("EntityNotFound"));
    }

    #[test]
    fn bus_error_display_serialization() {
        let err = BusError::SerializationError {
            path: "payload.connection".to_string(),
            value_desc: "[Socket object]".to_string(),
            hint: "Extract the data you need".to_string(),
        };
        let s = err.to_string();
        assert!(s.contains("payload.connection"));
        assert!(s.contains("[Socket object]"));
        assert!(s.contains("Extract the data"));
    }

    #[test]
    fn bus_error_display_deadlock() {
        let err = BusError::DeadlockDetected {
            cycle: vec![
                "task".to_string(),
                "comment".to_string(),
                "task".to_string(),
            ],
        };
        let s = err.to_string();
        assert!(s.contains("task → comment → task"));
        assert!(s.contains("DeadlockDetected"));
    }

    #[test]
    fn bus_error_display_isolate_closed() {
        let err = BusError::IsolateClosed {
            entity: "task".to_string(),
        };
        let s = err.to_string();
        assert!(s.contains("task"));
        assert!(s.contains("IsolateClosed"));
    }

    #[test]
    fn bus_error_display_timeout() {
        let err = BusError::Timeout {
            entity: "task".to_string(),
            operation: "list".to_string(),
            timeout_ms: 30000,
        };
        let s = err.to_string();
        assert!(s.contains("task"));
        assert!(s.contains("30000ms"));
    }

    #[test]
    fn default_config_is_deterministic() {
        let a = MessageBusConfig::default();
        let b = MessageBusConfig::default();
        assert_eq!(a.strict_serialization, b.strict_serialization);
        assert_eq!(a.channel_capacity, b.channel_capacity);
        assert!(!a.strict_serialization);
        assert_eq!(a.channel_capacity, 256);
    }
}
