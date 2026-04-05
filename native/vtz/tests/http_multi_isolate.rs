//! Integration tests for HTTP routing through multi-isolate supervisor + message bus.
//!
//! These tests verify the full pipeline: entity graph → supervisor → message bus
//! → API route resolution → cross-isolate message delivery.

use std::path::PathBuf;

use vertz_runtime::runtime::entity_graph::{EntityNode, EntityRef, IsolationMode, RefKind};
use vertz_runtime::runtime::isolate_supervisor::{
    extract_entity_from_path, IsolateSupervisor, SupervisorConfig,
};
use vertz_runtime::runtime::message_bus::{BusError, BusMessage, MessageBusConfig};

fn node(name: &str, refs: Vec<(&str, RefKind)>, isolation: IsolationMode) -> EntityNode {
    EntityNode {
        name: name.to_string(),
        refs: refs
            .into_iter()
            .map(|(target, kind)| EntityRef {
                target: target.to_string(),
                kind,
            })
            .collect(),
        isolation,
    }
}

/// Full pipeline: supervisor creates entity groups, wires message bus,
/// and API requests route through bus to correct isolate.
#[tokio::test]
async fn api_request_routes_to_correct_isolate_via_bus() {
    // 1. Set up supervisor with entities
    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities: vec![
            node(
                "task",
                vec![("comment", RefKind::Many)],
                IsolationMode::Default,
            ),
            node("comment", vec![], IsolationMode::Default),
            node("user", vec![], IsolationMode::Default),
        ],
    };
    let supervisor = IsolateSupervisor::new(config);

    // 2. Create message bus wired to supervisor
    let mut handles = supervisor.create_message_bus(MessageBusConfig::default());

    // 3. Resolve API route for /api/tasks
    let resolution = supervisor.resolve_api_route("/api/tasks").unwrap();
    assert_eq!(resolution.entity_name, "task");

    // 4. Send message through bus to the task entity's isolate
    let (resp_tx, _resp_rx) = tokio::sync::oneshot::channel();
    let msg = BusMessage {
        source_entity: "user".to_string(),
        target_entity: resolution.entity_name.clone(),
        operation: "list".to_string(),
        payload: vec![1, 2, 3],
        response_tx: resp_tx,
        trace_id: "req-001".to_string(),
        call_chain: vec!["user".to_string()],
    };

    handles.bus.send(msg).await.unwrap();

    // 5. Verify message arrived at the correct isolate's receiver
    let received = handles
        .receivers
        .get_mut(&resolution.isolate_index)
        .unwrap()
        .try_recv()
        .unwrap();
    assert_eq!(received.target_entity, "task");
    assert_eq!(received.operation, "list");
    assert_eq!(received.payload, vec![1, 2, 3]);
}

/// Cross-entity request: user isolate sends message to task isolate via bus.
#[tokio::test]
async fn cross_isolate_message_delivery() {
    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities: vec![
            node("task", vec![], IsolationMode::Default),
            node("user", vec![], IsolationMode::Default),
        ],
    };
    let supervisor = IsolateSupervisor::new(config);
    let mut handles = supervisor.create_message_bus(MessageBusConfig::default());

    // User isolate sends a cross-entity request to task isolate
    let (resp_tx, _resp_rx) = tokio::sync::oneshot::channel();
    let msg = BusMessage {
        source_entity: "user".to_string(),
        target_entity: "task".to_string(),
        operation: "get".to_string(),
        payload: b"task-123".to_vec(),
        response_tx: resp_tx,
        trace_id: "cross-001".to_string(),
        call_chain: vec!["user".to_string()],
    };

    handles.bus.send(msg).await.unwrap();

    // Task isolate receives the message
    let task_idx = supervisor.isolate_index_for_entity("task").unwrap();
    let received = handles
        .receivers
        .get_mut(&task_idx)
        .unwrap()
        .try_recv()
        .unwrap();
    assert_eq!(received.source_entity, "user");
    assert_eq!(received.target_entity, "task");
    assert_eq!(received.payload, b"task-123");
}

/// Deadlock detection works end-to-end through the bus.
#[tokio::test]
async fn cross_isolate_deadlock_detected() {
    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities: vec![
            node("task", vec![], IsolationMode::Default),
            node("comment", vec![], IsolationMode::Default),
        ],
    };
    let supervisor = IsolateSupervisor::new(config);
    let handles = supervisor.create_message_bus(MessageBusConfig::default());

    // Simulate: task → comment → task (circular)
    let (resp_tx, _) = tokio::sync::oneshot::channel();
    let msg = BusMessage {
        source_entity: "comment".to_string(),
        target_entity: "task".to_string(),
        operation: "get".to_string(),
        payload: vec![],
        response_tx: resp_tx,
        trace_id: "deadlock-001".to_string(),
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

/// Unknown entity API route returns None from supervisor.
#[test]
fn unknown_entity_route_returns_none() {
    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities: vec![node("task", vec![], IsolationMode::Default)],
    };
    let supervisor = IsolateSupervisor::new(config);

    assert!(supervisor.resolve_api_route("/api/unknown").is_none());
    assert!(supervisor.resolve_api_route("/api/tasks").is_some());
}

/// Entity path extraction handles common REST URL patterns.
#[test]
fn entity_extraction_rest_patterns() {
    assert_eq!(
        extract_entity_from_path("/api/tasks"),
        Some("task".to_string())
    );
    assert_eq!(
        extract_entity_from_path("/api/tasks/123"),
        Some("task".to_string())
    );
    assert_eq!(
        extract_entity_from_path("/api/tasks/123/comments"),
        Some("task".to_string())
    );
    assert_eq!(
        extract_entity_from_path("/api/task-comments"),
        Some("task-comment".to_string())
    );
    assert!(extract_entity_from_path("/not-api/tasks").is_none());
}

/// Strict serialization mode is configurable via message bus.
#[test]
fn strict_serialization_propagates() {
    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities: vec![
            node("task", vec![], IsolationMode::Default),
            node("user", vec![], IsolationMode::Default),
        ],
    };
    let supervisor = IsolateSupervisor::new(config);

    // Default: strict off
    let handles = supervisor.create_message_bus(MessageBusConfig::default());
    assert!(!handles.bus.strict_serialization());
    assert!(handles.bus.same_group("task", "task")); // same entity = same group

    // Explicit: strict on
    let handles = supervisor.create_message_bus(MessageBusConfig {
        strict_serialization: true,
        channel_capacity: 256,
    });
    assert!(handles.bus.strict_serialization());
}
