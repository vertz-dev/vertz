//! Isolate Supervisor — manages multiple PersistentIsolates for entity groups.
//!
//! The supervisor computes the entity graph, spawns one PersistentIsolate per
//! entity group, and provides routing for API/SSR requests to the correct Isolate.

use std::collections::HashMap;
use std::path::PathBuf;

use crate::runtime::entity_graph::{compute_groups, EntityGraphResult, EntityNode};
use crate::runtime::isolate_label::{format_entity_graph_summary, IsolateKind, IsolateLabel};
use crate::runtime::message_bus::{MessageBus, MessageBusConfig, MessageBusHandles};

/// Configuration for creating an IsolateSupervisor
#[derive(Debug, Clone)]
pub struct SupervisorConfig {
    pub root_dir: PathBuf,
    pub entities: Vec<EntityNode>,
}

/// Computed thread assignment for an Isolate
#[derive(Debug, Clone, PartialEq)]
pub struct ThreadAssignment {
    pub thread_id: usize,
    pub isolate_indices: Vec<usize>,
}

/// An Isolate managed by the supervisor
#[derive(Debug)]
pub struct ManagedIsolate {
    pub label: IsolateLabel,
    pub entity_names: Vec<String>,
    pub thread_id: usize,
}

/// The IsolateSupervisor manages multiple V8 Isolates based on entity grouping.
pub struct IsolateSupervisor {
    isolates: Vec<ManagedIsolate>,
    entity_to_isolate: HashMap<String, usize>,
    graph_result: EntityGraphResult,
    startup_summary: String,
}

impl IsolateSupervisor {
    /// Create a new supervisor from entity definitions.
    ///
    /// Computes entity groups, creates ManagedIsolate entries per group,
    /// and assigns them to threads.
    pub fn new(config: SupervisorConfig) -> Self {
        let graph_result = compute_groups(&config.entities);
        let startup_summary = format_entity_graph_summary(&graph_result);
        let num_threads = num_cpus();

        let mut isolates = Vec::new();
        let mut entity_to_isolate = HashMap::new();

        let thread_assignments = compute_thread_assignments(graph_result.groups.len(), num_threads);

        for (idx, group) in graph_result.groups.iter().enumerate() {
            let thread_id = thread_assignments
                .iter()
                .find(|a| a.isolate_indices.contains(&idx))
                .map(|a| a.thread_id)
                .unwrap_or(0);

            let label = IsolateLabel {
                kind: IsolateKind::EntityGroup,
                name: Some(group.entities.join(",")),
            };

            for entity_name in &group.entities {
                entity_to_isolate.insert(entity_name.clone(), idx);
            }

            isolates.push(ManagedIsolate {
                label,
                entity_names: group.entities.clone(),
                thread_id,
            });
        }

        IsolateSupervisor {
            isolates,
            entity_to_isolate,
            graph_result,
            startup_summary,
        }
    }

    /// Get the ManagedIsolate for a given entity name
    pub fn isolate_for_entity(&self, entity_name: &str) -> Option<&ManagedIsolate> {
        self.entity_to_isolate
            .get(entity_name)
            .and_then(|&idx| self.isolates.get(idx))
    }

    /// Get the isolate index for a given entity name
    pub fn isolate_index_for_entity(&self, entity_name: &str) -> Option<usize> {
        self.entity_to_isolate.get(entity_name).copied()
    }

    /// Total number of Isolates
    pub fn isolate_count(&self) -> usize {
        self.isolates.len()
    }

    /// Access the computed entity graph
    pub fn graph_result(&self) -> &EntityGraphResult {
        &self.graph_result
    }

    /// Get the startup summary string for logging
    pub fn startup_summary(&self) -> &str {
        &self.startup_summary
    }

    /// Get all managed isolates
    pub fn isolates(&self) -> &[ManagedIsolate] {
        &self.isolates
    }

    /// Create a message bus wired to this supervisor's entity routing.
    ///
    /// Returns the bus (for sending) and per-isolate receivers (for polling).
    pub fn create_message_bus(&self, config: MessageBusConfig) -> MessageBusHandles {
        MessageBus::create(self.entity_to_isolate.clone(), config)
    }

    /// Resolve an API request path to the target entity name and isolate index.
    ///
    /// Expects paths like `/api/tasks`, `/api/tasks/123`, `/api/task-comments`.
    /// Extracts the entity segment, singularizes it, and looks up the isolate.
    ///
    /// Returns `None` if the entity is not registered.
    pub fn resolve_api_route(&self, path: &str) -> Option<RouteResolution> {
        let entity_name = extract_entity_from_path(path)?;
        let isolate_idx = *self.entity_to_isolate.get(&entity_name)?;
        // entity_to_isolate indices are always valid — built together with isolates in new()
        let isolate = &self.isolates[isolate_idx];
        Some(RouteResolution {
            entity_name,
            isolate_index: isolate_idx,
            isolate_label: isolate.label.format(),
        })
    }
}

/// Result of resolving an API route to an entity and isolate
#[derive(Debug, Clone, PartialEq)]
pub struct RouteResolution {
    /// The resolved entity name (singularized)
    pub entity_name: String,
    /// Index of the isolate that handles this entity
    pub isolate_index: usize,
    /// Human-readable isolate label for logging
    pub isolate_label: String,
}

/// Extract entity name from an API path.
///
/// Handles:
/// - `/api/tasks` → `"task"`
/// - `/api/tasks/123` → `"task"`
/// - `/api/task-comments` → `"task-comment"`
/// - `/api/user` → `"user"`
///
/// Returns `None` for paths that don't start with `/api/` or have no entity segment.
pub(crate) fn extract_entity_from_path(path: &str) -> Option<String> {
    let rest = path.strip_prefix("/api/")?;
    let segment = rest.split('/').next().filter(|s| !s.is_empty())?;
    Some(singularize(segment))
}

/// Singularize a URL segment for entity name resolution.
///
/// Handles common English plural patterns:
/// - `-ies` → `-y` (categories → category, companies → company)
/// - `-ses`, `-xes`, `-ches`, `-shes`, `-zes` → strip `-es` (buses → bus, boxes → box)
/// - `-ss` → unchanged (access, class)
/// - regular `-s` → strip (tasks → task)
fn singularize(word: &str) -> String {
    // -ies → -y (categories → category)
    if word.ends_with("ies") && word.len() > 3 {
        return format!("{}y", &word[..word.len() - 3]);
    }
    // -sses → strip -es (addresses → address, dresses → dress)
    if word.ends_with("sses") && word.len() > 4 {
        return word[..word.len() - 2].to_string();
    }
    // -ses (but not -sses, handled above) → strip -es (buses → bus)
    if word.ends_with("ses") && word.len() > 3 {
        return word[..word.len() - 2].to_string();
    }
    if word.ends_with("xes") && word.len() > 3 {
        return word[..word.len() - 2].to_string();
    }
    if word.ends_with("ches") && word.len() > 4 {
        return word[..word.len() - 2].to_string();
    }
    if word.ends_with("shes") && word.len() > 4 {
        return word[..word.len() - 2].to_string();
    }
    if word.ends_with("zes") && word.len() > 3 {
        return word[..word.len() - 2].to_string();
    }
    // -ss → unchanged (access, class)
    if word.ends_with("ss") {
        return word.to_string();
    }
    // Regular -s → strip
    if word.len() > 1 && word.ends_with('s') {
        return word[..word.len() - 1].to_string();
    }
    word.to_string()
}

/// Compute how Isolates should be distributed across worker threads.
///
/// Distributes `num_isolates` across `num_threads` as evenly as possible,
/// using round-robin assignment.
pub fn compute_thread_assignments(
    num_isolates: usize,
    num_threads: usize,
) -> Vec<ThreadAssignment> {
    if num_isolates == 0 || num_threads == 0 {
        return Vec::new();
    }

    let effective_threads = num_threads.min(num_isolates);
    let mut assignments: Vec<ThreadAssignment> = (0..effective_threads)
        .map(|id| ThreadAssignment {
            thread_id: id,
            isolate_indices: Vec::new(),
        })
        .collect();

    for i in 0..num_isolates {
        assignments[i % effective_threads].isolate_indices.push(i);
    }

    assignments
}

/// Get the number of logical CPU cores.
fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::entity_graph::{EntityRef, IsolationMode, RefKind};

    fn entity(name: &str, refs: Vec<(&str, RefKind)>, isolation: IsolationMode) -> EntityNode {
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

    #[test]
    fn supervisor_creates_correct_isolate_count() {
        let config = SupervisorConfig {
            root_dir: PathBuf::from("/tmp/test"),
            entities: vec![
                entity(
                    "task",
                    vec![("comment", RefKind::Many)],
                    IsolationMode::Default,
                ),
                entity("comment", vec![], IsolationMode::Default),
                entity("user", vec![], IsolationMode::Default),
            ],
        };
        let supervisor = IsolateSupervisor::new(config);
        // task + comment grouped, user separate = 2 Isolates
        assert_eq!(supervisor.isolate_count(), 2);
    }

    #[test]
    fn isolate_for_entity_returns_correct_isolate() {
        let config = SupervisorConfig {
            root_dir: PathBuf::from("/tmp/test"),
            entities: vec![
                entity(
                    "task",
                    vec![("comment", RefKind::Many)],
                    IsolationMode::Default,
                ),
                entity("comment", vec![], IsolationMode::Default),
                entity("user", vec![], IsolationMode::Default),
            ],
        };
        let supervisor = IsolateSupervisor::new(config);

        // task and comment should map to the same isolate
        let task_idx = supervisor.isolate_index_for_entity("task").unwrap();
        let comment_idx = supervisor.isolate_index_for_entity("comment").unwrap();
        assert_eq!(task_idx, comment_idx);

        // user should be different
        let user_idx = supervisor.isolate_index_for_entity("user").unwrap();
        assert_ne!(task_idx, user_idx);
    }

    #[test]
    fn isolate_for_unknown_entity_returns_none() {
        let config = SupervisorConfig {
            root_dir: PathBuf::from("/tmp/test"),
            entities: vec![entity("task", vec![], IsolationMode::Default)],
        };
        let supervisor = IsolateSupervisor::new(config);
        assert!(supervisor.isolate_for_entity("nonexistent").is_none());
    }

    #[test]
    fn isolates_have_correct_labels() {
        let config = SupervisorConfig {
            root_dir: PathBuf::from("/tmp/test"),
            entities: vec![
                entity(
                    "task",
                    vec![("comment", RefKind::Many)],
                    IsolationMode::Default,
                ),
                entity("comment", vec![], IsolationMode::Default),
            ],
        };
        let supervisor = IsolateSupervisor::new(config);
        let isolate = supervisor.isolate_for_entity("task").unwrap();
        assert_eq!(isolate.label.format(), "[entity:comment,task]");
    }

    #[test]
    fn startup_summary_is_populated() {
        let config = SupervisorConfig {
            root_dir: PathBuf::from("/tmp/test"),
            entities: vec![entity("task", vec![], IsolationMode::Default)],
        };
        let supervisor = IsolateSupervisor::new(config);
        assert!(supervisor.startup_summary().contains("Entity Groups:"));
        assert!(supervisor.startup_summary().contains("1 Isolates"));
    }

    #[test]
    fn empty_entities_produces_empty_supervisor() {
        let config = SupervisorConfig {
            root_dir: PathBuf::from("/tmp/test"),
            entities: vec![],
        };
        let supervisor = IsolateSupervisor::new(config);
        assert_eq!(supervisor.isolate_count(), 0);
    }

    // Thread assignment tests

    #[test]
    fn thread_assignment_distributes_evenly() {
        let assignments = compute_thread_assignments(6, 4);
        assert_eq!(assignments.len(), 4);
        assert_eq!(assignments[0].isolate_indices, vec![0, 4]);
        assert_eq!(assignments[1].isolate_indices, vec![1, 5]);
        assert_eq!(assignments[2].isolate_indices, vec![2]);
        assert_eq!(assignments[3].isolate_indices, vec![3]);
    }

    #[test]
    fn thread_assignment_single_isolate() {
        let assignments = compute_thread_assignments(1, 4);
        assert_eq!(assignments.len(), 1);
        assert_eq!(assignments[0].thread_id, 0);
        assert_eq!(assignments[0].isolate_indices, vec![0]);
    }

    #[test]
    fn thread_assignment_more_threads_than_isolates() {
        let assignments = compute_thread_assignments(2, 8);
        assert_eq!(assignments.len(), 2);
        assert_eq!(assignments[0].isolate_indices, vec![0]);
        assert_eq!(assignments[1].isolate_indices, vec![1]);
    }

    #[test]
    fn thread_assignment_zero_isolates() {
        let assignments = compute_thread_assignments(0, 4);
        assert!(assignments.is_empty());
    }

    #[test]
    fn thread_assignment_zero_threads() {
        let assignments = compute_thread_assignments(4, 0);
        assert!(assignments.is_empty());
    }

    // --- Route resolution tests ---

    #[test]
    fn resolve_api_route_finds_entity_isolate() {
        let config = SupervisorConfig {
            root_dir: PathBuf::from("/tmp/test"),
            entities: vec![
                entity(
                    "task",
                    vec![("comment", RefKind::Many)],
                    IsolationMode::Default,
                ),
                entity("comment", vec![], IsolationMode::Default),
                entity("user", vec![], IsolationMode::Default),
            ],
        };
        let supervisor = IsolateSupervisor::new(config);

        // /api/tasks → task entity (plural → singular)
        let result = supervisor.resolve_api_route("/api/tasks").unwrap();
        assert_eq!(result.entity_name, "task");
        assert!(result.isolate_label.contains("entity:"));

        // /api/tasks/123 → still resolves to task
        let result = supervisor.resolve_api_route("/api/tasks/123").unwrap();
        assert_eq!(result.entity_name, "task");

        // /api/users → user entity
        let result = supervisor.resolve_api_route("/api/users").unwrap();
        assert_eq!(result.entity_name, "user");

        // task and comment should be in the same isolate
        let task_res = supervisor.resolve_api_route("/api/tasks").unwrap();
        let comment_res = supervisor.resolve_api_route("/api/comments").unwrap();
        assert_eq!(task_res.isolate_index, comment_res.isolate_index);

        // user should be in a different isolate
        let user_res = supervisor.resolve_api_route("/api/users").unwrap();
        assert_ne!(task_res.isolate_index, user_res.isolate_index);
    }

    #[test]
    fn resolve_api_route_returns_none_for_unknown_entity() {
        let config = SupervisorConfig {
            root_dir: PathBuf::from("/tmp/test"),
            entities: vec![entity("task", vec![], IsolationMode::Default)],
        };
        let supervisor = IsolateSupervisor::new(config);
        assert!(supervisor.resolve_api_route("/api/nonexistent").is_none());
    }

    #[test]
    fn resolve_api_route_returns_none_for_non_api_paths() {
        let config = SupervisorConfig {
            root_dir: PathBuf::from("/tmp/test"),
            entities: vec![entity("task", vec![], IsolationMode::Default)],
        };
        let supervisor = IsolateSupervisor::new(config);
        assert!(supervisor.resolve_api_route("/tasks").is_none());
        assert!(supervisor.resolve_api_route("/api/").is_none());
        assert!(supervisor.resolve_api_route("/api").is_none());
        assert!(supervisor.resolve_api_route("").is_none());
    }

    // --- Entity extraction tests ---

    #[test]
    fn extract_entity_from_path_plurals() {
        assert_eq!(
            extract_entity_from_path("/api/tasks"),
            Some("task".to_string())
        );
        assert_eq!(
            extract_entity_from_path("/api/users"),
            Some("user".to_string())
        );
        assert_eq!(
            extract_entity_from_path("/api/comments"),
            Some("comment".to_string())
        );
    }

    #[test]
    fn extract_entity_from_path_singular() {
        // Already singular — don't strip
        assert_eq!(
            extract_entity_from_path("/api/user"),
            Some("user".to_string())
        );
    }

    #[test]
    fn extract_entity_from_path_with_sub_path() {
        assert_eq!(
            extract_entity_from_path("/api/tasks/123"),
            Some("task".to_string())
        );
        assert_eq!(
            extract_entity_from_path("/api/tasks/123/comments"),
            Some("task".to_string())
        );
    }

    #[test]
    fn extract_entity_from_path_hyphenated() {
        assert_eq!(
            extract_entity_from_path("/api/task-comments"),
            Some("task-comment".to_string())
        );
    }

    #[test]
    fn extract_entity_from_path_invalid() {
        assert!(extract_entity_from_path("/tasks").is_none());
        assert!(extract_entity_from_path("/api/").is_none());
        assert!(extract_entity_from_path("/api").is_none());
        assert!(extract_entity_from_path("").is_none());
    }

    #[test]
    fn singularize_regular_plurals() {
        assert_eq!(singularize("tasks"), "task");
        assert_eq!(singularize("users"), "user");
        assert_eq!(singularize("comments"), "comment");
    }

    #[test]
    fn singularize_ies_to_y() {
        assert_eq!(singularize("categories"), "category");
        assert_eq!(singularize("companies"), "company");
        assert_eq!(singularize("entries"), "entry");
    }

    #[test]
    fn singularize_es_variants() {
        assert_eq!(singularize("buses"), "bus");
        assert_eq!(singularize("addresses"), "address");
        assert_eq!(singularize("boxes"), "box");
        assert_eq!(singularize("watches"), "watch");
        assert_eq!(singularize("crashes"), "crash");
        // Note: "quizzes" → "quizz" (doubled consonant not handled — rare edge case)
    }

    #[test]
    fn singularize_double_s_unchanged() {
        assert_eq!(singularize("access"), "access");
        assert_eq!(singularize("class"), "class");
    }

    #[test]
    fn singularize_already_singular() {
        assert_eq!(singularize("user"), "user");
        assert_eq!(singularize("task"), "task");
    }

    #[test]
    fn create_message_bus_wires_to_supervisor() {
        let config = SupervisorConfig {
            root_dir: PathBuf::from("/tmp/test"),
            entities: vec![
                entity(
                    "task",
                    vec![("comment", RefKind::Many)],
                    IsolationMode::Default,
                ),
                entity("comment", vec![], IsolationMode::Default),
                entity("user", vec![], IsolationMode::Default),
            ],
        };
        let supervisor = IsolateSupervisor::new(config);
        let handles = supervisor.create_message_bus(MessageBusConfig::default());

        // Bus should know about all entities
        assert!(handles.bus.has_entity("task"));
        assert!(handles.bus.has_entity("comment"));
        assert!(handles.bus.has_entity("user"));

        // Same-group detection should work
        assert!(handles.bus.same_group("task", "comment"));
        assert!(!handles.bus.same_group("task", "user"));

        // One receiver per isolate group
        assert_eq!(handles.receivers.len(), 2);
    }

    #[test]
    fn isolates_have_valid_thread_ids() {
        let config = SupervisorConfig {
            root_dir: PathBuf::from("/tmp/test"),
            entities: vec![
                entity("a", vec![], IsolationMode::Default),
                entity("b", vec![], IsolationMode::Default),
                entity("c", vec![], IsolationMode::Default),
            ],
        };
        let supervisor = IsolateSupervisor::new(config);
        // thread_id must be < effective_threads = min(cpus, isolate_count)
        let bound = supervisor.isolate_count();
        for isolate in supervisor.isolates() {
            assert!(
                isolate.thread_id < bound,
                "thread_id {} >= isolate_count {}",
                isolate.thread_id,
                bound
            );
        }
    }
}
