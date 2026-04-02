use crate::pm::types;
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

/// A discovered workspace package
#[derive(Debug, Clone)]
pub struct WorkspacePackage {
    pub name: String,
    pub version: String,
    pub path: PathBuf,
    pub pkg: types::PackageJson,
}

/// Discover workspace packages from glob patterns in package.json `workspaces` field.
/// Each pattern is a directory glob relative to root_dir (e.g., "packages/*").
pub fn discover_workspaces(
    root_dir: &Path,
    patterns: &[String],
) -> Result<Vec<WorkspacePackage>, Box<dyn std::error::Error>> {
    let mut workspaces = Vec::new();
    let mut seen_names = HashSet::new();

    for pattern in patterns {
        let full_pattern = root_dir.join(pattern);
        let pattern_str = full_pattern.to_string_lossy().to_string();

        let entries = glob::glob(&pattern_str).map_err(|e| {
            format!(
                "error: invalid workspace glob pattern \"{}\": {}",
                pattern, e
            )
        })?;

        for entry in entries {
            let dir = entry.map_err(|e| format!("error: glob error: {}", e))?;
            if !dir.is_dir() {
                continue;
            }

            let pkg_json_path = dir.join("package.json");
            if !pkg_json_path.exists() {
                continue;
            }

            let pkg = types::read_package_json(&dir)?;
            let name = pkg.name.clone().ok_or_else(|| {
                format!(
                    "error: workspace at {} has no \"name\" in package.json",
                    dir.display()
                )
            })?;

            if !seen_names.insert(name.clone()) {
                return Err(format!(
                    "error: duplicate workspace name \"{}\" at {}",
                    name,
                    dir.display()
                )
                .into());
            }

            let version = pkg.version.clone().unwrap_or_else(|| "0.0.0".to_string());
            let rel_path = dir.strip_prefix(root_dir).unwrap_or(&dir).to_path_buf();

            workspaces.push(WorkspacePackage {
                name,
                version,
                path: rel_path,
                pkg,
            });
        }
    }

    workspaces.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(workspaces)
}

/// Collect all external dependencies from all workspaces + root,
/// merging into a single deps map and dev_deps map.
/// Workspace-internal dependencies (one workspace depending on another) are excluded.
pub fn merge_workspace_deps(
    root_pkg: &types::PackageJson,
    workspaces: &[WorkspacePackage],
) -> (BTreeMap<String, String>, BTreeMap<String, String>) {
    let ws_names: HashSet<&str> = workspaces.iter().map(|ws| ws.name.as_str()).collect();

    let mut deps = BTreeMap::new();
    let mut dev_deps = BTreeMap::new();

    // Root deps
    for (name, range) in &root_pkg.dependencies {
        if !ws_names.contains(name.as_str()) {
            deps.insert(name.clone(), range.clone());
        }
    }
    for (name, range) in &root_pkg.dev_dependencies {
        if !ws_names.contains(name.as_str()) {
            dev_deps.insert(name.clone(), range.clone());
        }
    }

    // Workspace deps
    for ws in workspaces {
        for (name, range) in &ws.pkg.dependencies {
            if !ws_names.contains(name.as_str()) {
                deps.entry(name.clone()).or_insert_with(|| range.clone());
            }
        }
        for (name, range) in &ws.pkg.dev_dependencies {
            if !ws_names.contains(name.as_str()) {
                dev_deps
                    .entry(name.clone())
                    .or_insert_with(|| range.clone());
            }
        }
    }

    (deps, dev_deps)
}

/// Symlink workspace packages into root node_modules/.
/// Creates `node_modules/<ws-name>` → `<ws-dir>` (relative to root_dir).
pub fn link_workspaces(
    root_dir: &Path,
    workspaces: &[WorkspacePackage],
) -> Result<usize, Box<dyn std::error::Error>> {
    let node_modules = root_dir.join("node_modules");
    std::fs::create_dir_all(&node_modules)?;

    let mut linked = 0;
    for ws in workspaces {
        let target = node_modules.join(&ws.name);

        // Create parent directories for scoped packages
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Remove existing (could be a stale symlink or directory)
        if target.exists() || target.symlink_metadata().is_ok() {
            if target.is_dir() && !target.symlink_metadata()?.is_symlink() {
                std::fs::remove_dir_all(&target)?;
            } else {
                std::fs::remove_file(&target)?;
            }
        }

        // Create symlink: node_modules/<name> → <ws-dir>
        let ws_abs = root_dir.join(&ws.path);
        #[cfg(unix)]
        std::os::unix::fs::symlink(&ws_abs, &target)?;
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&ws_abs, &target)?;

        linked += 1;
    }

    Ok(linked)
}

/// Validate workspace dependency graph for cycles in production dependencies.
/// Circular devDependencies are allowed.
pub fn validate_workspace_graph(
    workspaces: &[WorkspacePackage],
) -> Result<(), Box<dyn std::error::Error>> {
    let ws_names: HashSet<&str> = workspaces.iter().map(|ws| ws.name.as_str()).collect();

    // Build adjacency list of production deps between workspaces
    let mut adj: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for ws in workspaces {
        let mut deps = Vec::new();
        for dep_name in ws.pkg.dependencies.keys() {
            if ws_names.contains(dep_name.as_str()) {
                deps.push(dep_name.as_str());
            }
        }
        adj.insert(ws.name.as_str(), deps);
    }

    // DFS-based cycle detection
    let mut visited = HashSet::new();
    let mut in_stack = HashSet::new();
    let mut path = Vec::new();

    for ws_name in adj.keys() {
        if !visited.contains(ws_name) {
            if let Some(cycle) = dfs_cycle(ws_name, &adj, &mut visited, &mut in_stack, &mut path) {
                return Err(format!(
                    "error: workspace dependency cycle detected\n  {}\n  Remove the circular dependency from one of the packages' \"dependencies\" field.\n  (Circular devDependencies are allowed.)",
                    cycle.join(" → ")
                ).into());
            }
        }
    }

    Ok(())
}

fn dfs_cycle<'a>(
    node: &'a str,
    adj: &BTreeMap<&'a str, Vec<&'a str>>,
    visited: &mut HashSet<&'a str>,
    in_stack: &mut HashSet<&'a str>,
    path: &mut Vec<&'a str>,
) -> Option<Vec<String>> {
    visited.insert(node);
    in_stack.insert(node);
    path.push(node);

    if let Some(deps) = adj.get(node) {
        for &dep in deps {
            if !visited.contains(dep) {
                if let Some(cycle) = dfs_cycle(dep, adj, visited, in_stack, path) {
                    return Some(cycle);
                }
            } else if in_stack.contains(dep) {
                // Found cycle — extract the cycle path
                let start = path.iter().position(|&n| n == dep).unwrap();
                let mut cycle: Vec<String> = path[start..].iter().map(|s| s.to_string()).collect();
                cycle.push(dep.to_string()); // Close the cycle
                return Some(cycle);
            }
        }
    }

    in_stack.remove(node);
    path.pop();
    None
}

/// Resolve a workspace specifier (package name or directory path) to the workspace's
/// absolute directory. Discovers workspaces from root package.json.
pub fn resolve_workspace_dir(
    root_dir: &Path,
    specifier: &str,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let pkg = types::read_package_json(root_dir)?;
    let patterns = pkg
        .workspaces
        .ok_or_else(|| "error: no \"workspaces\" field in root package.json".to_string())?;

    if patterns.is_empty() {
        return Err("error: \"workspaces\" field is empty in root package.json".into());
    }

    let workspaces = discover_workspaces(root_dir, &patterns)?;

    // Try matching by package name first
    if let Some(ws) = workspaces.iter().find(|ws| ws.name == specifier) {
        return Ok(root_dir.join(&ws.path));
    }

    // Try matching by directory path
    let spec_path = PathBuf::from(specifier);
    if let Some(ws) = workspaces.iter().find(|ws| ws.path == spec_path) {
        return Ok(root_dir.join(&ws.path));
    }

    // Not found — provide helpful error
    let available: Vec<String> = workspaces
        .iter()
        .map(|ws| format!("  {} ({})", ws.name, ws.path.display()))
        .collect();
    Err(format!(
        "error: workspace \"{}\" not found\nAvailable workspaces:\n{}",
        specifier,
        available.join("\n")
    )
    .into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ws_pkg(
        name: &str,
        deps: &[(&str, &str)],
        dev_deps: &[(&str, &str)],
    ) -> types::PackageJson {
        let mut dependencies = BTreeMap::new();
        for (k, v) in deps {
            dependencies.insert(k.to_string(), v.to_string());
        }
        let mut dev_dependencies = BTreeMap::new();
        for (k, v) in dev_deps {
            dev_dependencies.insert(k.to_string(), v.to_string());
        }
        types::PackageJson {
            name: Some(name.to_string()),
            version: Some("1.0.0".to_string()),
            dependencies,
            dev_dependencies,
            peer_dependencies: BTreeMap::new(),
            optional_dependencies: BTreeMap::new(),
            bundled_dependencies: vec![],
            bin: types::BinField::default(),
            scripts: BTreeMap::new(),
            workspaces: None,
            overrides: BTreeMap::new(),
            files: None,
        }
    }

    fn make_workspace(
        name: &str,
        path: &str,
        deps: &[(&str, &str)],
        dev_deps: &[(&str, &str)],
    ) -> WorkspacePackage {
        WorkspacePackage {
            name: name.to_string(),
            version: "1.0.0".to_string(),
            path: PathBuf::from(path),
            pkg: make_ws_pkg(name, deps, dev_deps),
        }
    }

    #[test]
    fn test_discover_workspaces_empty_patterns() {
        let dir = tempfile::tempdir().unwrap();
        let result = discover_workspaces(dir.path(), &[]).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_discover_workspaces_glob() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        // Create packages/a and packages/b
        let a_dir = root.join("packages/a");
        let b_dir = root.join("packages/b");
        std::fs::create_dir_all(&a_dir).unwrap();
        std::fs::create_dir_all(&b_dir).unwrap();

        std::fs::write(
            a_dir.join("package.json"),
            r#"{"name":"@myorg/a","version":"1.0.0"}"#,
        )
        .unwrap();
        std::fs::write(
            b_dir.join("package.json"),
            r#"{"name":"@myorg/b","version":"2.0.0"}"#,
        )
        .unwrap();

        let result = discover_workspaces(root, &["packages/*".to_string()]).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].name, "@myorg/a");
        assert_eq!(result[1].name, "@myorg/b");
    }

    #[test]
    fn test_discover_workspaces_no_name() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        let a_dir = root.join("packages/a");
        std::fs::create_dir_all(&a_dir).unwrap();
        std::fs::write(a_dir.join("package.json"), r#"{"version":"1.0.0"}"#).unwrap();

        let result = discover_workspaces(root, &["packages/*".to_string()]);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("no \"name\""));
    }

    #[test]
    fn test_discover_workspaces_duplicate_name() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        let a_dir = root.join("packages/a");
        let b_dir = root.join("packages/b");
        std::fs::create_dir_all(&a_dir).unwrap();
        std::fs::create_dir_all(&b_dir).unwrap();

        // Both have the same name
        std::fs::write(
            a_dir.join("package.json"),
            r#"{"name":"duplicate","version":"1.0.0"}"#,
        )
        .unwrap();
        std::fs::write(
            b_dir.join("package.json"),
            r#"{"name":"duplicate","version":"2.0.0"}"#,
        )
        .unwrap();

        let result = discover_workspaces(root, &["packages/*".to_string()]);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("duplicate workspace name"));
    }

    #[test]
    fn test_discover_workspaces_skips_non_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        let a_dir = root.join("packages/a");
        std::fs::create_dir_all(&a_dir).unwrap();
        std::fs::write(
            a_dir.join("package.json"),
            r#"{"name":"a","version":"1.0.0"}"#,
        )
        .unwrap();

        // Create a file (not a directory)
        std::fs::write(root.join("packages/README.md"), "# Readme").unwrap();

        let result = discover_workspaces(root, &["packages/*".to_string()]).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "a");
    }

    #[test]
    fn test_merge_workspace_deps_excludes_internal() {
        let root_pkg = make_ws_pkg("root", &[("zod", "^3.24.0")], &[]);
        let workspaces = vec![
            make_workspace(
                "@myorg/a",
                "packages/a",
                &[("@myorg/b", "^1.0.0"), ("react", "^18.0.0")],
                &[],
            ),
            make_workspace("@myorg/b", "packages/b", &[("typescript", "^5.0.0")], &[]),
        ];

        let (deps, dev_deps) = merge_workspace_deps(&root_pkg, &workspaces);

        // Internal dep "@myorg/b" should be excluded
        assert!(!deps.contains_key("@myorg/b"));
        assert!(!deps.contains_key("@myorg/a"));

        // External deps merged
        assert_eq!(deps["zod"], "^3.24.0");
        assert_eq!(deps["react"], "^18.0.0");
        assert_eq!(deps["typescript"], "^5.0.0");
        assert!(dev_deps.is_empty());
    }

    #[test]
    fn test_merge_workspace_deps_first_wins() {
        let root_pkg = make_ws_pkg("root", &[("zod", "^3.24.0")], &[]);
        let workspaces = vec![make_workspace(
            "a",
            "packages/a",
            &[("zod", "^3.23.0")],
            &[],
        )];

        let (deps, _) = merge_workspace_deps(&root_pkg, &workspaces);
        // Root dep takes precedence (first wins)
        assert_eq!(deps["zod"], "^3.24.0");
    }

    #[test]
    fn test_validate_no_cycles() {
        let workspaces = vec![
            make_workspace("a", "packages/a", &[("b", "^1.0.0")], &[]),
            make_workspace("b", "packages/b", &[], &[]),
        ];
        assert!(validate_workspace_graph(&workspaces).is_ok());
    }

    #[test]
    fn test_validate_cycle_detected() {
        let workspaces = vec![
            make_workspace("a", "packages/a", &[("b", "^1.0.0")], &[]),
            make_workspace("b", "packages/b", &[("a", "^1.0.0")], &[]),
        ];
        let result = validate_workspace_graph(&workspaces);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("cycle detected"));
        assert!(err.contains("→"));
    }

    #[test]
    fn test_validate_dev_dep_cycles_allowed() {
        let workspaces = vec![
            make_workspace("a", "packages/a", &[], &[("b", "^1.0.0")]),
            make_workspace("b", "packages/b", &[], &[("a", "^1.0.0")]),
        ];
        // devDependency cycles are allowed
        assert!(validate_workspace_graph(&workspaces).is_ok());
    }

    #[test]
    fn test_validate_transitive_cycle() {
        let workspaces = vec![
            make_workspace("a", "packages/a", &[("b", "^1.0.0")], &[]),
            make_workspace("b", "packages/b", &[("c", "^1.0.0")], &[]),
            make_workspace("c", "packages/c", &[("a", "^1.0.0")], &[]),
        ];
        let result = validate_workspace_graph(&workspaces);
        assert!(result.is_err());
    }

    #[test]
    fn test_link_workspaces_creates_symlinks() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        // Create workspace directories
        let a_dir = root.join("packages/a");
        std::fs::create_dir_all(&a_dir).unwrap();
        std::fs::write(a_dir.join("index.js"), "module.exports = 'a'").unwrap();

        let workspaces = vec![WorkspacePackage {
            name: "a".to_string(),
            version: "1.0.0".to_string(),
            path: PathBuf::from("packages/a"),
            pkg: make_ws_pkg("a", &[], &[]),
        }];

        let linked = link_workspaces(root, &workspaces).unwrap();
        assert_eq!(linked, 1);

        let symlink = root.join("node_modules/a");
        assert!(symlink.exists());
        assert!(symlink.symlink_metadata().unwrap().is_symlink());

        // Content should be accessible through symlink
        let content = std::fs::read_to_string(root.join("node_modules/a/index.js")).unwrap();
        assert_eq!(content, "module.exports = 'a'");
    }

    #[test]
    fn test_link_workspaces_scoped() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        let a_dir = root.join("packages/a");
        std::fs::create_dir_all(&a_dir).unwrap();
        std::fs::write(a_dir.join("index.js"), "a").unwrap();

        let workspaces = vec![WorkspacePackage {
            name: "@myorg/a".to_string(),
            version: "1.0.0".to_string(),
            path: PathBuf::from("packages/a"),
            pkg: make_ws_pkg("@myorg/a", &[], &[]),
        }];

        let linked = link_workspaces(root, &workspaces).unwrap();
        assert_eq!(linked, 1);
        assert!(root.join("node_modules/@myorg/a").exists());
    }

    // --- resolve_workspace_dir tests ---

    #[test]
    fn test_resolve_workspace_dir_by_name() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        // Create root package.json with workspaces
        std::fs::write(
            root.join("package.json"),
            r#"{"name":"root","workspaces":["packages/*"]}"#,
        )
        .unwrap();

        let a_dir = root.join("packages/api");
        std::fs::create_dir_all(&a_dir).unwrap();
        std::fs::write(
            a_dir.join("package.json"),
            r#"{"name":"@myorg/api","version":"1.0.0"}"#,
        )
        .unwrap();

        let result = resolve_workspace_dir(root, "@myorg/api").unwrap();
        assert_eq!(result, root.join("packages/api"));
    }

    #[test]
    fn test_resolve_workspace_dir_by_path() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        std::fs::write(
            root.join("package.json"),
            r#"{"name":"root","workspaces":["packages/*"]}"#,
        )
        .unwrap();

        let a_dir = root.join("packages/api");
        std::fs::create_dir_all(&a_dir).unwrap();
        std::fs::write(
            a_dir.join("package.json"),
            r#"{"name":"@myorg/api","version":"1.0.0"}"#,
        )
        .unwrap();

        let result = resolve_workspace_dir(root, "packages/api").unwrap();
        assert_eq!(result, root.join("packages/api"));
    }

    #[test]
    fn test_resolve_workspace_dir_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        std::fs::write(
            root.join("package.json"),
            r#"{"name":"root","workspaces":["packages/*"]}"#,
        )
        .unwrap();

        let a_dir = root.join("packages/api");
        std::fs::create_dir_all(&a_dir).unwrap();
        std::fs::write(
            a_dir.join("package.json"),
            r#"{"name":"@myorg/api","version":"1.0.0"}"#,
        )
        .unwrap();

        let result = resolve_workspace_dir(root, "@myorg/nonexistent");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("workspace \"@myorg/nonexistent\" not found"));
        assert!(err.contains("@myorg/api"));
    }

    #[test]
    fn test_resolve_workspace_dir_no_workspaces_field() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        std::fs::write(
            root.join("package.json"),
            r#"{"name":"root","version":"1.0.0"}"#,
        )
        .unwrap();

        let result = resolve_workspace_dir(root, "@myorg/api");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("no \"workspaces\" field"));
    }
}
