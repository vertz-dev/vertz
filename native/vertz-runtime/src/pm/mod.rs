pub mod bin;
pub mod linker;
pub mod lockfile;
pub mod output;
pub mod registry;
pub mod resolver;
pub mod tarball;
pub mod types;

use futures_util::stream::{self, StreamExt};
use output::PmOutput;
use registry::RegistryClient;
use std::collections::{BTreeMap, HashSet};
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;
use tarball::TarballManager;

/// Options for the `list` command
pub struct ListOptions {
    pub all: bool,
    pub depth: Option<usize>,
    pub filter: Option<String>,
}

/// A single entry in the list output
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListEntry {
    pub name: String,
    pub version: Option<String>,
    pub range: String,
    pub dev: bool,
    pub depth: usize,
    pub parent: Option<String>,
}

/// Install all dependencies from package.json
pub async fn install(
    root_dir: &Path,
    frozen: bool,
    _ignore_scripts: bool,
    output: Arc<dyn PmOutput>,
) -> Result<(), Box<dyn std::error::Error>> {
    let start = Instant::now();
    let pkg = types::read_package_json(root_dir)?;

    // Read existing lockfile if present
    let lockfile_path = root_dir.join("vertz.lock");
    let existing_lockfile = if lockfile_path.exists() {
        lockfile::read_lockfile(&lockfile_path)?
    } else {
        types::Lockfile::default()
    };

    // Frozen mode: verify lockfile matches package.json
    if frozen {
        verify_frozen(&pkg, &existing_lockfile)?;
    }

    // Combine all deps for resolution
    let mut all_deps = pkg.dependencies.clone();
    for (k, v) in &pkg.dev_dependencies {
        all_deps.insert(k.clone(), v.clone());
    }

    let cache_dir = registry::default_cache_dir();
    let registry_client = RegistryClient::new(&cache_dir);
    let tarball_mgr = Arc::new(TarballManager::new(&cache_dir));

    // Resolve dependency graph
    output.resolve_started();

    let mut graph = resolver::resolve_all(
        &pkg.dependencies,
        &pkg.dev_dependencies,
        &registry_client,
        &existing_lockfile,
    )
    .await
    .map_err(|e| format!("{}", e))?;

    output.resolve_complete(graph.packages.len());

    // Apply hoisting
    resolver::hoist(&mut graph);

    // Download and extract tarballs in parallel
    let packages_to_download: Vec<_> = graph
        .packages
        .values()
        .filter(|pkg| !tarball_mgr.is_cached(&pkg.name, &pkg.version))
        .collect();

    let download_count = packages_to_download.len();
    if download_count > 0 {
        output.download_started(download_count);

        let output_dl = Arc::clone(&output);
        let results: Vec<Result<_, Box<dyn std::error::Error + Send + Sync>>> =
            stream::iter(packages_to_download)
                .map(|pkg| {
                    let mgr = Arc::clone(&tarball_mgr);
                    let out = Arc::clone(&output_dl);
                    let name = pkg.name.clone();
                    let version = pkg.version.clone();
                    let url = pkg.tarball_url.clone();
                    let integrity = pkg.integrity.clone();
                    async move {
                        mgr.fetch_and_extract(&name, &version, &url, &integrity)
                            .await?;
                        out.download_tick();
                        Ok(())
                    }
                })
                .buffer_unordered(16)
                .collect()
                .await;

        // Check for download errors — collect all failures
        let download_errors: Vec<_> = results.into_iter().filter_map(|r| r.err()).collect();
        if !download_errors.is_empty() {
            let msgs: Vec<_> = download_errors.iter().map(|e| e.to_string()).collect();
            return Err(format!(
                "Failed to download {} package(s):\n  {}",
                msgs.len(),
                msgs.join("\n  ")
            )
            .into());
        }

        output.download_complete(download_count);
    }

    // Link packages into node_modules
    output.link_started();
    let store_dir = cache_dir.join("store");
    let link_result = linker::link_packages(root_dir, &graph, &store_dir)?;
    output.link_complete(link_result.packages_linked, link_result.files_linked);

    // Generate .bin/ stubs
    let bin_count = bin::generate_bin_stubs(root_dir, &graph)?;
    output.bin_stubs_created(bin_count);

    // Write lockfile
    let new_lockfile = resolver::graph_to_lockfile(&graph, &all_deps);
    lockfile::write_lockfile(&lockfile_path, &new_lockfile)?;

    let elapsed = start.elapsed();
    output.done(elapsed.as_millis() as u64);

    Ok(())
}

/// Add packages to dependencies (batch — single install pass)
pub async fn add(
    root_dir: &Path,
    packages: &[&str],
    dev: bool,
    exact: bool,
    output: Arc<dyn PmOutput>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut pkg = types::read_package_json(root_dir)?;

    let cache_dir = registry::default_cache_dir();
    let registry_client = RegistryClient::new(&cache_dir);

    // Resolve all packages first, then mutate package.json once
    for package in packages {
        let (name, version_spec) = types::parse_package_specifier(package);

        let metadata = registry_client
            .fetch_metadata(name)
            .await
            .map_err(|e| format!("{}", e))?;

        let resolved_version = if let Some(spec) = version_spec {
            // Check if specifier already contains a range operator
            if spec.contains('^') || spec.contains('~') || spec.contains('>') || spec.contains('|')
            {
                // Resolve to get the actual matching version
                let v = resolver::resolve_version(spec, &metadata.versions, &metadata.dist_tags)
                    .ok_or_else(|| {
                        format!("error: no version of \"{}\" matches \"{}\"", name, spec)
                    })?;
                if exact {
                    // --exact strips range operators and pins to resolved version
                    Some(v.version.clone())
                } else {
                    // Preserve explicit range as-is
                    None
                }
            } else {
                // Bare version — resolve it
                let v = resolver::resolve_version(spec, &metadata.versions, &metadata.dist_tags)
                    .ok_or_else(|| {
                        format!(
                            "error: no version of \"{}\" matches \"{}\" (latest: {})",
                            name,
                            spec,
                            metadata
                                .dist_tags
                                .get("latest")
                                .unwrap_or(&"unknown".to_string())
                        )
                    })?;
                Some(v.version.clone())
            }
        } else {
            // Use latest
            let latest =
                metadata.dist_tags.get("latest").cloned().ok_or_else(|| {
                    format!("error: package \"{}\" not found in npm registry", name)
                })?;
            Some(latest)
        };

        // Format the range
        let range = if let Some(version) = &resolved_version {
            if exact {
                version.clone()
            } else {
                format!("^{}", version)
            }
        } else {
            // Explicit range preserved as-is from spec
            version_spec.unwrap().to_string()
        };

        if dev {
            pkg.dev_dependencies.insert(name.to_string(), range.clone());
        } else {
            pkg.dependencies.insert(name.to_string(), range.clone());
        }

        let version_str = resolved_version.as_deref().unwrap_or(&range);
        output.package_added(name, version_str, &range);
    }

    types::write_package_json(root_dir, &pkg)?;

    // Single install pass for all packages
    install(root_dir, false, false, output).await
}

/// Remove packages from dependencies (batch — single install pass)
pub async fn remove(
    root_dir: &Path,
    packages: &[&str],
    output: Arc<dyn PmOutput>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut pkg = types::read_package_json(root_dir)?;
    let mut not_found: Vec<&str> = Vec::new();

    for package in packages {
        let removed = pkg.dependencies.remove(*package).is_some()
            || pkg.dev_dependencies.remove(*package).is_some();

        if !removed {
            not_found.push(package);
        } else {
            output.package_removed(package);
        }
    }

    if !not_found.is_empty() {
        let names = not_found
            .iter()
            .map(|p| format!("\"{}\"", p))
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!(
            "error: {} not a direct dependency: {}",
            if not_found.len() == 1 {
                "package is"
            } else {
                "packages are"
            },
            names
        )
        .into());
    }

    types::write_package_json(root_dir, &pkg)?;

    // Single install pass to clean orphaned deps
    install(root_dir, false, false, output).await
}

/// List installed packages from lockfile and package.json
pub fn list(
    root_dir: &Path,
    options: &ListOptions,
) -> Result<Vec<ListEntry>, Box<dyn std::error::Error>> {
    let pkg = types::read_package_json(root_dir)?;
    let lockfile_path = root_dir.join("vertz.lock");
    let lockfile = if lockfile_path.exists() {
        lockfile::read_lockfile(&lockfile_path)?
    } else {
        types::Lockfile::default()
    };
    Ok(build_list(&pkg, &lockfile, options))
}

/// Build list entries from package.json and lockfile (pure logic, no I/O)
pub fn build_list(
    pkg: &types::PackageJson,
    lockfile: &types::Lockfile,
    options: &ListOptions,
) -> Vec<ListEntry> {
    let show_all = options.all || options.depth.is_some();
    let max_depth = if show_all {
        options.depth.unwrap_or(usize::MAX)
    } else {
        0
    };

    let mut entries = Vec::new();

    // Process dependencies
    for (name, range) in &pkg.dependencies {
        if let Some(ref filter) = options.filter {
            if name != filter {
                continue;
            }
        }

        let key = types::Lockfile::spec_key(name, range);
        let version = lockfile.entries.get(&key).map(|e| e.version.clone());

        entries.push(ListEntry {
            name: name.clone(),
            version: version.clone(),
            range: range.clone(),
            dev: false,
            depth: 0,
            parent: None,
        });

        // Add transitive deps if showing tree
        if max_depth > 0 {
            if let Some(entry) = lockfile.entries.get(&key) {
                let mut visited = HashSet::new();
                visited.insert(key.clone());
                add_transitive_deps(
                    lockfile,
                    entry,
                    &mut entries,
                    1,
                    max_depth,
                    false,
                    name,
                    &mut visited,
                );
            }
        }
    }

    // Process devDependencies
    for (name, range) in &pkg.dev_dependencies {
        if let Some(ref filter) = options.filter {
            if name != filter {
                continue;
            }
        }

        let key = types::Lockfile::spec_key(name, range);
        let version = lockfile.entries.get(&key).map(|e| e.version.clone());

        entries.push(ListEntry {
            name: name.clone(),
            version: version.clone(),
            range: range.clone(),
            dev: true,
            depth: 0,
            parent: None,
        });

        // Add transitive deps if showing tree
        if max_depth > 0 {
            if let Some(entry) = lockfile.entries.get(&key) {
                let mut visited = HashSet::new();
                visited.insert(key.clone());
                add_transitive_deps(
                    lockfile,
                    entry,
                    &mut entries,
                    1,
                    max_depth,
                    true,
                    name,
                    &mut visited,
                );
            }
        }
    }

    entries
}

/// Recursively add transitive dependencies to the list
#[allow(clippy::too_many_arguments)]
fn add_transitive_deps(
    lockfile: &types::Lockfile,
    parent_entry: &types::LockfileEntry,
    entries: &mut Vec<ListEntry>,
    current_depth: usize,
    max_depth: usize,
    dev: bool,
    parent_name: &str,
    visited: &mut HashSet<String>,
) {
    if current_depth > max_depth {
        return;
    }

    for (dep_name, dep_range) in &parent_entry.dependencies {
        let key = types::Lockfile::spec_key(dep_name, dep_range);
        let version = lockfile.entries.get(&key).map(|e| e.version.clone());

        entries.push(ListEntry {
            name: dep_name.clone(),
            version: version.clone(),
            range: dep_range.clone(),
            dev,
            depth: current_depth,
            parent: Some(parent_name.to_string()),
        });

        // Recurse if not at max depth and not already visited (cycle protection)
        if current_depth < max_depth {
            if let Some(entry) = lockfile.entries.get(&key) {
                if visited.insert(key.clone()) {
                    add_transitive_deps(
                        lockfile,
                        entry,
                        entries,
                        current_depth + 1,
                        max_depth,
                        dev,
                        dep_name,
                        visited,
                    );
                }
            }
        }
    }
}

/// Format list entries as human-readable text
pub fn format_list_text(entries: &[ListEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }

    let mut output = String::new();
    let has_deps = entries.iter().any(|e| !e.dev && e.depth == 0);
    let has_dev_deps = entries.iter().any(|e| e.dev && e.depth == 0);

    if has_deps {
        output.push_str("dependencies:\n");
        for entry in entries.iter().filter(|e| !e.dev) {
            let indent = "  ".repeat(entry.depth + 1);
            let version_str = entry.version.as_deref().unwrap_or("(not installed)");
            output.push_str(&format!("{}{}@{}\n", indent, entry.name, version_str));
        }
    }

    if has_deps && has_dev_deps {
        output.push('\n');
    }

    if has_dev_deps {
        output.push_str("devDependencies:\n");
        for entry in entries.iter().filter(|e| e.dev) {
            let indent = "  ".repeat(entry.depth + 1);
            let version_str = entry.version.as_deref().unwrap_or("(not installed)");
            output.push_str(&format!("{}{}@{}\n", indent, entry.name, version_str));
        }
    }

    output
}

/// Format list entries as NDJSON lines
pub fn format_list_json(entries: &[ListEntry]) -> String {
    let mut output = String::new();
    for entry in entries {
        let mut obj = serde_json::Map::new();
        obj.insert(
            "type".to_string(),
            serde_json::Value::String("dependency".to_string()),
        );
        obj.insert(
            "name".to_string(),
            serde_json::Value::String(entry.name.clone()),
        );
        obj.insert(
            "version".to_string(),
            match &entry.version {
                Some(v) => serde_json::Value::String(v.clone()),
                None => serde_json::Value::Null,
            },
        );
        obj.insert(
            "range".to_string(),
            serde_json::Value::String(entry.range.clone()),
        );
        obj.insert("dev".to_string(), serde_json::Value::Bool(entry.dev));
        obj.insert(
            "depth".to_string(),
            serde_json::Value::Number(entry.depth.into()),
        );
        if let Some(ref parent) = entry.parent {
            obj.insert(
                "parent".to_string(),
                serde_json::Value::String(parent.clone()),
            );
        }
        if entry.version.is_none() {
            obj.insert("installed".to_string(), serde_json::Value::Bool(false));
        }
        let line = serde_json::Value::Object(obj);
        output.push_str(&line.to_string());
        output.push('\n');
    }
    output
}

/// Verify lockfile matches package.json for --frozen mode
fn verify_frozen(
    pkg: &types::PackageJson,
    lockfile: &types::Lockfile,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut all_deps: BTreeMap<String, String> = pkg.dependencies.clone();
    for (k, v) in &pkg.dev_dependencies {
        all_deps.insert(k.clone(), v.clone());
    }

    for (name, range) in &all_deps {
        let key = types::Lockfile::spec_key(name, range);
        if !lockfile.entries.contains_key(&key) {
            return Err(format!(
                "error: lockfile is out of date\n  {} \"{}\" not found in vertz.lock\n  Run `vertz install` to update",
                name, range
            )
            .into());
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pm::types::{Lockfile, LockfileEntry};

    fn make_pkg(deps: &[(&str, &str)], dev_deps: &[(&str, &str)]) -> types::PackageJson {
        let mut dependencies = BTreeMap::new();
        for (k, v) in deps {
            dependencies.insert(k.to_string(), v.to_string());
        }
        let mut dev_dependencies = BTreeMap::new();
        for (k, v) in dev_deps {
            dev_dependencies.insert(k.to_string(), v.to_string());
        }
        types::PackageJson {
            name: Some("test-app".to_string()),
            version: Some("1.0.0".to_string()),
            dependencies,
            dev_dependencies,
            peer_dependencies: BTreeMap::new(),
            optional_dependencies: BTreeMap::new(),
            bundled_dependencies: vec![],
            bin: types::BinField::default(),
            scripts: BTreeMap::new(),
        }
    }

    fn make_lockfile_entry(
        name: &str,
        range: &str,
        version: &str,
        deps: &[(&str, &str)],
    ) -> LockfileEntry {
        let mut dependencies = BTreeMap::new();
        for (k, v) in deps {
            dependencies.insert(k.to_string(), v.to_string());
        }
        LockfileEntry {
            name: name.to_string(),
            range: range.to_string(),
            version: version.to_string(),
            resolved: format!(
                "https://registry.npmjs.org/{}/-/{}-{}.tgz",
                name, name, version
            ),
            integrity: format!("sha512-fake-{}", name),
            dependencies,
        }
    }

    // --- verify_frozen tests ---

    #[test]
    fn test_verify_frozen_passes() {
        let pkg = make_pkg(&[("zod", "^3.24.0")], &[]);

        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(),
            make_lockfile_entry("zod", "^3.24.0", "3.24.4", &[]),
        );

        assert!(verify_frozen(&pkg, &lockfile).is_ok());
    }

    #[test]
    fn test_verify_frozen_fails_missing_dep() {
        let pkg = make_pkg(&[("zod", "^3.24.0")], &[]);
        let lockfile = Lockfile::default();

        let result = verify_frozen(&pkg, &lockfile);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("lockfile is out of date"));
    }

    #[test]
    fn test_verify_frozen_fails_changed_range() {
        let pkg = make_pkg(&[("zod", "^4.0.0")], &[]); // Changed range

        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(), // Old range in lockfile
            make_lockfile_entry("zod", "^3.24.0", "3.24.4", &[]),
        );

        let result = verify_frozen(&pkg, &lockfile);
        assert!(result.is_err());
    }

    // --- build_list tests ---

    #[test]
    fn test_list_direct_deps_only() {
        let pkg = make_pkg(
            &[("react", "^18.3.0"), ("zod", "^3.24.0")],
            &[("typescript", "^5.0.0")],
        );
        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "react@^18.3.0".to_string(),
            make_lockfile_entry("react", "^18.3.0", "18.3.1", &[("loose-envify", "^1.1.0")]),
        );
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(),
            make_lockfile_entry("zod", "^3.24.0", "3.24.4", &[]),
        );
        lockfile.entries.insert(
            "typescript@^5.0.0".to_string(),
            make_lockfile_entry("typescript", "^5.0.0", "5.7.3", &[]),
        );

        let options = ListOptions {
            all: false,
            depth: None,
            filter: None,
        };
        let entries = build_list(&pkg, &lockfile, &options);

        assert_eq!(entries.len(), 3);
        // Direct deps only — no transitive
        assert!(entries.iter().all(|e| e.depth == 0));

        let react = entries.iter().find(|e| e.name == "react").unwrap();
        assert_eq!(react.version, Some("18.3.1".to_string()));
        assert!(!react.dev);
        assert!(react.parent.is_none());

        let ts = entries.iter().find(|e| e.name == "typescript").unwrap();
        assert!(ts.dev);
    }

    #[test]
    fn test_list_all_shows_transitive() {
        let pkg = make_pkg(&[("react", "^18.3.0")], &[]);
        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "react@^18.3.0".to_string(),
            make_lockfile_entry("react", "^18.3.0", "18.3.1", &[("loose-envify", "^1.1.0")]),
        );
        lockfile.entries.insert(
            "loose-envify@^1.1.0".to_string(),
            make_lockfile_entry(
                "loose-envify",
                "^1.1.0",
                "1.4.0",
                &[("js-tokens", "^3.0.0 || ^4.0.0")],
            ),
        );
        lockfile.entries.insert(
            "js-tokens@^3.0.0 || ^4.0.0".to_string(),
            make_lockfile_entry("js-tokens", "^3.0.0 || ^4.0.0", "4.0.0", &[]),
        );

        let options = ListOptions {
            all: true,
            depth: None,
            filter: None,
        };
        let entries = build_list(&pkg, &lockfile, &options);

        assert_eq!(entries.len(), 3); // react, loose-envify, js-tokens

        let react = &entries[0];
        assert_eq!(react.name, "react");
        assert_eq!(react.depth, 0);

        let loose = &entries[1];
        assert_eq!(loose.name, "loose-envify");
        assert_eq!(loose.depth, 1);
        assert_eq!(loose.parent, Some("react".to_string()));

        let tokens = &entries[2];
        assert_eq!(tokens.name, "js-tokens");
        assert_eq!(tokens.depth, 2);
        assert_eq!(tokens.parent, Some("loose-envify".to_string()));
    }

    #[test]
    fn test_list_depth_limits_traversal() {
        let pkg = make_pkg(&[("react", "^18.3.0")], &[]);
        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "react@^18.3.0".to_string(),
            make_lockfile_entry("react", "^18.3.0", "18.3.1", &[("loose-envify", "^1.1.0")]),
        );
        lockfile.entries.insert(
            "loose-envify@^1.1.0".to_string(),
            make_lockfile_entry(
                "loose-envify",
                "^1.1.0",
                "1.4.0",
                &[("js-tokens", "^3.0.0 || ^4.0.0")],
            ),
        );
        lockfile.entries.insert(
            "js-tokens@^3.0.0 || ^4.0.0".to_string(),
            make_lockfile_entry("js-tokens", "^3.0.0 || ^4.0.0", "4.0.0", &[]),
        );

        // depth=1 implies --all, shows one level of transitive
        let options = ListOptions {
            all: false,
            depth: Some(1),
            filter: None,
        };
        let entries = build_list(&pkg, &lockfile, &options);

        assert_eq!(entries.len(), 2); // react + loose-envify, NOT js-tokens
        assert_eq!(entries[0].name, "react");
        assert_eq!(entries[1].name, "loose-envify");
        assert_eq!(entries[1].depth, 1);
    }

    #[test]
    fn test_list_filter_by_package() {
        let pkg = make_pkg(&[("react", "^18.3.0"), ("zod", "^3.24.0")], &[]);
        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "react@^18.3.0".to_string(),
            make_lockfile_entry("react", "^18.3.0", "18.3.1", &[("loose-envify", "^1.1.0")]),
        );
        lockfile.entries.insert(
            "loose-envify@^1.1.0".to_string(),
            make_lockfile_entry("loose-envify", "^1.1.0", "1.4.0", &[]),
        );
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(),
            make_lockfile_entry("zod", "^3.24.0", "3.24.4", &[]),
        );

        // Filter by react — shows react and its subtree
        let options = ListOptions {
            all: false,
            depth: None,
            filter: Some("react".to_string()),
        };
        let entries = build_list(&pkg, &lockfile, &options);

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "react");
    }

    #[test]
    fn test_list_filter_with_all_shows_subtree() {
        let pkg = make_pkg(&[("react", "^18.3.0"), ("zod", "^3.24.0")], &[]);
        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "react@^18.3.0".to_string(),
            make_lockfile_entry("react", "^18.3.0", "18.3.1", &[("loose-envify", "^1.1.0")]),
        );
        lockfile.entries.insert(
            "loose-envify@^1.1.0".to_string(),
            make_lockfile_entry("loose-envify", "^1.1.0", "1.4.0", &[]),
        );
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(),
            make_lockfile_entry("zod", "^3.24.0", "3.24.4", &[]),
        );

        let options = ListOptions {
            all: true,
            depth: None,
            filter: Some("react".to_string()),
        };
        let entries = build_list(&pkg, &lockfile, &options);

        assert_eq!(entries.len(), 2); // react + loose-envify
        assert_eq!(entries[0].name, "react");
        assert_eq!(entries[1].name, "loose-envify");
    }

    #[test]
    fn test_list_no_lockfile() {
        let pkg = make_pkg(&[("react", "^18.3.0")], &[]);
        let lockfile = Lockfile::default(); // Empty — no lockfile

        let options = ListOptions {
            all: false,
            depth: None,
            filter: None,
        };
        let entries = build_list(&pkg, &lockfile, &options);

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "react");
        assert!(entries[0].version.is_none()); // Not installed
    }

    #[test]
    fn test_list_circular_deps_no_infinite_loop() {
        let pkg = make_pkg(&[("a", "^1.0.0")], &[]);
        let mut lockfile = Lockfile::default();
        // a → b → a (circular)
        lockfile.entries.insert(
            "a@^1.0.0".to_string(),
            make_lockfile_entry("a", "^1.0.0", "1.0.0", &[("b", "^1.0.0")]),
        );
        lockfile.entries.insert(
            "b@^1.0.0".to_string(),
            make_lockfile_entry("b", "^1.0.0", "1.0.0", &[("a", "^1.0.0")]),
        );

        let options = ListOptions {
            all: true,
            depth: None,
            filter: None,
        };
        let entries = build_list(&pkg, &lockfile, &options);

        // Should not hang. a(0) → b(1) → a(2) would be stopped by visited set
        assert!(entries.len() >= 2);
        assert_eq!(entries[0].name, "a");
        assert_eq!(entries[1].name, "b");
    }

    #[test]
    fn test_list_depth_zero_shows_only_direct() {
        let pkg = make_pkg(&[("react", "^18.3.0")], &[]);
        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "react@^18.3.0".to_string(),
            make_lockfile_entry("react", "^18.3.0", "18.3.1", &[("loose-envify", "^1.1.0")]),
        );
        lockfile.entries.insert(
            "loose-envify@^1.1.0".to_string(),
            make_lockfile_entry("loose-envify", "^1.1.0", "1.4.0", &[]),
        );

        let options = ListOptions {
            all: false,
            depth: Some(0),
            filter: None,
        };
        let entries = build_list(&pkg, &lockfile, &options);

        // depth=0 means direct only (--depth 0 implies --all but limits to depth 0)
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "react");
    }

    // --- format tests ---

    #[test]
    fn test_format_list_text_grouped() {
        let entries = vec![
            ListEntry {
                name: "react".to_string(),
                version: Some("18.3.1".to_string()),
                range: "^18.3.0".to_string(),
                dev: false,
                depth: 0,
                parent: None,
            },
            ListEntry {
                name: "typescript".to_string(),
                version: Some("5.7.3".to_string()),
                range: "^5.0.0".to_string(),
                dev: true,
                depth: 0,
                parent: None,
            },
        ];

        let text = format_list_text(&entries);
        assert!(text.contains("dependencies:"));
        assert!(text.contains("  react@18.3.1"));
        assert!(text.contains("devDependencies:"));
        assert!(text.contains("  typescript@5.7.3"));
    }

    #[test]
    fn test_format_list_text_tree_indentation() {
        let entries = vec![
            ListEntry {
                name: "react".to_string(),
                version: Some("18.3.1".to_string()),
                range: "^18.3.0".to_string(),
                dev: false,
                depth: 0,
                parent: None,
            },
            ListEntry {
                name: "loose-envify".to_string(),
                version: Some("1.4.0".to_string()),
                range: "^1.1.0".to_string(),
                dev: false,
                depth: 1,
                parent: Some("react".to_string()),
            },
        ];

        let text = format_list_text(&entries);
        assert!(text.contains("  react@18.3.1"));
        assert!(text.contains("    loose-envify@1.4.0")); // 4 spaces = depth 1 + 1
    }

    #[test]
    fn test_format_list_text_not_installed() {
        let entries = vec![ListEntry {
            name: "react".to_string(),
            version: None,
            range: "^18.3.0".to_string(),
            dev: false,
            depth: 0,
            parent: None,
        }];

        let text = format_list_text(&entries);
        assert!(text.contains("react@(not installed)"));
    }

    #[test]
    fn test_format_list_json_direct() {
        let entries = vec![ListEntry {
            name: "zod".to_string(),
            version: Some("3.24.4".to_string()),
            range: "^3.24.0".to_string(),
            dev: false,
            depth: 0,
            parent: None,
        }];

        let json = format_list_json(&entries);
        let parsed: serde_json::Value = serde_json::from_str(json.trim()).unwrap();
        assert_eq!(parsed["type"], "dependency");
        assert_eq!(parsed["name"], "zod");
        assert_eq!(parsed["version"], "3.24.4");
        assert_eq!(parsed["range"], "^3.24.0");
        assert_eq!(parsed["dev"], false);
        assert_eq!(parsed["depth"], 0);
        assert!(parsed.get("parent").is_none());
        assert!(parsed.get("installed").is_none());
    }

    #[test]
    fn test_format_list_json_transitive() {
        let entries = vec![ListEntry {
            name: "loose-envify".to_string(),
            version: Some("1.4.0".to_string()),
            range: "^1.1.0".to_string(),
            dev: false,
            depth: 1,
            parent: Some("react".to_string()),
        }];

        let json = format_list_json(&entries);
        let parsed: serde_json::Value = serde_json::from_str(json.trim()).unwrap();
        assert_eq!(parsed["depth"], 1);
        assert_eq!(parsed["parent"], "react");
    }

    #[test]
    fn test_format_list_json_not_installed() {
        let entries = vec![ListEntry {
            name: "react".to_string(),
            version: None,
            range: "^18.3.0".to_string(),
            dev: false,
            depth: 0,
            parent: None,
        }];

        let json = format_list_json(&entries);
        let parsed: serde_json::Value = serde_json::from_str(json.trim()).unwrap();
        assert!(parsed["version"].is_null());
        assert_eq!(parsed["installed"], false);
    }

    #[test]
    fn test_format_list_json_ndjson_multiple_lines() {
        let entries = vec![
            ListEntry {
                name: "react".to_string(),
                version: Some("18.3.1".to_string()),
                range: "^18.3.0".to_string(),
                dev: false,
                depth: 0,
                parent: None,
            },
            ListEntry {
                name: "zod".to_string(),
                version: Some("3.24.4".to_string()),
                range: "^3.24.0".to_string(),
                dev: false,
                depth: 0,
                parent: None,
            },
        ];

        let json = format_list_json(&entries);
        let lines: Vec<&str> = json.trim().split('\n').collect();
        assert_eq!(lines.len(), 2);

        // Each line is valid JSON
        for line in &lines {
            let parsed: serde_json::Value = serde_json::from_str(line).unwrap();
            assert_eq!(parsed["type"], "dependency");
        }
    }

    #[test]
    fn test_format_list_text_empty() {
        let entries = Vec::new();
        let text = format_list_text(&entries);
        assert!(text.is_empty());
    }

    #[test]
    fn test_format_list_json_empty() {
        let entries = Vec::new();
        let json = format_list_json(&entries);
        assert!(json.is_empty());
    }
}
