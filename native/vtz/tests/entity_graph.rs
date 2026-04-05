use vertz_runtime::runtime::entity_graph::{
    compute_groups, EntityGraphWarning, EntityNode, EntityRef, IsolationMode, RefKind,
};
use vertz_runtime::runtime::isolate_label::format_entity_graph_summary;

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

/// Linear-clone fixture: task, comment, user, team, label
/// Relationships: task→comment (many), task→user (one), comment→task (one),
/// comment→user (one), team→user (many), task→label (many)
#[test]
fn linear_clone_entity_graph() {
    let nodes = vec![
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
    ];

    let result = compute_groups(&nodes);

    // All 5 entities are connected through direct refs (user connects team to the task cluster)
    // They should form one group (≤5 cap)
    assert_eq!(result.groups.len(), 1);
    assert_eq!(result.groups[0].entities.len(), 5);
    assert!(result.warnings.is_empty());

    // All entities in the same group
    let group_id = result.entity_to_group["task"];
    for name in &["comment", "user", "team", "label"] {
        assert_eq!(
            result.entity_to_group[*name], group_id,
            "{} should be in the same group as task",
            name
        );
    }
}

/// Linear-clone with analytics forced separate
#[test]
fn linear_clone_with_separate_analytics() {
    let nodes = vec![
        node(
            "task",
            vec![("comment", RefKind::Many), ("user", RefKind::One)],
            IsolationMode::Default,
        ),
        node(
            "comment",
            vec![("task", RefKind::One)],
            IsolationMode::Default,
        ),
        node("user", vec![], IsolationMode::Default),
        node(
            "analytics",
            vec![("task", RefKind::One)],
            IsolationMode::Separate,
        ),
    ];

    let result = compute_groups(&nodes);

    // analytics forced separate, remaining 3 in one group
    assert_eq!(result.groups.len(), 2);
    assert_ne!(
        result.entity_to_group["task"],
        result.entity_to_group["analytics"]
    );

    let analytics_group = result.entity_to_group["analytics"];
    assert!(result.groups[analytics_group].forced_separate);
}

/// Hub detection with 6+ inbound references
#[test]
fn hub_detection_with_six_inbound() {
    let mut nodes = vec![node("hub", vec![], IsolationMode::Default)];
    for i in 0..6 {
        nodes.push(node(
            &format!("e{}", i),
            vec![("hub", RefKind::One)],
            IsolationMode::Default,
        ));
    }

    let result = compute_groups(&nodes);

    // hub should be forced into its own group
    let hub_group = result.entity_to_group["hub"];
    assert_eq!(result.groups[hub_group].entities, vec!["hub"]);
    assert!(result.groups[hub_group].forced_separate);
}

/// Group cap splits correctly with BFS
#[test]
fn group_cap_splits_with_bfs() {
    // 8 entities in a connected chain
    let mut nodes = Vec::new();
    for i in 0..8 {
        let refs = if i < 7 {
            vec![(format!("e{}", i + 1), RefKind::One)]
        } else {
            vec![]
        };
        nodes.push(EntityNode {
            name: format!("e{}", i),
            refs: refs
                .into_iter()
                .map(|(target, kind)| EntityRef { target, kind })
                .collect(),
            isolation: IsolationMode::Default,
        });
    }

    let result = compute_groups(&nodes);

    // Should be split into groups of ≤5
    assert!(result.groups.len() >= 2);
    for group in &result.groups {
        assert!(
            group.entities.len() <= 5,
            "Group {} exceeds cap with {} entities",
            group.label,
            group.entities.len()
        );
    }
    let total: usize = result.groups.iter().map(|g| g.entities.len()).sum();
    assert_eq!(total, 8);
}

/// Empty entity list produces empty groups
#[test]
fn empty_entities() {
    let result = compute_groups(&[]);
    assert!(result.groups.is_empty());
    assert!(result.entity_to_group.is_empty());
    assert!(result.warnings.is_empty());
}

/// All separate entities produce N groups of 1
#[test]
fn all_separate() {
    let nodes = vec![
        node("a", vec![], IsolationMode::Separate),
        node("b", vec![], IsolationMode::Separate),
        node("c", vec![], IsolationMode::Separate),
    ];
    let result = compute_groups(&nodes);
    assert_eq!(result.groups.len(), 3);
    for group in &result.groups {
        assert_eq!(group.entities.len(), 1);
        assert!(group.forced_separate);
    }
}

/// Dangling ref produces a warning
#[test]
fn dangling_ref_warning() {
    let nodes = vec![node(
        "task",
        vec![("nonexistent", RefKind::One)],
        IsolationMode::Default,
    )];
    let result = compute_groups(&nodes);
    assert_eq!(result.warnings.len(), 1);
    assert_eq!(
        result.warnings[0],
        EntityGraphWarning::DanglingRef {
            source: "task".to_string(),
            target: "nonexistent".to_string(),
        }
    );
}

/// Full pipeline: compute groups + format summary
#[test]
fn full_pipeline_summary() {
    let nodes = vec![
        node(
            "task",
            vec![("comment", RefKind::Many)],
            IsolationMode::Default,
        ),
        node("comment", vec![], IsolationMode::Default),
        node("analytics", vec![], IsolationMode::Separate),
    ];

    let result = compute_groups(&nodes);
    let summary = format_entity_graph_summary(&result);

    assert!(summary.contains("Entity Groups:"));
    assert!(summary.contains("comment, task"));
    assert!(summary.contains("Separate: analytics"));
    assert!(summary.contains("Total: 3 entities in 2 Isolates"));
}
