use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};

/// A node in the module dependency graph.
#[derive(Debug, Clone, Default)]
pub struct ModuleNode {
    /// Modules that this module imports (outgoing edges).
    pub dependencies: HashSet<PathBuf>,
    /// Modules that import this module (incoming edges).
    pub dependents: HashSet<PathBuf>,
}

/// Directed graph of module dependencies.
///
/// Tracks both forward (dependencies) and reverse (dependents) edges.
/// Used for cache invalidation cascades: when a file changes, all
/// transitive dependents must be invalidated.
#[derive(Debug, Clone, Default)]
pub struct ModuleGraph {
    nodes: HashMap<PathBuf, ModuleNode>,
}

impl ModuleGraph {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
        }
    }

    /// Update the graph for a module after (re)compilation.
    ///
    /// Replaces the module's dependency edges with the new set of imports.
    /// Also updates the reverse (dependent) edges on all affected modules.
    pub fn update_module(&mut self, module_path: &Path, new_dependencies: Vec<PathBuf>) {
        let module_path = module_path.to_path_buf();

        // Remove old dependency edges
        if let Some(old_node) = self.nodes.get(&module_path) {
            let old_deps: Vec<PathBuf> = old_node.dependencies.iter().cloned().collect();
            for old_dep in &old_deps {
                if let Some(dep_node) = self.nodes.get_mut(old_dep) {
                    dep_node.dependents.remove(&module_path);
                }
            }
        }

        // Ensure the module has a node
        let node = self.nodes.entry(module_path.clone()).or_default();
        node.dependencies.clear();

        // Add new dependency edges
        for dep in &new_dependencies {
            node.dependencies.insert(dep.clone());
        }

        // Add reverse edges (this module is a dependent of each dependency)
        for dep in &new_dependencies {
            let dep_node = self.nodes.entry(dep.clone()).or_default();
            dep_node.dependents.insert(module_path.clone());
        }
    }

    /// Remove a module from the graph entirely.
    pub fn remove_module(&mut self, module_path: &Path) {
        if let Some(node) = self.nodes.remove(module_path) {
            // Remove this module from its dependencies' dependent lists
            for dep in &node.dependencies {
                if let Some(dep_node) = self.nodes.get_mut(dep) {
                    dep_node.dependents.remove(module_path);
                }
            }
            // Remove this module from its dependents' dependency lists
            for dependent in &node.dependents {
                if let Some(dep_node) = self.nodes.get_mut(dependent) {
                    dep_node.dependencies.remove(module_path);
                }
            }
        }
    }

    /// Get the direct dependents of a module (modules that import it).
    pub fn get_dependents(&self, module_path: &Path) -> Vec<PathBuf> {
        self.nodes
            .get(module_path)
            .map(|n| n.dependents.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Get the direct dependencies of a module (modules it imports).
    pub fn get_dependencies(&self, module_path: &Path) -> Vec<PathBuf> {
        self.nodes
            .get(module_path)
            .map(|n| n.dependencies.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Get all transitive dependents of a module (BFS traversal up the graph).
    ///
    /// Returns the set of all modules that directly or transitively depend on
    /// the given module, including the module itself.
    pub fn get_transitive_dependents(&self, module_path: &Path) -> HashSet<PathBuf> {
        let mut visited = HashSet::new();
        let mut queue = VecDeque::new();

        visited.insert(module_path.to_path_buf());
        queue.push_back(module_path.to_path_buf());

        while let Some(current) = queue.pop_front() {
            if let Some(node) = self.nodes.get(&current) {
                for dependent in &node.dependents {
                    if visited.insert(dependent.clone()) {
                        queue.push_back(dependent.clone());
                    }
                }
            }
        }

        visited
    }

    /// Check if a module exists in the graph.
    pub fn has_module(&self, module_path: &Path) -> bool {
        self.nodes.contains_key(module_path)
    }

    /// Get the number of modules in the graph.
    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    /// Check if the graph is empty.
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_graph() {
        let graph = ModuleGraph::new();
        assert!(graph.is_empty());
        assert_eq!(graph.len(), 0);
        assert!(!graph.has_module(Path::new("/src/app.tsx")));
    }

    #[test]
    fn test_add_module_with_dependencies() {
        let mut graph = ModuleGraph::new();
        graph.update_module(
            Path::new("/src/app.tsx"),
            vec![PathBuf::from("/src/Button.tsx")],
        );

        assert!(graph.has_module(Path::new("/src/app.tsx")));
        assert!(graph.has_module(Path::new("/src/Button.tsx")));
        assert_eq!(graph.len(), 2);
    }

    #[test]
    fn test_get_dependents() {
        let mut graph = ModuleGraph::new();
        graph.update_module(
            Path::new("/src/app.tsx"),
            vec![PathBuf::from("/src/Button.tsx")],
        );

        let dependents = graph.get_dependents(Path::new("/src/Button.tsx"));
        assert_eq!(dependents.len(), 1);
        assert!(dependents.contains(&PathBuf::from("/src/app.tsx")));
    }

    #[test]
    fn test_get_dependencies() {
        let mut graph = ModuleGraph::new();
        graph.update_module(
            Path::new("/src/app.tsx"),
            vec![
                PathBuf::from("/src/Button.tsx"),
                PathBuf::from("/src/utils.ts"),
            ],
        );

        let deps = graph.get_dependencies(Path::new("/src/app.tsx"));
        assert_eq!(deps.len(), 2);
        assert!(deps.contains(&PathBuf::from("/src/Button.tsx")));
        assert!(deps.contains(&PathBuf::from("/src/utils.ts")));
    }

    #[test]
    fn test_multiple_dependents() {
        let mut graph = ModuleGraph::new();
        graph.update_module(
            Path::new("/src/app.tsx"),
            vec![PathBuf::from("/src/Button.tsx")],
        );
        graph.update_module(
            Path::new("/src/page.tsx"),
            vec![PathBuf::from("/src/Button.tsx")],
        );
        graph.update_module(
            Path::new("/src/form.tsx"),
            vec![PathBuf::from("/src/Button.tsx")],
        );

        let dependents = graph.get_dependents(Path::new("/src/Button.tsx"));
        assert_eq!(dependents.len(), 3);
    }

    #[test]
    fn test_update_module_replaces_old_deps() {
        let mut graph = ModuleGraph::new();

        // First compilation: app imports Button
        graph.update_module(
            Path::new("/src/app.tsx"),
            vec![PathBuf::from("/src/Button.tsx")],
        );

        // Second compilation: app now imports Input instead
        graph.update_module(
            Path::new("/src/app.tsx"),
            vec![PathBuf::from("/src/Input.tsx")],
        );

        // Button should no longer have app as dependent
        let button_deps = graph.get_dependents(Path::new("/src/Button.tsx"));
        assert!(button_deps.is_empty());

        // Input should have app as dependent
        let input_deps = graph.get_dependents(Path::new("/src/Input.tsx"));
        assert_eq!(input_deps.len(), 1);
        assert!(input_deps.contains(&PathBuf::from("/src/app.tsx")));
    }

    #[test]
    fn test_transitive_dependents() {
        let mut graph = ModuleGraph::new();

        // C imports nothing, B imports C, A imports B
        graph.update_module(Path::new("/src/C.tsx"), vec![]);
        graph.update_module(Path::new("/src/B.tsx"), vec![PathBuf::from("/src/C.tsx")]);
        graph.update_module(Path::new("/src/A.tsx"), vec![PathBuf::from("/src/B.tsx")]);

        // Changing C should invalidate A, B, and C
        let affected = graph.get_transitive_dependents(Path::new("/src/C.tsx"));
        assert_eq!(affected.len(), 3);
        assert!(affected.contains(&PathBuf::from("/src/A.tsx")));
        assert!(affected.contains(&PathBuf::from("/src/B.tsx")));
        assert!(affected.contains(&PathBuf::from("/src/C.tsx")));
    }

    #[test]
    fn test_transitive_dependents_no_unrelated() {
        let mut graph = ModuleGraph::new();

        graph.update_module(Path::new("/src/A.tsx"), vec![PathBuf::from("/src/B.tsx")]);
        graph.update_module(Path::new("/src/C.tsx"), vec![PathBuf::from("/src/D.tsx")]);

        // Changing B should only affect A and B, not C or D
        let affected = graph.get_transitive_dependents(Path::new("/src/B.tsx"));
        assert_eq!(affected.len(), 2);
        assert!(affected.contains(&PathBuf::from("/src/A.tsx")));
        assert!(affected.contains(&PathBuf::from("/src/B.tsx")));
        assert!(!affected.contains(&PathBuf::from("/src/C.tsx")));
    }

    #[test]
    fn test_circular_dependency_no_infinite_loop() {
        let mut graph = ModuleGraph::new();

        // A imports B, B imports A (circular)
        graph.update_module(Path::new("/src/A.tsx"), vec![PathBuf::from("/src/B.tsx")]);
        graph.update_module(Path::new("/src/B.tsx"), vec![PathBuf::from("/src/A.tsx")]);

        // Should terminate and return both
        let affected = graph.get_transitive_dependents(Path::new("/src/A.tsx"));
        assert_eq!(affected.len(), 2);
        assert!(affected.contains(&PathBuf::from("/src/A.tsx")));
        assert!(affected.contains(&PathBuf::from("/src/B.tsx")));
    }

    #[test]
    fn test_self_referential_no_infinite_loop() {
        let mut graph = ModuleGraph::new();

        // A imports A (self-reference — unusual but shouldn't crash)
        graph.update_module(Path::new("/src/A.tsx"), vec![PathBuf::from("/src/A.tsx")]);

        let affected = graph.get_transitive_dependents(Path::new("/src/A.tsx"));
        assert_eq!(affected.len(), 1);
        assert!(affected.contains(&PathBuf::from("/src/A.tsx")));
    }

    #[test]
    fn test_remove_module() {
        let mut graph = ModuleGraph::new();
        graph.update_module(
            Path::new("/src/app.tsx"),
            vec![PathBuf::from("/src/Button.tsx")],
        );

        graph.remove_module(Path::new("/src/Button.tsx"));
        assert!(!graph.has_module(Path::new("/src/Button.tsx")));

        // app should no longer have Button as a dependency
        let deps = graph.get_dependencies(Path::new("/src/app.tsx"));
        assert!(!deps.contains(&PathBuf::from("/src/Button.tsx")));
    }

    #[test]
    fn test_get_dependents_empty() {
        let graph = ModuleGraph::new();
        let deps = graph.get_dependents(Path::new("/nonexistent"));
        assert!(deps.is_empty());
    }

    #[test]
    fn test_diamond_dependency() {
        let mut graph = ModuleGraph::new();

        // Diamond: A->B, A->C, B->D, C->D
        graph.update_module(
            Path::new("/src/A.tsx"),
            vec![PathBuf::from("/src/B.tsx"), PathBuf::from("/src/C.tsx")],
        );
        graph.update_module(Path::new("/src/B.tsx"), vec![PathBuf::from("/src/D.tsx")]);
        graph.update_module(Path::new("/src/C.tsx"), vec![PathBuf::from("/src/D.tsx")]);

        // Changing D should affect A, B, C, D
        let affected = graph.get_transitive_dependents(Path::new("/src/D.tsx"));
        assert_eq!(affected.len(), 4);
    }
}
