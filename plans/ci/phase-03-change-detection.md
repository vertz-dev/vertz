# Phase 3: Change Detection + Affected Filtering

## Context

Phases 1-2 deliver a parallel task runner that executes all tasks across all packages. This phase adds intelligence: git-based change detection maps file changes to packages, transitive affected calculation propagates through the dependency graph, `cond.*` conditions evaluate per-task, and `filter: 'affected'` on workflows restricts execution to changed packages. By the end, `vtz ci ci` skips unchanged packages and `vtz ci affected` lists what changed.

Design doc: `plans/pipe-ci-runner.md`

Depends on: Phase 1 (workspace), Phase 2 (task graph, scheduler)

## Tasks

### Task 1: Git-based change detection

**Files:**
- `native/vtz/src/ci/changes.rs` (new)

**What to implement:**

Detect changed files using a three-part git strategy:

```rust
pub struct ChangeDetector {
    root_dir: PathBuf,
    base_ref: String,  // e.g. "origin/main"
}

pub struct ChangeSet {
    pub files: Vec<PathBuf>,       // all changed files (relative to root)
    pub base_ref: String,          // the ref that was used
    pub is_shallow: bool,          // true if shallow clone fallback was used
}

impl ChangeDetector {
    pub fn new(root_dir: PathBuf, base_ref: String) -> Self;
    pub async fn detect(&self) -> Result<ChangeSet>;
}
```

**Three-part detection:**
1. **Committed changes** (PR diff): `git diff --name-only <base>...<head>` (three-dot merge-base)
2. **Staged changes**: `git diff --cached --name-only`
3. **Untracked files**: `git ls-files --others --exclude-standard`

Merge all three lists, deduplicate, normalize paths to be relative to repo root.

**Base ref resolution:**
- Default: `origin/main`
- Override: `--base <ref>` CLI flag
- CI detection: if `CI=true` env var is set, use `origin/main` (or `GITHUB_BASE_REF` if available)

**Shallow clone handling:**
- If `git merge-base` fails (exit code != 0), assume shallow clone
- Fallback: `git diff HEAD~1 --name-only`
- Set `is_shallow = true` and log a warning: `[pipe] Warning: shallow clone detected, change detection may be incomplete. Use fetch-depth: 0 in CI.`

**Edge cases:**
- Renamed files: git reports both old and new paths, both are included
- Deleted files: included (the package that contained them is marked as changed)
- Binary files: included (git diff still lists them)

All git commands run via `tokio::process::Command` for async execution.

**Acceptance criteria:**
- [ ] Detects committed changes via three-dot merge-base diff
- [ ] Detects staged (uncommitted) changes
- [ ] Detects untracked files
- [ ] Deduplicates across all three sources
- [ ] Paths are relative to repo root
- [ ] Falls back to `HEAD~1` on shallow clones with warning
- [ ] Uses `GITHUB_BASE_REF` when available in CI
- [ ] `--base` flag overrides default base ref
- [ ] Unit tests with mock git output
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 2: File→package mapping + transitive affected

**Files:**
- `native/vtz/src/ci/changes.rs` (modified — add package mapping)

**What to implement:**

Map changed files to packages, then compute transitive affected set.

```rust
pub struct AffectedResult {
    pub directly_changed: BTreeSet<String>,   // packages with file changes
    pub transitively_affected: BTreeSet<String>, // packages whose deps changed
    pub all_affected: BTreeSet<String>,        // union of both
    pub root_changed: bool,                    // files outside any package changed
}

impl ChangeDetector {
    pub fn map_to_packages(
        &self,
        changes: &ChangeSet,
        workspace: &ResolvedWorkspace,
    ) -> AffectedResult;
}
```

**File→package mapping:**
- For each changed file, check which package directory contains it (longest prefix match)
- Files in `native/` map to native crates (from `ResolvedWorkspace.native_crates`)
- Files outside any package directory are flagged as `root_changed` (lockfile, config, CI files)
- Root changes optionally affect all packages (configurable, default: no)

**Transitive affected calculation:**
- Start with directly changed packages
- Walk the reverse dependency graph: if package A depends on package B, and B is affected, then A is also affected
- Use BFS/DFS on the reverse dep graph from `ResolvedWorkspace`
- Mark transitive packages distinctly (for display: `@vertz/ui-primitives (transitive)`)

**Acceptance criteria:**
- [ ] Changed file correctly maps to its containing package
- [ ] Longest prefix match handles nested packages
- [ ] Files outside packages flagged as root changes
- [ ] Transitive deps correctly propagated via reverse dependency graph
- [ ] Native crate files map to their crate names
- [ ] `AffectedResult` distinguishes direct vs transitive
- [ ] Unit tests: single package change, transitive chain, root file change
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes

---

### Task 3: `cond.*` evaluation + workflow filter integration

**Files:**
- `native/vtz/src/ci/changes.rs` (modified — add condition evaluation)
- `native/vtz/src/ci/graph.rs` (modified — integrate conditions into graph building)
- `native/vtz/src/ci/mod.rs` (modified — wire `affected` CLI command)

**What to implement:**

**Condition evaluation:**
```rust
pub fn evaluate_condition(
    cond: &Condition,
    changes: &ChangeSet,
    current_branch: &str,
    env: &BTreeMap<String, String>,
) -> bool;
```

| Condition type | Evaluation |
|---|---|
| `Changed { patterns }` | Any changed file matches any glob pattern |
| `Branch { names }` | Current branch name matches any listed name (supports globs: `release/*`) |
| `Env { name, value }` | Env var exists (and optionally matches value) |
| `All { conditions }` | All sub-conditions true |
| `Any { conditions }` | Any sub-condition true |

Use the `glob` crate for pattern matching. Branch name from `git rev-parse --abbrev-ref HEAD`.

**Workflow filter integration:**
When building the task graph (Phase 2 `graph.rs`), apply the workflow's `filter`:
- `filter: 'affected'` → only create package-scoped nodes for packages in `AffectedResult.all_affected`
- `filter: 'all'` → create nodes for all packages
- `filter: string[]` → create nodes for packages matching the listed names/globs
- CLI `--all` flag overrides to `'all'`
- CLI `--scope <pkg>` overrides to `[pkg]`

**Task-level conditions:**
When the scheduler processes a node, check `task.cond` via `evaluate_condition()`. If false, mark as skipped and propagate according to edge types (Phase 2).

**`vtz ci affected` command:**
Wire the `Affected` subcommand:
```
$ vtz ci affected
@vertz/ui
@vertz/ui-server
@vertz/ui-primitives (transitive)

$ vtz ci affected --json
{"directly_changed":["@vertz/ui","@vertz/ui-server"],"transitively_affected":["@vertz/ui-primitives"],"files_changed":4}

$ vtz ci affected --base feature/branch
...
```

**Acceptance criteria:**
- [ ] `cond.changed('native/**')` evaluates correctly against change set
- [ ] `cond.branch('main', 'release/*')` matches current branch
- [ ] `cond.env('CI')` checks env var existence
- [ ] `cond.env('NODE_ENV', 'production')` checks env var value
- [ ] `cond.all()` requires all sub-conditions true
- [ ] `cond.any()` requires any sub-condition true
- [ ] `filter: 'affected'` restricts graph to affected packages only
- [ ] `filter: 'all'` includes all packages
- [ ] `--all` CLI flag overrides to all packages
- [ ] `--scope @vertz/ui` restricts to specific package
- [ ] Task-level `cond` evaluated at execution time, skip propagates correctly
- [ ] `vtz ci affected` prints affected packages
- [ ] `vtz ci affected --json` outputs structured JSON
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
