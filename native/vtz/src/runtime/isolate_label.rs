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
    pub name: String,
}

impl IsolateLabel {
    /// Format the label as a bracket-prefix: `[entity:task,comment]`
    pub fn format(&self) -> String {
        let prefix = match self.kind {
            IsolateKind::EntityGroup => "entity",
            IsolateKind::Queue => "queue",
            IsolateKind::Durable => "durable",
            IsolateKind::Ssr => "ssr",
            IsolateKind::Schedule => "schedule",
        };
        format!("[{}:{}]", prefix, self.name)
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
        if group.entities.len() == 1 {
            // Check if any entity in this single-entity group was forced separate
            // For now, we list single-entity groups under "Separate:" for clarity
            separate_entities.push(&group.entities[0]);
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
            name: "task,comment".to_string(),
        };
        assert_eq!(label.format(), "[entity:task,comment]");
    }

    #[test]
    fn queue_label_format() {
        let label = IsolateLabel {
            kind: IsolateKind::Queue,
            name: "notifications".to_string(),
        };
        assert_eq!(label.format(), "[queue:notifications]");
    }

    #[test]
    fn durable_label_format() {
        let label = IsolateLabel {
            kind: IsolateKind::Durable,
            name: "counter".to_string(),
        };
        assert_eq!(label.format(), "[durable:counter]");
    }

    #[test]
    fn ssr_label_format() {
        let label = IsolateLabel {
            kind: IsolateKind::Ssr,
            name: "main".to_string(),
        };
        assert_eq!(label.format(), "[ssr:main]");
    }

    #[test]
    fn schedule_label_format() {
        let label = IsolateLabel {
            kind: IsolateKind::Schedule,
            name: "daily-cleanup".to_string(),
        };
        assert_eq!(label.format(), "[schedule:daily-cleanup]");
    }

    #[test]
    fn format_log_prefixes_message() {
        let label = IsolateLabel {
            kind: IsolateKind::EntityGroup,
            name: "task".to_string(),
        };
        assert_eq!(
            label.format_log("Handling list request"),
            "[entity:task] Handling list request"
        );
    }

    #[test]
    fn format_summary_with_groups_and_separate() {
        let result = EntityGraphResult {
            groups: vec![
                EntityGroup {
                    id: 0,
                    entities: vec!["comment".to_string(), "task".to_string()],
                    label: "group-0:comment,task".to_string(),
                },
                EntityGroup {
                    id: 1,
                    entities: vec!["team".to_string(), "user".to_string()],
                    label: "group-1:team,user".to_string(),
                },
                EntityGroup {
                    id: 2,
                    entities: vec!["analytics".to_string()],
                    label: "group-2:analytics".to_string(),
                },
            ],
            entity_to_group: HashMap::from([
                ("task".to_string(), 0),
                ("comment".to_string(), 0),
                ("user".to_string(), 1),
                ("team".to_string(), 1),
                ("analytics".to_string(), 2),
            ]),
        };
        let summary = format_entity_graph_summary(&result);
        assert!(summary.contains("Entity Groups:"));
        assert!(summary.contains("Group 0: comment, task (2 entities)"));
        assert!(summary.contains("Group 1: team, user (2 entities)"));
        assert!(summary.contains("Separate: analytics"));
        assert!(summary.contains("Total: 5 entities in 3 Isolates"));
    }

    #[test]
    fn format_summary_all_separate() {
        let result = EntityGraphResult {
            groups: vec![
                EntityGroup {
                    id: 0,
                    entities: vec!["a".to_string()],
                    label: "group-0:a".to_string(),
                },
                EntityGroup {
                    id: 1,
                    entities: vec!["b".to_string()],
                    label: "group-1:b".to_string(),
                },
            ],
            entity_to_group: HashMap::from([("a".to_string(), 0), ("b".to_string(), 1)]),
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
        };
        let summary = format_entity_graph_summary(&result);
        assert!(summary.contains("Total: 0 entities in 0 Isolates"));
    }
}
