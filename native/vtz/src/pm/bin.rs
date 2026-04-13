use crate::pm::resolver::ResolvedGraph;
use crate::pm::workspace::WorkspacePackage;
use std::path::Path;

/// Write a single bin stub shell script to `bin_dir/<bin_name>`.
fn write_bin_stub(
    bin_dir: &Path,
    bin_name: &str,
    target: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let stub_path = bin_dir.join(bin_name);

    // Ensure parent directory exists (scoped bin names like @babel/parser
    // require creating .bin/@babel/)
    if let Some(parent) = stub_path.parent() {
        if parent != bin_dir {
            std::fs::create_dir_all(parent)?;
        }
    }

    let stub_content = if target.ends_with(".sh") {
        format!("#!/bin/sh\nexec \"$(dirname \"$0\")/{}\" \"$@\"\n", target)
    } else {
        format!(
            "#!/bin/sh\nexec node \"$(dirname \"$0\")/{}\" \"$@\"\n",
            target
        )
    };

    std::fs::write(&stub_path, stub_content)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&stub_path, perms)?;
    }

    Ok(())
}

/// Generate .bin/ stubs for all packages with bin entries.
/// Handles both npm registry packages (from the resolved graph) and
/// workspace packages (symlinked into node_modules/).
///
/// Workspace stubs are generated after npm stubs, so workspace packages
/// take precedence when both define the same bin name (matches npm/yarn/pnpm).
pub fn generate_bin_stubs(
    root_dir: &Path,
    graph: &ResolvedGraph,
    workspaces: &[WorkspacePackage],
) -> Result<usize, Box<dyn std::error::Error>> {
    let bin_dir = root_dir.join("node_modules").join(".bin");
    std::fs::create_dir_all(&bin_dir)?;

    let mut count = 0;

    // npm registry packages
    for pkg in graph.packages.values() {
        if !pkg.nest_path.is_empty() {
            continue;
        }

        for (bin_name, bin_path) in &pkg.bin {
            let target = format!("../{}/{}", pkg.name, bin_path.trim_start_matches("./"));
            write_bin_stub(&bin_dir, bin_name, &target)?;
            count += 1;
        }
    }

    // Workspace packages — generated after npm stubs so they take precedence
    for ws in workspaces {
        let bin_map = ws.pkg.bin.to_map(&ws.name);

        for (bin_name, bin_path) in &bin_map {
            let target = format!("../{}/{}", ws.name, bin_path.trim_start_matches("./"));
            write_bin_stub(&bin_dir, bin_name, &target)?;
            count += 1;
        }
    }

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pm::types::{BinField, PackageJson, ResolvedPackage};
    use std::collections::BTreeMap;
    use std::path::PathBuf;

    fn make_pkg_json(name: &str, bin: BinField) -> PackageJson {
        PackageJson {
            name: Some(name.to_string()),
            version: Some("1.0.0".to_string()),
            dependencies: BTreeMap::new(),
            dev_dependencies: BTreeMap::new(),
            peer_dependencies: BTreeMap::new(),
            optional_dependencies: BTreeMap::new(),
            bundled_dependencies: vec![],
            bin,
            scripts: BTreeMap::new(),
            workspaces: None,
            overrides: BTreeMap::new(),
            files: None,
        }
    }

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
                optional_dependencies: BTreeMap::new(),
                bin,
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        let count = generate_bin_stubs(root, &graph, &[]).unwrap();
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
                optional_dependencies: BTreeMap::new(),
                bin,
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        let count = generate_bin_stubs(root, &graph, &[]).unwrap();
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
                optional_dependencies: BTreeMap::new(),
                bin,
                nest_path: vec!["parent-pkg".to_string()],
                os: None,
                cpu: None,
            },
        );

        let count = generate_bin_stubs(root, &graph, &[]).unwrap();
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        let count = generate_bin_stubs(root, &graph, &[]).unwrap();
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
                optional_dependencies: BTreeMap::new(),
                bin,
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        generate_bin_stubs(root, &graph, &[]).unwrap();

        let perms = std::fs::metadata(root.join("node_modules/.bin/cmd"))
            .unwrap()
            .permissions();
        assert_eq!(perms.mode() & 0o111, 0o111); // executable bits set
    }

    // ─── Workspace bin stub tests ───

    #[test]
    fn test_workspace_bin_stubs_map() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let graph = ResolvedGraph::default();

        let mut bin_map = BTreeMap::new();
        bin_map.insert("vertz-build".to_string(), "./dist/cli.js".to_string());

        let workspaces = vec![WorkspacePackage {
            name: "@vertz/build".to_string(),
            version: "0.2.58".to_string(),
            path: PathBuf::from("packages/build"),
            pkg: make_pkg_json("@vertz/build", BinField::Map(bin_map)),
        }];

        let count = generate_bin_stubs(root, &graph, &workspaces).unwrap();
        assert_eq!(count, 1);

        let stub_path = root.join("node_modules/.bin/vertz-build");
        assert!(stub_path.exists(), "workspace bin stub should be created");

        let content = std::fs::read_to_string(&stub_path).unwrap();
        assert!(content.starts_with("#!/bin/sh"));
        assert!(
            content.contains("@vertz/build/dist/cli.js"),
            "stub should point to workspace package: {}",
            content
        );
    }

    #[test]
    fn test_workspace_bin_stubs_single() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let graph = ResolvedGraph::default();

        let workspaces = vec![WorkspacePackage {
            name: "my-cli".to_string(),
            version: "1.0.0".to_string(),
            path: PathBuf::from("packages/cli"),
            pkg: make_pkg_json("my-cli", BinField::Single("./bin/cli.js".to_string())),
        }];

        let count = generate_bin_stubs(root, &graph, &workspaces).unwrap();
        assert_eq!(count, 1);

        let stub_path = root.join("node_modules/.bin/my-cli");
        assert!(
            stub_path.exists(),
            "workspace bin stub (single) should be created"
        );

        let content = std::fs::read_to_string(&stub_path).unwrap();
        assert!(content.contains("my-cli/bin/cli.js"));
    }

    #[test]
    fn test_workspace_no_bins_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let graph = ResolvedGraph::default();

        let workspaces = vec![WorkspacePackage {
            name: "@vertz/core".to_string(),
            version: "0.2.58".to_string(),
            path: PathBuf::from("packages/core"),
            pkg: make_pkg_json("@vertz/core", BinField::default()),
        }];

        let count = generate_bin_stubs(root, &graph, &workspaces).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_workspace_and_npm_bins_combined() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        // npm package with bin
        let mut graph = ResolvedGraph::default();
        let mut npm_bin = BTreeMap::new();
        npm_bin.insert("esbuild".to_string(), "./bin/esbuild".to_string());
        graph.packages.insert(
            "esbuild@0.24.0".to_string(),
            ResolvedPackage {
                name: "esbuild".to_string(),
                version: "0.24.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin: npm_bin,
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        // workspace package with bin
        let mut ws_bin = BTreeMap::new();
        ws_bin.insert("vertz-build".to_string(), "./dist/cli.js".to_string());
        let workspaces = vec![WorkspacePackage {
            name: "@vertz/build".to_string(),
            version: "0.2.58".to_string(),
            path: PathBuf::from("packages/build"),
            pkg: make_pkg_json("@vertz/build", BinField::Map(ws_bin)),
        }];

        let count = generate_bin_stubs(root, &graph, &workspaces).unwrap();
        assert_eq!(count, 2);

        assert!(root.join("node_modules/.bin/esbuild").exists());
        assert!(root.join("node_modules/.bin/vertz-build").exists());
    }

    #[cfg(unix)]
    #[test]
    fn test_workspace_bin_stub_is_executable() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let graph = ResolvedGraph::default();

        let mut bin_map = BTreeMap::new();
        bin_map.insert("vertz-build".to_string(), "./dist/cli.js".to_string());

        let workspaces = vec![WorkspacePackage {
            name: "@vertz/build".to_string(),
            version: "0.2.58".to_string(),
            path: PathBuf::from("packages/build"),
            pkg: make_pkg_json("@vertz/build", BinField::Map(bin_map)),
        }];

        generate_bin_stubs(root, &graph, &workspaces).unwrap();

        let perms = std::fs::metadata(root.join("node_modules/.bin/vertz-build"))
            .unwrap()
            .permissions();
        assert_eq!(perms.mode() & 0o111, 0o111);
    }

    #[test]
    fn test_workspace_scoped_single_bin_strips_scope() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let graph = ResolvedGraph::default();

        // Scoped package with BinField::Single — bin name should be "build", not "@vertz/build"
        let workspaces = vec![WorkspacePackage {
            name: "@vertz/build".to_string(),
            version: "0.2.58".to_string(),
            path: PathBuf::from("packages/build"),
            pkg: make_pkg_json(
                "@vertz/build",
                BinField::Single("./dist/cli.js".to_string()),
            ),
        }];

        let count = generate_bin_stubs(root, &graph, &workspaces).unwrap();
        assert_eq!(count, 1);

        // Bin name should be "build" (scope stripped), not "@vertz/build"
        let stub_path = root.join("node_modules/.bin/build");
        assert!(stub_path.exists(), "scoped single bin should strip scope");
        assert!(
            !root.join("node_modules/.bin/@vertz").exists(),
            "should not create nested scope directory"
        );

        let content = std::fs::read_to_string(&stub_path).unwrap();
        assert!(
            content.contains("@vertz/build/dist/cli.js"),
            "target should use full scoped name: {}",
            content
        );
    }

    #[test]
    fn test_sh_bin_targets_not_wrapped_with_node() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let graph = ResolvedGraph::default();

        let mut bin_map = BTreeMap::new();
        bin_map.insert("vtz".to_string(), "./cli.sh".to_string());
        bin_map.insert("vtzx".to_string(), "./cli-exec.sh".to_string());

        let workspaces = vec![WorkspacePackage {
            name: "@vertz/runtime".to_string(),
            version: "0.1.0".to_string(),
            path: PathBuf::from("packages/runtime"),
            pkg: make_pkg_json("@vertz/runtime", BinField::Map(bin_map)),
        }];

        let count = generate_bin_stubs(root, &graph, &workspaces).unwrap();
        assert_eq!(count, 2);

        let vtz_content = std::fs::read_to_string(root.join("node_modules/.bin/vtz")).unwrap();
        assert!(
            !vtz_content.contains("exec node"),
            ".sh bin target must not be wrapped with node: {}",
            vtz_content
        );
        assert!(
            vtz_content.contains("exec \"$(dirname"),
            ".sh bin target should exec directly: {}",
            vtz_content
        );

        let vtzx_content = std::fs::read_to_string(root.join("node_modules/.bin/vtzx")).unwrap();
        assert!(
            !vtzx_content.contains("exec node"),
            ".sh bin target must not be wrapped with node: {}",
            vtzx_content
        );
    }

    #[test]
    fn test_js_bin_targets_still_wrapped_with_node() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let graph = ResolvedGraph::default();

        let mut bin_map = BTreeMap::new();
        bin_map.insert("vertz-build".to_string(), "./dist/cli.js".to_string());

        let workspaces = vec![WorkspacePackage {
            name: "@vertz/build".to_string(),
            version: "0.2.58".to_string(),
            path: PathBuf::from("packages/build"),
            pkg: make_pkg_json("@vertz/build", BinField::Map(bin_map)),
        }];

        generate_bin_stubs(root, &graph, &workspaces).unwrap();

        let content = std::fs::read_to_string(root.join("node_modules/.bin/vertz-build")).unwrap();
        assert!(
            content.contains("exec node"),
            ".js bin target should still use node: {}",
            content
        );
    }

    #[test]
    fn test_npm_sh_bin_targets_not_wrapped_with_node() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let mut graph = ResolvedGraph::default();
        let mut bin = BTreeMap::new();
        bin.insert("some-tool".to_string(), "./bin/run.sh".to_string());

        graph.packages.insert(
            "some-tool@1.0.0".to_string(),
            ResolvedPackage {
                name: "some-tool".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin,
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        generate_bin_stubs(root, &graph, &[]).unwrap();

        let content = std::fs::read_to_string(root.join("node_modules/.bin/some-tool")).unwrap();
        assert!(
            !content.contains("exec node"),
            "npm .sh bin target must not be wrapped with node: {}",
            content
        );
    }

    #[test]
    fn test_workspace_bin_takes_precedence_over_npm() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        // npm package with bin "cli"
        let mut graph = ResolvedGraph::default();
        let mut npm_bin = BTreeMap::new();
        npm_bin.insert("cli".to_string(), "./bin/cli.js".to_string());
        graph.packages.insert(
            "some-cli@1.0.0".to_string(),
            ResolvedPackage {
                name: "some-cli".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin: npm_bin,
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        // workspace package also defining bin "cli" — should win
        let mut ws_bin = BTreeMap::new();
        ws_bin.insert("cli".to_string(), "./dist/main.js".to_string());
        let workspaces = vec![WorkspacePackage {
            name: "@vertz/cli".to_string(),
            version: "0.2.58".to_string(),
            path: PathBuf::from("packages/cli"),
            pkg: make_pkg_json("@vertz/cli", BinField::Map(ws_bin)),
        }];

        let count = generate_bin_stubs(root, &graph, &workspaces).unwrap();
        // Both counted (2 writes), even though one overwrites the other
        assert_eq!(count, 2);

        // Workspace stub should be the one that exists (wrote last)
        let content = std::fs::read_to_string(root.join("node_modules/.bin/cli")).unwrap();
        assert!(
            content.contains("@vertz/cli/dist/main.js"),
            "workspace bin should take precedence: {}",
            content
        );
    }
}
