# Phase 1: Entity Graph Analysis + Grouping Algorithm

## Context

Phase 2a of the Vertz runtime adds multi-isolate entity workers. Before spawning separate Isolates, the runtime must analyze the entity graph to determine which entities share direct references and should be grouped into the same Isolate. This phase implements the entity graph data structures and grouping algorithm — the foundation for all subsequent multi-isolate work.

Design doc: `plans/vertz-runtime.md` (Phase 2 section)

## Tasks

### Task 1: Entity graph data structures + grouping algorithm

**Files:**
- `native/vtz/src/runtime/entity_graph.rs` (new)
- `native/vtz/src/runtime/mod.rs` (modified — add `pub mod entity_graph`)

**What to implement:**

Core data types for describing the entity graph and computing Isolate groups:

```rust
/// Describes a single entity's relationships
pub struct EntityNode {
    pub name: String,
    pub refs: Vec<EntityRef>,          // ref.one / ref.many targets
    pub isolation: IsolationMode,       // default or separate
}

pub struct EntityRef {
    pub target: String,                 // target entity name
    pub kind: RefKind,                  // One or Many
}

pub enum RefKind { One, Many }

pub enum IsolationMode {
    Default,                            // group with related entities
    Separate,                           // force own Isolate
}

/// Computed grouping result
pub struct EntityGroup {
    pub id: usize,
    pub entities: Vec<String>,
    pub label: String,                  // e.g. "group-0:task,comment,attachment"
}

pub struct EntityGraphResult {
    pub groups: Vec<EntityGroup>,
    pub entity_to_group: HashMap<String, usize>,
}
```

Implement `compute_groups(nodes: &[EntityNode]) -> EntityGraphResult`:
1. Filter out entities with `isolation: Separate` — each gets its own group
2. Build adjacency graph from `ref.one()`/`ref.many()` relationships (one-hop only, undirected)
3. Detect hub entities (referenced by >5 others) — force them into their own group
4. Merge connected entities into groups via union-find
5. If any group exceeds 5 entities, split by removing the least-connected edge and re-grouping

**Acceptance criteria:**
- [ ] `compute_groups` with no entities returns empty groups
- [ ] `compute_groups` groups entities sharing a direct `ref.one()` reference
- [ ] `compute_groups` groups entities sharing a `ref.many()` reference
- [ ] Transitive references (A→B→C, no A→C) result in separate groups for A and C
- [ ] `isolation: Separate` entities always get their own group, even with refs
- [ ] Hub entities (>5 references) are forced separate, remaining entities re-group
- [ ] Groups capped at 5 entities; oversized groups split correctly
- [ ] `entity_to_group` map is consistent with `groups`

---

### Task 2: Structured Isolate log labels

**Files:**
- `native/vtz/src/runtime/isolate_label.rs` (new)
- `native/vtz/src/runtime/mod.rs` (modified — add `pub mod isolate_label`)

**What to implement:**

Log label formatting for multi-isolate structured logging:

```rust
pub struct IsolateLabel {
    pub kind: IsolateKind,
    pub name: String,
}

pub enum IsolateKind {
    EntityGroup,   // [entity:task,comment]
    Queue,         // [queue:notifications]
    Durable,       // [durable:counter]
    Ssr,           // [ssr]
    Schedule,      // [schedule:daily-cleanup]
}

impl IsolateLabel {
    pub fn format(&self) -> String;         // e.g. "[entity:task,comment]"
    pub fn format_log(&self, msg: &str) -> String; // e.g. "[entity:task] Handling list request"
}
```

Also implement a startup summary formatter:

```rust
pub fn format_entity_graph_summary(result: &EntityGraphResult) -> String;
// Outputs:
// Entity Groups:
//   Group 0: task, comment, attachment (3 entities)
//   Group 1: user, team (2 entities)
//   Separate: analytics-events
// Total: 6 entities in 3 Isolates
```

**Acceptance criteria:**
- [ ] `IsolateLabel::format()` produces correct bracket format for each `IsolateKind`
- [ ] `format_entity_graph_summary` shows all groups with entity names and counts
- [ ] Separate entities listed under "Separate:" heading
- [ ] Total line shows correct entity count and Isolate count

---

### Task 3: Integration test — entity graph computation from fixture

**Files:**
- `native/vtz/tests/entity_graph.rs` (new)

**What to implement:**

Integration tests that validate the full pipeline:
1. Create a set of `EntityNode` definitions representing a realistic app (like the linear-clone with task, comment, user, team, etc.)
2. Run `compute_groups()` and verify grouping is correct
3. Verify `format_entity_graph_summary()` produces readable output

```rust
#[test]
fn linear_clone_entity_graph() {
    let nodes = vec![
        EntityNode { name: "task".into(), refs: vec![
            EntityRef { target: "comment".into(), kind: RefKind::Many },
            EntityRef { target: "user".into(), kind: RefKind::One },
        ], isolation: IsolationMode::Default },
        EntityNode { name: "comment".into(), refs: vec![
            EntityRef { target: "task".into(), kind: RefKind::One },
            EntityRef { target: "user".into(), kind: RefKind::One },
        ], isolation: IsolationMode::Default },
        EntityNode { name: "user".into(), refs: vec![], isolation: IsolationMode::Default },
        EntityNode { name: "team".into(), refs: vec![
            EntityRef { target: "user".into(), kind: RefKind::Many },
        ], isolation: IsolationMode::Default },
    ];
    let result = compute_groups(&nodes);
    // task + comment grouped (direct ref)
    // user is hub (referenced by task, comment, team) — if >5 would be separate
    // team + user grouped (direct ref)
    assert_eq!(result.groups.len(), ...);
}
```

**Acceptance criteria:**
- [ ] Linear-clone fixture produces expected grouping
- [ ] Hub detection works with 6+ inbound references
- [ ] Group cap of 5 splits correctly
- [ ] Empty entity list produces empty groups
- [ ] All-separate entities produce N groups of 1
