use crate::pm::resolver::ResolvedGraph;
use std::path::{Path, PathBuf};

/// Link resolved packages from the global store into node_modules/
pub fn link_packages(
    root_dir: &Path,
    graph: &ResolvedGraph,
    store_dir: &Path,
) -> Result<LinkResult, Box<dyn std::error::Error>> {
    let node_modules = root_dir.join("node_modules");

    // Clean existing node_modules
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

        // Determine the target directory in node_modules
        let target = if pkg.nest_path.is_empty() {
            node_modules.join(&pkg.name)
        } else {
            // Nested: node_modules/<parent>/node_modules/<pkg>
            let mut target = node_modules.clone();
            for parent in &pkg.nest_path {
                target = target.join(parent).join("node_modules");
            }
            target.join(&pkg.name)
        };

        std::fs::create_dir_all(&target)?;

        // Per-file hardlink from store to target
        let linked = link_directory_recursive(&source, &target)?;
        result.packages_linked += 1;
        result.files_linked += linked;
    }

    Ok(result)
}

/// Recursively hardlink all files from source to target, creating directories as needed
fn link_directory_recursive(
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

/// Get the store path for a package
fn store_path(store_dir: &Path, name: &str, version: &str) -> PathBuf {
    store_dir.join(format!("{}@{}", name.replace('/', "+"), version))
}

#[derive(Debug, Default)]
pub struct LinkResult {
    pub packages_linked: usize,
    pub files_linked: usize,
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

        let result = link_packages(&root, &graph, &store).unwrap();
        assert_eq!(result.packages_linked, 1);
        assert_eq!(result.files_linked, 2);

        // Verify files exist
        assert!(root.join("node_modules/zod/index.js").exists());
        assert!(root.join("node_modules/zod/package.json").exists());

        // Verify content
        let content = std::fs::read_to_string(root.join("node_modules/zod/index.js")).unwrap();
        assert_eq!(content, "module.exports = {}");
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

        let result = link_packages(&root, &graph, &store).unwrap();
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

        let result = link_packages(&root, &graph, &store).unwrap();
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

        link_packages(&root, &graph, &store).unwrap();

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

        let result = link_packages(&root, &graph, &store).unwrap();
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

        let result = link_packages(&root, &graph, &store);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("not found in store"));
    }
}
