pub mod bin;
pub mod cache;
pub mod config;
pub mod linker;
pub mod lockfile;
pub mod output;
pub mod registry;
pub mod resolver;
pub mod scripts;
pub mod tarball;
pub mod types;
pub mod workspace;

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
    ignore_scripts: bool,
    force: bool,
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

    // Workspace support: discover workspace packages, validate, and merge deps
    let workspaces = if let Some(ref patterns) = pkg.workspaces {
        if !patterns.is_empty() {
            let ws = workspace::discover_workspaces(root_dir, patterns)?;
            workspace::validate_workspace_graph(&ws)?;
            ws
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    // Combine all deps for resolution (with workspace deps merged if applicable)
    let (resolved_deps, resolved_dev_deps) = if !workspaces.is_empty() {
        workspace::merge_workspace_deps(&pkg, &workspaces)
    } else {
        (pkg.dependencies.clone(), pkg.dev_dependencies.clone())
    };

    let mut all_deps = resolved_deps.clone();
    for (k, v) in &resolved_dev_deps {
        all_deps.insert(k.clone(), v.clone());
    }

    // Frozen mode: verify lockfile matches merged deps (after workspace merging)
    if frozen {
        verify_frozen_deps(&all_deps, &existing_lockfile)?;
    }

    let cache_dir = registry::default_cache_dir();
    let registry_client = RegistryClient::new(&cache_dir);
    let tarball_mgr = Arc::new(TarballManager::new(&cache_dir));

    // Resolve dependency graph
    output.resolve_started();

    let mut graph = resolver::resolve_all(
        &resolved_deps,
        &resolved_dev_deps,
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

    // Link packages into node_modules (incremental unless --force)
    output.link_started();
    let store_dir = cache_dir.join("store");
    let link_result = linker::link_packages_incremental(root_dir, &graph, &store_dir, force)?;
    output.link_complete(
        link_result.packages_linked,
        link_result.files_linked,
        link_result.packages_cached,
    );

    // Symlink workspace packages into node_modules/
    if !workspaces.is_empty() {
        let ws_linked = workspace::link_workspaces(root_dir, &workspaces)?;
        if ws_linked > 0 {
            output.workspace_linked(ws_linked);
        }
    }

    // Generate .bin/ stubs
    let bin_count = bin::generate_bin_stubs(root_dir, &graph)?;
    output.bin_stubs_created(bin_count);

    // Run postinstall scripts (unless --ignore-scripts)
    if !ignore_scripts {
        let postinstall_pkgs = scripts::packages_with_postinstall(&graph, &graph.scripts);
        if !postinstall_pkgs.is_empty() {
            scripts::run_postinstall_scripts(root_dir, &postinstall_pkgs, Arc::clone(&output))
                .await;
        }
    }

    // Write lockfile (include workspace link: entries)
    let ws_info: Vec<resolver::WorkspaceInfo> = workspaces
        .iter()
        .map(|ws| resolver::WorkspaceInfo {
            name: ws.name.clone(),
            version: ws.version.clone(),
            path: ws.path.to_string_lossy().to_string(),
        })
        .collect();
    let new_lockfile = resolver::graph_to_lockfile(&graph, &all_deps, &ws_info);
    lockfile::write_lockfile(&lockfile_path, &new_lockfile)?;

    let elapsed = start.elapsed();
    output.done(elapsed.as_millis() as u64);

    Ok(())
}

/// Add packages to dependencies (batch — single install pass)
#[allow(clippy::too_many_arguments)]
pub async fn add(
    root_dir: &Path,
    packages: &[&str],
    dev: bool,
    peer: bool,
    exact: bool,
    ignore_scripts: bool,
    workspace_target: Option<&str>,
    output: Arc<dyn PmOutput>,
) -> Result<(), Box<dyn std::error::Error>> {
    if peer && dev {
        return Err("error: --peer and --dev cannot be used together".into());
    }

    // Determine target directory: workspace dir (if -w) or root_dir
    let target_dir = if let Some(ws) = workspace_target {
        workspace::resolve_workspace_dir(root_dir, ws)?
    } else {
        root_dir.to_path_buf()
    };

    let mut pkg = types::read_package_json(&target_dir)?;

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

        if peer {
            pkg.peer_dependencies
                .insert(name.to_string(), range.clone());
        } else if dev {
            pkg.dev_dependencies.insert(name.to_string(), range.clone());
        } else {
            pkg.dependencies.insert(name.to_string(), range.clone());
        }

        let version_str = resolved_version.as_deref().unwrap_or(&range);
        output.package_added(name, version_str, &range);
    }

    types::write_package_json(&target_dir, &pkg)?;

    if peer {
        // Peer deps are NOT installed — just recorded in package.json
        Ok(())
    } else {
        // Install from root — workspace deps are merged during install
        install(root_dir, false, ignore_scripts, false, output).await
    }
}

/// Remove packages from dependencies (batch — single install pass)
pub async fn remove(
    root_dir: &Path,
    packages: &[&str],
    workspace_target: Option<&str>,
    output: Arc<dyn PmOutput>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Determine target directory: workspace dir (if -w) or root_dir
    let target_dir = if let Some(ws) = workspace_target {
        workspace::resolve_workspace_dir(root_dir, ws)?
    } else {
        root_dir.to_path_buf()
    };

    let mut pkg = types::read_package_json(&target_dir)?;
    let mut not_found: Vec<&str> = Vec::new();

    for package in packages {
        let removed = pkg.dependencies.remove(*package).is_some()
            || pkg.dev_dependencies.remove(*package).is_some()
            || pkg.peer_dependencies.remove(*package).is_some();

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

    types::write_package_json(&target_dir, &pkg)?;

    // Install from root — workspace deps are merged during install
    install(root_dir, false, false, false, output).await
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

/// Result of a `vertz why` query — one entry per version of the target package found
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WhyResult {
    pub name: String,
    pub versions: Vec<WhyVersion>,
}

/// A single version of the target package with all dependency paths leading to it
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WhyVersion {
    pub version: String,
    pub paths: Vec<Vec<WhyPathEntry>>,
}

/// A single step in a dependency path
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WhyPathEntry {
    pub name: String,
    pub range: String,
    pub version: String,
}

/// Trace why a package is installed by searching the lockfile dependency graph
pub fn why(root_dir: &Path, package: &str) -> Result<WhyResult, Box<dyn std::error::Error>> {
    let pkg = types::read_package_json(root_dir)?;
    let lockfile_path = root_dir.join("vertz.lock");
    let lockfile = if lockfile_path.exists() {
        lockfile::read_lockfile(&lockfile_path)?
    } else {
        types::Lockfile::default()
    };
    build_why(&pkg, &lockfile, package)
}

/// Build why result from package.json and lockfile (pure logic, no I/O)
pub fn build_why(
    pkg: &types::PackageJson,
    lockfile: &types::Lockfile,
    target: &str,
) -> Result<WhyResult, Box<dyn std::error::Error>> {
    // Collect all root deps (both regular and dev)
    let mut all_root_deps: BTreeMap<String, String> = BTreeMap::new();
    for (k, v) in &pkg.dependencies {
        all_root_deps.insert(k.clone(), v.clone());
    }
    for (k, v) in &pkg.dev_dependencies {
        all_root_deps.insert(k.clone(), v.clone());
    }

    // Check if target is a direct dependency
    let is_direct = all_root_deps.contains_key(target);

    // BFS to find all paths from root deps to the target package
    // Each BFS state: (spec_key, path_so_far)
    let mut versions_found: BTreeMap<String, Vec<Vec<WhyPathEntry>>> = BTreeMap::new();

    // Check direct dependency
    if is_direct {
        let range = all_root_deps.get(target).unwrap();
        let spec_key = types::Lockfile::spec_key(target, range);
        if let Some(entry) = lockfile.entries.get(&spec_key) {
            versions_found
                .entry(entry.version.clone())
                .or_default()
                .push(Vec::new()); // Empty path = direct
        } else {
            // Direct dep but not in lockfile — still report it
            versions_found
                .entry("unknown".to_string())
                .or_default()
                .push(Vec::new());
        }
    }

    // BFS from each root dependency
    for (root_name, root_range) in &all_root_deps {
        if root_name == target {
            continue; // Already handled as direct
        }

        let root_key = types::Lockfile::spec_key(root_name, root_range);
        let root_entry = match lockfile.entries.get(&root_key) {
            Some(e) => e,
            None => continue,
        };

        // BFS queue: (entry, current path, visited set)
        let root_path_entry = WhyPathEntry {
            name: root_name.clone(),
            range: root_range.clone(),
            version: root_entry.version.clone(),
        };

        let mut queue: std::collections::VecDeque<(
            &types::LockfileEntry,
            Vec<WhyPathEntry>,
            HashSet<String>,
        )> = std::collections::VecDeque::new();

        let mut initial_visited = HashSet::new();
        initial_visited.insert(root_key.clone());
        queue.push_back((root_entry, vec![root_path_entry], initial_visited));

        // Cap total paths to prevent exponential blowup on diamond dependency graphs
        const MAX_PATHS: usize = 100;
        let mut total_paths: usize = versions_found.values().map(|v| v.len()).sum();

        while let Some((current_entry, current_path, visited)) = queue.pop_front() {
            if total_paths >= MAX_PATHS {
                break;
            }

            for (dep_name, dep_range) in &current_entry.dependencies {
                let dep_key = types::Lockfile::spec_key(dep_name, dep_range);

                if visited.contains(&dep_key) {
                    continue; // Cycle protection
                }

                if let Some(dep_entry) = lockfile.entries.get(&dep_key) {
                    let mut path = current_path.clone();
                    path.push(WhyPathEntry {
                        name: dep_name.clone(),
                        range: dep_range.clone(),
                        version: dep_entry.version.clone(),
                    });

                    if dep_name == target {
                        // Found a path to the target
                        versions_found
                            .entry(dep_entry.version.clone())
                            .or_default()
                            .push(path);
                        total_paths += 1;
                    } else {
                        // Continue BFS
                        let mut next_visited = visited.clone();
                        next_visited.insert(dep_key);
                        queue.push_back((dep_entry, path, next_visited));
                    }
                }
            }
        }
    }

    if versions_found.is_empty() {
        return Err(format!("error: package \"{}\" is not installed", target).into());
    }

    // Collect into WhyResult, sorted by version
    let mut versions = Vec::new();
    for (version, mut paths) in versions_found {
        // Sort paths by length (shortest first)
        paths.sort_by_key(|p| p.len());
        versions.push(WhyVersion { version, paths });
    }

    Ok(WhyResult {
        name: target.to_string(),
        versions,
    })
}

/// Format why result as human-readable text
pub fn format_why_text(result: &WhyResult) -> String {
    let mut output = String::new();

    for (i, ver) in result.versions.iter().enumerate() {
        if i > 0 {
            output.push('\n');
        }
        output.push_str(&format!("{}@{}\n", result.name, ver.version));

        let max_paths = 10;
        let shown = ver.paths.len().min(max_paths);

        for path in &ver.paths[..shown] {
            if path.is_empty() {
                output.push_str("  dependencies (direct)\n");
            } else {
                let chain: Vec<String> = path
                    .iter()
                    .map(|p| format!("{}@{}", p.name, p.range))
                    .collect();
                output.push_str(&format!("  {}\n", chain.join(" → ")));
            }
        }

        if ver.paths.len() > max_paths {
            output.push_str(&format!(
                "  and {} more paths — use --json for all\n",
                ver.paths.len() - max_paths
            ));
        }
    }

    output
}

/// Format why result as NDJSON
pub fn format_why_json(result: &WhyResult) -> String {
    let mut paths_json: Vec<serde_json::Value> = Vec::new();
    for ver in &result.versions {
        for path in &ver.paths {
            if path.is_empty() {
                // Direct dependency — empty path
                paths_json.push(serde_json::json!([]));
            } else {
                let entries: Vec<serde_json::Value> = path
                    .iter()
                    .map(|p| {
                        serde_json::json!({
                            "name": p.name,
                            "range": p.range,
                            "version": p.version,
                        })
                    })
                    .collect();
                paths_json.push(serde_json::Value::Array(entries));
            }
        }
    }

    let obj = serde_json::json!({
        "name": result.name,
        "version": if result.versions.len() == 1 {
            serde_json::Value::String(result.versions[0].version.clone())
        } else {
            let vs: Vec<String> = result.versions.iter().map(|v| v.version.clone()).collect();
            serde_json::Value::Array(vs.into_iter().map(serde_json::Value::String).collect())
        },
        "paths": paths_json,
    });

    format!("{}\n", obj)
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

/// A single entry in the outdated output
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutdatedEntry {
    pub name: String,
    pub current: String,
    pub wanted: String,
    pub latest: String,
    pub range: String,
    pub dev: bool,
}

/// Resolve the "wanted" version from abbreviated metadata (version keys + range).
/// Returns the highest version string satisfying the range.
fn resolve_wanted_version(
    range_str: &str,
    version_keys: &BTreeMap<String, serde_json::Value>,
    dist_tags: &BTreeMap<String, String>,
) -> Option<String> {
    // Handle dist-tags like "latest", "next"
    if let Some(tag_version) = dist_tags.get(range_str) {
        if version_keys.contains_key(tag_version) {
            return Some(tag_version.clone());
        }
    }

    let range = match node_semver::Range::parse(range_str) {
        Ok(r) => r,
        Err(_) => return None,
    };

    let mut best: Option<(node_semver::Version, String)> = None;
    for key in version_keys.keys() {
        if let Ok(ver) = node_semver::Version::parse(key) {
            if range.satisfies(&ver) {
                match &best {
                    None => best = Some((ver, key.clone())),
                    Some((current_best, _)) => {
                        if ver > *current_best {
                            best = Some((ver, key.clone()));
                        }
                    }
                }
            }
        }
    }
    best.map(|(_, s)| s)
}

/// Check for outdated packages by comparing installed versions against the registry.
/// Returns only packages where current != wanted or current != latest.
/// Warnings about failed metadata fetches are collected and returned alongside entries.
pub async fn outdated(
    root_dir: &Path,
) -> Result<(Vec<OutdatedEntry>, Vec<String>), Box<dyn std::error::Error>> {
    let pkg = types::read_package_json(root_dir)?;

    if pkg.dependencies.is_empty() && pkg.dev_dependencies.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }

    let lockfile_path = root_dir.join("vertz.lock");
    let lockfile = if lockfile_path.exists() {
        lockfile::read_lockfile(&lockfile_path)?
    } else {
        return Err("No lockfile found. Run `vertz install` first.".into());
    };

    let cache_dir = registry::default_cache_dir();
    let client = Arc::new(RegistryClient::new(&cache_dir));

    // Collect all direct deps with their current installed version
    let mut dep_tasks: Vec<(String, String, String, bool)> = Vec::new();
    for (name, range) in &pkg.dependencies {
        let spec_key = types::Lockfile::spec_key(name, range);
        if let Some(entry) = lockfile.entries.get(&spec_key) {
            dep_tasks.push((name.clone(), range.clone(), entry.version.clone(), false));
        }
    }
    for (name, range) in &pkg.dev_dependencies {
        let spec_key = types::Lockfile::spec_key(name, range);
        if let Some(entry) = lockfile.entries.get(&spec_key) {
            dep_tasks.push((name.clone(), range.clone(), entry.version.clone(), true));
        }
    }

    // Fetch metadata in parallel
    let results: Vec<_> = stream::iter(dep_tasks)
        .map(|(name, range, current, dev)| {
            let client = client.clone();
            async move {
                match client.fetch_metadata_abbreviated(&name).await {
                    Ok(meta) => {
                        let wanted =
                            resolve_wanted_version(&range, &meta.versions, &meta.dist_tags)
                                .unwrap_or_else(|| current.clone());
                        let latest = meta
                            .dist_tags
                            .get("latest")
                            .cloned()
                            .unwrap_or_else(|| current.clone());

                        // Only include if actually outdated
                        if current != wanted || current != latest {
                            Ok(Some(OutdatedEntry {
                                name,
                                current,
                                wanted,
                                latest,
                                range,
                                dev,
                            }))
                        } else {
                            Ok(None)
                        }
                    }
                    Err(e) => Err(format!(
                        "warning: could not fetch metadata for {}: {}",
                        name, e
                    )),
                }
            }
        })
        .buffer_unordered(16)
        .collect()
        .await;

    let mut entries = Vec::new();
    let mut warnings = Vec::new();
    for result in results {
        match result {
            Ok(Some(entry)) => entries.push(entry),
            Ok(None) => {} // Up to date, skip
            Err(warning) => warnings.push(warning),
        }
    }

    // Sort by name for stable output
    entries.sort_by(|a, b| a.name.cmp(&b.name));

    Ok((entries, warnings))
}

/// Format outdated entries as a human-readable table
pub fn format_outdated_text(entries: &[OutdatedEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }

    // Calculate column widths
    let name_width = entries
        .iter()
        .map(|e| e.name.len())
        .max()
        .unwrap_or(7)
        .max(7);
    let current_width = entries
        .iter()
        .map(|e| e.current.len())
        .max()
        .unwrap_or(7)
        .max(7);
    let wanted_width = entries
        .iter()
        .map(|e| e.wanted.len())
        .max()
        .unwrap_or(6)
        .max(6);

    let mut output = format!(
        "{:<name_w$}  {:<cur_w$}  {:<want_w$}  Latest\n",
        "Package",
        "Current",
        "Wanted",
        name_w = name_width,
        cur_w = current_width,
        want_w = wanted_width,
    );

    for entry in entries {
        output.push_str(&format!(
            "{:<name_w$}  {:<cur_w$}  {:<want_w$}  {}\n",
            entry.name,
            entry.current,
            entry.wanted,
            entry.latest,
            name_w = name_width,
            cur_w = current_width,
            want_w = wanted_width,
        ));
    }

    output
}

/// Format outdated entries as NDJSON
pub fn format_outdated_json(entries: &[OutdatedEntry]) -> String {
    let mut output = String::new();
    for entry in entries {
        let obj = serde_json::json!({
            "name": entry.name,
            "current": entry.current,
            "wanted": entry.wanted,
            "latest": entry.latest,
            "range": entry.range,
            "dev": entry.dev,
        });
        output.push_str(&obj.to_string());
        output.push('\n');
    }
    output
}

/// Result of a single package update
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateResult {
    pub name: String,
    pub from: String,
    pub to: String,
    pub range: String,
    pub dev: bool,
}

/// Update packages to newer versions.
/// If `packages` is empty, updates all direct dependencies.
/// Returns a list of updates that were (or would be) applied.
pub async fn update(
    root_dir: &Path,
    packages: &[&str],
    latest: bool,
    dry_run: bool,
    output: Arc<dyn PmOutput>,
) -> Result<Vec<UpdateResult>, Box<dyn std::error::Error>> {
    let start = Instant::now();
    let mut pkg = types::read_package_json(root_dir)?;

    let lockfile_path = root_dir.join("vertz.lock");
    if !lockfile_path.exists() {
        return Err("No lockfile found. Run `vertz install` first.".into());
    }

    let mut lockfile = lockfile::read_lockfile(&lockfile_path)?;

    // Determine which packages to update
    let targets: Vec<(String, String, bool)> = if packages.is_empty() {
        // Update all direct deps
        let mut all = Vec::new();
        for (name, range) in &pkg.dependencies {
            all.push((name.clone(), range.clone(), false));
        }
        for (name, range) in &pkg.dev_dependencies {
            all.push((name.clone(), range.clone(), true));
        }
        all
    } else {
        let mut targets = Vec::new();
        for &pkg_name in packages {
            if let Some(range) = pkg.dependencies.get(pkg_name) {
                targets.push((pkg_name.to_string(), range.clone(), false));
            } else if let Some(range) = pkg.dev_dependencies.get(pkg_name) {
                targets.push((pkg_name.to_string(), range.clone(), true));
            } else {
                return Err(format!(
                    "error: package is not a direct dependency: \"{}\"",
                    pkg_name
                )
                .into());
            }
        }
        targets
    };

    // Use outdated to find what needs updating — but we do our own check for --latest
    let cache_dir = registry::default_cache_dir();
    let client = Arc::new(RegistryClient::new(&cache_dir));

    let mut results: Vec<UpdateResult> = Vec::new();

    for (name, range, dev) in &targets {
        let spec_key = types::Lockfile::spec_key(name, range);
        let current_version = lockfile
            .entries
            .get(&spec_key)
            .map(|e| e.version.clone())
            .unwrap_or_default();

        if current_version.is_empty() {
            continue;
        }

        let meta = client
            .fetch_metadata_abbreviated(name)
            .await
            .map_err(|e| format!("{}", e))?;

        let new_version = if latest {
            // --latest: use latest dist-tag version
            meta.dist_tags.get("latest").cloned()
        } else {
            // Default: update within semver range
            resolve_wanted_version(range, &meta.versions, &meta.dist_tags)
        };

        if let Some(ref new_ver) = new_version {
            if new_ver != &current_version {
                let new_range = if latest {
                    // Preserve the range operator from the original range
                    let prefix = extract_range_prefix(range);
                    format!("{}{}", prefix, new_ver)
                } else {
                    range.clone()
                };

                results.push(UpdateResult {
                    name: name.clone(),
                    from: current_version.clone(),
                    to: new_ver.clone(),
                    range: new_range.clone(),
                    dev: *dev,
                });

                if !dry_run {
                    output.package_updated(name, &current_version, new_ver, &new_range);

                    // Remove lockfile entries for this package so resolver re-resolves
                    let keys_to_remove: Vec<String> = lockfile
                        .entries
                        .keys()
                        .filter(|k| {
                            types::Lockfile::parse_spec_key(k)
                                .map(|(n, _)| n == name.as_str())
                                .unwrap_or(false)
                        })
                        .cloned()
                        .collect();
                    for key in keys_to_remove {
                        lockfile.entries.remove(&key);
                    }

                    // Update range in package.json if --latest changed it
                    if latest {
                        if *dev {
                            pkg.dev_dependencies.insert(name.clone(), new_range);
                        } else {
                            pkg.dependencies.insert(name.clone(), new_range);
                        }
                    }
                }
            }
        }
    }

    if !dry_run && !results.is_empty() {
        // Write updated package.json (only if --latest changed ranges)
        if latest {
            types::write_package_json(root_dir, &pkg)?;
        }

        // Write lockfile with entries removed
        lockfile::write_lockfile(&lockfile_path, &lockfile)?;

        // Re-install to resolve and link updated packages
        install(root_dir, false, false, false, output.clone()).await?;
    } else if !dry_run && results.is_empty() {
        let elapsed = start.elapsed();
        output.done(elapsed.as_millis() as u64);
    }

    Ok(results)
}

/// Extract the range prefix operator from a semver range string.
/// e.g., "^3.24.0" → "^", "~1.0.0" → "~", ">=1.0.0" → ">=", "3.24.0" → ""
fn extract_range_prefix(range: &str) -> &str {
    if range.starts_with(">=") {
        ">="
    } else if range.starts_with("<=") {
        "<="
    } else if range.starts_with('^') {
        "^"
    } else if range.starts_with('~') {
        "~"
    } else if range.starts_with('>') {
        ">"
    } else if range.starts_with('<') {
        "<"
    } else {
        ""
    }
}

/// Format update dry-run results as human-readable text
pub fn format_update_dry_run_text(results: &[UpdateResult]) -> String {
    if results.is_empty() {
        return String::new();
    }

    let name_width = results
        .iter()
        .map(|r| r.name.len())
        .max()
        .unwrap_or(7)
        .max(7);
    let from_width = results
        .iter()
        .map(|r| r.from.len())
        .max()
        .unwrap_or(7)
        .max(7);

    let mut output = format!(
        "{:<name_w$}  {:<from_w$}  To\n",
        "Package",
        "Current",
        name_w = name_width,
        from_w = from_width,
    );

    for result in results {
        output.push_str(&format!(
            "{:<name_w$}  {:<from_w$}  {}\n",
            result.name,
            result.from,
            result.to,
            name_w = name_width,
            from_w = from_width,
        ));
    }

    output
}

/// Format update dry-run results as NDJSON
pub fn format_update_dry_run_json(results: &[UpdateResult]) -> String {
    let mut output = String::new();
    for result in results {
        let obj = serde_json::json!({
            "name": result.name,
            "from": result.from,
            "to": result.to,
            "range": result.range,
            "dev": result.dev,
        });
        output.push_str(&obj.to_string());
        output.push('\n');
    }
    output
}

/// Verify lockfile matches package.json for --frozen mode
/// Verify lockfile matches the given merged deps map (used after workspace dep merging)
fn verify_frozen_deps(
    all_deps: &BTreeMap<String, String>,
    lockfile: &types::Lockfile,
) -> Result<(), Box<dyn std::error::Error>> {
    for (name, range) in all_deps {
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
            workspaces: None,
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

    fn make_deps(deps: &[(&str, &str)]) -> BTreeMap<String, String> {
        deps.iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn test_verify_frozen_passes() {
        let deps = make_deps(&[("zod", "^3.24.0")]);

        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(),
            make_lockfile_entry("zod", "^3.24.0", "3.24.4", &[]),
        );

        assert!(verify_frozen_deps(&deps, &lockfile).is_ok());
    }

    #[test]
    fn test_verify_frozen_fails_missing_dep() {
        let deps = make_deps(&[("zod", "^3.24.0")]);
        let lockfile = Lockfile::default();

        let result = verify_frozen_deps(&deps, &lockfile);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("lockfile is out of date"));
    }

    #[test]
    fn test_verify_frozen_fails_changed_range() {
        let deps = make_deps(&[("zod", "^4.0.0")]); // Changed range

        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(), // Old range in lockfile
            make_lockfile_entry("zod", "^3.24.0", "3.24.4", &[]),
        );

        let result = verify_frozen_deps(&deps, &lockfile);
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

    // --- build_why tests ---

    #[test]
    fn test_why_direct_dependency() {
        let pkg = make_pkg(&[("react", "^18.3.0")], &[]);
        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "react@^18.3.0".to_string(),
            make_lockfile_entry("react", "^18.3.0", "18.3.1", &[]),
        );

        let result = build_why(&pkg, &lockfile, "react").unwrap();
        assert_eq!(result.name, "react");
        assert_eq!(result.versions.len(), 1);
        assert_eq!(result.versions[0].version, "18.3.1");
        assert_eq!(result.versions[0].paths.len(), 1);
        assert!(result.versions[0].paths[0].is_empty()); // Direct dep = empty path
    }

    #[test]
    fn test_why_transitive_dependency() {
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

        let result = build_why(&pkg, &lockfile, "js-tokens").unwrap();
        assert_eq!(result.name, "js-tokens");
        assert_eq!(result.versions.len(), 1);
        assert_eq!(result.versions[0].version, "4.0.0");
        assert_eq!(result.versions[0].paths.len(), 1);

        let path = &result.versions[0].paths[0];
        assert_eq!(path.len(), 3); // react → loose-envify → js-tokens
        assert_eq!(path[0].name, "react");
        assert_eq!(path[1].name, "loose-envify");
        assert_eq!(path[2].name, "js-tokens");
    }

    #[test]
    fn test_why_multiple_paths() {
        // react and react-dom both depend on loose-envify
        let pkg = make_pkg(&[("react", "^18.3.0"), ("react-dom", "^18.3.0")], &[]);
        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "react@^18.3.0".to_string(),
            make_lockfile_entry("react", "^18.3.0", "18.3.1", &[("loose-envify", "^1.1.0")]),
        );
        lockfile.entries.insert(
            "react-dom@^18.3.0".to_string(),
            make_lockfile_entry(
                "react-dom",
                "^18.3.0",
                "18.3.1",
                &[("loose-envify", "^1.1.0")],
            ),
        );
        lockfile.entries.insert(
            "loose-envify@^1.1.0".to_string(),
            make_lockfile_entry("loose-envify", "^1.1.0", "1.4.0", &[]),
        );

        let result = build_why(&pkg, &lockfile, "loose-envify").unwrap();
        assert_eq!(result.versions.len(), 1);
        assert_eq!(result.versions[0].paths.len(), 2); // Two paths: from react and react-dom
    }

    #[test]
    fn test_why_not_installed() {
        let pkg = make_pkg(&[("react", "^18.3.0")], &[]);
        let lockfile = Lockfile::default();

        let result = build_why(&pkg, &lockfile, "nonexistent");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("is not installed"));
    }

    #[test]
    fn test_why_circular_deps() {
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

        // Should not hang — b is reachable via a → b
        let result = build_why(&pkg, &lockfile, "b").unwrap();
        assert_eq!(result.versions.len(), 1);
        assert_eq!(result.versions[0].version, "1.0.0");
        assert!(!result.versions[0].paths.is_empty());
    }

    #[test]
    fn test_why_multi_version() {
        // lodash@4.17.21 is a direct dep, lodash@3.10.1 is nested via legacy-lib
        let pkg = make_pkg(&[("lodash", "^4.0.0"), ("legacy-lib", "^1.0.0")], &[]);
        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "lodash@^4.0.0".to_string(),
            make_lockfile_entry("lodash", "^4.0.0", "4.17.21", &[]),
        );
        lockfile.entries.insert(
            "legacy-lib@^1.0.0".to_string(),
            make_lockfile_entry("legacy-lib", "^1.0.0", "1.0.0", &[("lodash", "^3.0.0")]),
        );
        lockfile.entries.insert(
            "lodash@^3.0.0".to_string(),
            make_lockfile_entry("lodash", "^3.0.0", "3.10.1", &[]),
        );

        let result = build_why(&pkg, &lockfile, "lodash").unwrap();
        assert_eq!(result.versions.len(), 2);

        // Find each version
        let v3 = result
            .versions
            .iter()
            .find(|v| v.version == "3.10.1")
            .unwrap();
        let v4 = result
            .versions
            .iter()
            .find(|v| v.version == "4.17.21")
            .unwrap();

        // v4 is direct
        assert!(v4.paths.iter().any(|p| p.is_empty()));

        // v3 is via legacy-lib
        assert!(v3
            .paths
            .iter()
            .any(|p| { p.len() == 2 && p[0].name == "legacy-lib" && p[1].name == "lodash" }));
    }

    #[test]
    fn test_format_why_text_direct() {
        let result = WhyResult {
            name: "react".to_string(),
            versions: vec![WhyVersion {
                version: "18.3.1".to_string(),
                paths: vec![vec![]], // Direct dependency
            }],
        };

        let text = format_why_text(&result);
        assert!(text.contains("react@18.3.1"));
        assert!(text.contains("dependencies (direct)"));
    }

    #[test]
    fn test_format_why_text_transitive() {
        let result = WhyResult {
            name: "js-tokens".to_string(),
            versions: vec![WhyVersion {
                version: "4.0.0".to_string(),
                paths: vec![vec![
                    WhyPathEntry {
                        name: "react".to_string(),
                        range: "^18.3.0".to_string(),
                        version: "18.3.1".to_string(),
                    },
                    WhyPathEntry {
                        name: "loose-envify".to_string(),
                        range: "^1.1.0".to_string(),
                        version: "1.4.0".to_string(),
                    },
                    WhyPathEntry {
                        name: "js-tokens".to_string(),
                        range: "^3.0.0 || ^4.0.0".to_string(),
                        version: "4.0.0".to_string(),
                    },
                ]],
            }],
        };

        let text = format_why_text(&result);
        assert!(text.contains("js-tokens@4.0.0"));
        assert!(text.contains("react@^18.3.0"));
        assert!(text.contains("→"));
    }

    #[test]
    fn test_format_why_json() {
        let result = WhyResult {
            name: "js-tokens".to_string(),
            versions: vec![WhyVersion {
                version: "4.0.0".to_string(),
                paths: vec![vec![
                    WhyPathEntry {
                        name: "react".to_string(),
                        range: "^18.3.0".to_string(),
                        version: "18.3.1".to_string(),
                    },
                    WhyPathEntry {
                        name: "js-tokens".to_string(),
                        range: "^3.0.0 || ^4.0.0".to_string(),
                        version: "4.0.0".to_string(),
                    },
                ]],
            }],
        };

        let json = format_why_json(&result);
        let parsed: serde_json::Value = serde_json::from_str(json.trim()).unwrap();
        assert_eq!(parsed["name"], "js-tokens");
        assert_eq!(parsed["version"], "4.0.0");
        assert!(parsed["paths"].is_array());
        assert_eq!(parsed["paths"][0].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_format_why_json_direct() {
        let result = WhyResult {
            name: "react".to_string(),
            versions: vec![WhyVersion {
                version: "18.3.1".to_string(),
                paths: vec![vec![]], // Direct — empty path
            }],
        };

        let json = format_why_json(&result);
        let parsed: serde_json::Value = serde_json::from_str(json.trim()).unwrap();
        assert_eq!(parsed["paths"][0].as_array().unwrap().len(), 0);
    }

    // --- Outdated tests ---

    #[test]
    fn test_resolve_wanted_version_basic() {
        let mut versions = BTreeMap::new();
        versions.insert("1.0.0".to_string(), serde_json::json!({}));
        versions.insert("1.1.0".to_string(), serde_json::json!({}));
        versions.insert("1.2.0".to_string(), serde_json::json!({}));
        versions.insert("2.0.0".to_string(), serde_json::json!({}));
        let dist_tags = BTreeMap::new();

        let wanted = resolve_wanted_version("^1.0.0", &versions, &dist_tags);
        assert_eq!(wanted, Some("1.2.0".to_string()));
    }

    #[test]
    fn test_resolve_wanted_version_exact() {
        let mut versions = BTreeMap::new();
        versions.insert("1.0.0".to_string(), serde_json::json!({}));
        versions.insert("1.1.0".to_string(), serde_json::json!({}));
        let dist_tags = BTreeMap::new();

        let wanted = resolve_wanted_version("1.0.0", &versions, &dist_tags);
        assert_eq!(wanted, Some("1.0.0".to_string()));
    }

    #[test]
    fn test_resolve_wanted_version_no_match() {
        let mut versions = BTreeMap::new();
        versions.insert("1.0.0".to_string(), serde_json::json!({}));
        let dist_tags = BTreeMap::new();

        let wanted = resolve_wanted_version("^2.0.0", &versions, &dist_tags);
        assert!(wanted.is_none());
    }

    #[test]
    fn test_resolve_wanted_version_dist_tag() {
        let mut versions = BTreeMap::new();
        versions.insert("1.0.0".to_string(), serde_json::json!({}));
        versions.insert("2.0.0-beta.1".to_string(), serde_json::json!({}));
        let mut dist_tags = BTreeMap::new();
        dist_tags.insert("next".to_string(), "2.0.0-beta.1".to_string());

        let wanted = resolve_wanted_version("next", &versions, &dist_tags);
        assert_eq!(wanted, Some("2.0.0-beta.1".to_string()));
    }

    #[test]
    fn test_format_outdated_text_basic() {
        let entries = vec![
            OutdatedEntry {
                name: "react".to_string(),
                current: "18.3.1".to_string(),
                wanted: "18.3.1".to_string(),
                latest: "19.1.0".to_string(),
                range: "^18.3.0".to_string(),
                dev: false,
            },
            OutdatedEntry {
                name: "typescript".to_string(),
                current: "5.7.3".to_string(),
                wanted: "5.8.2".to_string(),
                latest: "5.8.2".to_string(),
                range: "^5.0.0".to_string(),
                dev: true,
            },
        ];

        let text = format_outdated_text(&entries);
        assert!(text.contains("Package"));
        assert!(text.contains("Current"));
        assert!(text.contains("Wanted"));
        assert!(text.contains("Latest"));
        assert!(text.contains("react"));
        assert!(text.contains("18.3.1"));
        assert!(text.contains("19.1.0"));
        assert!(text.contains("typescript"));
        assert!(text.contains("5.7.3"));
        assert!(text.contains("5.8.2"));
    }

    #[test]
    fn test_format_outdated_text_empty() {
        let entries: Vec<OutdatedEntry> = Vec::new();
        let text = format_outdated_text(&entries);
        assert!(text.is_empty());
    }

    #[test]
    fn test_format_outdated_json_basic() {
        let entries = vec![OutdatedEntry {
            name: "react".to_string(),
            current: "18.3.1".to_string(),
            wanted: "18.3.1".to_string(),
            latest: "19.1.0".to_string(),
            range: "^18.3.0".to_string(),
            dev: false,
        }];

        let json = format_outdated_json(&entries);
        let parsed: serde_json::Value = serde_json::from_str(json.trim()).unwrap();
        assert_eq!(parsed["name"], "react");
        assert_eq!(parsed["current"], "18.3.1");
        assert_eq!(parsed["wanted"], "18.3.1");
        assert_eq!(parsed["latest"], "19.1.0");
        assert_eq!(parsed["range"], "^18.3.0");
        assert_eq!(parsed["dev"], false);
    }

    #[test]
    fn test_format_outdated_json_empty() {
        let entries: Vec<OutdatedEntry> = Vec::new();
        let json = format_outdated_json(&entries);
        assert!(json.is_empty());
    }

    #[test]
    fn test_format_outdated_json_multiple() {
        let entries = vec![
            OutdatedEntry {
                name: "react".to_string(),
                current: "18.3.1".to_string(),
                wanted: "18.3.1".to_string(),
                latest: "19.1.0".to_string(),
                range: "^18.3.0".to_string(),
                dev: false,
            },
            OutdatedEntry {
                name: "typescript".to_string(),
                current: "5.7.3".to_string(),
                wanted: "5.8.2".to_string(),
                latest: "5.8.2".to_string(),
                range: "^5.0.0".to_string(),
                dev: true,
            },
        ];

        let json = format_outdated_json(&entries);
        let lines: Vec<&str> = json.trim().lines().collect();
        assert_eq!(lines.len(), 2);
        let first: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        let second: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(first["name"], "react");
        assert_eq!(second["name"], "typescript");
        assert_eq!(second["dev"], true);
    }

    // --- extract_range_prefix tests ---

    #[test]
    fn test_extract_range_prefix_caret() {
        assert_eq!(extract_range_prefix("^3.24.0"), "^");
    }

    #[test]
    fn test_extract_range_prefix_tilde() {
        assert_eq!(extract_range_prefix("~1.0.0"), "~");
    }

    #[test]
    fn test_extract_range_prefix_gte() {
        assert_eq!(extract_range_prefix(">=1.0.0"), ">=");
    }

    #[test]
    fn test_extract_range_prefix_lte() {
        assert_eq!(extract_range_prefix("<=2.0.0"), "<=");
    }

    #[test]
    fn test_extract_range_prefix_gt() {
        assert_eq!(extract_range_prefix(">1.0.0"), ">");
    }

    #[test]
    fn test_extract_range_prefix_lt() {
        assert_eq!(extract_range_prefix("<2.0.0"), "<");
    }

    #[test]
    fn test_extract_range_prefix_exact() {
        assert_eq!(extract_range_prefix("3.24.0"), "");
    }

    // --- format_update_dry_run tests ---

    #[test]
    fn test_format_update_dry_run_text_empty() {
        let results: Vec<UpdateResult> = Vec::new();
        assert_eq!(format_update_dry_run_text(&results), "");
    }

    #[test]
    fn test_format_update_dry_run_text_single() {
        let results = vec![UpdateResult {
            name: "zod".to_string(),
            from: "3.24.0".to_string(),
            to: "3.24.4".to_string(),
            range: "^3.24.0".to_string(),
            dev: false,
        }];
        let output = format_update_dry_run_text(&results);
        assert!(output.contains("Package"));
        assert!(output.contains("Current"));
        assert!(output.contains("To"));
        assert!(output.contains("zod"));
        assert!(output.contains("3.24.0"));
        assert!(output.contains("3.24.4"));
    }

    #[test]
    fn test_format_update_dry_run_json_single() {
        let results = vec![UpdateResult {
            name: "zod".to_string(),
            from: "3.24.0".to_string(),
            to: "3.24.4".to_string(),
            range: "^3.24.4".to_string(),
            dev: false,
        }];
        let json = format_update_dry_run_json(&results);
        let line: serde_json::Value = serde_json::from_str(json.trim()).unwrap();
        assert_eq!(line["name"], "zod");
        assert_eq!(line["from"], "3.24.0");
        assert_eq!(line["to"], "3.24.4");
        assert_eq!(line["range"], "^3.24.4");
        assert_eq!(line["dev"], false);
    }

    #[test]
    fn test_format_update_dry_run_json_multiple() {
        let results = vec![
            UpdateResult {
                name: "react".to_string(),
                from: "18.3.0".to_string(),
                to: "18.3.1".to_string(),
                range: "^18.3.0".to_string(),
                dev: false,
            },
            UpdateResult {
                name: "typescript".to_string(),
                from: "5.7.0".to_string(),
                to: "5.8.0".to_string(),
                range: "^5.0.0".to_string(),
                dev: true,
            },
        ];
        let json = format_update_dry_run_json(&results);
        let lines: Vec<&str> = json.trim().lines().collect();
        assert_eq!(lines.len(), 2);
        let first: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        let second: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(first["name"], "react");
        assert_eq!(second["name"], "typescript");
        assert_eq!(second["dev"], true);
    }
}
