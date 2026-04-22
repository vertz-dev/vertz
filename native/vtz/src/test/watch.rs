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

/// Recursively scan a file's local imports and record every discovered edge
/// in the module graph. Used to seed the graph before the watch loop starts,
/// so a later change to a source file deep in the import tree maps back to
/// the test file(s) that transitively depend on it.
///
/// Paths are canonicalized to match the paths that `FileChange` events carry
/// (which come from the OS watcher and are already canonicalized).
pub(crate) fn populate_graph_from_entry(
    entry_path: &Path,
    graph: &mut ModuleGraph,
    visited: &mut HashSet<PathBuf>,
) {
    let canonical = match entry_path.canonicalize() {
        Ok(p) => p,
        Err(_) => return,
    };
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
pub(crate) fn update_graph_for_change(change: &FileChange, graph: &mut ModuleGraph) {
    match change.kind {
        FileChangeKind::Remove => {
            graph.remove_module(&change.path);
        }
        FileChangeKind::Create | FileChangeKind::Modify => {
            if let Ok(source) = std::fs::read_to_string(&change.path) {
                let deps = crate::deps::scanner::scan_local_dependencies(&source, &change.path);
                graph.update_module(&change.path, deps);
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
    let all_test_files = discover_test_files(
        &config.root_dir,
        &paths,
        &include,
        &exclude,
        DiscoveryMode::Unit,
    );

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
                    let changes = debouncer.drain();

                    // Re-discover test files (new files may have been added)
                    let current_test_files = discover_test_files(
                        &root_dir,
                        &paths,
                        &include,
                        &exclude,
                        DiscoveryMode::Unit,
                    );

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
}
