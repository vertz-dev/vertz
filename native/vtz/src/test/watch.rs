use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::watcher::file_watcher::{
    Debouncer, FileChange, FileChangeKind, FileWatcher, FileWatcherConfig,
};
use crate::watcher::module_graph::ModuleGraph;

use super::collector::{discover_test_files, DiscoveryMode};
use super::executor::{execute_test_file_with_options, ExecuteOptions};
use super::reporter::terminal::format_results_with_wall_clock;
use super::runner::{TestRunConfig, TestRunResult};

/// Best-effort canonicalization: returns the canonical form when available,
/// otherwise the input path (e.g. for files that no longer exist on disk).
///
/// Paths from `walkdir` (used by `discover_test_files`) and paths from the
/// OS file watcher can disagree on canonicalization — notably, macOS fsevent
/// normalizes its events through `realpath` (so `/tmp/...` arrives as
/// `/private/tmp/...`), while Linux inotify keeps paths as-registered and
/// `walkdir` doesn't canonicalize either. Running every path through this
/// helper before it enters the module graph or the test-file set keeps
/// both sides of the eventual `contains()` / `get_transitive_dependents()`
/// lookups in the same shape.
pub(crate) fn canonicalize_or_same(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

/// Recursively scan a file's local imports and record every discovered edge
/// in the module graph. Used to seed the graph before the watch loop starts,
/// so a later change to a source file deep in the import tree maps back to
/// the test file(s) that transitively depend on it.
///
/// Paths are canonicalized internally so the graph's keys match the
/// canonicalized paths that `run_watch_mode` feeds into `affected_test_files`.
/// Callers may pass either canonical or non-canonical entry paths.
pub(crate) fn populate_graph_from_entry(
    entry_path: &Path,
    graph: &mut ModuleGraph,
    visited: &mut HashSet<PathBuf>,
) {
    let canonical = canonicalize_or_same(entry_path);
    // If the file doesn't resolve to anything readable, skip — the canonical
    // fallback returns the input verbatim, and `read_to_string` below will
    // reject it cleanly.
    if !visited.insert(canonical.clone()) {
        return;
    }

    let source = match std::fs::read_to_string(&canonical) {
        Ok(s) => s,
        Err(_) => return,
    };

    let deps = crate::deps::scanner::scan_local_dependencies(&source, &canonical);
    graph.update_module(&canonical, deps.clone());

    for dep in deps {
        populate_graph_from_entry(&dep, graph, visited);
    }
}

/// Apply a file-change event to the module graph.
///
/// - `Modify`/`Create`: re-scan the file's local imports and update its edges.
/// - `Remove`: remove the node and its reverse edges so deleted files don't
///   leave ghost entries (matches the dev-server behavior introduced in #2764).
///
/// This only re-scans the file named by `change`. If the file is a newly
/// created intermediate (a source file in the middle of a chain a test file
/// imports), the reverse edge from the test file to it won't exist until
/// the test file itself is re-scanned — a `Modify` to the test file, or the
/// next `run_watch_mode` startup, will heal the edge.
pub(crate) fn update_graph_for_change(change: &FileChange, graph: &mut ModuleGraph) {
    let path = canonicalize_or_same(&change.path);
    match change.kind {
        FileChangeKind::Remove => {
            graph.remove_module(&path);
        }
        FileChangeKind::Create | FileChangeKind::Modify => {
            if let Ok(source) = std::fs::read_to_string(&path) {
                let deps = crate::deps::scanner::scan_local_dependencies(&source, &path);
                graph.update_module(&path, deps);
            }
        }
    }
}

/// Determine which test files need to be re-run after a file change.
///
/// - If the changed file is itself a test file, re-run only that file.
/// - If the changed file is a source file, re-run all test files that
///   transitively depend on it (via the module graph). If no graph info
///   is available, falls back to re-running all test files.
pub fn affected_test_files(
    changed_files: &[FileChange],
    all_test_files: &[PathBuf],
    graph: &ModuleGraph,
) -> Vec<PathBuf> {
    let test_file_set: HashSet<&PathBuf> = all_test_files.iter().collect();
    let mut affected: HashSet<PathBuf> = HashSet::new();
    let mut needs_full_rerun = false;

    for change in changed_files {
        if change.kind == FileChangeKind::Remove {
            // Deleted file — re-run all to catch broken imports
            needs_full_rerun = true;
            break;
        }

        if test_file_set.contains(&change.path) {
            // Changed file is a test file — re-run it
            affected.insert(change.path.clone());
        } else {
            // Source file changed — find test files that depend on it
            let dependents = graph.get_transitive_dependents(&change.path);
            let test_dependents: Vec<PathBuf> = dependents
                .into_iter()
                .filter(|p| test_file_set.contains(p))
                .collect();

            if test_dependents.is_empty() {
                // No graph info — fall back to full re-run
                needs_full_rerun = true;
                break;
            }
            affected.extend(test_dependents);
        }
    }

    if needs_full_rerun {
        return all_test_files.to_vec();
    }

    let mut result: Vec<PathBuf> = affected.into_iter().collect();
    result.sort();
    result
}

/// Check if a path corresponds to a test file.
///
/// Matches patterns recognized by the test runner:
/// - `*.test.{ts,tsx}`, `*.spec.{ts,tsx}`, `*.e2e.{ts,tsx}` — standard test suffixes
/// - `*.local.{ts,tsx}` — integration tests (per integration-test-safety rules)
/// - Files inside `__tests__/` directories
pub fn is_test_file(path: &Path) -> bool {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    if stem.ends_with(".test")
        || stem.ends_with(".spec")
        || stem.ends_with(".e2e")
        || stem.ends_with(".local")
    {
        return true;
    }
    path.components().any(|c| c.as_os_str() == "__tests__")
}

/// Run the test suite in watch mode.
///
/// 1. Run the full test suite initially.
/// 2. Start a file watcher on the project root.
/// 3. On file changes, determine affected test files and re-run them.
/// 4. Clear screen and show results between runs.
pub async fn run_watch_mode(config: TestRunConfig) -> Result<(), String> {
    let root_dir = config.root_dir.clone();
    let paths = config.paths.clone();
    let include = config.include.clone();
    let exclude = config.exclude.clone();
    let preload_paths: Vec<std::path::PathBuf> = config
        .preload
        .iter()
        .map(|p| {
            let path = std::path::PathBuf::from(p);
            if path.is_absolute() {
                path
            } else {
                config.root_dir.join(path)
            }
        })
        .collect();

    // Create shared in-memory source cache (disabled when --no-cache)
    let shared_source_cache = if config.no_cache {
        None
    } else {
        Some(Arc::new(
            crate::runtime::compile_cache::SharedSourceCache::new(),
        ))
    };

    // Create shared V8 bytecode cache (disabled when --no-cache)
    let v8_code_cache = if config.no_cache {
        None
    } else {
        Some(Arc::new(crate::runtime::compile_cache::V8CodeCache::new(
            true,
        )))
    };

    // Create shared resolution cache (always active — resolution is deterministic)
    let resolution_cache = Some(Arc::new(
        crate::runtime::compile_cache::SharedResolutionCache::new(),
    ));

    let exec_options = Arc::new(ExecuteOptions {
        filter: config.filter.clone(),
        timeout_ms: config.timeout_ms,
        coverage: false,
        preload: preload_paths,
        root_dir: Some(config.root_dir.clone()),
        no_cache: config.no_cache,
        shared_source_cache,
        v8_code_cache,
        resolution_cache,
    });

    // Initial run
    let all_test_files: Vec<PathBuf> = discover_test_files(
        &config.root_dir,
        &paths,
        &include,
        &exclude,
        DiscoveryMode::Unit,
    )
    .into_iter()
    .map(|p| canonicalize_or_same(&p))
    .collect();

    if all_test_files.is_empty() {
        eprintln!("\nNo test files found.\n");
        return Ok(());
    }

    // Run initial suite on a blocking thread to avoid nesting Tokio runtimes.
    // The executor creates its own tokio runtime per-file, which panics if
    // called from within an existing runtime. (#2110)
    let (initial_result, initial_output) =
        tokio::task::spawn_blocking(move || super::runner::run_tests(config))
            .await
            .expect("initial test run panicked");
    clear_screen();
    print!("{}", initial_output);
    print_watch_status(&initial_result);

    // Start file watcher
    let watcher_config = FileWatcherConfig {
        debounce_ms: 100,
        extensions: vec![
            ".ts".to_string(),
            ".tsx".to_string(),
            ".js".to_string(),
            ".jsx".to_string(),
        ],
        ignore_dirs: vec![
            "node_modules".to_string(),
            ".vertz".to_string(),
            "dist".to_string(),
        ],
    };

    let (_watcher, mut rx) = FileWatcher::start(&root_dir, watcher_config)
        .map_err(|e| format!("Failed to start file watcher: {}", e))?;

    let mut debouncer = Debouncer::new(100);
    let mut graph = ModuleGraph::new();

    // Seed the module graph by recursively scanning each test file's local
    // imports. Without this, `affected_test_files` always hits the
    // `dependents.is_empty()` fallback on the first change and re-runs the
    // full suite — defeating the whole point of per-file targeting. (#2765)
    let mut visited: HashSet<PathBuf> = HashSet::new();
    for test_file in &all_test_files {
        populate_graph_from_entry(test_file, &mut graph, &mut visited);
    }

    eprintln!("\nWatching for changes...\n");

    loop {
        tokio::select! {
            Some(change) = rx.recv() => {
                debouncer.add(change);
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(50)) => {
                if debouncer.is_ready() && debouncer.has_pending() {
                    // Canonicalize event paths so they align with the keys
                    // in `graph` and the entries in `current_test_files`
                    // (which are canonicalized below). On macOS fsevent
                    // emits canonical paths anyway, but on Linux inotify
                    // it doesn't — and walkdir never does. (#2765)
                    let changes: Vec<FileChange> = debouncer
                        .drain()
                        .into_iter()
                        .map(|c| FileChange {
                            kind: c.kind,
                            path: canonicalize_or_same(&c.path),
                        })
                        .collect();

                    // Re-discover test files (new files may have been added)
                    let current_test_files: Vec<PathBuf> = discover_test_files(
                        &root_dir,
                        &paths,
                        &include,
                        &exclude,
                        DiscoveryMode::Unit,
                    )
                    .into_iter()
                    .map(|p| canonicalize_or_same(&p))
                    .collect();

                    // Keep the module graph in sync with the filesystem before
                    // computing the affected set, so renamed imports and
                    // deletions don't leave ghost edges. (#2765 / #2764)
                    for change in &changes {
                        update_graph_for_change(change, &mut graph);
                    }
                    // Seed newly discovered test files so their deps become
                    // part of the graph on the very next change.
                    for test_file in &current_test_files {
                        populate_graph_from_entry(test_file, &mut graph, &mut visited);
                    }

                    let files_to_run = affected_test_files(&changes, &current_test_files, &graph);

                    if files_to_run.is_empty() {
                        continue;
                    }

                    // Clear shared caches to avoid serving stale compiled
                    // output after source files change.
                    if let Some(ref cache) = exec_options.shared_source_cache {
                        cache.clear();
                    }
                    if let Some(ref cache) = exec_options.v8_code_cache {
                        cache.clear();
                    }
                    if let Some(ref cache) = exec_options.resolution_cache {
                        cache.clear();
                    }

                    // Execute affected test files on blocking threads to avoid
                    // nesting Tokio runtimes (executor creates its own). (#2110)
                    let wall_clock_start = std::time::Instant::now();

                    let mut handles = Vec::new();
                    for file in &files_to_run {
                        let file = file.clone();
                        let opts = exec_options.clone();
                        handles.push(tokio::task::spawn_blocking(move || {
                            execute_test_file_with_options(&file, &opts)
                        }));
                    }
                    let mut results = Vec::new();
                    for handle in handles {
                        results.push(handle.await.expect("test execution thread panicked"));
                    }

                    let wall_clock_ms =
                        wall_clock_start.elapsed().as_secs_f64() * 1000.0;

                    // Build summary
                    let total_passed: usize = results.iter().map(|r| r.passed()).sum();
                    let total_failed: usize = results.iter().map(|r| r.failed()).sum();
                    let total_skipped: usize = results.iter().map(|r| r.skipped()).sum();
                    let total_todo: usize = results.iter().map(|r| r.todo()).sum();
                    let file_errors: usize = results.iter().filter(|r| r.file_error.is_some()).count();

                    let run_result = TestRunResult {
                        total_files: results.len(),
                        total_passed,
                        total_failed,
                        total_skipped,
                        total_todo,
                        file_errors,
                        results,
                        coverage_failed: false,
                        coverage_report: None,
                        wall_clock_ms,
                    };

                    clear_screen();
                    let output = format_results_with_wall_clock(
                        &run_result.results,
                        Some(run_result.wall_clock_ms),
                    );
                    print!("{}", output);
                    print_watch_status(&run_result);
                    eprintln!("\nWatching for changes...\n");
                }
            }
            // Channel closed (shutdown) — exit the watch loop.
            else => break Ok(()),
        }
    }
}

fn clear_screen() {
    // ANSI escape: clear screen + move cursor to top-left
    print!("\x1B[2J\x1B[H");
}

fn print_watch_status(result: &TestRunResult) {
    if result.success() {
        eprintln!("\n\x1B[32m✓ All tests passed\x1B[0m");
    } else {
        eprintln!(
            "\n\x1B[31m✗ {} failed\x1B[0m",
            result.total_failed + result.file_errors
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_change(path: &str, kind: FileChangeKind) -> FileChange {
        FileChange {
            kind,
            path: PathBuf::from(path),
        }
    }

    #[test]
    fn test_is_test_file_ts() {
        assert!(is_test_file(Path::new("/src/math.test.ts")));
    }

    #[test]
    fn test_is_test_file_tsx() {
        assert!(is_test_file(Path::new("/src/Card.test.tsx")));
    }

    #[test]
    fn test_is_test_file_spec() {
        assert!(is_test_file(Path::new("/src/utils.spec.ts")));
        assert!(is_test_file(Path::new("/src/Card.spec.tsx")));
    }

    #[test]
    fn test_is_test_file_e2e() {
        assert!(is_test_file(Path::new("/src/login.e2e.ts")));
        assert!(is_test_file(Path::new("/src/login.e2e.tsx")));
    }

    #[test]
    fn test_is_test_file_local() {
        assert!(is_test_file(Path::new("/src/server.local.ts")));
    }

    #[test]
    fn test_is_test_file_dunder_tests() {
        assert!(is_test_file(Path::new("/src/__tests__/utils.ts")));
        assert!(is_test_file(Path::new("/src/__tests__/nested/deep.ts")));
    }

    #[test]
    fn test_is_not_test_file() {
        assert!(!is_test_file(Path::new("/src/utils.ts")));
        assert!(!is_test_file(Path::new("/src/Component.tsx")));
        assert!(!is_test_file(Path::new("/src/testing/helpers.ts")));
    }

    #[test]
    fn test_affected_test_file_changed_directly() {
        let graph = ModuleGraph::new();
        let all_tests = vec![
            PathBuf::from("/src/a.test.ts"),
            PathBuf::from("/src/b.test.ts"),
        ];

        let changes = vec![make_change("/src/a.test.ts", FileChangeKind::Modify)];
        let affected = affected_test_files(&changes, &all_tests, &graph);

        assert_eq!(affected, vec![PathBuf::from("/src/a.test.ts")]);
    }

    #[test]
    fn test_affected_source_file_no_graph_reruns_all() {
        let graph = ModuleGraph::new();
        let all_tests = vec![
            PathBuf::from("/src/a.test.ts"),
            PathBuf::from("/src/b.test.ts"),
        ];

        // Source file changed, not in graph → full re-run
        let changes = vec![make_change("/src/utils.ts", FileChangeKind::Modify)];
        let affected = affected_test_files(&changes, &all_tests, &graph);

        assert_eq!(affected.len(), 2);
    }

    #[test]
    fn test_affected_source_file_with_graph_targets() {
        let mut graph = ModuleGraph::new();
        // a.test.ts imports utils.ts
        graph.update_module(
            Path::new("/src/a.test.ts"),
            vec![PathBuf::from("/src/utils.ts")],
        );
        // b.test.ts imports other.ts (not utils.ts)
        graph.update_module(
            Path::new("/src/b.test.ts"),
            vec![PathBuf::from("/src/other.ts")],
        );

        let all_tests = vec![
            PathBuf::from("/src/a.test.ts"),
            PathBuf::from("/src/b.test.ts"),
        ];

        let changes = vec![make_change("/src/utils.ts", FileChangeKind::Modify)];
        let affected = affected_test_files(&changes, &all_tests, &graph);

        // Only a.test.ts depends on utils.ts
        assert_eq!(affected, vec![PathBuf::from("/src/a.test.ts")]);
    }

    #[test]
    fn test_affected_transitive_dependency() {
        let mut graph = ModuleGraph::new();
        // a.test.ts → helper.ts → utils.ts
        graph.update_module(
            Path::new("/src/a.test.ts"),
            vec![PathBuf::from("/src/helper.ts")],
        );
        graph.update_module(
            Path::new("/src/helper.ts"),
            vec![PathBuf::from("/src/utils.ts")],
        );

        let all_tests = vec![PathBuf::from("/src/a.test.ts")];

        let changes = vec![make_change("/src/utils.ts", FileChangeKind::Modify)];
        let affected = affected_test_files(&changes, &all_tests, &graph);

        assert_eq!(affected, vec![PathBuf::from("/src/a.test.ts")]);
    }

    #[test]
    fn test_affected_deleted_file_reruns_all() {
        let graph = ModuleGraph::new();
        let all_tests = vec![
            PathBuf::from("/src/a.test.ts"),
            PathBuf::from("/src/b.test.ts"),
        ];

        let changes = vec![make_change("/src/utils.ts", FileChangeKind::Remove)];
        let affected = affected_test_files(&changes, &all_tests, &graph);

        assert_eq!(affected.len(), 2);
    }

    #[test]
    fn test_affected_multiple_changes() {
        let graph = ModuleGraph::new();
        let all_tests = vec![
            PathBuf::from("/src/a.test.ts"),
            PathBuf::from("/src/b.test.ts"),
            PathBuf::from("/src/c.test.ts"),
        ];

        let changes = vec![
            make_change("/src/a.test.ts", FileChangeKind::Modify),
            make_change("/src/b.test.ts", FileChangeKind::Modify),
        ];
        let affected = affected_test_files(&changes, &all_tests, &graph);

        assert_eq!(affected.len(), 2);
        assert!(affected.contains(&PathBuf::from("/src/a.test.ts")));
        assert!(affected.contains(&PathBuf::from("/src/b.test.ts")));
    }

    /// Proves the bug from #2110: calling execute_test_file_with_options
    /// directly from within an async context panics because the executor
    /// creates a nested Tokio runtime.
    #[tokio::test]
    #[should_panic(expected = "Cannot start a runtime from within a runtime")]
    async fn test_execute_from_async_context_panics_without_spawn_blocking() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("basic.test.ts");
        std::fs::write(
            &file_path,
            r#"
            describe('basic', () => {
                it('passes', () => { expect(1).toBe(1); });
            });
            "#,
        )
        .unwrap();

        // This panics — the executor creates its own tokio runtime internally.
        execute_test_file_with_options(&file_path, &ExecuteOptions::default());
    }

    /// Regression test for #2110: wrapping in spawn_blocking prevents the
    /// nested runtime panic, which is what the watch mode fix does.
    #[tokio::test]
    async fn test_execute_single_file_from_async_context_with_spawn_blocking() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("basic.test.ts");
        std::fs::write(
            &file_path,
            r#"
            describe('basic', () => {
                it('passes', () => { expect(1).toBe(1); });
            });
            "#,
        )
        .unwrap();

        let opts = Arc::new(ExecuteOptions::default());
        let path = file_path.clone();
        let result =
            tokio::task::spawn_blocking(move || execute_test_file_with_options(&path, &opts))
                .await
                .expect("spawn_blocking panicked");

        assert!(
            result.file_error.is_none(),
            "File error: {:?}",
            result.file_error
        );
        assert_eq!(result.passed(), 1);
    }

    #[test]
    fn test_affected_deduplicates() {
        let mut graph = ModuleGraph::new();
        // a.test.ts imports both utils.ts and helper.ts
        graph.update_module(
            Path::new("/src/a.test.ts"),
            vec![
                PathBuf::from("/src/utils.ts"),
                PathBuf::from("/src/helper.ts"),
            ],
        );

        let all_tests = vec![PathBuf::from("/src/a.test.ts")];

        // Both utils.ts and helper.ts changed → a.test.ts should appear once
        let changes = vec![
            make_change("/src/utils.ts", FileChangeKind::Modify),
            make_change("/src/helper.ts", FileChangeKind::Modify),
        ];
        let affected = affected_test_files(&changes, &all_tests, &graph);

        assert_eq!(affected.len(), 1);
        assert_eq!(affected[0], PathBuf::from("/src/a.test.ts"));
    }

    #[test]
    fn test_populate_graph_from_entry_records_direct_and_transitive_deps() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        let utils_path = root.join("utils.ts");
        std::fs::write(&utils_path, "export const x = 1;\n").unwrap();

        let helper_path = root.join("helper.ts");
        std::fs::write(
            &helper_path,
            "import { x } from './utils';\nexport const y = x;\n",
        )
        .unwrap();

        let test_path = root.join("a.test.ts");
        std::fs::write(&test_path, "import { y } from './helper';\n").unwrap();

        let canonical_test = test_path.canonicalize().unwrap();
        let canonical_helper = helper_path.canonicalize().unwrap();
        let canonical_utils = utils_path.canonicalize().unwrap();

        let mut graph = ModuleGraph::new();
        let mut visited = HashSet::new();
        populate_graph_from_entry(&test_path, &mut graph, &mut visited);

        // Direct edge: test → helper
        assert!(graph
            .get_dependencies(&canonical_test)
            .contains(&canonical_helper));
        // Transitive edge: helper → utils (recorded because we recurse)
        assert!(graph
            .get_dependencies(&canonical_helper)
            .contains(&canonical_utils));
        // Reverse: changing utils must reach the test file through transitive dependents
        let transitive = graph.get_transitive_dependents(&canonical_utils);
        assert!(transitive.contains(&canonical_test));
    }

    #[test]
    fn test_update_graph_for_change_modify_scans_and_updates_edges() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        let dep_path = root.join("dep.ts");
        std::fs::write(&dep_path, "export const x = 1;\n").unwrap();
        let file_path = root.join("src.ts");
        std::fs::write(&file_path, "import { x } from './dep';\n").unwrap();

        let canonical_file = file_path.canonicalize().unwrap();
        let canonical_dep = dep_path.canonicalize().unwrap();

        let mut graph = ModuleGraph::new();
        let change = FileChange {
            kind: FileChangeKind::Modify,
            path: canonical_file.clone(),
        };
        update_graph_for_change(&change, &mut graph);

        assert!(graph
            .get_dependencies(&canonical_file)
            .contains(&canonical_dep));
        assert!(graph
            .get_dependents(&canonical_dep)
            .contains(&canonical_file));
    }

    #[test]
    fn test_update_graph_for_change_remove_cleans_ghost_entries() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        let dep_path = root.join("dep.ts");
        std::fs::write(&dep_path, "export const x = 1;\n").unwrap();
        let file_path = root.join("src.ts");
        std::fs::write(&file_path, "import { x } from './dep';\n").unwrap();

        let canonical_file = file_path.canonicalize().unwrap();
        let canonical_dep = dep_path.canonicalize().unwrap();

        let mut graph = ModuleGraph::new();
        let mut visited = HashSet::new();
        populate_graph_from_entry(&file_path, &mut graph, &mut visited);
        assert!(graph.has_module(&canonical_file));

        let change = FileChange {
            kind: FileChangeKind::Remove,
            path: canonical_file.clone(),
        };
        update_graph_for_change(&change, &mut graph);

        assert!(
            !graph.has_module(&canonical_file),
            "removed file must not leave a ghost node"
        );
        assert!(
            !graph
                .get_dependents(&canonical_dep)
                .contains(&canonical_file),
            "reverse edge from dep → removed file must be cleaned"
        );
    }

    /// Regression: `populate_graph_from_entry` and `update_graph_for_change`
    /// used to canonicalize asymmetrically — the seed normalized paths while
    /// the per-change update didn't — so projects under a symlinked root
    /// (macOS `/tmp` → `/private/tmp`, symlinked deps folders, etc.) would
    /// store canonical paths in the graph but receive non-canonical keys
    /// from `affected_test_files`, silently regressing to full reruns.
    ///
    /// Both code paths now route every path through `canonicalize_or_same`.
    /// This test proves that a test file reached through a symlink resolves
    /// to the same graph key as one reached through its realpath, so a
    /// change event on either path finds the seeded edges.
    #[cfg(unix)]
    #[test]
    fn test_canonicalization_consistent_across_symlinked_roots() {
        use std::os::unix::fs::symlink;

        let tmp = tempfile::tempdir().unwrap();
        let real_root = tmp.path().join("real");
        std::fs::create_dir(&real_root).unwrap();

        let real_test_path = real_root.join("a.test.ts");
        std::fs::write(&real_test_path, "import { x } from './dep';\n").unwrap();
        let real_dep_path = real_root.join("dep.ts");
        std::fs::write(&real_dep_path, "export const x = 1;\n").unwrap();

        let alias_root = tmp.path().join("alias");
        symlink(&real_root, &alias_root).unwrap();
        let alias_test_path = alias_root.join("a.test.ts");
        let alias_dep_path = alias_root.join("dep.ts");

        // Seed via the symlinked path; the helper must normalize.
        let mut graph = ModuleGraph::new();
        let mut visited = HashSet::new();
        populate_graph_from_entry(&alias_test_path, &mut graph, &mut visited);

        // A Modify event arriving through the realpath must hit the same
        // graph node the seed created, not a parallel ghost.
        let canonical_test = canonicalize_or_same(&real_test_path);
        let canonical_dep = canonicalize_or_same(&real_dep_path);
        let canonical_alias_dep = canonicalize_or_same(&alias_dep_path);
        assert_eq!(canonical_dep, canonical_alias_dep);
        assert!(graph
            .get_dependencies(&canonical_test)
            .contains(&canonical_dep));

        // And `affected_test_files` must return the test when the change
        // event is expressed through either alias, once callers route it
        // through `canonicalize_or_same` (as `run_watch_mode` does).
        let alias_change = FileChange {
            kind: FileChangeKind::Modify,
            path: canonicalize_or_same(&alias_dep_path),
        };
        let all_tests = vec![canonicalize_or_same(&alias_test_path)];
        let affected = affected_test_files(&[alias_change], &all_tests, &graph);
        assert_eq!(
            affected,
            vec![canonical_test.clone()],
            "change reached through the symlink must map to the same test file"
        );
    }
}
