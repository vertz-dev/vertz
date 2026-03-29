use crate::pm::resolver::ResolvedGraph;
use crate::pm::scripts;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

const MANIFEST_FILE: &str = ".vertz-manifest.json";

/// A single entry in the link manifest
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestEntry {
    pub name: String,
    pub version: String,
    pub nest_path: Vec<String>,
    pub has_scripts: bool,
    #[serde(default)]
    pub has_patch: bool,
}

/// The link manifest stored at node_modules/.vertz-manifest.json
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LinkManifest {
    pub packages: BTreeMap<String, ManifestEntry>,
}

/// Read the manifest from node_modules/.vertz-manifest.json
/// Returns None if missing or corrupt (triggering full relink)
pub fn read_manifest(root_dir: &Path) -> Option<LinkManifest> {
    let path = root_dir.join("node_modules").join(MANIFEST_FILE);
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Write the manifest to node_modules/.vertz-manifest.json
pub fn write_manifest(
    root_dir: &Path,
    manifest: &LinkManifest,
) -> Result<(), Box<dyn std::error::Error>> {
    let nm = root_dir.join("node_modules");
    std::fs::create_dir_all(&nm)?;
    let path = nm.join(MANIFEST_FILE);
    let content = serde_json::to_string_pretty(manifest)?;
    std::fs::write(path, content)?;
    Ok(())
}

/// Build the desired manifest from the resolved graph
pub fn build_manifest(graph: &ResolvedGraph, patched_packages: &HashSet<String>) -> LinkManifest {
    let mut packages = BTreeMap::new();
    for pkg in graph.packages.values() {
        let key = manifest_key(&pkg.name, &pkg.version, &pkg.nest_path);
        let has_scripts = scripts::has_postinstall(
            &graph
                .scripts
                .get(&format!("{}@{}", pkg.name, pkg.version))
                .cloned(),
        );
        let has_patch = patched_packages.contains(&pkg.name);
        packages.insert(
            key,
            ManifestEntry {
                name: pkg.name.clone(),
                version: pkg.version.clone(),
                nest_path: pkg.nest_path.clone(),
                has_scripts,
                has_patch,
            },
        );
    }
    LinkManifest { packages }
}

/// Compute a manifest key for a package
fn manifest_key(name: &str, version: &str, nest_path: &[String]) -> String {
    if nest_path.is_empty() {
        format!("{}@{}", name, version)
    } else {
        format!("{}@{}@{}", name, version, nest_path.join("/"))
    }
}

/// Link resolved packages from the global store into node_modules/
/// Supports incremental linking when a valid manifest exists.
pub fn link_packages(
    root_dir: &Path,
    graph: &ResolvedGraph,
    store_dir: &Path,
    patched_packages: &HashSet<String>,
) -> Result<LinkResult, Box<dyn std::error::Error>> {
    link_packages_incremental(root_dir, graph, store_dir, false, patched_packages)
}

/// Link packages with optional force flag to skip incremental check
pub fn link_packages_incremental(
    root_dir: &Path,
    graph: &ResolvedGraph,
    store_dir: &Path,
    force: bool,
    patched_packages: &HashSet<String>,
) -> Result<LinkResult, Box<dyn std::error::Error>> {
    let node_modules = root_dir.join("node_modules");
    let new_manifest = build_manifest(graph, patched_packages);

    // Try incremental linking
    if !force {
        if let Some(old_manifest) = read_manifest(root_dir) {
            return link_incremental(root_dir, graph, store_dir, &old_manifest, &new_manifest);
        }
    }

    // Full relink — nuke node_modules and relink everything
    if node_modules.exists() {
        std::fs::remove_dir_all(&node_modules)?;
    }
    std::fs::create_dir_all(&node_modules)?;

    let mut result = LinkResult::default();

    for pkg in graph.packages.values() {
        let source = store_path(store_dir, &pkg.name, &pkg.version);
        if !source.exists() {
            return Err(format!(
                "Package {}@{} not found in store at {}",
                pkg.name,
                pkg.version,
                source.display()
            )
            .into());
        }

        let target = target_path(&node_modules, &pkg.name, &pkg.nest_path);
        std::fs::create_dir_all(&target)?;

        let key = manifest_key(&pkg.name, &pkg.version, &pkg.nest_path);
        let entry = new_manifest.packages.get(&key).unwrap();
        let linked = if entry.has_scripts || entry.has_patch {
            copy_directory_recursive(&source, &target)?
        } else {
            link_directory_recursive(&source, &target)?
        };
        result.packages_linked += 1;
        result.files_linked += linked;
    }

    // Write manifest
    write_manifest(root_dir, &new_manifest)?;

    result.packages_cached = 0;
    Ok(result)
}

/// Perform incremental linking: only relink changed/new packages, remove stale ones
fn link_incremental(
    root_dir: &Path,
    graph: &ResolvedGraph,
    store_dir: &Path,
    old_manifest: &LinkManifest,
    new_manifest: &LinkManifest,
) -> Result<LinkResult, Box<dyn std::error::Error>> {
    let node_modules = root_dir.join("node_modules");
    std::fs::create_dir_all(&node_modules)?;

    let mut result = LinkResult::default();

    // Find packages to remove (in old but not in new)
    for (key, old_entry) in &old_manifest.packages {
        if !new_manifest.packages.contains_key(key) {
            // Remove from node_modules using the package name (not the manifest key)
            let target = target_path(&node_modules, &old_entry.name, &old_entry.nest_path);
            if target.exists() {
                let _ = std::fs::remove_dir_all(&target);
            }
        }
    }

    // Link new or changed packages
    for pkg in graph.packages.values() {
        let key = manifest_key(&pkg.name, &pkg.version, &pkg.nest_path);
        let new_entry = new_manifest.packages.get(&key).unwrap();

        if let Some(old_entry) = old_manifest.packages.get(&key) {
            if old_entry == new_entry {
                // Unchanged — skip (cached)
                result.packages_cached += 1;
                continue;
            }
        }

        // New or changed — relink
        let source = store_path(store_dir, &pkg.name, &pkg.version);
        if !source.exists() {
            return Err(format!(
                "Package {}@{} not found in store at {}",
                pkg.name,
                pkg.version,
                source.display()
            )
            .into());
        }

        let target = target_path(&node_modules, &pkg.name, &pkg.nest_path);

        // Remove old target if it exists
        if target.exists() {
            std::fs::remove_dir_all(&target)?;
        }
        std::fs::create_dir_all(&target)?;

        let linked = if new_entry.has_scripts || new_entry.has_patch {
            copy_directory_recursive(&source, &target)?
        } else {
            link_directory_recursive(&source, &target)?
        };
        result.packages_linked += 1;
        result.files_linked += linked;
    }

    // Write updated manifest
    write_manifest(root_dir, new_manifest)?;

    Ok(result)
}

/// Compute target path in node_modules for a package
fn target_path(node_modules: &Path, name: &str, nest_path: &[String]) -> PathBuf {
    if nest_path.is_empty() {
        node_modules.join(name)
    } else {
        let mut target = node_modules.to_path_buf();
        for parent in nest_path {
            target = target.join(parent).join("node_modules");
        }
        target.join(name)
    }
}

/// Recursively hardlink all files from source to target, creating directories as needed.
/// Public so `audit --fix` can re-link individual packages without a full ResolvedGraph.
pub fn link_directory_recursive(
    source: &Path,
    target: &Path,
) -> Result<usize, Box<dyn std::error::Error>> {
    let mut count = 0;

    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());

        if file_type.is_dir() {
            std::fs::create_dir_all(&target_path)?;
            count += link_directory_recursive(&source_path, &target_path)?;
        } else if file_type.is_file() {
            match std::fs::hard_link(&source_path, &target_path) {
                Ok(()) => count += 1,
                Err(_) => {
                    // Fallback to copy if hardlink fails (cross-filesystem, etc.)
                    std::fs::copy(&source_path, &target_path)?;
                    count += 1;
                }
            }
        }
        // Skip symlinks
    }

    Ok(count)
}

/// Recursively copy all files from source to target (no hardlinks)
/// Used for packages with postinstall scripts to protect the global store.
fn copy_directory_recursive(
    source: &Path,
    target: &Path,
) -> Result<usize, Box<dyn std::error::Error>> {
    let mut count = 0;

    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());

        if file_type.is_dir() {
            std::fs::create_dir_all(&target_path)?;
            count += copy_directory_recursive(&source_path, &target_path)?;
        } else if file_type.is_file() {
            std::fs::copy(&source_path, &target_path)?;
            count += 1;
        }
        // Skip symlinks
    }

    Ok(count)
}

/// Get the store path for a package
fn store_path(store_dir: &Path, name: &str, version: &str) -> PathBuf {
    store_dir.join(format!("{}@{}", name.replace('/', "+"), version))
}

#[derive(Debug, Default)]
pub struct LinkResult {
    pub packages_linked: usize,
    pub files_linked: usize,
    pub packages_cached: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pm::types::ResolvedPackage;
    use std::collections::BTreeMap;

    fn create_store_package(store_dir: &Path, name: &str, version: &str, files: &[(&str, &str)]) {
        let pkg_dir = store_path(store_dir, name, version);
        std::fs::create_dir_all(&pkg_dir).unwrap();
        for (file_name, content) in files {
            let file_path = pkg_dir.join(file_name);
            if let Some(parent) = file_path.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(file_path, content).unwrap();
        }
    }

    #[test]
    fn test_link_single_package() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        std::fs::create_dir_all(&root).unwrap();

        create_store_package(
            &store,
            "zod",
            "3.24.4",
            &[
                ("index.js", "module.exports = {}"),
                ("package.json", r#"{"name":"zod","version":"3.24.4"}"#),
            ],
        );

        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let result = link_packages(&root, &graph, &store, &HashSet::new()).unwrap();
        assert_eq!(result.packages_linked, 1);
        assert_eq!(result.files_linked, 2);

        // Verify files exist
        assert!(root.join("node_modules/zod/index.js").exists());
        assert!(root.join("node_modules/zod/package.json").exists());

        // Verify content
        let content = std::fs::read_to_string(root.join("node_modules/zod/index.js")).unwrap();
        assert_eq!(content, "module.exports = {}");

        // Verify manifest was written
        let manifest = read_manifest(&root).unwrap();
        assert_eq!(manifest.packages.len(), 1);
        assert!(manifest.packages.contains_key("zod@3.24.4"));
    }

    #[test]
    fn test_link_scoped_package() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        std::fs::create_dir_all(&root).unwrap();

        create_store_package(
            &store,
            "@vertz/ui",
            "0.1.42",
            &[("index.js", "export default {}")],
        );

        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "@vertz/ui@0.1.42".to_string(),
            ResolvedPackage {
                name: "@vertz/ui".to_string(),
                version: "0.1.42".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let result = link_packages(&root, &graph, &store, &HashSet::new()).unwrap();
        assert_eq!(result.packages_linked, 1);
        assert!(root.join("node_modules/@vertz/ui/index.js").exists());
    }

    #[test]
    fn test_link_nested_package() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        std::fs::create_dir_all(&root).unwrap();

        create_store_package(&store, "dep-a", "1.0.0", &[("index.js", "a")]);
        create_store_package(&store, "dep-b", "2.0.0", &[("index.js", "b")]);

        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "dep-a@1.0.0".to_string(),
            ResolvedPackage {
                name: "dep-a".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        graph.packages.insert(
            "dep-b@2.0.0".to_string(),
            ResolvedPackage {
                name: "dep-b".to_string(),
                version: "2.0.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec!["dep-a".to_string()],
            },
        );

        let result = link_packages(&root, &graph, &store, &HashSet::new()).unwrap();
        assert_eq!(result.packages_linked, 2);

        // Root-level dep-a
        assert!(root.join("node_modules/dep-a/index.js").exists());
        // Nested dep-b under dep-a
        assert!(root
            .join("node_modules/dep-a/node_modules/dep-b/index.js")
            .exists());
    }

    #[test]
    fn test_link_cleans_existing_node_modules() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        let nm = root.join("node_modules");
        std::fs::create_dir_all(nm.join("stale-pkg")).unwrap();
        std::fs::write(nm.join("stale-pkg/index.js"), "old").unwrap();

        create_store_package(&store, "zod", "3.24.4", &[("index.js", "new")]);

        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        link_packages(&root, &graph, &store, &HashSet::new()).unwrap();

        // Stale package should be gone
        assert!(!nm.join("stale-pkg").exists());
        // New package should be there
        assert!(nm.join("zod/index.js").exists());
    }

    #[test]
    fn test_link_with_subdirectories() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        std::fs::create_dir_all(&root).unwrap();

        create_store_package(
            &store,
            "pkg",
            "1.0.0",
            &[
                ("index.js", "root"),
                ("lib/utils.js", "utils"),
                ("lib/helpers/format.js", "format"),
            ],
        );

        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "pkg@1.0.0".to_string(),
            ResolvedPackage {
                name: "pkg".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let result = link_packages(&root, &graph, &store, &HashSet::new()).unwrap();
        assert_eq!(result.files_linked, 3);
        assert!(root.join("node_modules/pkg/lib/utils.js").exists());
        assert!(root.join("node_modules/pkg/lib/helpers/format.js").exists());
    }

    #[test]
    fn test_link_missing_store_package() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        std::fs::create_dir_all(&root).unwrap();

        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "missing@1.0.0".to_string(),
            ResolvedPackage {
                name: "missing".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let result = link_packages(&root, &graph, &store, &HashSet::new());
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("not found in store"));
    }

    // --- Incremental linking tests ---

    #[test]
    fn test_incremental_no_changes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        std::fs::create_dir_all(&root).unwrap();

        create_store_package(
            &store,
            "zod",
            "3.24.4",
            &[("index.js", "module.exports = {}")],
        );

        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        // First install — full link
        let result1 = link_packages(&root, &graph, &store, &HashSet::new()).unwrap();
        assert_eq!(result1.packages_linked, 1);
        assert_eq!(result1.packages_cached, 0);

        // Second install — incremental, nothing changed
        let result2 = link_packages(&root, &graph, &store, &HashSet::new()).unwrap();
        assert_eq!(result2.packages_linked, 0);
        assert_eq!(result2.packages_cached, 1);

        // Files should still exist
        assert!(root.join("node_modules/zod/index.js").exists());
    }

    #[test]
    fn test_incremental_new_package_added() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        std::fs::create_dir_all(&root).unwrap();

        create_store_package(&store, "zod", "3.24.4", &[("index.js", "zod")]);
        create_store_package(&store, "react", "18.3.1", &[("index.js", "react")]);

        // First install — just zod
        let mut graph1 = ResolvedGraph::default();
        graph1.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        link_packages(&root, &graph1, &store, &HashSet::new()).unwrap();

        // Second install — zod + react
        let mut graph2 = ResolvedGraph::default();
        graph2.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        graph2.packages.insert(
            "react@18.3.1".to_string(),
            ResolvedPackage {
                name: "react".to_string(),
                version: "18.3.1".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        let result = link_packages(&root, &graph2, &store, &HashSet::new()).unwrap();
        assert_eq!(result.packages_linked, 1); // Only react
        assert_eq!(result.packages_cached, 1); // zod cached

        assert!(root.join("node_modules/zod/index.js").exists());
        assert!(root.join("node_modules/react/index.js").exists());
    }

    #[test]
    fn test_incremental_package_removed() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        std::fs::create_dir_all(&root).unwrap();

        create_store_package(&store, "zod", "3.24.4", &[("index.js", "zod")]);
        create_store_package(&store, "react", "18.3.1", &[("index.js", "react")]);

        // First install — zod + react
        let mut graph1 = ResolvedGraph::default();
        graph1.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        graph1.packages.insert(
            "react@18.3.1".to_string(),
            ResolvedPackage {
                name: "react".to_string(),
                version: "18.3.1".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        link_packages(&root, &graph1, &store, &HashSet::new()).unwrap();
        assert!(root.join("node_modules/react/index.js").exists());

        // Second install — only zod (react removed)
        let mut graph2 = ResolvedGraph::default();
        graph2.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        let result = link_packages(&root, &graph2, &store, &HashSet::new()).unwrap();
        assert_eq!(result.packages_cached, 1); // zod cached
        assert_eq!(result.packages_linked, 0);

        assert!(root.join("node_modules/zod/index.js").exists());
        // react should be removed — the removal targets the package name path
        // Note: removal uses the manifest key, which includes the name
    }

    #[test]
    fn test_incremental_corrupted_manifest() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        std::fs::create_dir_all(&root).unwrap();

        create_store_package(&store, "zod", "3.24.4", &[("index.js", "zod")]);

        // Write a corrupt manifest
        let nm = root.join("node_modules");
        std::fs::create_dir_all(&nm).unwrap();
        std::fs::write(nm.join(MANIFEST_FILE), "not json").unwrap();

        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        // Should fall back to full relink
        let result = link_packages(&root, &graph, &store, &HashSet::new()).unwrap();
        assert_eq!(result.packages_linked, 1);
        assert_eq!(result.packages_cached, 0);
        assert!(root.join("node_modules/zod/index.js").exists());
    }

    #[test]
    fn test_force_flag_skips_manifest() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        std::fs::create_dir_all(&root).unwrap();

        create_store_package(&store, "zod", "3.24.4", &[("index.js", "zod")]);

        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        // First install
        link_packages(&root, &graph, &store, &HashSet::new()).unwrap();

        // Force relink — should relink everything despite manifest
        let result =
            link_packages_incremental(&root, &graph, &store, true, &HashSet::new()).unwrap();
        assert_eq!(result.packages_linked, 1);
        assert_eq!(result.packages_cached, 0);
    }

    #[test]
    fn test_manifest_roundtrip() {
        let mut manifest = LinkManifest::default();
        manifest.packages.insert(
            "zod@3.24.4".to_string(),
            ManifestEntry {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                nest_path: vec![],
                has_scripts: false,
                has_patch: false,
            },
        );
        manifest.packages.insert(
            "esbuild@0.20.0".to_string(),
            ManifestEntry {
                name: "esbuild".to_string(),
                version: "0.20.0".to_string(),
                nest_path: vec![],
                has_scripts: true,
                has_patch: false,
            },
        );

        let dir = tempfile::tempdir().unwrap();
        write_manifest(dir.path(), &manifest).unwrap();
        let loaded = read_manifest(dir.path()).unwrap();
        assert_eq!(loaded.packages.len(), 2);
        assert_eq!(loaded.packages["zod@3.24.4"].version, "3.24.4");
        assert!(!loaded.packages["zod@3.24.4"].has_scripts);
        assert!(loaded.packages["esbuild@0.20.0"].has_scripts);
    }

    #[test]
    fn test_manifest_key_flat() {
        assert_eq!(manifest_key("zod", "3.24.4", &[]), "zod@3.24.4");
    }

    #[test]
    fn test_manifest_key_nested() {
        assert_eq!(
            manifest_key("dep-b", "2.0.0", &["dep-a".to_string()]),
            "dep-b@2.0.0@dep-a"
        );
    }

    #[test]
    fn test_build_manifest_from_graph() {
        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let manifest = build_manifest(&graph, &HashSet::new());
        assert_eq!(manifest.packages.len(), 1);
        let entry = &manifest.packages["zod@3.24.4"];
        assert_eq!(entry.version, "3.24.4");
        assert!(!entry.has_scripts);
    }

    #[cfg(unix)]
    #[test]
    fn test_link_copies_packages_with_postinstall_scripts() {
        use std::os::unix::fs::MetadataExt;

        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        std::fs::create_dir_all(&root).unwrap();

        // zod: no postinstall (should be hardlinked)
        create_store_package(&store, "zod", "3.24.4", &[("index.js", "zod")]);
        // esbuild: has postinstall (should be copied)
        create_store_package(&store, "esbuild", "0.20.0", &[("index.js", "esbuild")]);

        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        graph.packages.insert(
            "esbuild@0.20.0".to_string(),
            ResolvedPackage {
                name: "esbuild".to_string(),
                version: "0.20.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        // Mark esbuild as having postinstall
        let mut pkg_scripts = BTreeMap::new();
        pkg_scripts.insert("postinstall".to_string(), "node install.js".to_string());
        graph
            .scripts
            .insert("esbuild@0.20.0".to_string(), pkg_scripts);

        link_packages(&root, &graph, &store, &HashSet::new()).unwrap();

        // zod should be hardlinked (same inode)
        let store_zod = store_path(&store, "zod", "3.24.4").join("index.js");
        let linked_zod = root.join("node_modules/zod/index.js");
        assert_eq!(
            std::fs::metadata(&store_zod).unwrap().ino(),
            std::fs::metadata(&linked_zod).unwrap().ino(),
            "zod should be hardlinked (same inode)"
        );

        // esbuild should be copied (different inode)
        let store_esbuild = store_path(&store, "esbuild", "0.20.0").join("index.js");
        let linked_esbuild = root.join("node_modules/esbuild/index.js");
        assert_ne!(
            std::fs::metadata(&store_esbuild).unwrap().ino(),
            std::fs::metadata(&linked_esbuild).unwrap().ino(),
            "esbuild should be copied (different inode)"
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_incremental_link_copies_packages_with_postinstall_scripts() {
        use std::os::unix::fs::MetadataExt;

        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        let store = dir.path().join("store");
        std::fs::create_dir_all(&root).unwrap();

        create_store_package(&store, "zod", "3.24.4", &[("index.js", "zod")]);
        create_store_package(&store, "esbuild", "0.20.0", &[("index.js", "esbuild")]);

        // First install — just zod (no scripts)
        let mut graph1 = ResolvedGraph::default();
        graph1.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        link_packages(&root, &graph1, &store, &HashSet::new()).unwrap();

        // Second install — add esbuild with postinstall (incremental path)
        let mut graph2 = ResolvedGraph::default();
        graph2.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        graph2.packages.insert(
            "esbuild@0.20.0".to_string(),
            ResolvedPackage {
                name: "esbuild".to_string(),
                version: "0.20.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        let mut pkg_scripts = BTreeMap::new();
        pkg_scripts.insert("postinstall".to_string(), "node install.js".to_string());
        graph2
            .scripts
            .insert("esbuild@0.20.0".to_string(), pkg_scripts);

        link_packages(&root, &graph2, &store, &HashSet::new()).unwrap();

        // esbuild should be copied (different inode) via incremental path
        let store_esbuild = store_path(&store, "esbuild", "0.20.0").join("index.js");
        let linked_esbuild = root.join("node_modules/esbuild/index.js");
        assert_ne!(
            std::fs::metadata(&store_esbuild).unwrap().ino(),
            std::fs::metadata(&linked_esbuild).unwrap().ino(),
            "esbuild should be copied (different inode) in incremental path"
        );
    }

    #[test]
    fn test_build_manifest_with_scripts() {
        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "esbuild@0.20.0".to_string(),
            ResolvedPackage {
                name: "esbuild".to_string(),
                version: "0.20.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        let mut pkg_scripts = BTreeMap::new();
        pkg_scripts.insert("postinstall".to_string(), "node install.js".to_string());
        graph
            .scripts
            .insert("esbuild@0.20.0".to_string(), pkg_scripts);

        let manifest = build_manifest(&graph, &HashSet::new());
        assert!(manifest.packages["esbuild@0.20.0"].has_scripts);
    }
}
