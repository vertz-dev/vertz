use crate::pm::resolver::ResolvedGraph;
use std::path::Path;

/// Generate .bin/ stubs for all packages with bin entries
pub fn generate_bin_stubs(
    root_dir: &Path,
    graph: &ResolvedGraph,
) -> Result<usize, Box<dyn std::error::Error>> {
    let bin_dir = root_dir.join("node_modules").join(".bin");
    std::fs::create_dir_all(&bin_dir)?;

    let mut count = 0;

    for pkg in graph.packages.values() {
        // Only generate stubs for root-level packages (not nested)
        if !pkg.nest_path.is_empty() {
            continue;
        }

        for (bin_name, bin_path) in &pkg.bin {
            let stub_path = bin_dir.join(bin_name);
            let target = format!("../{}/{}", pkg.name, bin_path.trim_start_matches("./"));

            let stub_content = format!(
                "#!/bin/sh\nexec node \"$(dirname \"$0\")/{}\" \"$@\"\n",
                target
            );

            std::fs::write(&stub_path, stub_content)?;

            // Make executable
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let perms = std::fs::Permissions::from_mode(0o755);
                std::fs::set_permissions(&stub_path, perms)?;
            }

            count += 1;
        }
    }

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pm::types::ResolvedPackage;
    use std::collections::BTreeMap;

    #[test]
    fn test_generate_bin_stubs() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let mut graph = ResolvedGraph::default();
        let mut bin = BTreeMap::new();
        bin.insert("esbuild".to_string(), "./bin/esbuild".to_string());

        graph.packages.insert(
            "esbuild@0.24.0".to_string(),
            ResolvedPackage {
                name: "esbuild".to_string(),
                version: "0.24.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin,
                nest_path: vec![],
            },
        );

        let count = generate_bin_stubs(root, &graph).unwrap();
        assert_eq!(count, 1);

        let stub_path = root.join("node_modules/.bin/esbuild");
        assert!(stub_path.exists());

        let content = std::fs::read_to_string(&stub_path).unwrap();
        assert!(content.starts_with("#!/bin/sh"));
        assert!(content.contains("esbuild/bin/esbuild"));
    }

    #[test]
    fn test_generate_multiple_bins() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let mut graph = ResolvedGraph::default();
        let mut bin = BTreeMap::new();
        bin.insert("tsc".to_string(), "./bin/tsc".to_string());
        bin.insert("tsserver".to_string(), "./bin/tsserver".to_string());

        graph.packages.insert(
            "typescript@5.7.0".to_string(),
            ResolvedPackage {
                name: "typescript".to_string(),
                version: "5.7.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin,
                nest_path: vec![],
            },
        );

        let count = generate_bin_stubs(root, &graph).unwrap();
        assert_eq!(count, 2);
        assert!(root.join("node_modules/.bin/tsc").exists());
        assert!(root.join("node_modules/.bin/tsserver").exists());
    }

    #[test]
    fn test_skip_nested_packages() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let mut graph = ResolvedGraph::default();
        let mut bin = BTreeMap::new();
        bin.insert("cmd".to_string(), "./bin/cmd".to_string());

        graph.packages.insert(
            "nested-pkg@1.0.0".to_string(),
            ResolvedPackage {
                name: "nested-pkg".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin,
                nest_path: vec!["parent-pkg".to_string()],
            },
        );

        let count = generate_bin_stubs(root, &graph).unwrap();
        assert_eq!(count, 0);
        assert!(!root.join("node_modules/.bin/cmd").exists());
    }

    #[test]
    fn test_no_bins() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

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

        let count = generate_bin_stubs(root, &graph).unwrap();
        assert_eq!(count, 0);
    }

    #[cfg(unix)]
    #[test]
    fn test_bin_stub_is_executable() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let mut graph = ResolvedGraph::default();
        let mut bin = BTreeMap::new();
        bin.insert("cmd".to_string(), "./bin/cmd".to_string());

        graph.packages.insert(
            "pkg@1.0.0".to_string(),
            ResolvedPackage {
                name: "pkg".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin,
                nest_path: vec![],
            },
        );

        generate_bin_stubs(root, &graph).unwrap();

        let perms = std::fs::metadata(root.join("node_modules/.bin/cmd"))
            .unwrap()
            .permissions();
        assert_eq!(perms.mode() & 0o111, 0o111); // executable bits set
    }
}
