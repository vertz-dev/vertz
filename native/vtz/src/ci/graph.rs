use crate::ci::types::{
    Dep, DepCondition, DepEdge, ResolvedWorkspace, TaskDef, TaskResult, TaskScope, TaskStatus,
    WorkflowConfig,
};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

// ---------------------------------------------------------------------------
// Graph node + edge types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TaskNode {
    pub task_name: String,
    pub package: Option<String>,
}

impl TaskNode {
    pub fn label(&self) -> String {
        match &self.package {
            Some(pkg) => format!("{} {}", self.task_name, pkg),
            None => self.task_name.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
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

// ---------------------------------------------------------------------------
// Task graph
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub struct TaskGraph {
    pub nodes: Vec<TaskNode>,
    /// (from_idx, to_idx, edge_type) — "from" must complete before "to" runs
    pub edges: Vec<(usize, usize, EdgeType)>,
    /// Forward adjacency: node_idx → [(dependent_idx, edge_type)]
    pub adjacency: Vec<Vec<(usize, EdgeType)>>,
    /// Reverse adjacency: node_idx → [(dependency_idx, edge_type)]
    pub reverse_adj: Vec<Vec<(usize, EdgeType)>>,
    /// Node index lookup by (task_name, package)
    node_index: HashMap<(String, Option<String>), usize>,
}

impl TaskGraph {
    /// Build a task graph from a workflow config, task definitions, and resolved workspace.
    ///
    /// `filter_packages` restricts package-scoped nodes to only the listed packages.
    /// When `None`, all packages in the workspace are included.
    pub fn build(
        workflow: &WorkflowConfig,
        tasks: &BTreeMap<String, TaskDef>,
        workspace: &ResolvedWorkspace,
        filter_packages: Option<&std::collections::BTreeSet<String>>,
    ) -> Result<Self, String> {
        let mut nodes = Vec::new();
        let mut node_index: HashMap<(String, Option<String>), usize> = HashMap::new();

        // Determine which packages to include
        let all_packages: std::collections::BTreeSet<String> =
            workspace.packages.keys().cloned().collect();
        let active_packages = filter_packages.unwrap_or(&all_packages);

        // 1. Create nodes for each task in the workflow's run list
        for task_name in &workflow.run {
            let task_def = tasks.get(task_name.as_str()).ok_or_else(|| {
                let available: Vec<&str> = tasks.keys().map(|s| s.as_str()).collect();
                format!(
                    "workflow references unknown task \"{task_name}\"\navailable tasks: {}",
                    available.join(", ")
                )
            })?;

            match task_def.base().scope {
                TaskScope::Root => {
                    let idx = nodes.len();
                    nodes.push(TaskNode {
                        task_name: task_name.clone(),
                        package: None,
                    });
                    node_index.insert((task_name.clone(), None), idx);
                }
                TaskScope::Package => {
                    for pkg_name in active_packages {
                        let idx = nodes.len();
                        nodes.push(TaskNode {
                            task_name: task_name.clone(),
                            package: Some(pkg_name.clone()),
                        });
                        node_index.insert((task_name.clone(), Some(pkg_name.clone())), idx);
                    }
                }
            }
        }

        // Also create nodes for tasks referenced in deps but not in workflow.run
        // (they need to exist so edges can point to them)
        let mut dep_tasks_to_add: Vec<String> = Vec::new();
        for task_name in &workflow.run {
            if let Some(task_def) = tasks.get(task_name.as_str()) {
                for dep in &task_def.base().deps {
                    let (dep_task, _) = parse_dep_name(dep);
                    if !workflow.run.contains(&dep_task) {
                        dep_tasks_to_add.push(dep_task);
                    }
                }
            }
        }

        for dep_task in &dep_tasks_to_add {
            if tasks.get(dep_task.as_str()).is_none() {
                continue; // will be caught during edge resolution
            }
            let task_def = &tasks[dep_task.as_str()];
            match task_def.base().scope {
                TaskScope::Root => {
                    let key = (dep_task.clone(), None);
                    if let std::collections::hash_map::Entry::Vacant(e) = node_index.entry(key) {
                        let idx = nodes.len();
                        nodes.push(TaskNode {
                            task_name: dep_task.clone(),
                            package: None,
                        });
                        e.insert(idx);
                    }
                }
                TaskScope::Package => {
                    for pkg_name in active_packages {
                        let key = (dep_task.clone(), Some(pkg_name.clone()));
                        if let std::collections::hash_map::Entry::Vacant(e) = node_index.entry(key)
                        {
                            let idx = nodes.len();
                            nodes.push(TaskNode {
                                task_name: dep_task.clone(),
                                package: Some(pkg_name.clone()),
                            });
                            e.insert(idx);
                        }
                    }
                }
            }
        }

        // 2. Create edges from dependency declarations
        let mut edges: Vec<(usize, usize, EdgeType)> = Vec::new();

        for task_name in &workflow.run {
            let task_def = match tasks.get(task_name.as_str()) {
                Some(t) => t,
                None => continue,
            };

            for dep in &task_def.base().deps {
                let (dep_task_name, is_topological) = parse_dep_name(dep);
                let edge_type = dep_edge_type(dep);

                // Validate the dep task exists
                if !tasks.contains_key(dep_task_name.as_str()) {
                    let available: Vec<&str> = tasks.keys().map(|s| s.as_str()).collect();
                    return Err(format!(
                        "task \"{}\" depends on unknown task \"{}\"\navailable tasks: {}",
                        task_name,
                        dep_task_name,
                        available.join(", ")
                    ));
                }

                // Root-scoped tasks can't use ^ (topological) deps
                if is_topological && task_def.base().scope == TaskScope::Root {
                    return Err(format!(
                        "root-scoped task \"{}\" cannot use topological dependency \"^{}\" \
                         (^ deps resolve through package dependency graph, which root tasks don't have)",
                        task_name, dep_task_name
                    ));
                }

                match task_def.base().scope {
                    TaskScope::Root => {
                        // Root task: dep is on the dep task's root node (or all its package nodes)
                        let dep_def = &tasks[dep_task_name.as_str()];
                        match dep_def.base().scope {
                            TaskScope::Root => {
                                if let (Some(&from), Some(&to)) = (
                                    node_index.get(&(dep_task_name.clone(), None)),
                                    node_index.get(&(task_name.clone(), None)),
                                ) {
                                    edges.push((from, to, edge_type.clone()));
                                }
                            }
                            TaskScope::Package => {
                                // Root depends on a package-scoped task → edge from each package node
                                let to = match node_index.get(&(task_name.clone(), None)) {
                                    Some(&idx) => idx,
                                    None => continue,
                                };
                                for pkg_name in workspace.packages.keys() {
                                    if let Some(&from) = node_index
                                        .get(&(dep_task_name.clone(), Some(pkg_name.clone())))
                                    {
                                        edges.push((from, to, edge_type.clone()));
                                    }
                                }
                            }
                        }
                    }
                    TaskScope::Package => {
                        if is_topological {
                            // ^dep: for each package P, edge from dep task in P's internal_deps
                            for pkg_name in workspace.packages.keys() {
                                let to = match node_index
                                    .get(&(task_name.clone(), Some(pkg_name.clone())))
                                {
                                    Some(&idx) => idx,
                                    None => continue,
                                };

                                let pkg = &workspace.packages[pkg_name];
                                for dep_pkg_name in &pkg.internal_deps {
                                    if let Some(&from) = node_index
                                        .get(&(dep_task_name.clone(), Some(dep_pkg_name.clone())))
                                    {
                                        edges.push((from, to, edge_type.clone()));
                                    }
                                }
                            }
                        } else {
                            // Same-package dep
                            let dep_def = &tasks[dep_task_name.as_str()];
                            match dep_def.base().scope {
                                TaskScope::Package => {
                                    // Package→Package within same package
                                    for pkg_name in workspace.packages.keys() {
                                        if let (Some(&from), Some(&to)) = (
                                            node_index.get(&(
                                                dep_task_name.clone(),
                                                Some(pkg_name.clone()),
                                            )),
                                            node_index
                                                .get(&(task_name.clone(), Some(pkg_name.clone()))),
                                        ) {
                                            edges.push((from, to, edge_type.clone()));
                                        }
                                    }
                                }
                                TaskScope::Root => {
                                    // Package depends on root-scoped → edge from root node
                                    let from = match node_index.get(&(dep_task_name.clone(), None))
                                    {
                                        Some(&idx) => idx,
                                        None => continue,
                                    };
                                    for pkg_name in workspace.packages.keys() {
                                        if let Some(&to) = node_index
                                            .get(&(task_name.clone(), Some(pkg_name.clone())))
                                        {
                                            edges.push((from, to, edge_type.clone()));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Build adjacency lists
        let n = nodes.len();
        let mut adjacency = vec![vec![]; n];
        let mut reverse_adj = vec![vec![]; n];

        for &(from, to, ref etype) in &edges {
            adjacency[from].push((to, etype.clone()));
            reverse_adj[to].push((from, etype.clone()));
        }

        let graph = TaskGraph {
            nodes,
            edges,
            adjacency,
            reverse_adj,
            node_index,
        };

        // 4. Validate no cycles (reuses topological_order)
        graph.topological_order()?;

        Ok(graph)
    }

    /// Return nodes in topological order (dependencies before dependents).
    /// Also serves as cycle detection: if the sort fails, a cycle exists.
    pub fn topological_order(&self) -> Result<Vec<usize>, String> {
        let n = self.nodes.len();
        let mut in_degree = vec![0usize; n];
        for edges in &self.adjacency {
            for &(to, _) in edges {
                in_degree[to] += 1;
            }
        }

        let mut queue: VecDeque<usize> = VecDeque::new();
        for (i, &deg) in in_degree.iter().enumerate() {
            if deg == 0 {
                queue.push_back(i);
            }
        }

        let mut order = Vec::with_capacity(n);
        while let Some(node) = queue.pop_front() {
            order.push(node);
            for &(to, _) in &self.adjacency[node] {
                in_degree[to] -= 1;
                if in_degree[to] == 0 {
                    queue.push_back(to);
                }
            }
        }

        if order.len() != n {
            // Cycle exists — find it for error reporting
            let cycle = self.find_cycle_path(&in_degree);
            return Err(format!(
                "circular dependency detected\n  {}",
                cycle.join(" → ")
            ));
        }

        Ok(order)
    }

    /// Look up a node index by (task_name, package).
    pub fn find_node(&self, task_name: &str, package: Option<&str>) -> Option<usize> {
        self.node_index
            .get(&(task_name.to_string(), package.map(String::from)))
            .copied()
    }

    /// Get the number of nodes.
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    /// Render the task graph as a Graphviz DOT string.
    pub fn to_dot(&self) -> String {
        let mut out = String::new();
        out.push_str("digraph tasks {\n");
        out.push_str("  rankdir=LR;\n");
        out.push_str("  node [shape=box, style=rounded];\n\n");

        // Track which nodes appear in edges
        let mut referenced = HashSet::new();

        for (from_idx, to_idx, edge_type) in &self.edges {
            referenced.insert(*from_idx);
            referenced.insert(*to_idx);
            let from_label = dot_escape(&self.nodes[*from_idx].label());
            let to_label = dot_escape(&self.nodes[*to_idx].label());
            let attrs = match edge_type {
                EdgeType::Default => String::new(),
                EdgeType::Success => " [label=\"success\"]".to_string(),
                EdgeType::Always => " [label=\"always\"]".to_string(),
                EdgeType::Failure => " [label=\"failure\"]".to_string(),
                EdgeType::Callback(id) => format!(" [label=\"callback({id})\"]"),
            };
            out.push_str(&format!("  \"{from_label}\" -> \"{to_label}\"{attrs};\n",));
        }

        // Emit isolated nodes (no incoming or outgoing edges)
        for (idx, node) in self.nodes.iter().enumerate() {
            if !referenced.contains(&idx) {
                out.push_str(&format!("  \"{}\";\n", dot_escape(&node.label())));
            }
        }

        out.push_str("}\n");
        out
    }

    /// Render the task graph as a human-readable text tree.
    pub fn to_text_tree(&self) -> String {
        let order = match self.topological_order() {
            Ok(o) => o,
            Err(e) => return format!("Error: {e}"),
        };

        // Find root nodes (no incoming edges)
        let mut has_parent = vec![false; self.nodes.len()];
        for (_, to, _) in &self.edges {
            has_parent[*to] = true;
        }

        let mut out = String::new();
        let visited = &mut vec![false; self.nodes.len()];

        // Print from root nodes in topological order
        for &idx in &order {
            if !has_parent[idx] && !visited[idx] {
                self.text_tree_dfs(idx, 0, visited, &mut out);
            }
        }

        out
    }

    fn text_tree_dfs(&self, node: usize, depth: usize, visited: &mut Vec<bool>, out: &mut String) {
        if visited[node] {
            return;
        }
        visited[node] = true;

        let indent = "  ".repeat(depth);
        out.push_str(&format!("{}{}\n", indent, self.nodes[node].label()));

        for &(child, _) in &self.adjacency[node] {
            self.text_tree_dfs(child, depth + 1, visited, out);
        }
    }

    /// DFS to find an actual cycle path for error reporting.
    fn find_cycle_path(&self, in_degree: &[usize]) -> Vec<String> {
        // Start from any node still in the cycle (in_degree > 0)
        let start = in_degree.iter().position(|&d| d > 0).unwrap_or(0);

        let mut visited = HashSet::new();
        let mut stack = Vec::new();

        if self.dfs_find_cycle(start, &mut visited, &mut stack) {
            // stack contains the cycle path
            return stack.iter().map(|&i| self.nodes[i].label()).collect();
        }

        vec!["(cycle detected but path could not be determined)".to_string()]
    }

    fn dfs_find_cycle(
        &self,
        node: usize,
        visited: &mut HashSet<usize>,
        stack: &mut Vec<usize>,
    ) -> bool {
        if stack.contains(&node) {
            // Found cycle — trim stack to just the cycle
            let pos = stack.iter().position(|&n| n == node).unwrap();
            *stack = stack[pos..].to_vec();
            stack.push(node); // close the cycle
            return true;
        }
        if visited.contains(&node) {
            return false;
        }

        visited.insert(node);
        stack.push(node);

        for &(to, _) in &self.adjacency[node] {
            if self.dfs_find_cycle(to, visited, stack) {
                return true;
            }
        }

        stack.pop();
        false
    }
}

// ---------------------------------------------------------------------------
// Dependency decision (skip propagation)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub enum DepDecision {
    /// The dependent should run
    Run,
    /// The dependent should be skipped
    Skip,
    /// Need to evaluate a callback via Bun bridge to decide
    EvalCallback(u64),
}

impl TaskGraph {
    /// Determine whether a dependent node should run, given the result of one
    /// of its dependency nodes and the edge type connecting them.
    pub fn should_run_dependent(dep_result: &TaskResult, edge_type: &EdgeType) -> DepDecision {
        match edge_type {
            EdgeType::Default => match dep_result.status {
                TaskStatus::Success => DepDecision::Run,
                TaskStatus::Failed => DepDecision::Skip,
                TaskStatus::Skipped => DepDecision::Run, // skip=continue
            },
            EdgeType::Success => match dep_result.status {
                TaskStatus::Success => DepDecision::Run,
                TaskStatus::Failed => DepDecision::Skip,
                TaskStatus::Skipped => DepDecision::Skip,
            },
            EdgeType::Always => DepDecision::Run,
            EdgeType::Failure => match dep_result.status {
                TaskStatus::Success => DepDecision::Skip,
                TaskStatus::Failed => DepDecision::Run,
                TaskStatus::Skipped => DepDecision::Skip,
            },
            EdgeType::Callback(id) => DepDecision::EvalCallback(*id),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Escape double quotes for Graphviz DOT label strings.
fn dot_escape(s: &str) -> String {
    s.replace('"', "\\\"")
}

/// Parse a dep reference: "^build" → ("build", true), "build" → ("build", false)
fn parse_dep_name(dep: &Dep) -> (String, bool) {
    match dep {
        Dep::Simple(s) => {
            if let Some(stripped) = s.strip_prefix('^') {
                (stripped.to_string(), true)
            } else {
                (s.clone(), false)
            }
        }
        Dep::Edge(edge) => {
            if let Some(stripped) = edge.task.strip_prefix('^') {
                (stripped.to_string(), true)
            } else {
                (edge.task.clone(), false)
            }
        }
    }
}

/// Get the edge type from a dep declaration.
fn dep_edge_type(dep: &Dep) -> EdgeType {
    match dep {
        Dep::Simple(_) => EdgeType::Default,
        Dep::Edge(DepEdge { on, .. }) => match on {
            DepCondition::Success => EdgeType::Success,
            DepCondition::Always => EdgeType::Always,
            DepCondition::Failure => EdgeType::Failure,
            DepCondition::Callback(id) => EdgeType::Callback(*id),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ci::types::*;

    /// Helper to create a minimal PipeConfig with given tasks
    fn make_config(tasks: Vec<(&str, TaskDef)>) -> BTreeMap<String, TaskDef> {
        tasks
            .into_iter()
            .map(|(name, def)| (name.to_string(), def))
            .collect()
    }

    fn cmd_task(command: &str, scope: TaskScope, deps: Vec<Dep>) -> TaskDef {
        TaskDef::Command(CommandTask {
            command: command.to_string(),
            base: TaskBase {
                scope,
                deps,
                ..Default::default()
            },
        })
    }

    fn make_workspace(packages: Vec<(&str, Vec<&str>)>) -> ResolvedWorkspace {
        let mut pkgs = BTreeMap::new();
        for (name, internal_deps) in packages {
            pkgs.insert(
                name.to_string(),
                WorkspacePackage {
                    name: name.to_string(),
                    version: "1.0.0".to_string(),
                    path: std::path::PathBuf::from(format!("packages/{name}")),
                    internal_deps: internal_deps.into_iter().map(String::from).collect(),
                },
            );
        }
        ResolvedWorkspace {
            packages: pkgs,
            native_crates: BTreeMap::new(),
        }
    }

    fn workflow(run: Vec<&str>) -> WorkflowConfig {
        WorkflowConfig {
            run: run.into_iter().map(String::from).collect(),
            filter: WorkflowFilter::All,
            env: BTreeMap::new(),
        }
    }

    // --- Graph construction tests ---

    #[test]
    fn build_simple_graph_root_task() {
        let tasks = make_config(vec![("lint", cmd_task("oxlint", TaskScope::Root, vec![]))]);
        let workspace = make_workspace(vec![("a", vec![]), ("b", vec![])]);
        let wf = workflow(vec!["lint"]);

        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();
        assert_eq!(graph.node_count(), 1);
        assert_eq!(graph.nodes[0].task_name, "lint");
        assert!(graph.nodes[0].package.is_none());
    }

    #[test]
    fn build_package_scoped_creates_per_package_nodes() {
        let tasks = make_config(vec![(
            "build",
            cmd_task("bun run build", TaskScope::Package, vec![]),
        )]);
        let workspace = make_workspace(vec![("a", vec![]), ("b", vec![]), ("c", vec![])]);
        let wf = workflow(vec!["build"]);

        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();
        assert_eq!(graph.node_count(), 3);
        // One node per package
        assert!(graph.find_node("build", Some("a")).is_some());
        assert!(graph.find_node("build", Some("b")).is_some());
        assert!(graph.find_node("build", Some("c")).is_some());
    }

    #[test]
    fn same_package_dep_creates_edges() {
        let tasks = make_config(vec![
            (
                "build",
                cmd_task("bun run build", TaskScope::Package, vec![]),
            ),
            (
                "test",
                cmd_task(
                    "bun test",
                    TaskScope::Package,
                    vec![Dep::Simple("build".to_string())],
                ),
            ),
        ]);
        let workspace = make_workspace(vec![("a", vec![])]);
        let wf = workflow(vec!["build", "test"]);

        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();
        assert_eq!(graph.node_count(), 2);

        // test(a) depends on build(a)
        let build_a = graph.find_node("build", Some("a")).unwrap();
        let test_a = graph.find_node("test", Some("a")).unwrap();
        assert!(graph.adjacency[build_a].iter().any(|&(to, _)| to == test_a));
    }

    #[test]
    fn topological_dep_creates_cross_package_edges() {
        // a depends on b; ^build means build(a) depends on build(b)
        let tasks = make_config(vec![(
            "build",
            cmd_task(
                "bun run build",
                TaskScope::Package,
                vec![Dep::Simple("^build".to_string())],
            ),
        )]);
        let workspace = make_workspace(vec![("a", vec!["b"]), ("b", vec![])]);
        let wf = workflow(vec!["build"]);

        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();
        assert_eq!(graph.node_count(), 2);

        let build_a = graph.find_node("build", Some("a")).unwrap();
        let build_b = graph.find_node("build", Some("b")).unwrap();

        // build(b) → build(a) (b must build before a)
        assert!(graph.adjacency[build_b]
            .iter()
            .any(|&(to, _)| to == build_a));
        // build(a) should NOT have edge to build(b)
        assert!(!graph.adjacency[build_a]
            .iter()
            .any(|&(to, _)| to == build_b));
    }

    #[test]
    fn dep_edge_with_edge_type() {
        let tasks = make_config(vec![
            (
                "build",
                cmd_task("bun run build", TaskScope::Package, vec![]),
            ),
            (
                "deploy",
                cmd_task(
                    "deploy",
                    TaskScope::Package,
                    vec![Dep::Edge(DepEdge {
                        task: "build".to_string(),
                        on: DepCondition::Always,
                    })],
                ),
            ),
        ]);
        let workspace = make_workspace(vec![("a", vec![])]);
        let wf = workflow(vec!["build", "deploy"]);

        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();
        let build_a = graph.find_node("build", Some("a")).unwrap();
        let deploy_a = graph.find_node("deploy", Some("a")).unwrap();

        let edge = graph.adjacency[build_a]
            .iter()
            .find(|&&(to, _)| to == deploy_a);
        assert!(edge.is_some());
        assert_eq!(edge.unwrap().1, EdgeType::Always);
    }

    #[test]
    fn root_task_with_topological_dep_errors() {
        let tasks = make_config(vec![
            (
                "lint",
                cmd_task(
                    "oxlint",
                    TaskScope::Root,
                    vec![Dep::Simple("^build".to_string())],
                ),
            ),
            (
                "build",
                cmd_task("bun run build", TaskScope::Package, vec![]),
            ),
        ]);
        let workspace = make_workspace(vec![("a", vec![])]);
        let wf = workflow(vec!["lint"]);

        let result = TaskGraph::build(&wf, &tasks, &workspace, None);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("root-scoped task"));
        assert!(err.contains("topological dependency"));
    }

    #[test]
    fn dep_references_unknown_task_errors() {
        let tasks = make_config(vec![(
            "test",
            cmd_task(
                "bun test",
                TaskScope::Package,
                vec![Dep::Simple("nonexistent".to_string())],
            ),
        )]);
        let workspace = make_workspace(vec![("a", vec![])]);
        let wf = workflow(vec!["test"]);

        let result = TaskGraph::build(&wf, &tasks, &workspace, None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown task \"nonexistent\""));
    }

    #[test]
    fn workflow_references_unknown_task_errors() {
        let tasks = make_config(vec![]);
        let workspace = make_workspace(vec![]);
        let wf = workflow(vec!["nonexistent"]);

        let result = TaskGraph::build(&wf, &tasks, &workspace, None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown task \"nonexistent\""));
    }

    #[test]
    fn cycle_detection() {
        // a → b → c → a (cycle)
        let tasks = make_config(vec![
            (
                "a",
                cmd_task(
                    "echo a",
                    TaskScope::Root,
                    vec![Dep::Simple("c".to_string())],
                ),
            ),
            (
                "b",
                cmd_task(
                    "echo b",
                    TaskScope::Root,
                    vec![Dep::Simple("a".to_string())],
                ),
            ),
            (
                "c",
                cmd_task(
                    "echo c",
                    TaskScope::Root,
                    vec![Dep::Simple("b".to_string())],
                ),
            ),
        ]);
        let workspace = make_workspace(vec![]);
        let wf = workflow(vec!["a", "b", "c"]);

        let result = TaskGraph::build(&wf, &tasks, &workspace, None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("circular dependency"));
    }

    #[test]
    fn topological_order_valid() {
        // build → test → deploy (linear chain)
        let tasks = make_config(vec![
            ("build", cmd_task("echo build", TaskScope::Root, vec![])),
            (
                "test",
                cmd_task(
                    "echo test",
                    TaskScope::Root,
                    vec![Dep::Simple("build".to_string())],
                ),
            ),
            (
                "deploy",
                cmd_task(
                    "echo deploy",
                    TaskScope::Root,
                    vec![Dep::Simple("test".to_string())],
                ),
            ),
        ]);
        let workspace = make_workspace(vec![]);
        let wf = workflow(vec!["build", "test", "deploy"]);

        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();
        let order = graph.topological_order().unwrap();
        assert_eq!(order.len(), 3);

        let build_idx = graph.find_node("build", None).unwrap();
        let test_idx = graph.find_node("test", None).unwrap();
        let deploy_idx = graph.find_node("deploy", None).unwrap();

        let build_pos = order.iter().position(|&i| i == build_idx).unwrap();
        let test_pos = order.iter().position(|&i| i == test_idx).unwrap();
        let deploy_pos = order.iter().position(|&i| i == deploy_idx).unwrap();

        assert!(build_pos < test_pos);
        assert!(test_pos < deploy_pos);
    }

    #[test]
    fn diamond_deps_no_cycle() {
        // build → test, build → lint, test → deploy, lint → deploy
        let tasks = make_config(vec![
            ("build", cmd_task("echo build", TaskScope::Root, vec![])),
            (
                "test",
                cmd_task(
                    "echo test",
                    TaskScope::Root,
                    vec![Dep::Simple("build".to_string())],
                ),
            ),
            (
                "lint",
                cmd_task(
                    "echo lint",
                    TaskScope::Root,
                    vec![Dep::Simple("build".to_string())],
                ),
            ),
            (
                "deploy",
                cmd_task(
                    "echo deploy",
                    TaskScope::Root,
                    vec![
                        Dep::Simple("test".to_string()),
                        Dep::Simple("lint".to_string()),
                    ],
                ),
            ),
        ]);
        let workspace = make_workspace(vec![]);
        let wf = workflow(vec!["build", "test", "lint", "deploy"]);

        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();
        let order = graph.topological_order().unwrap();
        assert_eq!(order.len(), 4);

        let build_pos = order
            .iter()
            .position(|&i| i == graph.find_node("build", None).unwrap())
            .unwrap();
        let deploy_pos = order
            .iter()
            .position(|&i| i == graph.find_node("deploy", None).unwrap())
            .unwrap();
        assert!(build_pos < deploy_pos);
    }

    #[test]
    fn mixed_scopes_root_and_package() {
        let tasks = make_config(vec![
            ("lint", cmd_task("oxlint", TaskScope::Root, vec![])),
            (
                "build",
                cmd_task(
                    "bun run build",
                    TaskScope::Package,
                    vec![Dep::Simple("lint".to_string())],
                ),
            ),
        ]);
        let workspace = make_workspace(vec![("a", vec![]), ("b", vec![])]);
        let wf = workflow(vec!["lint", "build"]);

        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();
        // 1 root node (lint) + 2 package nodes (build a, build b)
        assert_eq!(graph.node_count(), 3);

        // Each build node depends on lint
        let lint_idx = graph.find_node("lint", None).unwrap();
        assert_eq!(graph.adjacency[lint_idx].len(), 2);
    }

    // --- Skip propagation tests ---

    fn make_result(status: TaskStatus) -> TaskResult {
        let exit_code = match &status {
            TaskStatus::Success => Some(0),
            TaskStatus::Failed => Some(1),
            TaskStatus::Skipped => None,
        };
        TaskResult {
            status,
            exit_code,
            duration_ms: 100,
            package: None,
            task: "test".to_string(),
            cached: false,
        }
    }

    #[test]
    fn default_edge_success_runs() {
        let result = make_result(TaskStatus::Success);
        assert_eq!(
            TaskGraph::should_run_dependent(&result, &EdgeType::Default),
            DepDecision::Run
        );
    }

    #[test]
    fn default_edge_failed_skips() {
        let result = make_result(TaskStatus::Failed);
        assert_eq!(
            TaskGraph::should_run_dependent(&result, &EdgeType::Default),
            DepDecision::Skip
        );
    }

    #[test]
    fn default_edge_skipped_continues() {
        let result = make_result(TaskStatus::Skipped);
        assert_eq!(
            TaskGraph::should_run_dependent(&result, &EdgeType::Default),
            DepDecision::Run
        );
    }

    #[test]
    fn success_edge_success_runs() {
        let result = make_result(TaskStatus::Success);
        assert_eq!(
            TaskGraph::should_run_dependent(&result, &EdgeType::Success),
            DepDecision::Run
        );
    }

    #[test]
    fn success_edge_failed_skips() {
        let result = make_result(TaskStatus::Failed);
        assert_eq!(
            TaskGraph::should_run_dependent(&result, &EdgeType::Success),
            DepDecision::Skip
        );
    }

    #[test]
    fn success_edge_skipped_skips() {
        let result = make_result(TaskStatus::Skipped);
        assert_eq!(
            TaskGraph::should_run_dependent(&result, &EdgeType::Success),
            DepDecision::Skip
        );
    }

    #[test]
    fn always_edge_any_status_runs() {
        for status in [TaskStatus::Success, TaskStatus::Failed, TaskStatus::Skipped] {
            let result = make_result(status);
            assert_eq!(
                TaskGraph::should_run_dependent(&result, &EdgeType::Always),
                DepDecision::Run
            );
        }
    }

    #[test]
    fn failure_edge_failed_runs() {
        let result = make_result(TaskStatus::Failed);
        assert_eq!(
            TaskGraph::should_run_dependent(&result, &EdgeType::Failure),
            DepDecision::Run
        );
    }

    #[test]
    fn failure_edge_success_skips() {
        let result = make_result(TaskStatus::Success);
        assert_eq!(
            TaskGraph::should_run_dependent(&result, &EdgeType::Failure),
            DepDecision::Skip
        );
    }

    #[test]
    fn failure_edge_skipped_skips() {
        let result = make_result(TaskStatus::Skipped);
        assert_eq!(
            TaskGraph::should_run_dependent(&result, &EdgeType::Failure),
            DepDecision::Skip
        );
    }

    #[test]
    fn callback_edge_returns_eval() {
        let result = make_result(TaskStatus::Success);
        assert_eq!(
            TaskGraph::should_run_dependent(&result, &EdgeType::Callback(42)),
            DepDecision::EvalCallback(42)
        );
    }

    // --- filter_packages tests ---

    #[test]
    fn filter_packages_restricts_nodes() {
        let tasks = make_config(vec![(
            "build",
            cmd_task("bun run build", TaskScope::Package, vec![]),
        )]);
        let workspace = make_workspace(vec![("a", vec![]), ("b", vec![]), ("c", vec![])]);
        let wf = workflow(vec!["build"]);

        let filter: std::collections::BTreeSet<String> =
            ["a".to_string(), "c".to_string()].into_iter().collect();
        let graph = TaskGraph::build(&wf, &tasks, &workspace, Some(&filter)).unwrap();

        assert_eq!(graph.node_count(), 2);
        assert!(graph.find_node("build", Some("a")).is_some());
        assert!(graph.find_node("build", Some("b")).is_none());
        assert!(graph.find_node("build", Some("c")).is_some());
    }

    #[test]
    fn filter_packages_root_tasks_unaffected() {
        let tasks = make_config(vec![
            ("lint", cmd_task("oxlint", TaskScope::Root, vec![])),
            (
                "build",
                cmd_task("bun run build", TaskScope::Package, vec![]),
            ),
        ]);
        let workspace = make_workspace(vec![("a", vec![]), ("b", vec![])]);
        let wf = workflow(vec!["lint", "build"]);

        let filter: std::collections::BTreeSet<String> = ["a".to_string()].into_iter().collect();
        let graph = TaskGraph::build(&wf, &tasks, &workspace, Some(&filter)).unwrap();

        // 1 root node + 1 package node (a only)
        assert_eq!(graph.node_count(), 2);
        assert!(graph.find_node("lint", None).is_some());
        assert!(graph.find_node("build", Some("a")).is_some());
        assert!(graph.find_node("build", Some("b")).is_none());
    }

    #[test]
    fn filter_packages_empty_produces_root_only() {
        let tasks = make_config(vec![
            ("lint", cmd_task("oxlint", TaskScope::Root, vec![])),
            (
                "build",
                cmd_task("bun run build", TaskScope::Package, vec![]),
            ),
        ]);
        let workspace = make_workspace(vec![("a", vec![]), ("b", vec![])]);
        let wf = workflow(vec!["lint", "build"]);

        let filter: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
        let graph = TaskGraph::build(&wf, &tasks, &workspace, Some(&filter)).unwrap();

        // Only root tasks should exist
        assert_eq!(graph.node_count(), 1);
        assert!(graph.find_node("lint", None).is_some());
    }

    // -- DOT output --

    #[test]
    fn to_dot_simple_graph() {
        let tasks = make_config(vec![
            ("build", cmd_task("bun run build", TaskScope::Root, vec![])),
            (
                "test",
                cmd_task(
                    "bun test",
                    TaskScope::Root,
                    vec![Dep::Simple("build".to_string())],
                ),
            ),
        ]);
        let workspace = ResolvedWorkspace::default();
        let wf = workflow(vec!["build", "test"]);
        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();

        let dot = graph.to_dot();
        assert!(dot.starts_with("digraph tasks {"));
        assert!(dot.contains("rankdir=LR"));
        assert!(dot.contains("\"build\" -> \"test\""));
        assert!(dot.ends_with("}\n"));
    }

    #[test]
    fn to_dot_with_edge_labels() {
        let tasks = make_config(vec![
            ("build", cmd_task("build", TaskScope::Root, vec![])),
            (
                "notify",
                cmd_task(
                    "notify",
                    TaskScope::Root,
                    vec![Dep::Edge(DepEdge {
                        task: "build".to_string(),
                        on: DepCondition::Always,
                    })],
                ),
            ),
        ]);
        let workspace = ResolvedWorkspace::default();
        let wf = workflow(vec!["build", "notify"]);
        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();

        let dot = graph.to_dot();
        assert!(dot.contains("[label=\"always\"]"));
    }

    #[test]
    fn to_dot_package_scoped() {
        let tasks = make_config(vec![
            (
                "build",
                cmd_task("bun run build", TaskScope::Package, vec![]),
            ),
            (
                "test",
                cmd_task(
                    "bun test",
                    TaskScope::Package,
                    vec![Dep::Simple("^build".to_string())],
                ),
            ),
        ]);
        let workspace = make_workspace(vec![("core", vec![]), ("ui", vec!["core"])]);
        let wf = workflow(vec!["build", "test"]);
        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();

        let dot = graph.to_dot();
        assert!(dot.starts_with("digraph tasks {"));
        // ^build topological dep: ui depends on core → build core must finish before test ui
        assert!(dot.contains("\"build core\" -> \"test ui\""));
        // All 4 nodes are present in the graph
        assert_eq!(graph.node_count(), 4);
    }

    // -- Text tree output --

    #[test]
    fn to_text_tree_simple() {
        let tasks = make_config(vec![
            ("build", cmd_task("build", TaskScope::Root, vec![])),
            (
                "test",
                cmd_task(
                    "test",
                    TaskScope::Root,
                    vec![Dep::Simple("build".to_string())],
                ),
            ),
        ]);
        let workspace = ResolvedWorkspace::default();
        let wf = workflow(vec!["build", "test"]);
        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();

        let tree = graph.to_text_tree();
        assert!(tree.contains("build"));
        assert!(tree.contains("test"));
        // test should be indented under build
        let lines: Vec<&str> = tree.lines().collect();
        assert!(lines.iter().any(|l| l.starts_with("build")));
        assert!(lines.iter().any(|l| l.starts_with("  test")));
    }

    #[test]
    fn to_text_tree_independent_roots() {
        let tasks = make_config(vec![
            ("build", cmd_task("build", TaskScope::Root, vec![])),
            ("lint", cmd_task("lint", TaskScope::Root, vec![])),
        ]);
        let workspace = ResolvedWorkspace::default();
        let wf = workflow(vec!["build", "lint"]);
        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();

        let tree = graph.to_text_tree();
        let lines: Vec<&str> = tree.lines().collect();
        // Both should be at root level (no indent)
        assert_eq!(lines.len(), 2);
        assert!(lines.iter().all(|l| !l.starts_with(' ')));
    }

    #[test]
    fn to_dot_isolated_nodes_included() {
        // Isolated nodes (no edges) should still appear in DOT output
        let tasks = make_config(vec![
            ("build", cmd_task("build", TaskScope::Root, vec![])),
            ("lint", cmd_task("lint", TaskScope::Root, vec![])),
        ]);
        let workspace = ResolvedWorkspace::default();
        let wf = workflow(vec!["build", "lint"]);
        let graph = TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();

        let dot = graph.to_dot();
        // No edges, but both nodes should appear as isolated declarations
        assert!(dot.contains("\"build\";"));
        assert!(dot.contains("\"lint\";"));
    }

    #[test]
    fn dot_escape_handles_quotes() {
        assert_eq!(super::dot_escape("hello"), "hello");
        assert_eq!(super::dot_escape("say \"hi\""), "say \\\"hi\\\"");
    }
}
