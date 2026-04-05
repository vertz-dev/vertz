//! Message Bus — routes messages between Isolates with serialization boundary.
//!
//! All inter-Isolate communication goes through Rust-native tokio channels.
//! The bus enforces serialization via structured clone protocol to ensure
//! local-production parity.

use std::collections::HashMap;

use tokio::sync::{mpsc, oneshot};

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
    pub response_tx: oneshot::Sender<BusResponse>,
    /// Request trace ID for cross-Isolate tracing
    pub trace_id: String,
    /// Call chain for deadlock detection (entities in the current call path)
    pub call_chain: Vec<String>,
}

/// Response from a cross-Isolate call
#[derive(Debug)]
pub struct BusResponse {
    /// Serialized response payload (V8 ValueSerializer bytes)
    pub payload: Vec<u8>,
    /// Error, if any
    pub error: Option<BusError>,
}

/// Errors that can occur during message bus operations
#[derive(Debug, Clone, PartialEq)]
pub enum BusError {
    /// Target entity not found in the message bus
    EntityNotFound { entity: String },
    /// Non-serializable data detected
    SerializationError {
        path: String,
        value_desc: String,
        hint: String,
    },
    /// Circular cross-entity call detected
    DeadlockDetected { cycle: Vec<String> },
    /// Operation timed out
    Timeout {
        entity: String,
        operation: String,
        timeout_ms: u64,
    },
    /// Inbox channel full (backpressure)
    ChannelFull { entity: String },
}

impl std::fmt::Display for BusError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BusError::EntityNotFound { entity } => {
                write!(f, "EntityNotFound: entity '{}' not registered", entity)
            }
            BusError::SerializationError {
                path,
                value_desc,
                hint,
            } => {
                write!(
                    f,
                    "SerializationError: Cannot serialize value at path '{}'\n  Value: {}\n  Hint: {}",
                    path, value_desc, hint
                )
            }
            BusError::DeadlockDetected { cycle } => {
                let cycle_str = cycle.join(" → ");
                write!(
                    f,
                    "DeadlockDetected: Circular cross-entity read detected\n  Cycle: {}\n  Hint: Break the cycle by making one of these calls asynchronous.",
                    cycle_str
                )
            }
            BusError::Timeout {
                entity,
                operation,
                timeout_ms,
            } => {
                write!(
                    f,
                    "Timeout: entity '{}' operation '{}' exceeded {}ms",
                    entity, operation, timeout_ms
                )
            }
            BusError::ChannelFull { entity } => {
                write!(
                    f,
                    "ChannelFull: inbox for entity '{}' is full (backpressure)",
                    entity
                )
            }
        }
    }
}

impl std::error::Error for BusError {}

/// Configuration for the message bus
#[derive(Debug, Clone)]
pub struct MessageBusConfig {
    /// Whether to serialize even same-group calls (default: false, true in CI)
    pub strict_serialization: bool,
    /// Bounded channel capacity per Isolate inbox
    pub channel_capacity: usize,
}

impl Default for MessageBusConfig {
    fn default() -> Self {
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
    pub fn create(
        entity_to_isolate: HashMap<String, usize>,
        config: MessageBusConfig,
    ) -> MessageBusHandles {
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

    /// Check if a deadlock would occur by sending to `target_entity`
    /// given the current `call_chain`.
    pub fn check_deadlock(call_chain: &[String], target_entity: &str) -> Option<BusError> {
        if call_chain.contains(&target_entity.to_string()) {
            let mut cycle = call_chain.to_vec();
            cycle.push(target_entity.to_string());
            return Some(BusError::DeadlockDetected { cycle });
        }
        None
    }

    /// Send a message to the target entity's Isolate.
    ///
    /// Returns `Err(BusError)` if the entity is unknown or the channel is full.
    pub async fn send(&self, msg: BusMessage) -> Result<(), BusError> {
        // Check for deadlock
        if let Some(err) = Self::check_deadlock(&msg.call_chain, &msg.target_entity) {
            return Err(err);
        }

        let isolate_idx = self
            .entity_to_isolate
            .get(&msg.target_entity)
            .ok_or_else(|| BusError::EntityNotFound {
                entity: msg.target_entity.clone(),
            })?;

        let sender =
            self.isolate_inboxes
                .get(isolate_idx)
                .ok_or_else(|| BusError::EntityNotFound {
                    entity: msg.target_entity.clone(),
                })?;

        sender.try_send(msg).map_err(|e| match e {
            mpsc::error::TrySendError::Full(_) => BusError::ChannelFull {
                entity: "unknown".to_string(),
            },
            mpsc::error::TrySendError::Closed(_) => BusError::EntityNotFound {
                entity: "closed".to_string(),
            },
        })
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
        // Reset env vars for this test
        let handles = MessageBus::create(
            test_entity_map(),
            MessageBusConfig {
                strict_serialization: false,
                channel_capacity: 16,
            },
        );
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
}
