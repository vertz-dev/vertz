# Phase 2: Isolate Supervisor + Multi-Isolate Spawn

## Context

With entity grouping computed (Phase 1), the runtime needs to spawn and manage multiple V8 Isolates — one per entity group. This phase creates the `IsolateSupervisor` that owns the lifecycle of all Isolates, distributes them across worker threads, and provides a unified API for sending messages to specific entities.

Design doc: `plans/vertz-runtime.md` (Phase 2 Architecture Summary)

## Tasks

### Task 1: IsolateSupervisor core — spawn multiple Isolates

**Files:**
- `native/vtz/src/runtime/isolate_supervisor.rs` (new)
- `native/vtz/src/runtime/mod.rs` (modified — add `pub mod isolate_supervisor`)
- `native/vtz/src/runtime/persistent_isolate.rs` (modified — add `label` to options)

**What to implement:**

Extend `PersistentIsolateOptions` with an `IsolateLabel` and group info:

```rust
// In persistent_isolate.rs
pub struct PersistentIsolateOptions {
    // ... existing fields ...
    pub label: Option<IsolateLabel>,
    pub entity_names: Vec<String>,      // entities this Isolate handles
}
```

Create `IsolateSupervisor`:

```rust
pub struct IsolateSupervisor {
    isolates: Vec<Arc<PersistentIsolate>>,
    entity_to_isolate: HashMap<String, usize>,  // entity name → isolate index
    graph_result: EntityGraphResult,
}

pub struct SupervisorConfig {
    pub root_dir: PathBuf,
    pub entities: Vec<EntityNode>,
    pub shared_source_cache: Arc<SharedSourceCache>,
    pub v8_code_cache: Arc<V8CodeCache>,
    pub resolution_cache: Arc<SharedResolutionCache>,
    // ... other shared resources
}

impl IsolateSupervisor {
    pub fn new(config: SupervisorConfig) -> Result<Self>;
    pub fn isolate_for_entity(&self, entity_name: &str) -> Option<&Arc<PersistentIsolate>>;
    pub fn isolate_count(&self) -> usize;
    pub fn graph_result(&self) -> &EntityGraphResult;
    pub async fn shutdown(self);
}
```

The `new()` constructor:
1. Computes entity groups via `compute_groups()`
2. Spawns one `PersistentIsolate` per group
3. Passes shared caches to all Isolates
4. Builds `entity_to_isolate` lookup map
5. Logs the entity graph summary at startup

**Acceptance criteria:**
- [ ] `IsolateSupervisor::new()` spawns correct number of Isolates per entity graph
- [ ] `isolate_for_entity()` returns the correct Isolate for each entity
- [ ] Shared caches (source, V8 code, resolution) are shared across all Isolates
- [ ] Each Isolate has correct `IsolateLabel`
- [ ] `shutdown()` cleanly stops all Isolates without panics

---

### Task 2: Thread distribution — balance Isolates across CPU cores

**Files:**
- `native/vtz/src/runtime/isolate_supervisor.rs` (modified)
- `native/vtz/src/runtime/persistent_isolate.rs` (modified — configurable thread affinity)

**What to implement:**

Add thread pool awareness to `IsolateSupervisor`:

```rust
struct ThreadAssignment {
    thread_id: usize,
    isolate_indices: Vec<usize>,
}

impl IsolateSupervisor {
    fn compute_thread_assignments(
        num_isolates: usize,
        num_threads: usize,  // default: num_cpus::get()
    ) -> Vec<ThreadAssignment>;
}
```

The current `PersistentIsolate` spawns its own OS thread. For N:M scheduling, multiple Isolates should share a thread. Modify `PersistentIsolate::new()` to optionally accept a pre-existing thread handle or thread ID for pinning.

For this phase, the simplest correct approach: each Isolate still gets its own OS thread (1:1), but the supervisor round-robin assigns them to logical "thread slots" for future N:M migration. The thread slot assignment is logged.

**Acceptance criteria:**
- [ ] `compute_thread_assignments(6, 4)` distributes [2, 2, 1, 1] across threads
- [ ] `compute_thread_assignments(1, 4)` assigns single Isolate to thread 0
- [ ] Thread assignments logged at startup alongside entity graph summary
- [ ] Each Isolate's thread is labeled for structured logging

---

### Task 3: Integration test — multi-Isolate supervisor lifecycle

**Files:**
- `native/vtz/tests/isolate_supervisor.rs` (new)
- `native/vtz/tests/fixtures/multi-entity-app/` (new — minimal fixture)

**What to implement:**

Create a minimal fixture app with 2+ entity definitions. Test the full lifecycle:

```rust
#[tokio::test]
async fn supervisor_spawns_isolates_per_group() {
    let config = SupervisorConfig {
        root_dir: fixture_path("multi-entity-app"),
        entities: vec![
            EntityNode { name: "task".into(), refs: vec![ref_to("comment")], .. },
            EntityNode { name: "comment".into(), refs: vec![ref_to("task")], .. },
            EntityNode { name: "user".into(), refs: vec![], .. },
        ],
        // shared caches...
    };
    let supervisor = IsolateSupervisor::new(config).unwrap();
    // task + comment grouped, user separate = 2 Isolates
    assert_eq!(supervisor.isolate_count(), 2);
    assert!(supervisor.isolate_for_entity("task").is_some());
    assert!(supervisor.isolate_for_entity("user").is_some());
    // same Isolate for task and comment
    assert!(std::ptr::eq(
        supervisor.isolate_for_entity("task").unwrap().as_ref(),
        supervisor.isolate_for_entity("comment").unwrap().as_ref(),
    ));
    supervisor.shutdown().await;
}
```

**Acceptance criteria:**
- [ ] Supervisor spawns correct number of Isolates
- [ ] Grouped entities share the same Isolate reference
- [ ] Ungrouped entities get separate Isolates
- [ ] Shutdown completes without timeout or panic
- [ ] Shared caches are populated after Isolate initialization
