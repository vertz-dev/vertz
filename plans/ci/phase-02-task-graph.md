# Phase 2: Task Graph + Parallelism + Conditional Skip

## Context

Phase 1 delivered basic sequential execution of individual tasks. This phase adds the core scheduling engine: DAG construction with topological dependencies, parallel work-stealing execution, dependency edge types (bare string, shortcuts, callbacks), conditional skip propagation, output buffering, and signal handling. By the end, `vtz ci ci` runs a full workflow with parallel task execution and correct dependency ordering.

Design doc: `plans/pipe-ci-runner.md`

Depends on: Phase 1 (config loading, workspace resolution, types)

## Tasks

### Task 1: DAG construction + cycle detection

**Files:**
- `native/vtz/src/ci/graph.rs` (new)
- `native/vtz/src/ci/graph_tests.rs` (new — or inline `#[cfg(test)]` module)

**What to implement:**

Build a directed acyclic graph of `(package, task)` execution nodes from a workflow config.

**Node types:**
```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TaskNode {
    pub task_name: String,
    pub package: Option<String>,  // None for root-scoped tasks
}

pub struct TaskGraph {
    pub nodes: Vec<TaskNode>,
    pub edges: Vec<(usize, usize, EdgeType)>,  // (from, to, type)
    pub adjacency: Vec<Vec<(usize, EdgeType)>>, // from → [(to, type)]
    pub reverse_adj: Vec<Vec<(usize, EdgeType)>>, // to → [(from, type)]
}

pub enum EdgeType {
    /// Bare string dep: skip=continue, fail=block
    Default,
    /// on: 'success' — only run if upstream ran AND succeeded
    Success,
    /// on: 'always' — run regardless
    Always,
    /// on: 'failure' — only run if upstream ran AND failed
    Failure,
    /// on: callback — evaluated via Bun bridge
    Callback(u64),
}
```

**Graph construction from workflow:**
1. Take `WorkflowConfig.run` (list of task names) and `ResolvedWorkspace`
2. For each task name in `run`:
   - If `scope: 'root'` → create one `TaskNode { task_name, package: None }`
   - If `scope: 'package'` → create one node per package (filtered by workflow filter)
3. Resolve `deps`:
   - `'^build'` → for each package P, add edges from P's node to `build` nodes in P's dependency packages
   - `'build'` → for each package P, add edge from P's node to `build` node in the same package
   - `DepEdge { task, on }` → same resolution but with the specified `EdgeType`
4. Validate:
   - All dep task names exist in the config's task definitions
   - Root-scoped tasks don't have `^` prefix deps (error with clear message)
   - No cycles (see below)

**Cycle detection:**
- Kahn's algorithm (topological sort) — if the sort doesn't include all nodes, there's a cycle
- When cycle detected: use DFS to find the actual cycle path and report it:
  ```
  error: circular dependency detected
    build (@vertz/ui) → build (@vertz/ui-server) → build (@vertz/ui)
  ```

**Topological order:**
- `fn topological_order(&self) -> Result<Vec<usize>>` — returns node indices in valid execution order
- Used by the scheduler to determine what's ready to run

**Acceptance criteria:**
- [ ] Builds graph from workflow + workspace with correct node count
- [ ] `^task` deps create edges to dependency packages (topological)
- [ ] `task` deps create edges within same package
- [ ] `DepEdge` deps create edges with correct `EdgeType`
- [ ] Root-scoped tasks with `^` deps produce clear error
- [ ] Dep referencing non-existent task name produces error listing available tasks
- [ ] Cycle detection finds and reports the cycle path
- [ ] Topological order is valid (all deps before dependents)
- [ ] Unit tests: simple graph, diamond deps, cycle, mixed scopes
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 2: Conditional skip propagation

**Files:**
- `native/vtz/src/ci/graph.rs` (modified — add skip propagation logic)

**What to implement:**

When a task's `cond` evaluates to `false`, the task is skipped. The skip must propagate to dependents based on the edge type.

**Skip propagation rules (per edge type):**

| EdgeType | Upstream skipped | Upstream failed | Upstream succeeded |
|----------|-----------------|-----------------|-------------------|
| `Default` | **Continue** (downstream runs) | **Block** (downstream skipped) | **Run** |
| `Success` | **Block** (downstream skipped) | **Block** | **Run** |
| `Always` | **Continue** | **Continue** | **Run** |
| `Failure` | **Block** | **Continue** (downstream runs) | **Block** |
| `Callback(id)` | **Callback decides** | **Callback decides** | **Callback decides** |

Add to `TaskGraph`:
```rust
pub fn should_run_dependent(
    &self,
    dep_node: usize,
    dep_result: &TaskResult,
    edge_type: &EdgeType,
) -> DepDecision;

pub enum DepDecision {
    Run,
    Skip,
    EvalCallback(u64),  // needs callback eval via Bun bridge
}
```

A dependent runs only if ALL its incoming edges say "Run" (or callback returns true). If ANY edge says "Skip", the dependent is skipped.

**Acceptance criteria:**
- [ ] Default edge: upstream skipped → dependent runs
- [ ] Default edge: upstream failed → dependent skipped
- [ ] Success edge: upstream skipped → dependent skipped
- [ ] Always edge: upstream skipped → dependent runs
- [ ] Always edge: upstream failed → dependent runs
- [ ] Failure edge: upstream failed → dependent runs
- [ ] Failure edge: upstream succeeded → dependent skipped
- [ ] Callback edge: returns `EvalCallback(id)` for Bun bridge
- [ ] Multiple deps: ALL must allow for dependent to run
- [ ] Unit tests for each edge type × each upstream status
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 3: Parallel work-stealing scheduler

**Files:**
- `native/vtz/src/ci/scheduler.rs` (new)

**What to implement:**

A concurrent scheduler that executes tasks in parallel, respecting dependencies and concurrency limits.

```rust
pub struct Scheduler {
    graph: TaskGraph,
    concurrency: usize,
    config: BTreeMap<String, TaskDef>,
    workspace: ResolvedWorkspace,
}

pub struct SchedulerResult {
    pub results: BTreeMap<TaskNode, TaskResult>,
    pub total_duration: Duration,
    pub cached_count: usize,
    pub executed_count: usize,
    pub skipped_count: usize,
    pub failed_count: usize,
}

impl Scheduler {
    pub async fn execute(
        &self,
        config_bridge: &mut ConfigBridge,  // for callback eval
        secrets: &[String],               // for output redaction
    ) -> Result<SchedulerResult>;
}
```

**Algorithm:**
1. Compute in-degree for each node
2. Initialize ready queue with all nodes that have in-degree 0
3. Spawn up to `concurrency` worker tasks (tokio tasks)
4. Each worker:
   a. Pull a node from the ready queue (use `tokio::sync::mpsc` channel)
   b. Check if the node's `cond` should skip it → if so, mark as skipped
   c. Check all incoming edges using `should_run_dependent()` → if any says Skip, mark as skipped
   d. If callback needed: send eval request via `config_bridge`, await response
   e. Otherwise: execute the command via `tokio::process::Command` with `sh -c`
   f. Record `TaskResult`
   g. For each dependent node: decrement in-degree. If in-degree reaches 0, push to ready queue.
5. Repeat until all nodes processed

**Command execution:**
- Use `tokio::process::Command::new("sh").args(["-c", &command])`
- Set working directory: package path for package-scoped, root_dir for root-scoped
- Set env vars from task config + workflow config
- Capture stdout and stderr (buffered per task)
- Apply timeout if configured (via `tokio::time::timeout`)
- For `steps: [...]`: run commands sequentially, stop on first failure

**Secret redaction in output:**
- Before storing stdout/stderr, scan for exact matches of secret values and replace with `[REDACTED]`

**Acceptance criteria:**
- [ ] Tasks with no deps start immediately
- [ ] Tasks wait for all deps to complete before starting
- [ ] Respects concurrency limit (at most N tasks running simultaneously)
- [ ] Failed task blocks dependents (default edge type)
- [ ] Skipped task allows dependents to continue (default edge type)
- [ ] Callback dep edges evaluated via config bridge
- [ ] Steps tasks stop on first failure
- [ ] Task timeout kills the process and marks as failed
- [ ] Env vars from task and workflow config are passed to commands
- [ ] Working directory set correctly (package path vs root)
- [ ] Secret values redacted from stdout/stderr
- [ ] Returns complete `SchedulerResult` with all task results
- [ ] `cargo test --all` passes (with mock command execution)
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 4: Output buffering + terminal display

**Files:**
- `native/vtz/src/ci/output.rs` (new)

**What to implement:**

Buffered terminal output that prevents interleaved output from parallel tasks.

**Default mode (buffered):**
- Each task's stdout/stderr is captured in memory
- When a task completes, replay its output in order
- Show a live progress line at the bottom: `⏳ running: build @vertz/ui, test @vertz/core (3/14)`
- Use `owo-colors` for colored output (already a dependency)

**Verbose mode (`--verbose`):**
- Stream output live with task prefix: `[build @vertz/ui] compiling...`
- No buffering, interleaved output is expected

**Summary:**
```
 ✓ lint                         2.1s
 ● build  @vertz/core           cached
 ✓ build  @vertz/ui             1.8s
 ✗ test   @vertz/ui             FAILED (exit 1)
 ⊘ test   @vertz/ui-server      skipped (dep failed)

[pipe] Done in 12.4s (3 cached, 8 executed, 3 skipped, 1 failed)
```

Symbols: `✓` success, `✗` failed, `●` cached, `⊘` skipped.

**Acceptance criteria:**
- [ ] Default mode: output is replayed after task completion, not interleaved
- [ ] Verbose mode: output streams live with task prefix
- [ ] Summary shows all tasks with status and duration
- [ ] Colored output using owo-colors
- [ ] Failed tasks show exit code
- [ ] Skipped tasks show reason (condition false, dep failed, etc.)
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 5: Signal handling + `--dry-run` + `--concurrency`

**Files:**
- `native/vtz/src/ci/scheduler.rs` (modified — add signal handling)
- `native/vtz/src/ci/mod.rs` (modified — wire CLI flags)

**What to implement:**

**Signal handling (SIGINT/Ctrl+C):**
1. Register a `tokio::signal::ctrl_c()` handler
2. On first SIGINT: send SIGTERM to all running child processes, print "Shutting down..."
3. Wait up to 5 seconds for graceful shutdown
4. On second SIGINT (or after 5s): send SIGKILL to all children
5. Print partial results summary (which tasks completed, which were interrupted)

**`--dry-run` flag:**
- Build the task graph and print what would run, without executing:
  ```
  [pipe] Dry run — no commands will be executed

   → lint                         oxlint packages/ && oxfmt --check packages/
   → build  @vertz/ui             bun run build (deps: @vertz/core, @vertz/schema)
   → build  @vertz/ui-server      bun run build (deps: @vertz/ui)
  ```

**`--concurrency` flag:**
- Default: `num_cpus::get()` (or tokio available parallelism)
- Override with `--concurrency N`

**`--verbose` and `--quiet` flags:**
- `--verbose`: live streaming, cache key details
- `--quiet`: only failures and final summary

Wire these flags through from `CiArgs` → `Scheduler::execute()`.

**Acceptance criteria:**
- [ ] SIGINT sends SIGTERM to running children, then SIGKILL after 5s
- [ ] Partial results displayed after interrupted execution
- [ ] `--dry-run` shows execution plan without running commands
- [ ] `--concurrency 1` forces sequential execution
- [ ] `--verbose` enables live output streaming
- [ ] `--quiet` suppresses non-error output
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
