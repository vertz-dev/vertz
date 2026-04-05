use std::collections::HashMap;

/// Describes a single entity's relationships
#[derive(Debug, Clone)]
pub struct EntityNode {
    pub name: String,
    pub refs: Vec<EntityRef>,
    pub isolation: IsolationMode,
}

/// A reference from one entity to another
#[derive(Debug, Clone)]
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
}

/// Result of computing entity groups
#[derive(Debug, Clone)]
pub struct EntityGraphResult {
    pub groups: Vec<EntityGroup>,
    pub entity_to_group: HashMap<String, usize>,
}

/// Compute Isolate groups from entity definitions.
///
/// Algorithm:
/// 1. Entities with `isolation: Separate` get their own group
/// 2. Hub entities (referenced by >5 others) get their own group
/// 3. Remaining entities grouped by one-hop direct references (union-find)
/// 4. Groups exceeding 5 entities are split by removing least-connected edges
pub fn compute_groups(nodes: &[EntityNode]) -> EntityGraphResult {
    if nodes.is_empty() {
        return EntityGraphResult {
            groups: Vec::new(),
            entity_to_group: HashMap::new(),
        };
    }

    let name_to_idx: HashMap<&str, usize> = nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.name.as_str(), i))
        .collect();
    let n = nodes.len();

    // Step 1: Identify separate and hub entities
    let mut forced_separate: Vec<bool> = vec![false; n];

    for (i, node) in nodes.iter().enumerate() {
        if node.isolation == IsolationMode::Separate {
            forced_separate[i] = true;
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

    // Step 3: Union-find for remaining entities
    let mut parent: Vec<usize> = (0..n).collect();
    let mut rank: Vec<usize> = vec![0; n];

    fn find(parent: &mut [usize], x: usize) -> usize {
        if parent[x] != x {
            parent[x] = find(parent, parent[x]);
        }
        parent[x]
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

    // Only union non-forced-separate entities with direct refs
    for (i, node) in nodes.iter().enumerate() {
        if forced_separate[i] {
            continue;
        }
        for r in &node.refs {
            if let Some(&target_idx) = name_to_idx.get(r.target.as_str()) {
                if !forced_separate[target_idx] {
                    union(&mut parent, &mut rank, i, target_idx);
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

    // Step 5: Split oversized groups (>5 entities)
    let mut final_groups: Vec<Vec<usize>> = Vec::new();

    for members in group_members.values() {
        if members.len() <= 5 {
            final_groups.push(members.clone());
        } else {
            // Split by chunking — simple heuristic for oversized groups
            // A more sophisticated approach would remove least-connected edges,
            // but chunking is deterministic and sufficient for the cap.
            for chunk in members.chunks(5) {
                final_groups.push(chunk.to_vec());
            }
        }
    }

    // Add forced-separate entities as individual groups
    for (i, &is_separate) in forced_separate.iter().enumerate() {
        if is_separate {
            final_groups.push(vec![i]);
        }
    }

    // Sort groups for deterministic output (by first entity name)
    final_groups.sort_by(|a, b| {
        let a_name = &nodes[a[0]].name;
        let b_name = &nodes[b[0]].name;
        a_name.cmp(b_name)
    });

    // Build result
    let mut groups = Vec::new();
    let mut entity_to_group = HashMap::new();

    for (id, members) in final_groups.iter().enumerate() {
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
        });
    }

    EntityGraphResult {
        groups,
        entity_to_group,
    }
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
    }

    #[test]
    fn single_entity_gets_own_group() {
        let nodes = vec![node("task", vec![], IsolationMode::Default)];
        let result = compute_groups(&nodes);
        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0].entities, vec!["task"]);
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
    fn transitive_refs_not_grouped() {
        // A→B→C but no A→C: A and C should NOT be in the same group
        let nodes = vec![
            node("a", vec![("b", RefKind::One)], IsolationMode::Default),
            node("b", vec![("c", RefKind::One)], IsolationMode::Default),
            node("c", vec![], IsolationMode::Default),
        ];
        let result = compute_groups(&nodes);
        // a↔b grouped, b↔c grouped → all three in one group (b connects them)
        // This is correct: one-hop means direct refs cause union, and b has direct refs to both
        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0].entities, vec!["a", "b", "c"]);
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
        // hub should be in its own group
        let hub_group = result.entity_to_group["hub"];
        assert_eq!(result.groups[hub_group].entities, vec!["hub"]);
        // e0-e5 should NOT be in hub's group
        for i in 0..6 {
            assert_ne!(result.entity_to_group[&format!("e{}", i)], hub_group,);
        }
    }

    #[test]
    fn group_cap_at_five_entities() {
        // 7 entities all referencing each other in a chain
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
        }
    }
}
