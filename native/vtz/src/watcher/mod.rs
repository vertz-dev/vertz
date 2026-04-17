pub mod backpressure;
pub mod dep_watcher;
pub mod file_watcher;
pub mod module_graph;

use crate::compiler::cache::CompilationCache;
use file_watcher::{FileChange, FileChangeKind};
use module_graph::ModuleGraph;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

/// Result of processing a file change event.
#[derive(Debug, Clone)]
pub struct InvalidationResult {
    /// The file that was changed.
    pub changed_file: PathBuf,
    /// The type of change.
    pub change_kind: FileChangeKind,
    /// All files that were invalidated (including transitive dependents).
    pub invalidated_files: Vec<PathBuf>,
    /// Whether this is the entry file (requires full reload).
    pub is_entry_file: bool,
    /// Whether this is a CSS-only change.
    pub is_css_only: bool,
}

/// Shared module graph, thread-safe for concurrent access.
pub type SharedModuleGraph = Arc<RwLock<ModuleGraph>>;

/// Create a new shared module graph.
pub fn new_shared_module_graph() -> SharedModuleGraph {
    Arc::new(RwLock::new(ModuleGraph::new()))
}

/// Process a file change: invalidate caches and determine affected modules.
///
/// This is the core invalidation cascade:
/// 1. Invalidate the changed file in the compilation cache
/// 2. Walk the module graph upward to find all transitive dependents
/// 3. Invalidate all transitive dependents in the compilation cache
/// 4. Return the set of affected modules for HMR notification
pub fn process_file_change(
    change: &FileChange,
    cache: &CompilationCache,
    graph: &SharedModuleGraph,
    entry_file: &Path,
) -> InvalidationResult {
    let is_entry_file = change.path == entry_file;
    let is_remove = matches!(change.kind, FileChangeKind::Remove);

    // Snapshot dependents and (for Remove) clean up the graph under a single
    // write lock so a concurrent module_server fetch can't add a dependent
    // between the read and write phases.
    let (invalidated_files, is_css_only) = {
        let mut g = graph.write().unwrap();

        // A CSS file is "CSS-only" if it has no JS dependents in the module
        // graph. When a CSS file is imported by JS (`import './styles.css'`),
        // it's served as a JS module — so changes should trigger a module
        // update, not a CSS update. A deleted CSS file is never CSS-only:
        // re-fetching the URL would 404, so we must escalate to a module
        // update / full reload.
        let is_css = change
            .path
            .extension()
            .map(|ext| ext == "css")
            .unwrap_or(false);
        let is_css_only = is_css && !is_remove && g.get_dependents(&change.path).is_empty();

        let invalidated: Vec<PathBuf> = g
            .get_transitive_dependents(&change.path)
            .into_iter()
            .collect();

        if is_remove {
            g.remove_module(&change.path);
        }

        (invalidated, is_css_only)
    };

    // Invalidate all affected files in the compilation cache
    for file in &invalidated_files {
        cache.invalidate(file);
    }

    // If the changed file is new (not in graph yet), just invalidate it
    if invalidated_files.is_empty() {
        cache.invalidate(&change.path);
    }

    InvalidationResult {
        changed_file: change.path.clone(),
        change_kind: change.kind,
        invalidated_files,
        is_entry_file,
        is_css_only,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compiler::cache::CachedModule;
    use std::time::SystemTime;

    fn make_cached_module(code: &str) -> CachedModule {
        CachedModule {
            code: code.to_string(),
            source_map: None,
            css: None,
            mtime: SystemTime::UNIX_EPOCH,
        }
    }

    #[test]
    fn test_process_file_change_invalidates_changed_file() {
        let cache = CompilationCache::new();
        let graph = new_shared_module_graph();
        let entry = PathBuf::from("/src/app.tsx");

        // Populate cache
        cache.insert(PathBuf::from("/src/utils.ts"), make_cached_module("utils"));

        // Add to graph
        {
            let mut g = graph.write().unwrap();
            g.update_module(
                Path::new("/src/app.tsx"),
                vec![PathBuf::from("/src/utils.ts")],
            );
        }

        let change = FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/utils.ts"),
        };

        let result = process_file_change(&change, &cache, &graph, &entry);

        assert_eq!(result.changed_file, PathBuf::from("/src/utils.ts"));
        assert!(!result.is_entry_file);
        assert!(!result.is_css_only);
        // utils.ts and app.tsx should be invalidated
        assert!(result
            .invalidated_files
            .contains(&PathBuf::from("/src/utils.ts")));
        assert!(result
            .invalidated_files
            .contains(&PathBuf::from("/src/app.tsx")));
    }

    #[test]
    fn test_process_file_change_transitive_invalidation() {
        let cache = CompilationCache::new();
        let graph = new_shared_module_graph();
        let entry = PathBuf::from("/src/app.tsx");

        // Build graph: app -> page -> Button
        {
            let mut g = graph.write().unwrap();
            g.update_module(
                Path::new("/src/app.tsx"),
                vec![PathBuf::from("/src/page.tsx")],
            );
            g.update_module(
                Path::new("/src/page.tsx"),
                vec![PathBuf::from("/src/Button.tsx")],
            );
        }

        // Populate cache
        cache.insert(PathBuf::from("/src/Button.tsx"), make_cached_module("btn"));
        cache.insert(PathBuf::from("/src/page.tsx"), make_cached_module("page"));
        cache.insert(PathBuf::from("/src/app.tsx"), make_cached_module("app"));

        let change = FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/Button.tsx"),
        };

        let result = process_file_change(&change, &cache, &graph, &entry);

        // All three files should be invalidated
        assert_eq!(result.invalidated_files.len(), 3);
        assert!(result
            .invalidated_files
            .contains(&PathBuf::from("/src/Button.tsx")));
        assert!(result
            .invalidated_files
            .contains(&PathBuf::from("/src/page.tsx")));
        assert!(result
            .invalidated_files
            .contains(&PathBuf::from("/src/app.tsx")));
    }

    #[test]
    fn test_process_file_change_entry_file() {
        let cache = CompilationCache::new();
        let graph = new_shared_module_graph();
        let entry = PathBuf::from("/src/app.tsx");

        {
            let mut g = graph.write().unwrap();
            g.update_module(Path::new("/src/app.tsx"), vec![]);
        }

        let change = FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        };

        let result = process_file_change(&change, &cache, &graph, &entry);
        assert!(result.is_entry_file);
    }

    #[test]
    fn test_process_file_change_css_only_standalone() {
        let cache = CompilationCache::new();
        let graph = new_shared_module_graph();
        let entry = PathBuf::from("/src/app.tsx");

        let change = FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/styles.css"),
        };

        let result = process_file_change(&change, &cache, &graph, &entry);
        // A CSS file with no JS dependents is CSS-only
        assert!(result.is_css_only);
    }

    #[test]
    fn test_process_file_change_css_imported_by_js_is_module_update() {
        let cache = CompilationCache::new();
        let graph = new_shared_module_graph();
        let entry = PathBuf::from("/src/app.tsx");

        // app.tsx imports styles.css
        {
            let mut g = graph.write().unwrap();
            g.update_module(
                Path::new("/src/app.tsx"),
                vec![PathBuf::from("/src/styles.css")],
            );
        }

        let change = FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/styles.css"),
        };

        let result = process_file_change(&change, &cache, &graph, &entry);
        // CSS file imported by JS should NOT be css_only — it should trigger
        // a module update so the JS wrapper is re-imported
        assert!(
            !result.is_css_only,
            "CSS imported by JS should be a module update, not CSS-only"
        );
        // The invalidated files should include the CSS file and its JS dependents
        assert!(result
            .invalidated_files
            .contains(&PathBuf::from("/src/styles.css")));
        assert!(result
            .invalidated_files
            .contains(&PathBuf::from("/src/app.tsx")));
    }

    #[test]
    fn test_process_file_change_unrelated_files_not_invalidated() {
        let cache = CompilationCache::new();
        let graph = new_shared_module_graph();
        let entry = PathBuf::from("/src/app.tsx");

        // Build graph: app -> Button, page -> Input (separate chains)
        {
            let mut g = graph.write().unwrap();
            g.update_module(
                Path::new("/src/app.tsx"),
                vec![PathBuf::from("/src/Button.tsx")],
            );
            g.update_module(
                Path::new("/src/page.tsx"),
                vec![PathBuf::from("/src/Input.tsx")],
            );
        }

        cache.insert(PathBuf::from("/src/page.tsx"), make_cached_module("page"));

        let change = FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/Button.tsx"),
        };

        let result = process_file_change(&change, &cache, &graph, &entry);

        // page.tsx and Input.tsx should NOT be in the invalidated list
        assert!(!result
            .invalidated_files
            .contains(&PathBuf::from("/src/page.tsx")));
        assert!(!result
            .invalidated_files
            .contains(&PathBuf::from("/src/Input.tsx")));
    }

    #[test]
    fn test_process_file_change_remove_cleans_graph_and_invalidates_dependents() {
        let cache = CompilationCache::new();
        let graph = new_shared_module_graph();
        let entry = PathBuf::from("/src/app.tsx");

        // app depends on utils
        {
            let mut g = graph.write().unwrap();
            g.update_module(
                Path::new("/src/app.tsx"),
                vec![PathBuf::from("/src/utils.ts")],
            );
        }
        cache.insert(PathBuf::from("/src/utils.ts"), make_cached_module("utils"));
        cache.insert(PathBuf::from("/src/app.tsx"), make_cached_module("app"));

        let change = FileChange {
            kind: FileChangeKind::Remove,
            path: PathBuf::from("/src/utils.ts"),
        };

        let result = process_file_change(&change, &cache, &graph, &entry);

        // Deleted file must be gone from the graph
        {
            let g = graph.read().unwrap();
            assert!(
                !g.has_module(Path::new("/src/utils.ts")),
                "deleted module must be removed from graph"
            );
            // app should no longer reference utils as a dependency
            let app_deps = g.get_dependencies(Path::new("/src/app.tsx"));
            assert!(
                !app_deps.contains(&PathBuf::from("/src/utils.ts")),
                "reverse edges must be cleaned on remove"
            );
        }

        // Dependents must be in the invalidation result so HMR can notify them
        assert!(
            result
                .invalidated_files
                .contains(&PathBuf::from("/src/app.tsx")),
            "dependents must be invalidated on remove"
        );

        // Cache must not retain stale entries for the deleted file or its dependents
        assert!(
            cache.get_unchecked(Path::new("/src/utils.ts")).is_none(),
            "cache entry for deleted file must be removed"
        );
        assert!(
            cache.get_unchecked(Path::new("/src/app.tsx")).is_none(),
            "cache entry for dependent must be invalidated"
        );
    }

    #[test]
    fn test_process_file_change_standalone_css_delete_is_not_css_only() {
        // A standalone CSS file with no JS dependents would normally be treated
        // as CSS-only (HMR re-fetches the stylesheet URL). On delete, that URL
        // 404s — so Remove events must escalate past CssUpdate.
        let cache = CompilationCache::new();
        let graph = new_shared_module_graph();
        let entry = PathBuf::from("/src/app.tsx");

        let change = FileChange {
            kind: FileChangeKind::Remove,
            path: PathBuf::from("/src/styles.css"),
        };

        let result = process_file_change(&change, &cache, &graph, &entry);
        assert!(
            !result.is_css_only,
            "deleted CSS file must not be treated as css_only (would 404 on re-fetch)"
        );
    }

    #[test]
    fn test_process_file_change_new_file_not_in_graph() {
        let cache = CompilationCache::new();
        let graph = new_shared_module_graph();
        let entry = PathBuf::from("/src/app.tsx");

        let change = FileChange {
            kind: FileChangeKind::Create,
            path: PathBuf::from("/src/NewComponent.tsx"),
        };

        let result = process_file_change(&change, &cache, &graph, &entry);

        // New file not in graph — only the changed file itself is in the list
        assert_eq!(result.invalidated_files.len(), 1);
        assert!(result
            .invalidated_files
            .contains(&PathBuf::from("/src/NewComponent.tsx")));
    }
}
