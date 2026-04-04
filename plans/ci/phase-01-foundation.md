# Phase 1: Foundation — `ci/` Module + Config + Workspace + Basic Execution

## Context

`vtz ci` is a new monorepo task runner built into the `vtz` Rust binary. This phase establishes the module skeleton, CLI wiring, config loading via a Bun NDJSON bridge, workspace resolution, and basic sequential task execution. By the end, `vtz ci build` runs a single task sequentially across workspace packages.

Design doc: `plans/pipe-ci-runner.md`

## Tasks

### Task 1: Module skeleton + shared types

**Files:**
- `native/vtz/src/ci/mod.rs` (new)
- `native/vtz/src/ci/types.rs` (new)

**What to implement:**

Create the `ci/` module at `native/vtz/src/ci/`. Define all shared Rust types that map to the TypeScript SDK config.

`mod.rs` — declare submodules and export a public `execute()` entry point (initially a stub that loads config and prints it):
```rust
pub mod config;
pub mod types;
pub mod workspace;

pub async fn execute(args: &crate::cli::CiArgs, root_dir: &Path) -> Result<()>;
```

`types.rs` — Rust equivalents of the TS types:
```rust
pub struct PipeConfig {
    pub secrets: Vec<String>,
    pub workspace: Option<WorkspaceConfig>,
    pub tasks: BTreeMap<String, TaskDef>,
    pub workflows: BTreeMap<String, WorkflowConfig>,
    pub cache: Option<CacheConfig>,
}

pub enum TaskDef {
    Command(CommandTask),
    Steps(StepsTask),
}

pub struct TaskBase {
    pub deps: Vec<Dep>,
    pub cond: Option<Condition>,
    pub cache: Option<TaskCacheConfig>,
    pub env: BTreeMap<String, String>,
    pub timeout: Option<u64>,
    pub scope: TaskScope,
}

pub enum TaskScope { Package, Root }

pub enum Dep {
    Simple(String),           // bare string, skip=continue
    Edge(DepEdge),            // explicit control
}

pub struct DepEdge {
    pub task: String,
    pub on: DepCondition,
}

pub enum DepCondition {
    Success,
    Always,
    Failure,
    Callback(u64),  // callback ID, evaluated via Bun bridge
}

pub struct TaskResult {
    pub status: TaskStatus,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub package: Option<String>,
    pub task: String,
    pub cached: bool,
}

pub enum TaskStatus { Success, Failed, Skipped }

pub enum Condition {
    Changed { patterns: Vec<String> },
    Branch { names: Vec<String> },
    Env { name: String, value: Option<String> },
    All { conditions: Vec<Condition> },
    Any { conditions: Vec<Condition> },
}

pub struct WorkflowConfig {
    pub run: Vec<String>,
    pub filter: WorkflowFilter,
    pub env: BTreeMap<String, String>,
}

pub enum WorkflowFilter {
    Affected,
    All,
    Packages(Vec<String>),
}

pub struct CacheConfig {
    pub local: Option<String>,
    pub remote: Option<RemoteCacheConfig>,
    pub max_size: Option<u64>,
}

pub enum RemoteCacheConfig {
    Auto,
    Url(String),
    Disabled,
}

pub struct TaskCacheConfig {
    pub inputs: Vec<String>,
    pub outputs: Vec<String>,
}

pub struct WorkspaceConfig {
    pub packages: Vec<String>,
    pub native: Option<NativeWorkspaceConfig>,
}

pub struct NativeWorkspaceConfig {
    pub root: String,
    pub members: Vec<String>,
}
```

All types derive `Debug, Clone, Serialize, Deserialize` as appropriate. Use `serde` for JSON deserialization from the Bun bridge. Use `BTreeMap` (not HashMap) for deterministic ordering.

**Acceptance criteria:**
- [ ] `native/vtz/src/ci/mod.rs` compiles with submodule declarations
- [ ] All types in `types.rs` derive necessary serde traits
- [ ] `TaskDef` is a proper enum (Command vs Steps), not a struct with optional fields
- [ ] `Dep` is an enum (Simple string vs Edge with condition)
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 2: CLI args + routing

**Files:**
- `native/vtz/src/cli.rs` (modified — add `Ci(CiArgs)` variant)
- `native/vtz/src/main.rs` (modified — add routing)

**What to implement:**

Add `CiArgs` and `CiCommand` to `cli.rs`:
```rust
/// Monorepo CI task orchestration
Ci(CiArgs),

#[derive(Parser, Debug)]
pub struct CiArgs {
    #[command(subcommand)]
    pub command: Option<CiCommand>,
    /// Task or workflow name (positional, when no subcommand)
    #[arg(trailing_var_arg = true)]
    pub name: Vec<String>,
}

#[derive(Subcommand, Debug)]
pub enum CiCommand {
    /// List affected packages
    Affected(AffectedArgs),
    /// Cache management
    Cache(CiCacheArgs),
    /// Print task execution graph
    Graph(GraphArgs),
}

#[derive(Parser, Debug)]
pub struct AffectedArgs {
    #[arg(long, default_value = "origin/main")]
    pub base: String,
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct CiCacheArgs {
    #[command(subcommand)]
    pub command: CiCacheCommand,
}

#[derive(Subcommand, Debug)]
pub enum CiCacheCommand {
    Status,
    Clean,
    Push,
}

#[derive(Parser, Debug)]
pub struct GraphArgs {
    #[arg(long)]
    pub dot: bool,
    pub name: Option<String>,
}
```

The default (no subcommand) is `vtz ci <name>` which runs a task/workflow by name. This allows both:
- `vtz ci ci` — run the "ci" workflow
- `vtz ci affected` — list affected packages
- `vtz ci cache clean` — cache management

Add routing in `main.rs`:
```rust
Command::Ci(args) => {
    let root_dir = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    if let Err(e) = ci::execute(&args, &root_dir).await {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}
```

**Acceptance criteria:**
- [ ] `vtz ci --help` shows the CI subcommands
- [ ] `vtz ci ci` routes to `ci::execute()`
- [ ] `vtz ci affected --base main --json` parses correctly
- [ ] `vtz ci cache clean` parses correctly
- [ ] `vtz ci graph --dot` parses correctly
- [ ] Existing commands unaffected
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 3: Config loading via Bun (NDJSON bridge)

**Files:**
- `native/vtz/src/ci/config.rs` (new)
- `native/vtz/src/ci/loader.ts` (new — embedded or bundled)

**What to implement:**

`config.rs` — spawn Bun to evaluate `ci.config.ts`, keep it alive for callback evaluation:

1. **Find config file:** Look for `ci.config.ts` in `root_dir`. Error if not found.
2. **Find runtime:** Try `bun` first (via `which`), then `node` with tsx. Error if neither found.
3. **Spawn process:** Start Bun with the loader script, pipe stdin/stdout.
4. **Phase 1 — read config:** Read first NDJSON line from stdout, parse as `PipeConfig`.
5. **Callback evaluation:** Provide `eval_callback(id: u64, result: &TaskResult) -> Result<bool>` that sends an eval request over stdin and reads the response from stdout.
6. **Shutdown:** Send `{"shutdown": true}` and wait for process exit.

The **loader script** (`loader.ts`) is a small TypeScript file that:
- Sets up `globalThis.__pipeRegisterCallback` for callback registration
- Imports the user's `ci.config.ts`
- Sends config JSON to stdout (functions replaced with `{ type: 'callback', id: N }`)
- Listens on stdin for callback eval requests
- Responds on stdout with eval results

For Phase 1, the loader script can be embedded as a string constant in `config.rs` and written to `.pipe/loader.ts` at runtime, OR stored alongside the binary. The simplest approach: embed it as `include_str!("loader.ts")` and write to a temp file.

**Secrets validation:** After config is loaded, check that every env var in `config.secrets` exists. If any are missing, print the error listing missing secrets and return `Err`.

Custom serde deserializer for `TaskDef`:
- If JSON has `"command"` field → `TaskDef::Command`
- If JSON has `"steps"` field → `TaskDef::Steps`
- If both → error
- If neither → error

Custom serde deserializer for `Dep`:
- If JSON is a string → `Dep::Simple(string)`
- If JSON is an object with `"task"` and `"on"` → `Dep::Edge`
- `"on"` is string ("success"/"always"/"failure") or `{ "type": "callback", "id": N }`

**Acceptance criteria:**
- [ ] Config loads from `ci.config.ts` via Bun
- [ ] Config JSON deserializes into `PipeConfig` with correct types
- [ ] `TaskDef` correctly deserializes as Command or Steps variant
- [ ] `Dep` correctly deserializes as Simple or Edge variant
- [ ] `DepCondition::Callback` stores the callback ID
- [ ] Secrets validation fails fast with clear error listing missing vars
- [ ] Callback eval sends request and receives boolean response
- [ ] Shutdown cleanly terminates the Bun process
- [ ] Falls back to Node+tsx if Bun not found
- [ ] Clear error if neither Bun nor Node found
- [ ] Clear error if `ci.config.ts` not found
- [ ] `cargo test --all` passes (unit tests with mock stdin/stdout)
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 4: Workspace resolution

**Files:**
- `native/vtz/src/ci/workspace.rs` (new)

**What to implement:**

Resolve both TypeScript and Rust workspaces into a unified package graph.

**TypeScript packages:**
1. If `config.workspace.packages` is set, use those globs. Otherwise, read `package.json` at `root_dir` and use its `workspaces` field.
2. Expand glob patterns using the `glob` crate.
3. For each matched directory, read `package.json`, extract `name`, `version`, `dependencies`, `devDependencies`.
4. Recognize `workspace:*`, `workspace:^`, `workspace:~` as local workspace references.
5. Build a dependency graph (name → set of dependency names, filtered to only workspace-internal deps).

Reuse patterns from `pm/workspace.rs`:
- `discover_workspaces()` pattern for glob expansion + validation
- `merge_workspace_deps()` pattern for filtering internal deps
- `validate_workspace_graph()` pattern for cycle detection (DFS)
- Use `BTreeMap` for deterministic ordering

**Rust crates:**
1. If `config.workspace.native` is set, use it. Otherwise, check if `Cargo.toml` at `root_dir` has a `[workspace]` section.
2. Run `cargo metadata --format-version=1 --no-deps` and parse JSON output.
3. Extract crate names and directory paths.

**Output types:**
```rust
pub struct ResolvedWorkspace {
    pub packages: BTreeMap<String, WorkspacePackage>,
    pub native_crates: BTreeMap<String, NativeCrate>,
}

pub struct WorkspacePackage {
    pub name: String,
    pub version: String,
    pub path: PathBuf,
    pub internal_deps: Vec<String>,  // workspace package names this depends on
}

pub struct NativeCrate {
    pub name: String,
    pub path: PathBuf,
}
```

**Acceptance criteria:**
- [ ] Discovers packages from `package.json` `workspaces` globs
- [ ] Extracts `workspace:*` deps as internal references
- [ ] Builds internal dependency graph (which workspace pkg depends on which)
- [ ] Resolves Rust crates from `cargo metadata` output
- [ ] Falls back to reading `Cargo.toml` workspace members if `cargo metadata` fails
- [ ] Returns clear error on duplicate package names
- [ ] Detects circular dependencies (DFS) with cycle path in error
- [ ] `cargo test --all` passes (unit tests with fixture package.json files)
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 5: Basic sequential execution + NDJSON logs

**Files:**
- `native/vtz/src/ci/logs.rs` (new)
- `native/vtz/src/ci/mod.rs` (modified — wire everything together)

**What to implement:**

Wire the full Phase 1 flow in `execute()`:

1. Load config from `ci.config.ts` (Task 3)
2. Validate secrets (Task 3)
3. Resolve workspace (Task 4)
4. Find the requested task/workflow by name (from CLI args)
5. For a **single task** (not workflow yet):
   - If `scope: 'root'`: run the command once at `root_dir`
   - If `scope: 'package'`: run the command once per affected package (sequentially for now)
6. Execute commands via `tokio::process::Command` with `sh -c`
7. Collect exit codes, print summary

**NDJSON execution logs** (`logs.rs`):
- Generate a run ID (ULID or UUID)
- Write structured log entries to `.pipe/logs/<run-id>.jsonl`
- Each entry: `{ timestamp, run_id, task, package, event, ... }`
- Events: `task_start`, `task_end` (with status, exit_code, duration_ms), `run_start`, `run_end`
- **Secret redaction:** Before writing any log entry, scan string values for exact matches against secret values from `config.secrets` and replace with `[REDACTED]`.

**Terminal output:**
- `[pipe] Loading ci.config.ts...`
- `[pipe] Workspace: N packages, M native crates`
- `✓ task  package  duration` or `✗ task  package  error`
- `[pipe] Done in Xs`

**Acceptance criteria:**
- [ ] `vtz ci build` loads config, resolves workspace, runs `bun run build` per package
- [ ] Root-scoped tasks run once at repo root
- [ ] Package-scoped tasks run once per package (sequential)
- [ ] Exit code 0 when all tasks pass, 1 when any fails
- [ ] NDJSON log written to `.pipe/logs/<run-id>.jsonl`
- [ ] Log entries include task name, package, status, duration, exit code
- [ ] Secret values redacted from logs and terminal output
- [ ] Terminal output shows progress and summary
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
