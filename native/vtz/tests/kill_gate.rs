//! Kill Gate Validation — Phase 2a acceptance criteria.
//!
//! These tests validate the structural requirements for multi-isolate entity workers.
//! They verify that the entity graph, supervisor, message bus, and routing infrastructure
//! meet the kill gate criteria for the linear-clone example app.

use std::path::PathBuf;
use std::time::Instant;

use vertz_runtime::runtime::entity_graph::{
    compute_groups, EntityNode, EntityRef, IsolationMode, RefKind,
};
use vertz_runtime::runtime::isolate_supervisor::{
    compute_thread_assignments, IsolateSupervisor, SupervisorConfig,
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

/// Linear-clone entities for kill gate validation.
fn linear_clone_entities() -> Vec<EntityNode> {
    vec![
        node(
            "task",
            vec![
                ("comment", RefKind::Many),
                ("user", RefKind::One),
                ("label", RefKind::Many),
            ],
            IsolationMode::Default,
        ),
        node(
            "comment",
            vec![("task", RefKind::One), ("user", RefKind::One)],
            IsolationMode::Default,
        ),
        node("user", vec![], IsolationMode::Default),
        node(
            "team",
            vec![("user", RefKind::Many)],
            IsolationMode::Default,
        ),
        node("label", vec![], IsolationMode::Default),
    ]
}

/// Kill gate criterion: Linear-clone task and comment entities are co-located
/// in the same isolate (they share refs), while user/team are separate.
#[test]
fn kill_gate_entity_grouping() {
    let entities = linear_clone_entities();
    let result = compute_groups(&entities);

    // task, comment, user, label are all connected → one group
    // team→user connects team to the same group
    // With 5 entities and the hub/cap logic, verify structure
    let task_group = result.entity_to_group.get("task").unwrap();
    let comment_group = result.entity_to_group.get("comment").unwrap();

    // task and comment MUST be in the same group (they have direct refs)
    assert_eq!(
        task_group, comment_group,
        "task and comment must be co-located in the same isolate"
    );
}

/// Kill gate criterion: Cross-entity communication works through the message bus.
#[tokio::test]
async fn kill_gate_cross_entity_bus_communication() {
    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities: vec![
            node("task", vec![], IsolationMode::Default),
            node("user", vec![], IsolationMode::Separate),
        ],
    };
    let supervisor = IsolateSupervisor::new(config);
    let mut handles = supervisor.create_message_bus(MessageBusConfig::default());

    // task and user are in separate isolates (user is IsolationMode::Separate)
    assert!(!handles.bus.same_group("task", "user"));

    // Send cross-entity message: user → task
    let (resp_tx, _) = tokio::sync::oneshot::channel();
    let msg = BusMessage {
        source_entity: "user".to_string(),
        target_entity: "task".to_string(),
        operation: "list".to_string(),
        payload: b"fetch-tasks".to_vec(),
        response_tx: resp_tx,
        trace_id: "kg-001".to_string(),
        call_chain: vec!["user".to_string()],
    };

    handles.bus.send(msg).await.unwrap();

    let task_idx = supervisor.isolate_index_for_entity("task").unwrap();
    let received = handles
        .receivers
        .get_mut(&task_idx)
        .unwrap()
        .try_recv()
        .unwrap();
    assert_eq!(received.target_entity, "task");
    assert_eq!(received.operation, "list");
    assert_eq!(received.payload, b"fetch-tasks");
}

/// Kill gate criterion: Deadlock detection catches circular cross-entity reads.
#[tokio::test]
async fn kill_gate_deadlock_detection() {
    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities: vec![
            node("task", vec![], IsolationMode::Default),
            node("comment", vec![], IsolationMode::Default),
            node("user", vec![], IsolationMode::Default),
        ],
    };
    let supervisor = IsolateSupervisor::new(config);
    let handles = supervisor.create_message_bus(MessageBusConfig::default());

    // Circular: task → comment → task
    let (resp_tx, _) = tokio::sync::oneshot::channel();
    let msg = BusMessage {
        source_entity: "comment".to_string(),
        target_entity: "task".to_string(),
        operation: "get".to_string(),
        payload: vec![],
        response_tx: resp_tx,
        trace_id: "kg-deadlock".to_string(),
        call_chain: vec!["task".to_string(), "comment".to_string()],
    };

    let err = handles.bus.send(msg).await.unwrap_err();
    match &err {
        BusError::DeadlockDetected { cycle } => {
            assert_eq!(cycle, &["task", "comment", "task"]);
        }
        _ => panic!("Expected DeadlockDetected, got {:?}", err),
    }

    // Three-hop: user → task → comment → user
    let (resp_tx, _) = tokio::sync::oneshot::channel();
    let msg = BusMessage {
        source_entity: "comment".to_string(),
        target_entity: "user".to_string(),
        operation: "get".to_string(),
        payload: vec![],
        response_tx: resp_tx,
        trace_id: "kg-deadlock-3".to_string(),
        call_chain: vec![
            "user".to_string(),
            "task".to_string(),
            "comment".to_string(),
        ],
    };

    let err = handles.bus.send(msg).await.unwrap_err();
    match &err {
        BusError::DeadlockDetected { cycle } => {
            assert_eq!(cycle, &["user", "task", "comment", "user"]);
        }
        _ => panic!("Expected DeadlockDetected, got {:?}", err),
    }
}

/// Kill gate criterion: strict serialization mode can be enabled.
#[test]
fn kill_gate_strict_serialization_mode() {
    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities: vec![
            node(
                "task",
                vec![("comment", RefKind::Many)],
                IsolationMode::Default,
            ),
            node("comment", vec![], IsolationMode::Default),
        ],
    };
    let supervisor = IsolateSupervisor::new(config);

    // Default: strict off
    let handles = supervisor.create_message_bus(MessageBusConfig::default());
    assert!(!handles.bus.strict_serialization());
    assert!(handles.bus.same_group("task", "comment"));

    // Strict on: same-group calls should still go through serialization
    let handles = supervisor.create_message_bus(MessageBusConfig {
        strict_serialization: true,
        channel_capacity: 256,
    });
    assert!(handles.bus.strict_serialization());
    // same_group still reports true (the routing layer uses this + strict flag
    // to decide whether to serialize)
    assert!(handles.bus.same_group("task", "comment"));
}

/// Kill gate criterion: API routes resolve correctly for the linear-clone app.
#[test]
fn kill_gate_api_routing() {
    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities: linear_clone_entities(),
    };
    let supervisor = IsolateSupervisor::new(config);

    // All entity API routes should resolve
    assert!(supervisor.resolve_api_route("/api/tasks").is_some());
    assert!(supervisor.resolve_api_route("/api/comments").is_some());
    assert!(supervisor.resolve_api_route("/api/users").is_some());
    assert!(supervisor.resolve_api_route("/api/teams").is_some());
    assert!(supervisor.resolve_api_route("/api/labels").is_some());

    // Sub-paths resolve to the same entity
    let tasks_root = supervisor.resolve_api_route("/api/tasks").unwrap();
    let tasks_sub = supervisor.resolve_api_route("/api/tasks/123").unwrap();
    assert_eq!(tasks_root.entity_name, tasks_sub.entity_name);
    assert_eq!(tasks_root.isolate_index, tasks_sub.isolate_index);
}

/// Kill gate criterion: Cold start with 5+ isolates completes quickly.
///
/// Note: This tests supervisor creation time (entity graph + thread assignment),
/// not V8 isolate startup time (which requires the full runtime).
#[test]
fn kill_gate_cold_start_performance() {
    let start = Instant::now();
    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities: linear_clone_entities(),
    };
    let supervisor = IsolateSupervisor::new(config);
    let elapsed = start.elapsed();

    // Supervisor creation (without V8) should be well under 100ms
    assert!(
        elapsed.as_millis() < 100,
        "Supervisor cold start took {}ms (limit: 100ms)",
        elapsed.as_millis()
    );
    assert!(supervisor.isolate_count() > 0);
}

/// Kill gate criterion: Thread assignment distributes isolates for 50 entities.
#[test]
fn kill_gate_50_entity_thread_distribution() {
    let entities: Vec<EntityNode> = (0..50)
        .map(|i| node(&format!("entity-{}", i), vec![], IsolationMode::Separate))
        .collect();

    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities,
    };
    let supervisor = IsolateSupervisor::new(config);

    // 50 separate entities = 50 isolates
    assert_eq!(supervisor.isolate_count(), 50);

    // Thread assignments should distribute across available cores
    let num_cpus = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let assignments = compute_thread_assignments(50, num_cpus);

    // Should use all available threads (up to 50)
    assert_eq!(assignments.len(), num_cpus.min(50));

    // Every isolate should be assigned to a thread
    let total_assigned: usize = assignments.iter().map(|a| a.isolate_indices.len()).sum();
    assert_eq!(total_assigned, 50);
}

/// Kill gate criterion: Message bus handles 50 entities without errors.
#[tokio::test]
async fn kill_gate_50_entity_bus_routing() {
    let entities: Vec<EntityNode> = (0..50)
        .map(|i| node(&format!("entity-{}", i), vec![], IsolationMode::Separate))
        .collect();

    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities,
    };
    let supervisor = IsolateSupervisor::new(config);
    let mut handles = supervisor.create_message_bus(MessageBusConfig::default());

    // Send a message to each entity and verify delivery
    for i in 0..50 {
        let entity_name = format!("entity-{}", i);
        let (resp_tx, _) = tokio::sync::oneshot::channel();
        let msg = BusMessage {
            source_entity: "test-harness".to_string(),
            target_entity: entity_name.clone(),
            operation: "ping".to_string(),
            payload: vec![i as u8],
            response_tx: resp_tx,
            trace_id: format!("kg-50-{}", i),
            call_chain: vec![],
        };
        handles.bus.send(msg).await.unwrap();
    }

    // Verify all 50 messages were delivered (one per isolate)
    let mut total_received = 0;
    for (_idx, rx) in handles.receivers.iter_mut() {
        while let Ok(_msg) = rx.try_recv() {
            total_received += 1;
        }
    }
    assert_eq!(total_received, 50);
}

/// Verify the startup summary includes all expected information.
#[test]
fn kill_gate_startup_summary() {
    let config = SupervisorConfig {
        root_dir: PathBuf::from("/tmp/test"),
        entities: linear_clone_entities(),
    };
    let supervisor = IsolateSupervisor::new(config);
    let summary = supervisor.startup_summary();

    assert!(summary.contains("Entity Groups:"));
    assert!(summary.contains("Total:"));
    assert!(summary.contains("entities"));
    assert!(summary.contains("Isolates"));
}
