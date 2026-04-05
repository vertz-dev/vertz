//! Isolate Supervisor — manages multiple PersistentIsolates for entity groups.
//!
//! The supervisor computes the entity graph, spawns one PersistentIsolate per
//! entity group, and provides routing for API/SSR requests to the correct Isolate.

use std::collections::HashMap;
use std::path::PathBuf;

use crate::runtime::entity_graph::{compute_groups, EntityGraphResult, EntityNode};
use crate::runtime::isolate_label::{format_entity_graph_summary, IsolateKind, IsolateLabel};

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

    #[test]
    fn isolates_have_thread_ids() {
        let config = SupervisorConfig {
            root_dir: PathBuf::from("/tmp/test"),
            entities: vec![
                entity("a", vec![], IsolationMode::Default),
                entity("b", vec![], IsolationMode::Default),
                entity("c", vec![], IsolationMode::Default),
            ],
        };
        let supervisor = IsolateSupervisor::new(config);
        // Each isolate should have a thread_id assigned
        for isolate in supervisor.isolates() {
            assert!(isolate.thread_id < num_cpus());
        }
    }
}
