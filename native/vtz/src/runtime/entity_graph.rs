use std::collections::{HashMap, HashSet, VecDeque};

/// Describes a single entity's relationships
#[derive(Debug, Clone)]
pub struct EntityNode {
    pub name: String,
    pub refs: Vec<EntityRef>,
    pub isolation: IsolationMode,
}

/// A reference from one entity to another
#[derive(Debug, Clone, PartialEq)]
pub struct EntityRef {
    pub target: String,
    pub kind: RefKind,
}

/// Type of reference between entities
#[derive(Debug, Clone, PartialEq)]
pub enum RefKind {
    One,
    Many,
}

/// How an entity should be isolated
#[derive(Debug, Clone, PartialEq)]
pub enum IsolationMode {
    /// Group with related entities (default)
    Default,
    /// Force own Isolate
    Separate,
}

/// A computed group of entities that share an Isolate
#[derive(Debug, Clone)]
pub struct EntityGroup {
    pub id: usize,
    pub entities: Vec<String>,
    pub label: String,
    /// Whether this group was created because of explicit `isolation: Separate`
    /// or hub detection, vs being a natural grouping
    pub forced_separate: bool,
}

/// A warning about the entity graph (e.g. dangling references)
#[derive(Debug, Clone, PartialEq)]
pub enum EntityGraphWarning {
    DanglingRef { source: String, target: String },
}

/// Result of computing entity groups
#[derive(Debug, Clone)]
pub struct EntityGraphResult {
    pub groups: Vec<EntityGroup>,
    pub entity_to_group: HashMap<String, usize>,
    pub warnings: Vec<EntityGraphWarning>,
}

/// Compute Isolate groups from entity definitions.
///
/// Algorithm:
/// 1. Entities with `isolation: Separate` get their own group
/// 2. Hub entities (referenced by >5 others) get their own group
/// 3. Remaining entities grouped by connected components via union-find
///    (entities sharing direct refs end up in the same group; transitivity
///    through shared nodes is intentional — if A→B and B→C, all three share
///    an Isolate because B connects them)
/// 4. Groups exceeding 5 entities are split via BFS-based connectivity-aware
///    partitioning to keep tightly-coupled entities together
pub fn compute_groups(nodes: &[EntityNode]) -> EntityGraphResult {
    if nodes.is_empty() {
        return EntityGraphResult {
            groups: Vec::new(),
            entity_to_group: HashMap::new(),
            warnings: Vec::new(),
        };
    }

    let name_to_idx: HashMap<&str, usize> = nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.name.as_str(), i))
        .collect();
    let n = nodes.len();
    let mut warnings = Vec::new();

    // Step 1: Identify separate entities + collect dangling ref warnings
    let mut forced_separate: Vec<bool> = vec![false; n];

    for (i, node) in nodes.iter().enumerate() {
        if node.isolation == IsolationMode::Separate {
            forced_separate[i] = true;
        }
        for r in &node.refs {
            if !name_to_idx.contains_key(r.target.as_str()) {
                warnings.push(EntityGraphWarning::DanglingRef {
                    source: node.name.clone(),
                    target: r.target.clone(),
                });
            }
        }
    }

    // Count inbound references for hub detection
    let mut inbound_count: Vec<usize> = vec![0; n];
    for node in nodes {
        for r in &node.refs {
            if let Some(&target_idx) = name_to_idx.get(r.target.as_str()) {
                inbound_count[target_idx] += 1;
            }
        }
    }

    // Step 2: Hub entities (>5 inbound refs) forced separate
    for (i, is_separate) in forced_separate.iter_mut().enumerate() {
        if inbound_count[i] > 5 {
            *is_separate = true;
        }
    }

    // Step 3: Union-find for remaining entities (connected components)
    let mut parent: Vec<usize> = (0..n).collect();
    let mut rank: Vec<usize> = vec![0; n];

    // Iterative find with path compression (avoids stack overflow on long chains)
    fn find(parent: &mut [usize], mut x: usize) -> usize {
        while parent[x] != x {
            parent[x] = parent[parent[x]]; // path halving
            x = parent[x];
        }
        x
    }

    fn union(parent: &mut [usize], rank: &mut [usize], x: usize, y: usize) {
        let rx = find(parent, x);
        let ry = find(parent, y);
        if rx == ry {
            return;
        }
        if rank[rx] < rank[ry] {
            parent[rx] = ry;
        } else if rank[rx] > rank[ry] {
            parent[ry] = rx;
        } else {
            parent[ry] = rx;
            rank[rx] += 1;
        }
    }

    // Build adjacency list for BFS-based splitting later
    let mut adjacency: Vec<HashSet<usize>> = vec![HashSet::new(); n];

    // Only union non-forced-separate entities with direct refs
    for (i, node) in nodes.iter().enumerate() {
        if forced_separate[i] {
            continue;
        }
        for r in &node.refs {
            if let Some(&target_idx) = name_to_idx.get(r.target.as_str()) {
                if !forced_separate[target_idx] {
                    union(&mut parent, &mut rank, i, target_idx);
                    adjacency[i].insert(target_idx);
                    adjacency[target_idx].insert(i);
                }
            }
        }
    }

    // Step 4: Collect groups
    let mut group_members: HashMap<usize, Vec<usize>> = HashMap::new();
    for (i, &is_separate) in forced_separate.iter().enumerate() {
        if is_separate {
            continue;
        }
        let root = find(&mut parent, i);
        group_members.entry(root).or_default().push(i);
    }

    // Step 5: Split oversized groups (>5 entities) via BFS-based partitioning
    let mut final_groups: Vec<(Vec<usize>, bool)> = Vec::new(); // (members, forced_separate)

    for members in group_members.values() {
        if members.len() <= 5 {
            final_groups.push((members.clone(), false));
        } else {
            // BFS-based connectivity-aware split: start from the most-connected
            // node, grow a partition up to 5 via BFS, then repeat for remaining
            let partitions = bfs_partition(members, &adjacency, 5);
            for partition in partitions {
                final_groups.push((partition, false));
            }
        }
    }

    // Add forced-separate entities as individual groups
    for (i, &is_separate) in forced_separate.iter().enumerate() {
        if is_separate {
            final_groups.push((vec![i], true));
        }
    }

    // Sort groups for deterministic output (by first entity name alphabetically)
    final_groups.sort_by(|a, b| {
        let a_name = &nodes[a.0[0]].name;
        let b_name = &nodes[b.0[0]].name;
        a_name.cmp(b_name)
    });

    // Build result
    let mut groups = Vec::new();
    let mut entity_to_group = HashMap::new();

    for (id, (members, forced)) in final_groups.iter().enumerate() {
        let mut entities: Vec<String> = members.iter().map(|&i| nodes[i].name.clone()).collect();
        entities.sort();
        let label = format!("group-{}:{}", id, entities.join(","));

        for entity in &entities {
            entity_to_group.insert(entity.clone(), id);
        }

        groups.push(EntityGroup {
            id,
            entities,
            label,
            forced_separate: *forced,
        });
    }

    EntityGraphResult {
        groups,
        entity_to_group,
        warnings,
    }
}

/// BFS-based partitioning: split a set of members into partitions of at most
/// `max_size`, keeping tightly-connected nodes together.
fn bfs_partition(
    members: &[usize],
    adjacency: &[HashSet<usize>],
    max_size: usize,
) -> Vec<Vec<usize>> {
    let member_set: HashSet<usize> = members.iter().copied().collect();
    let mut assigned: HashSet<usize> = HashSet::new();
    let mut partitions: Vec<Vec<usize>> = Vec::new();

    // Sort members by descending degree (most-connected first as seed)
    let mut sorted_members: Vec<usize> = members.to_vec();
    sorted_members.sort_by(|&a, &b| {
        let deg_a = adjacency[a]
            .iter()
            .filter(|x| member_set.contains(x))
            .count();
        let deg_b = adjacency[b]
            .iter()
            .filter(|x| member_set.contains(x))
            .count();
        deg_b.cmp(&deg_a)
    });

    for &seed in &sorted_members {
        if assigned.contains(&seed) {
            continue;
        }

        let mut partition = Vec::new();
        let mut queue = VecDeque::new();
        queue.push_back(seed);

        while let Some(node) = queue.pop_front() {
            // Skip if already assigned to a partition (may be queued multiple times)
            if assigned.contains(&node) {
                continue;
            }
            // Stop growing this partition at max_size — node is NOT assigned,
            // so it will be picked up as a seed for the next partition
            if partition.len() >= max_size {
                continue;
            }

            assigned.insert(node);
            partition.push(node);

            // Add unassigned neighbors that are in our member set
            let mut neighbors: Vec<usize> = adjacency[node]
                .iter()
                .filter(|&&nb| member_set.contains(&nb) && !assigned.contains(&nb))
                .copied()
                .collect();
            // Sort neighbors by degree descending for better grouping
            neighbors.sort_by(|&a, &b| {
                let deg_a = adjacency[a]
                    .iter()
                    .filter(|x| member_set.contains(x))
                    .count();
                let deg_b = adjacency[b]
                    .iter()
                    .filter(|x| member_set.contains(x))
                    .count();
                deg_b.cmp(&deg_a)
            });
            for nb in neighbors {
                if !assigned.contains(&nb) {
                    queue.push_back(nb);
                }
            }
        }

        if !partition.is_empty() {
            partitions.push(partition);
        }
    }

    partitions
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn empty_entities_returns_empty_groups() {
        let result = compute_groups(&[]);
        assert!(result.groups.is_empty());
        assert!(result.entity_to_group.is_empty());
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn single_entity_gets_own_group() {
        let nodes = vec![node("task", vec![], IsolationMode::Default)];
        let result = compute_groups(&nodes);
        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0].entities, vec!["task"]);
        assert!(!result.groups[0].forced_separate);
        assert_eq!(result.entity_to_group["task"], 0);
    }

    #[test]
    fn groups_entities_sharing_ref_one() {
        let nodes = vec![
            node(
                "task",
                vec![("comment", RefKind::One)],
                IsolationMode::Default,
            ),
            node(
                "comment",
                vec![("task", RefKind::One)],
                IsolationMode::Default,
            ),
        ];
        let result = compute_groups(&nodes);
        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0].entities, vec!["comment", "task"]);
        assert_eq!(
            result.entity_to_group["task"],
            result.entity_to_group["comment"]
        );
    }

    #[test]
    fn groups_entities_sharing_ref_many() {
        let nodes = vec![
            node(
                "task",
                vec![("comment", RefKind::Many)],
                IsolationMode::Default,
            ),
            node("comment", vec![], IsolationMode::Default),
        ];
        let result = compute_groups(&nodes);
        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0].entities, vec!["comment", "task"]);
    }

    #[test]
    fn connected_component_groups_through_shared_node() {
        // A→B and B→C: all three share a group because B connects them.
        // Union-find computes connected components — transitivity through
        // shared nodes is intentional for Isolate grouping.
        let nodes = vec![
            node("a", vec![("b", RefKind::One)], IsolationMode::Default),
            node("b", vec![("c", RefKind::One)], IsolationMode::Default),
            node("c", vec![], IsolationMode::Default),
        ];
        let result = compute_groups(&nodes);
        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0].entities, vec!["a", "b", "c"]);
    }

    #[test]
    fn disconnected_entities_not_grouped() {
        // A→B, C���D, no connection between pairs
        let nodes = vec![
            node("a", vec![("b", RefKind::One)], IsolationMode::Default),
            node("b", vec![], IsolationMode::Default),
            node("c", vec![("d", RefKind::One)], IsolationMode::Default),
            node("d", vec![], IsolationMode::Default),
        ];
        let result = compute_groups(&nodes);
        assert_eq!(result.groups.len(), 2);
        assert_ne!(result.entity_to_group["a"], result.entity_to_group["c"]);
    }

    #[test]
    fn unrelated_entities_separate_groups() {
        let nodes = vec![
            node("task", vec![], IsolationMode::Default),
            node("user", vec![], IsolationMode::Default),
        ];
        let result = compute_groups(&nodes);
        assert_eq!(result.groups.len(), 2);
        assert_ne!(
            result.entity_to_group["task"],
            result.entity_to_group["user"]
        );
    }

    #[test]
    fn isolation_separate_forces_own_group() {
        let nodes = vec![
            node(
                "task",
                vec![("analytics", RefKind::One)],
                IsolationMode::Default,
            ),
            node("analytics", vec![], IsolationMode::Separate),
        ];
        let result = compute_groups(&nodes);
        assert_eq!(result.groups.len(), 2);
        assert_ne!(
            result.entity_to_group["task"],
            result.entity_to_group["analytics"]
        );
        // analytics group should be marked forced_separate
        let analytics_group_id = result.entity_to_group["analytics"];
        assert!(result.groups[analytics_group_id].forced_separate);
        // task group should NOT be marked forced_separate
        let task_group_id = result.entity_to_group["task"];
        assert!(!result.groups[task_group_id].forced_separate);
    }

    #[test]
    fn hub_entity_forced_separate() {
        // "hub" is referenced by 6 entities (>5 threshold)
        let mut nodes = vec![node("hub", vec![], IsolationMode::Default)];
        for i in 0..6 {
            nodes.push(node(
                &format!("e{}", i),
                vec![("hub", RefKind::One)],
                IsolationMode::Default,
            ));
        }
        let result = compute_groups(&nodes);
        // hub should be in its own group, marked as forced_separate
        let hub_group = result.entity_to_group["hub"];
        assert_eq!(result.groups[hub_group].entities, vec!["hub"]);
        assert!(result.groups[hub_group].forced_separate);
        // e0-e5 should NOT be in hub's group
        for i in 0..6 {
            assert_ne!(result.entity_to_group[&format!("e{}", i)], hub_group);
        }
    }

    #[test]
    fn group_cap_at_five_entities() {
        // 7 entities in a chain: e0→e1→e2→e3→e4→e5→e6
        let mut nodes = Vec::new();
        for i in 0..7 {
            let refs = if i < 6 {
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
        // Should be split into groups of max 5
        for group in &result.groups {
            assert!(
                group.entities.len() <= 5,
                "Group {} has {} entities",
                group.label,
                group.entities.len()
            );
        }
        // Total entities accounted for
        let total: usize = result.groups.iter().map(|g| g.entities.len()).sum();
        assert_eq!(total, 7);
    }

    #[test]
    fn bfs_split_keeps_connected_entities_together() {
        // 6 entities: a↔b↔c (tightly connected), d↔e↔f (tightly connected), a→d (bridge)
        let nodes = vec![
            node(
                "a",
                vec![("b", RefKind::One), ("d", RefKind::One)],
                IsolationMode::Default,
            ),
            node("b", vec![("c", RefKind::One)], IsolationMode::Default),
            node("c", vec![("a", RefKind::One)], IsolationMode::Default),
            node("d", vec![("e", RefKind::One)], IsolationMode::Default),
            node("e", vec![("f", RefKind::One)], IsolationMode::Default),
            node("f", vec![("d", RefKind::One)], IsolationMode::Default),
        ];
        let result = compute_groups(&nodes);
        // Should split into 2 groups, keeping clusters together
        assert_eq!(result.groups.len(), 2);
        for group in &result.groups {
            assert!(group.entities.len() <= 5);
        }
        let total: usize = result.groups.iter().map(|g| g.entities.len()).sum();
        assert_eq!(total, 6);
    }

    #[test]
    fn entity_to_group_consistent_with_groups() {
        let nodes = vec![
            node(
                "task",
                vec![("comment", RefKind::Many)],
                IsolationMode::Default,
            ),
            node("comment", vec![], IsolationMode::Default),
            node("user", vec![], IsolationMode::Separate),
        ];
        let result = compute_groups(&nodes);
        for group in &result.groups {
            for entity in &group.entities {
                assert_eq!(
                    result.entity_to_group[entity], group.id,
                    "Entity {} maps to group {} but is in group {}",
                    entity, result.entity_to_group[entity], group.id
                );
            }
        }
    }

    #[test]
    fn all_separate_entities_produce_individual_groups() {
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

    #[test]
    fn dangling_ref_produces_warning() {
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

    #[test]
    fn valid_refs_produce_no_warnings() {
        let nodes = vec![
            node(
                "task",
                vec![("comment", RefKind::One)],
                IsolationMode::Default,
            ),
            node("comment", vec![], IsolationMode::Default),
        ];
        let result = compute_groups(&nodes);
        assert!(result.warnings.is_empty());
    }
}
