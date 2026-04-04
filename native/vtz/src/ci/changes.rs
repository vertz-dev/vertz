use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::path::{Path, PathBuf};

use crate::ci::types::{ResolvedWorkspace, WorkspacePackage};

// ---------------------------------------------------------------------------
// Change detection — git-based file diff
// ---------------------------------------------------------------------------

/// Detects changed files using a three-part git strategy:
/// 1. Committed changes (PR diff via three-dot merge-base)
/// 2. Staged (uncommitted) changes
/// 3. Untracked files
pub struct ChangeDetector {
    root_dir: PathBuf,
    base_ref: String,
}

/// The set of changed files detected by git.
#[derive(Debug, Clone)]
pub struct ChangeSet {
    /// All changed files, relative to the repo root.
    pub files: Vec<PathBuf>,
    /// The git ref that was diffed against.
    pub base_ref: String,
    /// True if shallow clone fallback was used (incomplete history).
    pub is_shallow: bool,
}

/// Result of mapping changed files to workspace packages.
#[derive(Debug, Clone)]
pub struct AffectedResult {
    /// Packages that directly contain changed files.
    pub directly_changed: BTreeSet<String>,
    /// Packages affected transitively (their deps changed).
    pub transitively_affected: BTreeSet<String>,
    /// Union of directly_changed and transitively_affected.
    pub all_affected: BTreeSet<String>,
    /// Whether files outside any package directory changed.
    pub root_changed: bool,
}

impl ChangeDetector {
    pub fn new(root_dir: PathBuf, base_ref: String) -> Self {
        Self { root_dir, base_ref }
    }

    /// Resolve the effective base ref based on environment.
    /// Priority: explicit base_ref > GITHUB_BASE_REF (in CI) > "origin/main"
    pub fn resolve_base_ref(explicit: Option<&str>) -> String {
        let ci = std::env::var("CI").ok();
        let github_base = std::env::var("GITHUB_BASE_REF").ok();
        let is_ci = ci.as_deref().is_some_and(|v| !v.is_empty());
        resolve_base_ref_from("origin/main", explicit, github_base.as_deref(), is_ci)
    }

    /// Detect all changed files using the three-part git strategy.
    pub async fn detect(&self) -> Result<ChangeSet, String> {
        let mut all_files = BTreeSet::new();
        let mut is_shallow = false;

        // 1. Committed changes (three-dot merge-base diff)
        match self.committed_changes().await {
            Ok(files) => {
                for f in files {
                    all_files.insert(f);
                }
            }
            Err(_) => {
                // Shallow clone fallback: use HEAD~1
                is_shallow = true;
                eprintln!(
                    "[pipe] Warning: shallow clone detected, change detection may be \
                     incomplete. Use fetch-depth: 0 in CI."
                );
                match self.shallow_fallback().await {
                    Ok(files) => {
                        for f in files {
                            all_files.insert(f);
                        }
                    }
                    Err(e) => {
                        return Err(format!("failed to detect committed changes: {e}"));
                    }
                }
            }
        }

        // 2. Staged changes
        match self.staged_changes().await {
            Ok(files) => {
                for f in files {
                    all_files.insert(f);
                }
            }
            Err(e) => {
                return Err(format!("failed to detect staged changes: {e}"));
            }
        }

        // 3. Untracked files
        match self.untracked_files().await {
            Ok(files) => {
                for f in files {
                    all_files.insert(f);
                }
            }
            Err(e) => {
                return Err(format!("failed to detect untracked files: {e}"));
            }
        }

        Ok(ChangeSet {
            files: all_files.into_iter().collect(),
            base_ref: self.base_ref.clone(),
            is_shallow,
        })
    }

    /// `git diff --name-only <base>...<head>` (three-dot merge-base)
    async fn committed_changes(&self) -> Result<Vec<PathBuf>, String> {
        let args = &["diff", "--name-only", &format!("{}...HEAD", self.base_ref)];
        self.run_git(args).await
    }

    /// Shallow clone fallback: `git diff HEAD~1 --name-only`
    async fn shallow_fallback(&self) -> Result<Vec<PathBuf>, String> {
        self.run_git(&["diff", "HEAD~1", "--name-only"]).await
    }

    /// `git diff --cached --name-only`
    async fn staged_changes(&self) -> Result<Vec<PathBuf>, String> {
        self.run_git(&["diff", "--cached", "--name-only"]).await
    }

    /// `git ls-files --others --exclude-standard`
    async fn untracked_files(&self) -> Result<Vec<PathBuf>, String> {
        self.run_git(&["ls-files", "--others", "--exclude-standard"])
            .await
    }

    /// Run a git command and parse its stdout into a list of paths.
    async fn run_git(&self, args: &[&str]) -> Result<Vec<PathBuf>, String> {
        let output = tokio::process::Command::new("git")
            .args(args)
            .current_dir(&self.root_dir)
            .output()
            .await
            .map_err(|e| format!("git {}: {e}", args.join(" ")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "git {} failed (exit {}): {}",
                args.join(" "),
                output.status.code().unwrap_or(-1),
                stderr.trim()
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(parse_file_list(&stdout))
    }

    // -----------------------------------------------------------------------
    // File → package mapping
    // -----------------------------------------------------------------------

    /// Map changed files to workspace packages and compute transitive affected set.
    pub fn map_to_packages(
        &self,
        changes: &ChangeSet,
        workspace: &ResolvedWorkspace,
    ) -> AffectedResult {
        map_files_to_packages(&changes.files, workspace)
    }
}

/// Testable inner function for base ref resolution — no env var access.
fn resolve_base_ref_from(
    default: &str,
    explicit: Option<&str>,
    github_base_ref: Option<&str>,
    is_ci: bool,
) -> String {
    if let Some(base) = explicit {
        return base.to_string();
    }
    if is_ci {
        if let Some(github_base) = github_base_ref {
            if !github_base.is_empty() {
                return format!("origin/{github_base}");
            }
        }
    }
    default.to_string()
}

/// Parse git output lines into a list of relative PathBufs.
/// Filters out empty lines.
fn parse_file_list(output: &str) -> Vec<PathBuf> {
    output
        .lines()
        .filter(|l| !l.is_empty())
        .map(PathBuf::from)
        .collect()
}

/// Pure function: map changed files to packages and compute transitive affected.
pub fn map_files_to_packages(files: &[PathBuf], workspace: &ResolvedWorkspace) -> AffectedResult {
    // Build a sorted list of (package_path, package_name) for longest-prefix matching.
    // Include both TS packages and native crates.
    let mut pkg_paths: Vec<(&Path, &str)> = Vec::new();
    for (name, pkg) in &workspace.packages {
        pkg_paths.push((pkg.path.as_path(), name.as_str()));
    }
    for (name, cr) in &workspace.native_crates {
        pkg_paths.push((cr.path.as_path(), name.as_str()));
    }
    // Sort by path length descending so longest prefix matches first.
    pkg_paths.sort_by(|a, b| b.0.components().count().cmp(&a.0.components().count()));

    let mut directly_changed = BTreeSet::new();
    let mut root_changed = false;

    for file in files {
        let mut matched = false;
        for &(pkg_path, pkg_name) in &pkg_paths {
            if file.starts_with(pkg_path) {
                directly_changed.insert(pkg_name.to_string());
                matched = true;
                break; // longest prefix already (sorted)
            }
        }
        if !matched {
            root_changed = true;
        }
    }

    // Compute transitive affected via reverse dependency BFS
    let transitively_affected = compute_transitive_affected(&directly_changed, &workspace.packages);

    let all_affected: BTreeSet<String> = directly_changed
        .union(&transitively_affected)
        .cloned()
        .collect();

    AffectedResult {
        directly_changed,
        transitively_affected,
        all_affected,
        root_changed,
    }
}

/// Compute packages transitively affected by changes in `changed` packages.
/// Uses BFS on the reverse dependency graph: if A depends on B, and B changed,
/// then A is transitively affected.
fn compute_transitive_affected(
    changed: &BTreeSet<String>,
    packages: &BTreeMap<String, WorkspacePackage>,
) -> BTreeSet<String> {
    // Build reverse dependency map: dep_name → Vec<dependent_name>
    let mut reverse_deps: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for (name, pkg) in packages {
        for dep in &pkg.internal_deps {
            reverse_deps
                .entry(dep.as_str())
                .or_default()
                .push(name.as_str());
        }
    }

    let mut transitive = BTreeSet::new();
    let mut queue: VecDeque<&str> = changed.iter().map(|s| s.as_str()).collect();
    let mut visited: BTreeSet<&str> = changed.iter().map(|s| s.as_str()).collect();

    while let Some(pkg) = queue.pop_front() {
        if let Some(dependents) = reverse_deps.get(pkg) {
            for &dep in dependents {
                if visited.insert(dep) {
                    // Only mark as transitive if not directly changed
                    if !changed.contains(dep) {
                        transitive.insert(dep.to_string());
                    }
                    queue.push_back(dep);
                }
            }
        }
    }

    transitive
}

// ---------------------------------------------------------------------------
// Get current branch name
// ---------------------------------------------------------------------------

/// Get the current git branch name.
pub async fn current_branch(root_dir: &Path) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(root_dir)
        .output()
        .await
        .map_err(|e| format!("git rev-parse: {e}"))?;

    if !output.status.success() {
        return Err("failed to determine current branch".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

/// Evaluate a `Condition` against the current context.
pub fn evaluate_condition(
    cond: &crate::ci::types::Condition,
    changes: &ChangeSet,
    current_branch: &str,
) -> bool {
    use crate::ci::types::Condition;

    match cond {
        Condition::Changed { patterns } => {
            // Any changed file matches any glob pattern
            for pattern in patterns {
                match glob::Pattern::new(pattern) {
                    Ok(glob) => {
                        for file in &changes.files {
                            if glob.matches_path(file) {
                                return true;
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[pipe] Warning: invalid glob pattern \"{pattern}\": {e}");
                    }
                }
            }
            false
        }
        Condition::Branch { names } => {
            // Current branch matches any listed name (supports globs)
            for name in names {
                match glob::Pattern::new(name) {
                    Ok(glob) => {
                        if glob.matches(current_branch) {
                            return true;
                        }
                    }
                    Err(e) => {
                        eprintln!("[pipe] Warning: invalid branch pattern \"{name}\": {e}");
                    }
                }
            }
            false
        }
        Condition::Env { name, value } => {
            let env_val = std::env::var(name).ok();
            match (env_val, value) {
                (None, _) => false,      // env var not set
                (Some(_), None) => true, // just check existence
                (Some(actual), Some(expected)) => &actual == expected,
            }
        }
        Condition::All { conditions } => conditions
            .iter()
            .all(|c| evaluate_condition(c, changes, current_branch)),
        Condition::Any { conditions } => conditions
            .iter()
            .any(|c| evaluate_condition(c, changes, current_branch)),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ci::types::{Condition, NativeCrate, WorkspacePackage};

    // -- parse_file_list --

    #[test]
    fn parse_file_list_basic() {
        let output = "packages/ui/src/index.ts\npackages/server/src/main.ts\n";
        let result = parse_file_list(output);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], PathBuf::from("packages/ui/src/index.ts"));
        assert_eq!(result[1], PathBuf::from("packages/server/src/main.ts"));
    }

    #[test]
    fn parse_file_list_empty_lines() {
        let output = "\npackages/ui/src/index.ts\n\n\n";
        let result = parse_file_list(output);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], PathBuf::from("packages/ui/src/index.ts"));
    }

    #[test]
    fn parse_file_list_empty() {
        let result = parse_file_list("");
        assert!(result.is_empty());
    }

    // -- resolve_base_ref --

    #[test]
    fn resolve_base_ref_explicit() {
        assert_eq!(
            ChangeDetector::resolve_base_ref(Some("origin/develop")),
            "origin/develop"
        );
    }

    // Note: resolve_base_ref tests that depend on env vars are inherently racy
    // in parallel test execution. We test the logic via a helper that takes
    // explicit env values instead.

    #[test]
    fn resolve_base_ref_default_no_ci() {
        // When no explicit base and CI is not set, returns origin/main
        let result = resolve_base_ref_from("origin/main", None, None, false);
        assert_eq!(result, "origin/main");
    }

    #[test]
    fn resolve_base_ref_ci_github() {
        let result = resolve_base_ref_from("origin/main", None, Some("develop"), true);
        assert_eq!(result, "origin/develop");
    }

    #[test]
    fn resolve_base_ref_ci_no_github() {
        let result = resolve_base_ref_from("origin/main", None, None, true);
        assert_eq!(result, "origin/main");
    }

    // -- map_files_to_packages --

    fn make_workspace() -> ResolvedWorkspace {
        let mut packages = BTreeMap::new();
        packages.insert(
            "@vertz/ui".to_string(),
            WorkspacePackage {
                name: "@vertz/ui".to_string(),
                version: "0.1.0".to_string(),
                path: PathBuf::from("packages/ui"),
                internal_deps: vec![],
            },
        );
        packages.insert(
            "@vertz/server".to_string(),
            WorkspacePackage {
                name: "@vertz/server".to_string(),
                version: "0.1.0".to_string(),
                path: PathBuf::from("packages/server"),
                internal_deps: vec!["@vertz/ui".to_string()],
            },
        );
        packages.insert(
            "@vertz/ui-primitives".to_string(),
            WorkspacePackage {
                name: "@vertz/ui-primitives".to_string(),
                version: "0.1.0".to_string(),
                path: PathBuf::from("packages/ui-primitives"),
                internal_deps: vec!["@vertz/ui".to_string()],
            },
        );

        let mut native_crates = BTreeMap::new();
        native_crates.insert(
            "vtz".to_string(),
            NativeCrate {
                name: "vtz".to_string(),
                path: PathBuf::from("native/vtz"),
            },
        );

        ResolvedWorkspace {
            packages,
            native_crates,
        }
    }

    #[test]
    fn map_single_package_change() {
        let ws = make_workspace();
        let files = vec![PathBuf::from("packages/ui/src/index.ts")];
        let result = map_files_to_packages(&files, &ws);

        assert!(result.directly_changed.contains("@vertz/ui"));
        assert_eq!(result.directly_changed.len(), 1);
        assert!(!result.root_changed);
    }

    #[test]
    fn map_root_file_change() {
        let ws = make_workspace();
        let files = vec![PathBuf::from("package.json")];
        let result = map_files_to_packages(&files, &ws);

        assert!(result.directly_changed.is_empty());
        assert!(result.root_changed);
    }

    #[test]
    fn map_native_crate_change() {
        let ws = make_workspace();
        let files = vec![PathBuf::from("native/vtz/src/ci/mod.rs")];
        let result = map_files_to_packages(&files, &ws);

        assert!(result.directly_changed.contains("vtz"));
        assert_eq!(result.directly_changed.len(), 1);
        assert!(!result.root_changed);
    }

    #[test]
    fn map_transitive_deps() {
        let ws = make_workspace();
        // @vertz/ui changed → @vertz/server and @vertz/ui-primitives depend on it
        let files = vec![PathBuf::from("packages/ui/src/index.ts")];
        let result = map_files_to_packages(&files, &ws);

        assert!(result.directly_changed.contains("@vertz/ui"));
        assert!(result.transitively_affected.contains("@vertz/server"));
        assert!(result
            .transitively_affected
            .contains("@vertz/ui-primitives"));
        assert_eq!(result.all_affected.len(), 3);
    }

    #[test]
    fn map_directly_and_transitively() {
        let ws = make_workspace();
        // Both @vertz/ui and @vertz/server changed directly
        let files = vec![
            PathBuf::from("packages/ui/src/index.ts"),
            PathBuf::from("packages/server/src/main.ts"),
        ];
        let result = map_files_to_packages(&files, &ws);

        assert!(result.directly_changed.contains("@vertz/ui"));
        assert!(result.directly_changed.contains("@vertz/server"));
        // @vertz/server is directly changed, not transitively
        assert!(!result.transitively_affected.contains("@vertz/server"));
        // @vertz/ui-primitives is transitively affected
        assert!(result
            .transitively_affected
            .contains("@vertz/ui-primitives"));
    }

    #[test]
    fn map_no_changes() {
        let ws = make_workspace();
        let result = map_files_to_packages(&[], &ws);

        assert!(result.directly_changed.is_empty());
        assert!(result.transitively_affected.is_empty());
        assert!(result.all_affected.is_empty());
        assert!(!result.root_changed);
    }

    #[test]
    fn map_deduplication() {
        let ws = make_workspace();
        // Multiple files in the same package should only count once
        let files = vec![
            PathBuf::from("packages/ui/src/index.ts"),
            PathBuf::from("packages/ui/src/router.ts"),
            PathBuf::from("packages/ui/src/signals.ts"),
        ];
        let result = map_files_to_packages(&files, &ws);

        assert_eq!(result.directly_changed.len(), 1);
        assert!(result.directly_changed.contains("@vertz/ui"));
    }

    #[test]
    fn map_mixed_root_and_package() {
        let ws = make_workspace();
        let files = vec![
            PathBuf::from("packages/ui/src/index.ts"),
            PathBuf::from("bun.lock"),
        ];
        let result = map_files_to_packages(&files, &ws);

        assert!(result.directly_changed.contains("@vertz/ui"));
        assert!(result.root_changed);
    }

    // -- compute_transitive_affected --

    #[test]
    fn transitive_chain() {
        // A → B → C: changing C affects B and A
        let mut packages = BTreeMap::new();
        packages.insert(
            "A".to_string(),
            WorkspacePackage {
                name: "A".to_string(),
                version: "0.1.0".to_string(),
                path: PathBuf::from("packages/a"),
                internal_deps: vec!["B".to_string()],
            },
        );
        packages.insert(
            "B".to_string(),
            WorkspacePackage {
                name: "B".to_string(),
                version: "0.1.0".to_string(),
                path: PathBuf::from("packages/b"),
                internal_deps: vec!["C".to_string()],
            },
        );
        packages.insert(
            "C".to_string(),
            WorkspacePackage {
                name: "C".to_string(),
                version: "0.1.0".to_string(),
                path: PathBuf::from("packages/c"),
                internal_deps: vec![],
            },
        );

        let changed: BTreeSet<String> = ["C".to_string()].into_iter().collect();
        let transitive = compute_transitive_affected(&changed, &packages);

        assert!(transitive.contains("A"));
        assert!(transitive.contains("B"));
        assert!(!transitive.contains("C")); // C is directly changed, not transitive
    }

    #[test]
    fn transitive_no_deps() {
        let packages = BTreeMap::new();
        let changed: BTreeSet<String> = ["foo".to_string()].into_iter().collect();
        let transitive = compute_transitive_affected(&changed, &packages);
        assert!(transitive.is_empty());
    }

    // -- evaluate_condition --

    fn make_changes(files: &[&str]) -> ChangeSet {
        ChangeSet {
            files: files.iter().map(PathBuf::from).collect(),
            base_ref: "origin/main".to_string(),
            is_shallow: false,
        }
    }

    #[test]
    fn cond_changed_matches() {
        let changes = make_changes(&["native/vtz/src/ci/mod.rs", "packages/ui/src/index.ts"]);
        let cond = Condition::Changed {
            patterns: vec!["native/**".to_string()],
        };
        assert!(evaluate_condition(&cond, &changes, "main"));
    }

    #[test]
    fn cond_changed_no_match() {
        let changes = make_changes(&["packages/ui/src/index.ts"]);
        let cond = Condition::Changed {
            patterns: vec!["native/**".to_string()],
        };
        assert!(!evaluate_condition(&cond, &changes, "main"));
    }

    #[test]
    fn cond_changed_multiple_patterns() {
        let changes = make_changes(&["docs/readme.md"]);
        let cond = Condition::Changed {
            patterns: vec!["native/**".to_string(), "docs/**".to_string()],
        };
        assert!(evaluate_condition(&cond, &changes, "main"));
    }

    #[test]
    fn cond_branch_exact() {
        let changes = make_changes(&[]);
        let cond = Condition::Branch {
            names: vec!["main".to_string(), "develop".to_string()],
        };
        assert!(evaluate_condition(&cond, &changes, "main"));
        assert!(!evaluate_condition(&cond, &changes, "feature/foo"));
    }

    #[test]
    fn cond_branch_glob() {
        let changes = make_changes(&[]);
        let cond = Condition::Branch {
            names: vec!["release/*".to_string()],
        };
        assert!(evaluate_condition(&cond, &changes, "release/v1.0"));
        assert!(!evaluate_condition(&cond, &changes, "main"));
    }

    #[test]
    fn cond_env_exists() {
        std::env::set_var("__VTZ_TEST_COND_ENV", "1");
        let changes = make_changes(&[]);
        let cond = Condition::Env {
            name: "__VTZ_TEST_COND_ENV".to_string(),
            value: None,
        };
        assert!(evaluate_condition(&cond, &changes, "main"));
        std::env::remove_var("__VTZ_TEST_COND_ENV");
    }

    #[test]
    fn cond_env_missing() {
        std::env::remove_var("__VTZ_TEST_COND_ENV_MISSING");
        let changes = make_changes(&[]);
        let cond = Condition::Env {
            name: "__VTZ_TEST_COND_ENV_MISSING".to_string(),
            value: None,
        };
        assert!(!evaluate_condition(&cond, &changes, "main"));
    }

    #[test]
    fn cond_env_value_match() {
        std::env::set_var("__VTZ_TEST_COND_ENV_VAL", "production");
        let changes = make_changes(&[]);
        let cond = Condition::Env {
            name: "__VTZ_TEST_COND_ENV_VAL".to_string(),
            value: Some("production".to_string()),
        };
        assert!(evaluate_condition(&cond, &changes, "main"));
        std::env::remove_var("__VTZ_TEST_COND_ENV_VAL");
    }

    #[test]
    fn cond_env_value_mismatch() {
        std::env::set_var("__VTZ_TEST_COND_ENV_VAL2", "staging");
        let changes = make_changes(&[]);
        let cond = Condition::Env {
            name: "__VTZ_TEST_COND_ENV_VAL2".to_string(),
            value: Some("production".to_string()),
        };
        assert!(!evaluate_condition(&cond, &changes, "main"));
        std::env::remove_var("__VTZ_TEST_COND_ENV_VAL2");
    }

    #[test]
    fn cond_all_true() {
        std::env::set_var("__VTZ_TEST_ALL", "1");
        let changes = make_changes(&["native/vtz/src/main.rs"]);
        let cond = Condition::All {
            conditions: vec![
                Condition::Changed {
                    patterns: vec!["native/**".to_string()],
                },
                Condition::Env {
                    name: "__VTZ_TEST_ALL".to_string(),
                    value: None,
                },
            ],
        };
        assert!(evaluate_condition(&cond, &changes, "main"));
        std::env::remove_var("__VTZ_TEST_ALL");
    }

    #[test]
    fn cond_all_one_false() {
        let changes = make_changes(&["packages/ui/src/index.ts"]);
        let cond = Condition::All {
            conditions: vec![
                Condition::Changed {
                    patterns: vec!["native/**".to_string()],
                },
                Condition::Branch {
                    names: vec!["main".to_string()],
                },
            ],
        };
        assert!(!evaluate_condition(&cond, &changes, "main"));
    }

    #[test]
    fn cond_any_one_true() {
        let changes = make_changes(&["packages/ui/src/index.ts"]);
        let cond = Condition::Any {
            conditions: vec![
                Condition::Changed {
                    patterns: vec!["native/**".to_string()],
                },
                Condition::Branch {
                    names: vec!["main".to_string()],
                },
            ],
        };
        assert!(evaluate_condition(&cond, &changes, "main"));
    }

    #[test]
    fn cond_any_none_true() {
        let changes = make_changes(&["packages/ui/src/index.ts"]);
        let cond = Condition::Any {
            conditions: vec![
                Condition::Changed {
                    patterns: vec!["native/**".to_string()],
                },
                Condition::Branch {
                    names: vec!["develop".to_string()],
                },
            ],
        };
        assert!(!evaluate_condition(&cond, &changes, "main"));
    }

    #[test]
    fn cond_all_empty() {
        let changes = make_changes(&[]);
        let cond = Condition::All { conditions: vec![] };
        // Empty All = vacuously true
        assert!(evaluate_condition(&cond, &changes, "main"));
    }

    #[test]
    fn cond_any_empty() {
        let changes = make_changes(&[]);
        let cond = Condition::Any { conditions: vec![] };
        // Empty Any = vacuously false
        assert!(!evaluate_condition(&cond, &changes, "main"));
    }
}
