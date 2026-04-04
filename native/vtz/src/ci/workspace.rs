use crate::ci::types::{NativeCrate, ResolvedWorkspace, WorkspaceConfig, WorkspacePackage};
use serde::Deserialize;
use std::collections::{BTreeMap, HashSet};
use std::path::Path;

/// Resolve both TypeScript and Rust workspaces into a unified package graph.
///
/// 1. If `config.workspace.packages` is set, uses those globs.
///    Otherwise reads `package.json` at `root_dir` for its `workspaces` field.
/// 2. For Rust: if `config.workspace.native` is set, uses it.
///    Otherwise runs `cargo metadata` if a `Cargo.toml` workspace exists.
pub fn resolve(
    root_dir: &Path,
    config_workspace: Option<&WorkspaceConfig>,
) -> Result<ResolvedWorkspace, String> {
    let packages = resolve_ts_packages(root_dir, config_workspace)?;
    let native_crates = resolve_native_crates(root_dir, config_workspace)?;
    Ok(ResolvedWorkspace {
        packages,
        native_crates,
    })
}

/// Resolve TypeScript workspace packages from package.json workspaces globs.
fn resolve_ts_packages(
    root_dir: &Path,
    config_workspace: Option<&WorkspaceConfig>,
) -> Result<BTreeMap<String, WorkspacePackage>, String> {
    let patterns = get_workspace_patterns(root_dir, config_workspace)?;

    if patterns.is_empty() {
        return Ok(BTreeMap::new());
    }

    let mut packages = BTreeMap::new();

    for pattern in &patterns {
        let full_pattern = root_dir.join(pattern);
        let pattern_str = full_pattern.to_string_lossy().to_string();

        let entries = glob::glob(&pattern_str)
            .map_err(|e| format!("invalid workspace glob pattern \"{pattern}\": {e}"))?;

        for entry in entries {
            let dir = entry.map_err(|e| format!("glob error: {e}"))?;
            if !dir.is_dir() {
                continue;
            }

            let pkg_json_path = dir.join("package.json");
            if !pkg_json_path.exists() {
                continue;
            }

            let pkg_json = read_package_json(&pkg_json_path)?;
            let name = pkg_json.name.ok_or_else(|| {
                format!(
                    "workspace at {} has no \"name\" in package.json",
                    dir.display()
                )
            })?;

            if packages.contains_key(&name) {
                return Err(format!(
                    "duplicate workspace name \"{name}\" at {}",
                    dir.display()
                ));
            }

            let version = pkg_json.version.unwrap_or_else(|| "0.0.0".to_string());
            let rel_path = dir.strip_prefix(root_dir).unwrap_or(&dir).to_path_buf();

            packages.insert(
                name.clone(),
                WorkspacePackage {
                    name: name.clone(),
                    version,
                    path: rel_path,
                    internal_deps: Vec::new(), // filled below
                },
            );
        }
    }

    // Now resolve internal dependencies
    let all_names: HashSet<&str> = packages.keys().map(|s| s.as_str()).collect();

    // Re-read package.json files to extract deps (we need the full dep maps)
    let dep_maps = collect_internal_deps(root_dir, &packages, &all_names)?;

    for (name, deps) in dep_maps {
        if let Some(pkg) = packages.get_mut(&name) {
            pkg.internal_deps = deps;
        }
    }

    Ok(packages)
}

/// Get workspace glob patterns from config or package.json.
fn get_workspace_patterns(
    root_dir: &Path,
    config_workspace: Option<&WorkspaceConfig>,
) -> Result<Vec<String>, String> {
    // Config takes precedence
    if let Some(ws) = config_workspace {
        if !ws.packages.is_empty() {
            return Ok(ws.packages.clone());
        }
    }

    // Fall back to reading package.json
    let root_pkg_path = root_dir.join("package.json");
    if !root_pkg_path.exists() {
        return Ok(Vec::new());
    }

    let root_pkg = read_package_json(&root_pkg_path)?;
    Ok(root_pkg.workspaces.unwrap_or_default())
}

/// Collect internal dependency names for each workspace package.
fn collect_internal_deps(
    root_dir: &Path,
    packages: &BTreeMap<String, WorkspacePackage>,
    workspace_names: &HashSet<&str>,
) -> Result<BTreeMap<String, Vec<String>>, String> {
    let mut result = BTreeMap::new();

    for (name, pkg) in packages {
        let pkg_json_path = root_dir.join(&pkg.path).join("package.json");
        let pkg_json = read_package_json(&pkg_json_path)?;

        let mut internal = Vec::new();

        // Check dependencies
        if let Some(deps) = &pkg_json.dependencies {
            for dep_name in deps.keys() {
                if workspace_names.contains(dep_name.as_str()) {
                    internal.push(dep_name.clone());
                }
            }
        }

        // Check devDependencies
        if let Some(deps) = &pkg_json.dev_dependencies {
            for dep_name in deps.keys() {
                if workspace_names.contains(dep_name.as_str()) && !internal.contains(dep_name) {
                    internal.push(dep_name.clone());
                }
            }
        }

        internal.sort();
        result.insert(name.clone(), internal);
    }

    Ok(result)
}

/// Resolve Rust/Cargo workspace crates.
fn resolve_native_crates(
    root_dir: &Path,
    config_workspace: Option<&WorkspaceConfig>,
) -> Result<BTreeMap<String, NativeCrate>, String> {
    // Try config first
    if let Some(ws) = config_workspace {
        if let Some(native) = &ws.native {
            let native_root = root_dir.join(&native.root);
            let mut crates = BTreeMap::new();
            for member in &native.members {
                let crate_dir = native_root.join(member);
                if !crate_dir.exists() {
                    return Err(format!(
                        "native crate directory not found: {}",
                        crate_dir.display()
                    ));
                }
                let rel_path = crate_dir
                    .strip_prefix(root_dir)
                    .unwrap_or(&crate_dir)
                    .to_path_buf();
                crates.insert(
                    member.clone(),
                    NativeCrate {
                        name: member.clone(),
                        path: rel_path,
                    },
                );
            }
            return Ok(crates);
        }
    }

    // Fall back to cargo metadata if Cargo.toml exists
    let cargo_toml = root_dir.join("Cargo.toml");
    if !cargo_toml.exists() {
        return Ok(BTreeMap::new());
    }

    // Check if it has a [workspace] section
    let content =
        std::fs::read_to_string(&cargo_toml).map_err(|e| format!("read Cargo.toml: {e}"))?;
    if !content.contains("[workspace]") {
        return Ok(BTreeMap::new());
    }

    resolve_native_via_cargo_metadata(root_dir)
}

/// Run `cargo metadata` to discover Cargo workspace members.
fn resolve_native_via_cargo_metadata(
    root_dir: &Path,
) -> Result<BTreeMap<String, NativeCrate>, String> {
    let output = std::process::Command::new("cargo")
        .args(["metadata", "--format-version=1", "--no-deps"])
        .current_dir(root_dir)
        .output()
        .map_err(|e| format!("failed to run cargo metadata: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("cargo metadata failed: {stderr}"));
    }

    let metadata: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("parse cargo metadata: {e}"))?;

    let mut crates = BTreeMap::new();

    if let Some(packages) = metadata.get("packages").and_then(|v| v.as_array()) {
        let workspace_root = metadata
            .get("workspace_root")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        for pkg in packages {
            let name = pkg.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let manifest = pkg
                .get("manifest_path")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if name.is_empty() || manifest.is_empty() {
                continue;
            }

            // Get the crate directory (parent of Cargo.toml)
            let crate_dir = Path::new(manifest).parent().unwrap_or(Path::new(""));

            // Make path relative to the project root (not the Cargo workspace root)
            let rel_path = crate_dir
                .strip_prefix(root_dir)
                .or_else(|_| crate_dir.strip_prefix(workspace_root))
                .unwrap_or(crate_dir)
                .to_path_buf();

            crates.insert(
                name.to_string(),
                NativeCrate {
                    name: name.to_string(),
                    path: rel_path,
                },
            );
        }
    }

    Ok(crates)
}

// ---------------------------------------------------------------------------
// Minimal package.json parser (just the fields we need)
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Deserialize)]
struct MinimalPackageJson {
    name: Option<String>,
    version: Option<String>,
    #[serde(default, deserialize_with = "deserialize_workspaces")]
    workspaces: Option<Vec<String>>,
    dependencies: Option<BTreeMap<String, serde_json::Value>>,
    #[serde(rename = "devDependencies")]
    dev_dependencies: Option<BTreeMap<String, serde_json::Value>>,
}

/// Deserialize `workspaces` field which can be either:
/// - an array: `["packages/*"]`
/// - an object with a `packages` key: `{ "packages": ["packages/*"], "nohoist": [...] }`
fn deserialize_workspaces<'de, D>(deserializer: D) -> Result<Option<Vec<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: Option<serde_json::Value> = Option::deserialize(deserializer)?;
    match value {
        None => Ok(None),
        Some(serde_json::Value::Array(arr)) => {
            let strs: Result<Vec<String>, _> = arr
                .into_iter()
                .map(|v| match v {
                    serde_json::Value::String(s) => Ok(s),
                    _ => Err(serde::de::Error::custom(
                        "workspace pattern must be a string",
                    )),
                })
                .collect();
            Ok(Some(strs?))
        }
        Some(serde_json::Value::Object(obj)) => {
            if let Some(serde_json::Value::Array(arr)) = obj.get("packages") {
                let strs: Result<Vec<String>, _> = arr
                    .iter()
                    .map(|v| match v {
                        serde_json::Value::String(s) => Ok(s.clone()),
                        _ => Err(serde::de::Error::custom(
                            "workspace pattern must be a string",
                        )),
                    })
                    .collect();
                Ok(Some(strs?))
            } else {
                Ok(Some(vec![]))
            }
        }
        Some(_) => Err(serde::de::Error::custom(
            "workspaces must be an array or object",
        )),
    }
}

fn read_package_json(path: &Path) -> Result<MinimalPackageJson, String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    serde_json::from_str(&content).map_err(|e| format!("parse {}: {e}", path.display()))
}

// ---------------------------------------------------------------------------
// Cycle detection (validates the workspace dependency graph)
// ---------------------------------------------------------------------------

/// Check for circular dependencies in the workspace graph.
/// Returns Ok(()) if acyclic, Err with cycle path if cycle found.
pub fn validate_no_cycles(packages: &BTreeMap<String, WorkspacePackage>) -> Result<(), String> {
    let mut visited = HashSet::new();
    let mut in_stack = HashSet::new();
    let mut path = Vec::new();

    for name in packages.keys() {
        if !visited.contains(name.as_str()) {
            if let Some(cycle) = dfs_cycle(name, packages, &mut visited, &mut in_stack, &mut path) {
                return Err(format!(
                    "circular dependency detected:\n  {}",
                    cycle.join(" → ")
                ));
            }
        }
    }

    Ok(())
}

fn dfs_cycle<'a>(
    node: &'a str,
    packages: &'a BTreeMap<String, WorkspacePackage>,
    visited: &mut HashSet<&'a str>,
    in_stack: &mut HashSet<&'a str>,
    path: &mut Vec<&'a str>,
) -> Option<Vec<String>> {
    visited.insert(node);
    in_stack.insert(node);
    path.push(node);

    if let Some(pkg) = packages.get(node) {
        for dep in &pkg.internal_deps {
            if !visited.contains(dep.as_str()) {
                if let Some(cycle) = dfs_cycle(dep, packages, visited, in_stack, path) {
                    return Some(cycle);
                }
            } else if in_stack.contains(dep.as_str()) {
                // Found a cycle — extract the cycle path
                let cycle_start = path.iter().position(|&n| n == dep.as_str()).unwrap_or(0);
                let mut cycle: Vec<String> =
                    path[cycle_start..].iter().map(|s| s.to_string()).collect();
                cycle.push(dep.clone());
                return Some(cycle);
            }
        }
    }

    path.pop();
    in_stack.remove(node);
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn make_pkg(name: &str, deps: Vec<&str>) -> WorkspacePackage {
        WorkspacePackage {
            name: name.to_string(),
            version: "1.0.0".to_string(),
            path: PathBuf::from(format!("packages/{name}")),
            internal_deps: deps.into_iter().map(String::from).collect(),
        }
    }

    #[test]
    fn cycle_detection_acyclic() {
        let mut packages = BTreeMap::new();
        packages.insert("a".to_string(), make_pkg("a", vec!["b"]));
        packages.insert("b".to_string(), make_pkg("b", vec!["c"]));
        packages.insert("c".to_string(), make_pkg("c", vec![]));

        assert!(validate_no_cycles(&packages).is_ok());
    }

    #[test]
    fn cycle_detection_simple_cycle() {
        let mut packages = BTreeMap::new();
        packages.insert("a".to_string(), make_pkg("a", vec!["b"]));
        packages.insert("b".to_string(), make_pkg("b", vec!["a"]));

        let result = validate_no_cycles(&packages);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("circular dependency"));
        assert!(err.contains("a"));
        assert!(err.contains("b"));
    }

    #[test]
    fn cycle_detection_triangle_cycle() {
        let mut packages = BTreeMap::new();
        packages.insert("a".to_string(), make_pkg("a", vec!["b"]));
        packages.insert("b".to_string(), make_pkg("b", vec!["c"]));
        packages.insert("c".to_string(), make_pkg("c", vec!["a"]));

        let result = validate_no_cycles(&packages);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("circular dependency"));
    }

    #[test]
    fn cycle_detection_diamond_acyclic() {
        // Diamond: a→b, a→c, b→d, c→d — no cycle
        let mut packages = BTreeMap::new();
        packages.insert("a".to_string(), make_pkg("a", vec!["b", "c"]));
        packages.insert("b".to_string(), make_pkg("b", vec!["d"]));
        packages.insert("c".to_string(), make_pkg("c", vec!["d"]));
        packages.insert("d".to_string(), make_pkg("d", vec![]));

        assert!(validate_no_cycles(&packages).is_ok());
    }

    #[test]
    fn cycle_detection_no_deps() {
        let mut packages = BTreeMap::new();
        packages.insert("a".to_string(), make_pkg("a", vec![]));
        packages.insert("b".to_string(), make_pkg("b", vec![]));

        assert!(validate_no_cycles(&packages).is_ok());
    }

    #[test]
    fn resolve_ts_packages_from_fixture() {
        // Create a minimal workspace fixture
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        // Root package.json with workspaces
        std::fs::write(
            root.join("package.json"),
            r#"{"workspaces": ["packages/*"]}"#,
        )
        .unwrap();

        // Package A depends on B
        let pkg_a = root.join("packages/a");
        std::fs::create_dir_all(&pkg_a).unwrap();
        std::fs::write(
            pkg_a.join("package.json"),
            r#"{"name": "@test/a", "version": "1.0.0", "dependencies": {"@test/b": "workspace:*"}}"#,
        )
        .unwrap();

        // Package B — no workspace deps
        let pkg_b = root.join("packages/b");
        std::fs::create_dir_all(&pkg_b).unwrap();
        std::fs::write(
            pkg_b.join("package.json"),
            r#"{"name": "@test/b", "version": "1.0.0"}"#,
        )
        .unwrap();

        let result = resolve(root, None).unwrap();
        assert_eq!(result.packages.len(), 2);
        assert!(result.packages.contains_key("@test/a"));
        assert!(result.packages.contains_key("@test/b"));

        // Check internal deps
        assert_eq!(
            result.packages["@test/a"].internal_deps,
            vec!["@test/b".to_string()]
        );
        assert!(result.packages["@test/b"].internal_deps.is_empty());
    }

    #[test]
    fn resolve_ts_packages_no_package_json() {
        let dir = tempfile::tempdir().unwrap();
        let result = resolve(dir.path(), None).unwrap();
        assert!(result.packages.is_empty());
    }

    #[test]
    fn resolve_ts_packages_duplicate_name() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        std::fs::write(
            root.join("package.json"),
            r#"{"workspaces": ["packages/*", "libs/*"]}"#,
        )
        .unwrap();

        // Same name in two locations
        let pkg_a1 = root.join("packages/a");
        std::fs::create_dir_all(&pkg_a1).unwrap();
        std::fs::write(
            pkg_a1.join("package.json"),
            r#"{"name": "@test/dup", "version": "1.0.0"}"#,
        )
        .unwrap();

        let pkg_a2 = root.join("libs/a");
        std::fs::create_dir_all(&pkg_a2).unwrap();
        std::fs::write(
            pkg_a2.join("package.json"),
            r#"{"name": "@test/dup", "version": "2.0.0"}"#,
        )
        .unwrap();

        let result = resolve(root, None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("duplicate workspace name"));
    }

    #[test]
    fn resolve_with_config_override() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        // Root has workspaces pointing to packages/*
        std::fs::write(
            root.join("package.json"),
            r#"{"workspaces": ["packages/*"]}"#,
        )
        .unwrap();

        let pkg_a = root.join("packages/a");
        std::fs::create_dir_all(&pkg_a).unwrap();
        std::fs::write(
            pkg_a.join("package.json"),
            r#"{"name": "@test/a", "version": "1.0.0"}"#,
        )
        .unwrap();

        // Also create a libs dir not in root workspaces
        let lib_b = root.join("libs/b");
        std::fs::create_dir_all(&lib_b).unwrap();
        std::fs::write(
            lib_b.join("package.json"),
            r#"{"name": "@test/b", "version": "1.0.0"}"#,
        )
        .unwrap();

        // Config overrides to only look at libs/*
        let config = WorkspaceConfig {
            packages: vec!["libs/*".to_string()],
            native: None,
        };

        let result = resolve(root, Some(&config)).unwrap();
        // Should only find @test/b from libs/, not @test/a from packages/
        assert_eq!(result.packages.len(), 1);
        assert!(result.packages.contains_key("@test/b"));
    }

    #[test]
    fn resolve_native_from_config() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        // Create native directories
        let native_root = root.join("native");
        std::fs::create_dir_all(native_root.join("vtz")).unwrap();
        std::fs::create_dir_all(native_root.join("compiler")).unwrap();

        let config = WorkspaceConfig {
            packages: vec![],
            native: Some(crate::ci::types::NativeWorkspaceConfig {
                root: "native".to_string(),
                members: vec!["vtz".to_string(), "compiler".to_string()],
            }),
        };

        let result = resolve(root, Some(&config)).unwrap();
        assert_eq!(result.native_crates.len(), 2);
        assert!(result.native_crates.contains_key("vtz"));
        assert!(result.native_crates.contains_key("compiler"));
        assert_eq!(
            result.native_crates["vtz"].path,
            PathBuf::from("native/vtz")
        );
    }

    #[test]
    fn resolve_native_missing_dir() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        let config = WorkspaceConfig {
            packages: vec![],
            native: Some(crate::ci::types::NativeWorkspaceConfig {
                root: "native".to_string(),
                members: vec!["nonexistent".to_string()],
            }),
        };

        let result = resolve(root, Some(&config));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    fn resolve_ts_packages_object_workspaces() {
        // Test the Yarn-style object format: { "packages": [...] }
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        std::fs::write(
            root.join("package.json"),
            r#"{"workspaces": {"packages": ["packages/*"], "nohoist": ["**/react"]}}"#,
        )
        .unwrap();

        let pkg_a = root.join("packages/a");
        std::fs::create_dir_all(&pkg_a).unwrap();
        std::fs::write(
            pkg_a.join("package.json"),
            r#"{"name": "@test/a", "version": "1.0.0"}"#,
        )
        .unwrap();

        let result = resolve(root, None).unwrap();
        assert_eq!(result.packages.len(), 1);
        assert!(result.packages.contains_key("@test/a"));
    }
}
