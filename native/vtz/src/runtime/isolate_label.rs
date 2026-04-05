use crate::runtime::entity_graph::EntityGraphResult;

/// The kind of Isolate for labeling purposes
#[derive(Debug, Clone, PartialEq)]
pub enum IsolateKind {
    EntityGroup,
    Queue,
    Durable,
    Ssr,
    Schedule,
}

/// A label for identifying an Isolate in logs and diagnostics
#[derive(Debug, Clone)]
pub struct IsolateLabel {
    pub kind: IsolateKind,
    /// Name for the Isolate. None for singleton Isolates like SSR.
    pub name: Option<String>,
}

impl IsolateLabel {
    /// Format the label as a bracket-prefix: `[entity:task,comment]` or `[ssr]`
    pub fn format(&self) -> String {
        let prefix = match self.kind {
            IsolateKind::EntityGroup => "entity",
            IsolateKind::Queue => "queue",
            IsolateKind::Durable => "durable",
            IsolateKind::Ssr => "ssr",
            IsolateKind::Schedule => "schedule",
        };
        match &self.name {
            Some(name) => format!("[{}:{}]", prefix, name),
            None => format!("[{}]", prefix),
        }
    }

    /// Format a log message with the label prefix
    pub fn format_log(&self, msg: &str) -> String {
        format!("{} {}", self.format(), msg)
    }
}

/// Format a startup summary of the entity graph
pub fn format_entity_graph_summary(result: &EntityGraphResult) -> String {
    let mut lines = vec!["Entity Groups:".to_string()];
    let mut separate_entities: Vec<&str> = Vec::new();
    let mut grouped_count = 0;

    for group in &result.groups {
        if group.forced_separate {
            separate_entities.push(&group.entities[0]);
        } else if group.entities.len() == 1 {
            // Single-entity group that wasn't forced separate — just no refs
            let entity_list = &group.entities[0];
            lines.push(format!("  Group {}: {} (1 entity)", group.id, entity_list));
            grouped_count += 1;
        } else {
            let entity_list = group.entities.join(", ");
            lines.push(format!(
                "  Group {}: {} ({} entities)",
                group.id,
                entity_list,
                group.entities.len()
            ));
            grouped_count += group.entities.len();
        }
    }

    if !separate_entities.is_empty() {
        separate_entities.sort();
        lines.push(format!("  Separate: {}", separate_entities.join(", ")));
    }

    let total_entities = grouped_count + separate_entities.len();
    let total_isolates = result.groups.len();
    lines.push(format!(
        "Total: {} entities in {} Isolates",
        total_entities, total_isolates
    ));

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::entity_graph::{EntityGraphResult, EntityGroup};
    use std::collections::HashMap;

    #[test]
    fn entity_group_label_format() {
        let label = IsolateLabel {
            kind: IsolateKind::EntityGroup,
            name: Some("task,comment".to_string()),
        };
        assert_eq!(label.format(), "[entity:task,comment]");
    }

    #[test]
    fn queue_label_format() {
        let label = IsolateLabel {
            kind: IsolateKind::Queue,
            name: Some("notifications".to_string()),
        };
        assert_eq!(label.format(), "[queue:notifications]");
    }

    #[test]
    fn durable_label_format() {
        let label = IsolateLabel {
            kind: IsolateKind::Durable,
            name: Some("counter".to_string()),
        };
        assert_eq!(label.format(), "[durable:counter]");
    }

    #[test]
    fn ssr_label_format_no_name() {
        let label = IsolateLabel {
            kind: IsolateKind::Ssr,
            name: None,
        };
        assert_eq!(label.format(), "[ssr]");
    }

    #[test]
    fn schedule_label_format() {
        let label = IsolateLabel {
            kind: IsolateKind::Schedule,
            name: Some("daily-cleanup".to_string()),
        };
        assert_eq!(label.format(), "[schedule:daily-cleanup]");
    }

    #[test]
    fn format_log_prefixes_message() {
        let label = IsolateLabel {
            kind: IsolateKind::EntityGroup,
            name: Some("task".to_string()),
        };
        assert_eq!(
            label.format_log("Handling list request"),
            "[entity:task] Handling list request"
        );
    }

    #[test]
    fn format_log_without_name() {
        let label = IsolateLabel {
            kind: IsolateKind::Ssr,
            name: None,
        };
        assert_eq!(label.format_log("Rendering page"), "[ssr] Rendering page");
    }

    #[test]
    fn format_summary_with_groups_and_separate() {
        let result = EntityGraphResult {
            groups: vec![
                EntityGroup {
                    id: 0,
                    entities: vec!["comment".to_string(), "task".to_string()],
                    label: "group-0:comment,task".to_string(),
                    forced_separate: false,
                },
                EntityGroup {
                    id: 1,
                    entities: vec!["team".to_string(), "user".to_string()],
                    label: "group-1:team,user".to_string(),
                    forced_separate: false,
                },
                EntityGroup {
                    id: 2,
                    entities: vec!["analytics".to_string()],
                    label: "group-2:analytics".to_string(),
                    forced_separate: true,
                },
            ],
            entity_to_group: HashMap::from([
                ("task".to_string(), 0),
                ("comment".to_string(), 0),
                ("user".to_string(), 1),
                ("team".to_string(), 1),
                ("analytics".to_string(), 2),
            ]),
            warnings: Vec::new(),
        };
        let summary = format_entity_graph_summary(&result);
        assert!(summary.contains("Entity Groups:"));
        assert!(summary.contains("Group 0: comment, task (2 entities)"));
        assert!(summary.contains("Group 1: team, user (2 entities)"));
        assert!(summary.contains("Separate: analytics"));
        assert!(summary.contains("Total: 5 entities in 3 Isolates"));
    }

    #[test]
    fn format_summary_single_entity_default_not_listed_as_separate() {
        // A single-entity group with Default isolation should show as a group, not "Separate:"
        let result = EntityGraphResult {
            groups: vec![
                EntityGroup {
                    id: 0,
                    entities: vec!["settings".to_string()],
                    label: "group-0:settings".to_string(),
                    forced_separate: false,
                },
                EntityGroup {
                    id: 1,
                    entities: vec!["analytics".to_string()],
                    label: "group-1:analytics".to_string(),
                    forced_separate: true,
                },
            ],
            entity_to_group: HashMap::from([
                ("settings".to_string(), 0),
                ("analytics".to_string(), 1),
            ]),
            warnings: Vec::new(),
        };
        let summary = format_entity_graph_summary(&result);
        assert!(summary.contains("Group 0: settings (1 entity)"));
        assert!(summary.contains("Separate: analytics"));
        assert!(!summary.contains("Separate: analytics, settings"));
    }

    #[test]
    fn format_summary_all_separate() {
        let result = EntityGraphResult {
            groups: vec![
                EntityGroup {
                    id: 0,
                    entities: vec!["a".to_string()],
                    label: "group-0:a".to_string(),
                    forced_separate: true,
                },
                EntityGroup {
                    id: 1,
                    entities: vec!["b".to_string()],
                    label: "group-1:b".to_string(),
                    forced_separate: true,
                },
            ],
            entity_to_group: HashMap::from([("a".to_string(), 0), ("b".to_string(), 1)]),
            warnings: Vec::new(),
        };
        let summary = format_entity_graph_summary(&result);
        assert!(summary.contains("Separate: a, b"));
        assert!(summary.contains("Total: 2 entities in 2 Isolates"));
    }

    #[test]
    fn format_summary_empty() {
        let result = EntityGraphResult {
            groups: Vec::new(),
            entity_to_group: HashMap::new(),
            warnings: Vec::new(),
        };
        let summary = format_entity_graph_summary(&result);
        assert!(summary.contains("Total: 0 entities in 0 Isolates"));
    }
}
