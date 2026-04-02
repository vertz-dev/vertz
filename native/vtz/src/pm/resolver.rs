use crate::pm::overrides::OverrideMap;
use crate::pm::registry::RegistryClient;
use crate::pm::types::{
    Lockfile, LockfileEntry, PackageMetadata, ResolvedPackage, VersionMetadata,
};
use futures_util::stream::{FuturesUnordered, StreamExt};
use node_semver::{Range, Version};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

/// Resolve the best matching version for a range from available versions
pub fn resolve_version<'a>(
    range_str: &str,
    versions: &'a BTreeMap<String, VersionMetadata>,
    dist_tags: &BTreeMap<String, String>,
) -> Option<&'a VersionMetadata> {
    // Handle dist-tags like "latest", "next"
    if let Some(tag_version) = dist_tags.get(range_str) {
        if let Some(v) = versions.get(tag_version) {
            return Some(v);
        }
    }

    // Parse the range
    let range = match Range::parse(range_str) {
        Ok(r) => r,
        Err(_) => return None,
    };

    // Find the highest version that satisfies the range
    let mut best: Option<&VersionMetadata> = None;
    for v_meta in versions.values() {
        if let Ok(ver) = Version::parse(&v_meta.version) {
            if range.satisfies(&ver) {
                match &best {
                    None => best = Some(v_meta),
                    Some(current_best) => {
                        if let Ok(current_ver) = Version::parse(&current_best.version) {
                            if ver > current_ver {
                                best = Some(v_meta);
                            }
                        }
                    }
                }
            }
        }
    }
    best
}

/// The full dependency graph after resolution
#[derive(Debug, Default)]
pub struct ResolvedGraph {
    /// All resolved packages indexed by "name@version"
    pub packages: BTreeMap<String, ResolvedPackage>,
    /// Scripts per package: "name@version" → { scriptName → scriptCommand }
    pub scripts: BTreeMap<String, BTreeMap<String, String>>,
}

impl ResolvedGraph {
    fn key(name: &str, version: &str) -> String {
        format!("{}@{}", name, version)
    }
}

/// Record of an override being applied during resolution
#[derive(Debug, Clone)]
pub struct OverrideApplication {
    pub target: String,
    pub original_range: String,
    pub forced_version: String,
    pub pattern: String,
}

/// A unit of work for the concurrent BFS resolver
struct ResolveTask {
    name: String,
    range: String,
    parent_chain: Vec<String>,
}

/// Shared mutable state for concurrent resolution, protected by individual locks.
/// Each field uses the narrowest lock scope to maximize parallelism.
struct SharedResolveState {
    graph: tokio::sync::Mutex<ResolvedGraph>,
    visited: std::sync::Mutex<HashSet<String>>,
    metadata_cache: tokio::sync::Mutex<HashMap<String, PackageMetadata>>,
    override_apps: std::sync::Mutex<Vec<OverrideApplication>>,
}

/// Resolve all dependencies concurrently using breadth-first traversal.
///
/// Instead of sequential depth-first recursion, this uses `FuturesUnordered`
/// to resolve multiple packages in parallel. When a package's metadata returns,
/// its transitive deps are immediately queued for parallel fetching.
///
/// `pre_resolved` contains packages already resolved externally (e.g., GitHub packages)
/// that should be inserted into the graph before resolution begins.
/// Their transitive npm deps will be resolved normally.
///
/// `on_progress` is called with the number of resolved packages each time one completes.
pub async fn resolve_all(
    root_deps: &BTreeMap<String, String>,
    root_dev_deps: &BTreeMap<String, String>,
    registry: &RegistryClient,
    lockfile: &Lockfile,
    overrides: &OverrideMap,
    pre_resolved: Vec<ResolvedPackage>,
    on_progress: Option<&(dyn Fn(usize) + Send + Sync)>,
) -> Result<(ResolvedGraph, Vec<OverrideApplication>), Box<dyn std::error::Error + Send + Sync>> {
    let state = SharedResolveState {
        graph: tokio::sync::Mutex::new(ResolvedGraph::default()),
        visited: std::sync::Mutex::new(HashSet::new()),
        metadata_cache: tokio::sync::Mutex::new(HashMap::new()),
        override_apps: std::sync::Mutex::new(Vec::new()),
    };

    // Insert pre-resolved packages (e.g., GitHub deps) into graph
    {
        let mut g = state.graph.lock().await;
        for pkg in pre_resolved {
            let key = ResolvedGraph::key(&pkg.name, &pkg.version);
            g.packages.insert(key, pkg);
        }
    }

    // Seed queue with root deps
    let mut queue: VecDeque<ResolveTask> = VecDeque::new();
    for (name, range) in root_deps.iter().chain(root_dev_deps.iter()) {
        queue.push_back(ResolveTask {
            name: name.clone(),
            range: range.clone(),
            parent_chain: vec![],
        });
    }

    let mut pending = FuturesUnordered::new();
    let mut resolved_count = 0usize;

    loop {
        // Drain queue into pending futures for concurrent execution
        while let Some(task) = queue.pop_front() {
            pending.push(resolve_one_task(
                task, registry, lockfile, overrides, &state,
            ));
        }

        if pending.is_empty() {
            break;
        }

        // Wait for any one future to complete
        match pending.next().await {
            Some(Ok((added, new_tasks))) => {
                if added {
                    resolved_count += 1;
                    if let Some(cb) = on_progress {
                        cb(resolved_count);
                    }
                }
                for task in new_tasks {
                    queue.push_back(task);
                }
            }
            Some(Err(e)) => return Err(e),
            None => break,
        }
    }

    // Drop pending futures before consuming shared state
    drop(pending);

    let graph = state.graph.into_inner();
    let override_apps = state.override_apps.into_inner().unwrap();

    Ok((graph, override_apps))
}

/// Resolve a single package and return its transitive deps as new tasks.
/// Returns `(true, deps)` if a new package was added to the graph,
/// `(false, deps)` if skipped (cycle/duplicate) but deps may still be returned
/// for GitHub packages whose transitive deps need resolution.
async fn resolve_one_task<'a>(
    task: ResolveTask,
    registry: &'a RegistryClient,
    lockfile: &'a Lockfile,
    overrides: &'a OverrideMap,
    state: &'a SharedResolveState,
) -> Result<(bool, Vec<ResolveTask>), Box<dyn std::error::Error + Send + Sync>> {
    let name = &task.name;
    let range = &task.range;
    let parent_chain = &task.parent_chain;

    // Check for override BEFORE visited check — the override applies to THIS dep
    let effective_range =
        if let Some(override_version) = overrides.find_override(name, parent_chain) {
            let pattern = if parent_chain.is_empty() {
                name.to_string()
            } else {
                format!("{}>{}", parent_chain.join(">"), name)
            };
            state
                .override_apps
                .lock()
                .unwrap()
                .push(OverrideApplication {
                    target: name.to_string(),
                    original_range: range.to_string(),
                    forced_version: override_version.to_string(),
                    pattern,
                });
            override_version.to_string()
        } else {
            range.to_string()
        };

    // Atomic visited check-and-insert using effective range
    let visit_key = format!("{}@{}", name, effective_range);
    {
        let mut v = state.visited.lock().unwrap();
        if v.contains(&visit_key) {
            return Ok((false, vec![]));
        }
        v.insert(visit_key);
    }

    // GitHub specifiers: look up the pre-resolved package in the graph, then
    // return its transitive npm deps as new tasks. No registry calls needed.
    if effective_range.starts_with("github:") {
        let pkg = {
            let g = state.graph.lock().await;
            g.packages.values().find(|p| p.name == *name).cloned()
        };

        if let Some(pkg) = pkg {
            let mut child_chain = parent_chain.clone();
            child_chain.push(name.to_string());
            let deps: Vec<ResolveTask> = pkg
                .dependencies
                .iter()
                .map(|(n, r)| ResolveTask {
                    name: n.clone(),
                    range: r.clone(),
                    parent_chain: child_chain.clone(),
                })
                .collect();
            return Ok((false, deps));
        } else if !parent_chain.is_empty() {
            eprintln!(
                "warning: transitive GitHub dependency \"{}\" ({}) from {} is not supported — skipping",
                name,
                effective_range,
                parent_chain.last().unwrap_or(&"root".to_string())
            );
        }
        return Ok((false, vec![]));
    }

    // Check lockfile first for pinned version (use ORIGINAL range for lockfile key)
    let lockfile_key = Lockfile::spec_key(name, range);
    if let Some(entry) = lockfile.entries.get(&lockfile_key) {
        // If override is active, ignore lockfile version — use override instead
        if effective_range == *range {
            let graph_key = ResolvedGraph::key(name, &entry.version);

            let resolved = ResolvedPackage {
                name: name.to_string(),
                version: entry.version.clone(),
                tarball_url: entry.resolved.clone(),
                integrity: entry.integrity.clone(),
                dependencies: entry.dependencies.clone(),
                bin: entry.bin.clone(),
                nest_path: vec![],
            };

            // Atomic check-and-insert into graph
            {
                let mut g = state.graph.lock().await;
                if g.packages.contains_key(&graph_key) {
                    return Ok((false, vec![]));
                }
                if !entry.scripts.is_empty() {
                    g.scripts.insert(graph_key.clone(), entry.scripts.clone());
                }
                g.packages.insert(graph_key, resolved);
            }

            let mut child_chain = parent_chain.clone();
            child_chain.push(name.to_string());
            let deps: Vec<ResolveTask> = entry
                .dependencies
                .iter()
                .map(|(n, r)| ResolveTask {
                    name: n.clone(),
                    range: r.clone(),
                    parent_chain: child_chain.clone(),
                })
                .collect();

            return Ok((true, deps));
        }
    }

    // Fetch metadata from registry using abbreviated install format (10-100x smaller)
    let metadata = {
        // Fast path: check in-memory cache
        let cached = {
            let cache = state.metadata_cache.lock().await;
            cache.get(name.as_str()).cloned()
        };
        if let Some(meta) = cached {
            meta
        } else {
            // Slow path: fetch from registry (no lock held during network I/O)
            let meta = registry.fetch_metadata_for_install(name).await?;
            let mut cache = state.metadata_cache.lock().await;
            cache
                .entry(name.to_string())
                .or_insert_with(|| meta.clone());
            meta
        }
    };

    // Resolve version (using effective range which may be overridden)
    let version_meta = resolve_version(&effective_range, &metadata.versions, &metadata.dist_tags)
        .ok_or_else(|| {
        format!(
            "No version of '{}' matches range '{}'",
            name, effective_range
        )
    })?;

    let graph_key = ResolvedGraph::key(name, &version_meta.version);

    let resolved = ResolvedPackage {
        name: name.to_string(),
        version: version_meta.version.clone(),
        tarball_url: version_meta.dist.tarball.clone(),
        integrity: version_meta.dist.integrity.clone(),
        dependencies: version_meta.dependencies.clone(),
        bin: version_meta.bin.to_map(name),
        nest_path: vec![],
    };

    // Atomic check-and-insert into graph
    {
        let mut g = state.graph.lock().await;
        if g.packages.contains_key(&graph_key) {
            return Ok((false, vec![]));
        }
        if !version_meta.scripts.is_empty() {
            g.scripts
                .insert(graph_key.clone(), version_meta.scripts.clone());
        }
        g.packages.insert(graph_key, resolved);
    }

    // Queue transitive deps (skip transitive devDeps — only root devDeps are resolved)
    let mut child_chain = parent_chain.clone();
    child_chain.push(name.to_string());
    let deps: Vec<ResolveTask> = version_meta
        .dependencies
        .iter()
        .map(|(n, r)| ResolveTask {
            name: n.clone(),
            range: r.clone(),
            parent_chain: child_chain.clone(),
        })
        .collect();

    Ok((true, deps))
}

/// Hoisting algorithm: determine which packages go at root vs nested
///
/// Two-pass approach:
/// 1. Count how many dependents need each version of each package
/// 2. Hoist the majority version to root, nest others
pub fn hoist(graph: &mut ResolvedGraph) {
    // Group packages by name
    let mut by_name: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (key, pkg) in &graph.packages {
        by_name
            .entry(pkg.name.clone())
            .or_default()
            .push(key.clone());
    }

    for keys in by_name.values() {
        if keys.len() == 1 {
            // Only one version — hoist to root (already default nest_path = [])
            continue;
        }

        // Multiple versions — count dependents for each
        let mut dep_count: BTreeMap<String, usize> = BTreeMap::new();
        for key in keys {
            // Count how many other packages depend on this version
            let version = &graph.packages[key].version;
            let count = graph
                .packages
                .values()
                .filter(|p| {
                    p.dependencies.iter().any(|(dep_name, _dep_range)| {
                        let dep_key = ResolvedGraph::key(dep_name, version);
                        keys.contains(&dep_key) && dep_name == &graph.packages[key].name
                    })
                })
                .count();
            dep_count.insert(key.clone(), count);
        }

        // Find the version with the most dependents (ties broken by higher version)
        let hoisted_key = keys
            .iter()
            .max_by(|a, b| {
                let count_a = dep_count.get(*a).unwrap_or(&0);
                let count_b = dep_count.get(*b).unwrap_or(&0);
                count_a.cmp(count_b).then_with(|| {
                    let ver_a = Version::parse(&graph.packages[*a].version).ok();
                    let ver_b = Version::parse(&graph.packages[*b].version).ok();
                    ver_a.cmp(&ver_b)
                })
            })
            .cloned();

        if let Some(hoisted) = hoisted_key {
            // The hoisted version stays at root (nest_path = [])
            // Others need to be nested under their dependents
            for key in keys {
                if key != &hoisted {
                    // Find which packages depend on this version
                    let version = graph.packages[key].version.clone();
                    let pkg_name = graph.packages[key].name.clone();
                    let dependents: Vec<String> = graph
                        .packages
                        .iter()
                        .filter(|(_k, p)| {
                            p.dependencies.iter().any(|(dep_name, dep_range)| {
                                dep_name == &pkg_name && {
                                    if let Ok(range) = Range::parse(dep_range) {
                                        if let Ok(ver) = Version::parse(&version) {
                                            range.satisfies(&ver)
                                        } else {
                                            false
                                        }
                                    } else {
                                        false
                                    }
                                }
                            })
                        })
                        .map(|(_, p)| p.name.clone())
                        .collect();

                    if let Some(parent) = dependents.first() {
                        if let Some(pkg) = graph.packages.get_mut(key) {
                            pkg.nest_path = vec![parent.clone()];
                        }
                    }
                }
            }
        }
    }
}

/// Workspace info for lockfile generation
pub struct WorkspaceInfo {
    pub name: String,
    pub version: String,
    pub path: String,
}

/// Convert resolved graph to lockfile entries.
/// `optional_names` contains the set of package names that came from optionalDependencies.
pub fn graph_to_lockfile(
    graph: &ResolvedGraph,
    all_deps: &BTreeMap<String, String>,
    workspaces: &[WorkspaceInfo],
    optional_names: &HashSet<String>,
) -> Lockfile {
    let mut lockfile = Lockfile::default();

    for (name, range) in all_deps {
        let key = Lockfile::spec_key(name, range);
        // Find the resolved version for this dep
        if let Some(pkg) = graph
            .packages
            .values()
            .find(|p| p.name == *name && p.nest_path.is_empty())
        {
            let graph_key = ResolvedGraph::key(name, &pkg.version);
            let scripts = graph.scripts.get(&graph_key).cloned().unwrap_or_default();
            lockfile.entries.insert(
                key,
                LockfileEntry {
                    name: name.clone(),
                    range: range.clone(),
                    version: pkg.version.clone(),
                    resolved: pkg.tarball_url.clone(),
                    integrity: pkg.integrity.clone(),
                    dependencies: pkg.dependencies.clone(),
                    bin: pkg.bin.clone(),
                    scripts,
                    optional: optional_names.contains(name),
                    overridden: false,
                },
            );
        }
    }

    // Also add transitive deps — match by semver range, not just name.
    // For github: ranges, match by exact string equality (not semver).
    for pkg in graph.packages.values() {
        for (dep_name, dep_range) in &pkg.dependencies {
            let key = Lockfile::spec_key(dep_name, dep_range);
            if let std::collections::btree_map::Entry::Vacant(entry) = lockfile.entries.entry(key) {
                let dep_pkg = if dep_range.starts_with("github:") {
                    // GitHub dep: match by exact range string equality
                    graph.packages.values().find(|p| p.name == *dep_name)
                } else {
                    // npm dep: match by semver range satisfaction.
                    // Fail-closed: no name-only fallback — if range doesn't match, skip.
                    graph.packages.values().find(|p| {
                        p.name == *dep_name
                            && Range::parse(dep_range)
                                .ok()
                                .and_then(|r| {
                                    Version::parse(&p.version).ok().map(|v| r.satisfies(&v))
                                })
                                .unwrap_or(false)
                    })
                };

                if let Some(dep_pkg) = dep_pkg {
                    let dep_graph_key = ResolvedGraph::key(&dep_pkg.name, &dep_pkg.version);
                    let dep_scripts = graph
                        .scripts
                        .get(&dep_graph_key)
                        .cloned()
                        .unwrap_or_default();
                    entry.insert(LockfileEntry {
                        name: dep_name.clone(),
                        range: dep_range.clone(),
                        version: dep_pkg.version.clone(),
                        resolved: dep_pkg.tarball_url.clone(),
                        integrity: dep_pkg.integrity.clone(),
                        dependencies: dep_pkg.dependencies.clone(),
                        bin: dep_pkg.bin.clone(),
                        scripts: dep_scripts,
                        optional: false,
                        overridden: false,
                    });
                }
            }
        }
    }

    // Add workspace link entries
    for ws in workspaces {
        let key = format!("{}@link:{}", ws.name, ws.path);
        lockfile.entries.insert(
            key,
            LockfileEntry {
                name: ws.name.clone(),
                range: format!("link:{}", ws.path),
                version: ws.version.clone(),
                resolved: format!("link:{}", ws.path),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );
    }

    lockfile
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pm::types::DistInfo;

    fn make_version(name: &str, version: &str, deps: &[(&str, &str)]) -> VersionMetadata {
        let mut dependencies = BTreeMap::new();
        for (k, v) in deps {
            dependencies.insert(k.to_string(), v.to_string());
        }
        VersionMetadata {
            name: name.to_string(),
            version: version.to_string(),
            dependencies,
            dev_dependencies: BTreeMap::new(),
            peer_dependencies: BTreeMap::new(),
            optional_dependencies: BTreeMap::new(),
            bundled_dependencies: vec![],
            bin: crate::pm::types::BinField::default(),
            scripts: BTreeMap::new(),
            dist: DistInfo {
                tarball: format!(
                    "https://registry.npmjs.org/{}/-/{}-{}.tgz",
                    name, name, version
                ),
                integrity: format!("sha512-fake-{}-{}", name, version),
                shasum: String::new(),
            },
            os: None,
            cpu: None,
        }
    }

    fn make_metadata(name: &str, versions: Vec<VersionMetadata>) -> PackageMetadata {
        let mut ver_map = BTreeMap::new();
        let mut latest = String::new();
        for v in versions {
            latest = v.version.clone();
            ver_map.insert(v.version.clone(), v);
        }
        let mut dist_tags = BTreeMap::new();
        dist_tags.insert("latest".to_string(), latest);
        PackageMetadata {
            name: name.to_string(),
            dist_tags,
            versions: ver_map,
        }
    }

    #[test]
    fn test_resolve_version_caret() {
        let meta = make_metadata(
            "zod",
            vec![
                make_version("zod", "3.24.0", &[]),
                make_version("zod", "3.24.2", &[]),
                make_version("zod", "3.24.4", &[]),
                make_version("zod", "4.0.0", &[]),
            ],
        );
        let result = resolve_version("^3.24.0", &meta.versions, &meta.dist_tags).unwrap();
        assert_eq!(result.version, "3.24.4"); // Highest matching ^3.24.0
    }

    #[test]
    fn test_resolve_version_tilde() {
        let meta = make_metadata(
            "zod",
            vec![
                make_version("zod", "3.24.0", &[]),
                make_version("zod", "3.24.4", &[]),
                make_version("zod", "3.25.0", &[]),
            ],
        );
        let result = resolve_version("~3.24.0", &meta.versions, &meta.dist_tags).unwrap();
        assert_eq!(result.version, "3.24.4"); // Highest matching ~3.24.0
    }

    #[test]
    fn test_resolve_version_exact() {
        let meta = make_metadata(
            "zod",
            vec![
                make_version("zod", "3.24.0", &[]),
                make_version("zod", "3.24.4", &[]),
            ],
        );
        let result = resolve_version("3.24.0", &meta.versions, &meta.dist_tags).unwrap();
        assert_eq!(result.version, "3.24.0");
    }

    #[test]
    fn test_resolve_version_dist_tag() {
        let meta = make_metadata(
            "zod",
            vec![
                make_version("zod", "3.24.0", &[]),
                make_version("zod", "3.24.4", &[]),
            ],
        );
        let result = resolve_version("latest", &meta.versions, &meta.dist_tags).unwrap();
        assert_eq!(result.version, "3.24.4");
    }

    #[test]
    fn test_resolve_version_no_match() {
        let meta = make_metadata("zod", vec![make_version("zod", "3.24.0", &[])]);
        let result = resolve_version("^4.0.0", &meta.versions, &meta.dist_tags);
        assert!(result.is_none());
    }

    #[test]
    fn test_resolve_version_range() {
        let meta = make_metadata(
            "pkg",
            vec![
                make_version("pkg", "1.0.0", &[]),
                make_version("pkg", "1.5.0", &[]),
                make_version("pkg", "2.0.0", &[]),
            ],
        );
        let result = resolve_version(">=1.0.0 <2.0.0", &meta.versions, &meta.dist_tags).unwrap();
        assert_eq!(result.version, "1.5.0");
    }

    #[test]
    fn test_hoist_single_version() {
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

        hoist(&mut graph);

        // Single version should remain at root
        assert!(graph.packages["zod@3.24.4"].nest_path.is_empty());
    }

    #[test]
    fn test_graph_to_lockfile() {
        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: "https://registry.npmjs.org/zod/-/zod-3.24.4.tgz".to_string(),
                integrity: "sha512-abc".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let mut deps = BTreeMap::new();
        deps.insert("zod".to_string(), "^3.24.0".to_string());

        let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());
        assert_eq!(lockfile.entries.len(), 1);

        let entry = &lockfile.entries["zod@^3.24.0"];
        assert_eq!(entry.version, "3.24.4");
        assert_eq!(
            entry.resolved,
            "https://registry.npmjs.org/zod/-/zod-3.24.4.tgz"
        );
    }

    #[test]
    fn test_graph_to_lockfile_transitive_matches_by_semver_range() {
        // If two versions of the same package exist, the lockfile must match
        // by semver range, not just by name.
        // Bug: name-only .find() picks whichever comes first in BTreeMap order.
        // This test ensures the CORRECT version is matched by semver range.
        let mut graph = ResolvedGraph::default();

        // Parent depends on lodash@^4.0.0
        let mut parent_deps = BTreeMap::new();
        parent_deps.insert("lodash".to_string(), "^4.0.0".to_string());

        graph.packages.insert(
            "parent@1.0.0".to_string(),
            ResolvedPackage {
                name: "parent".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: "url-parent".to_string(),
                integrity: "hash-parent".to_string(),
                dependencies: parent_deps,
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        // lodash@3.10.1 comes FIRST in BTreeMap order ("3" < "4")
        // but does NOT satisfy ^4.0.0
        graph.packages.insert(
            "lodash@3.10.1".to_string(),
            ResolvedPackage {
                name: "lodash".to_string(),
                version: "3.10.1".to_string(),
                tarball_url: "url-lodash-3".to_string(),
                integrity: "hash-lodash-3".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec!["other".to_string()],
            },
        );

        // lodash@4.17.21 comes SECOND but DOES satisfy ^4.0.0
        graph.packages.insert(
            "lodash@4.17.21".to_string(),
            ResolvedPackage {
                name: "lodash".to_string(),
                version: "4.17.21".to_string(),
                tarball_url: "url-lodash-4".to_string(),
                integrity: "hash-lodash-4".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let mut deps = BTreeMap::new();
        deps.insert("parent".to_string(), "^1.0.0".to_string());

        let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());

        // The transitive lodash@^4.0.0 should match lodash@4.17.21, NOT lodash@3.10.1
        let lodash_entry = &lockfile.entries["lodash@^4.0.0"];
        assert_eq!(lodash_entry.version, "4.17.21");
        assert_eq!(lodash_entry.resolved, "url-lodash-4");
    }

    #[test]
    fn test_graph_to_lockfile_with_transitive() {
        let mut graph = ResolvedGraph::default();

        let mut react_deps = BTreeMap::new();
        react_deps.insert("loose-envify".to_string(), "^1.1.0".to_string());

        graph.packages.insert(
            "react@18.3.1".to_string(),
            ResolvedPackage {
                name: "react".to_string(),
                version: "18.3.1".to_string(),
                tarball_url: "https://registry.npmjs.org/react/-/react-18.3.1.tgz".to_string(),
                integrity: "sha512-react".to_string(),
                dependencies: react_deps,
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let mut loose_deps = BTreeMap::new();
        loose_deps.insert("js-tokens".to_string(), "^3.0.0 || ^4.0.0".to_string());

        graph.packages.insert(
            "loose-envify@1.4.0".to_string(),
            ResolvedPackage {
                name: "loose-envify".to_string(),
                version: "1.4.0".to_string(),
                tarball_url: "https://registry.npmjs.org/loose-envify/-/loose-envify-1.4.0.tgz"
                    .to_string(),
                integrity: "sha512-loose".to_string(),
                dependencies: loose_deps,
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        graph.packages.insert(
            "js-tokens@4.0.0".to_string(),
            ResolvedPackage {
                name: "js-tokens".to_string(),
                version: "4.0.0".to_string(),
                tarball_url: "https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz"
                    .to_string(),
                integrity: "sha512-tokens".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let mut deps = BTreeMap::new();
        deps.insert("react".to_string(), "^18.3.0".to_string());

        let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());
        // Should have react, loose-envify, and js-tokens
        assert!(lockfile.entries.contains_key("react@^18.3.0"));
        assert!(lockfile.entries.contains_key("loose-envify@^1.1.0"));
        assert!(lockfile.entries.contains_key("js-tokens@^3.0.0 || ^4.0.0"));
    }

    #[test]
    fn test_graph_to_lockfile_includes_workspace_packages() {
        let graph = ResolvedGraph::default();
        let workspaces = vec![
            WorkspaceInfo {
                name: "@myorg/shared".to_string(),
                version: "1.0.0".to_string(),
                path: "packages/shared".to_string(),
            },
            WorkspaceInfo {
                name: "@myorg/api".to_string(),
                version: "2.3.0".to_string(),
                path: "packages/api".to_string(),
            },
        ];
        let deps = BTreeMap::new();
        let lockfile = graph_to_lockfile(&graph, &deps, &workspaces, &HashSet::new());

        assert_eq!(lockfile.entries.len(), 2);

        let shared = &lockfile.entries["@myorg/shared@link:packages/shared"];
        assert_eq!(shared.name, "@myorg/shared");
        assert_eq!(shared.version, "1.0.0");
        assert_eq!(shared.resolved, "link:packages/shared");
        assert_eq!(shared.range, "link:packages/shared");
        assert!(shared.integrity.is_empty());

        let api = &lockfile.entries["@myorg/api@link:packages/api"];
        assert_eq!(api.version, "2.3.0");
    }

    #[test]
    fn test_graph_to_lockfile_workspace_mixed_with_registry_deps() {
        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: "https://registry.npmjs.org/zod/-/zod-3.24.4.tgz".to_string(),
                integrity: "sha512-abc".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let workspaces = vec![WorkspaceInfo {
            name: "@myorg/shared".to_string(),
            version: "1.0.0".to_string(),
            path: "packages/shared".to_string(),
        }];

        let mut deps = BTreeMap::new();
        deps.insert("zod".to_string(), "^3.24.0".to_string());

        let lockfile = graph_to_lockfile(&graph, &deps, &workspaces, &HashSet::new());

        // Both registry and workspace entries should exist
        assert_eq!(lockfile.entries.len(), 2);
        assert!(lockfile.entries.contains_key("zod@^3.24.0"));
        assert!(lockfile
            .entries
            .contains_key("@myorg/shared@link:packages/shared"));
    }

    #[test]
    fn test_graph_to_lockfile_marks_optional_deps() {
        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "fsevents@2.3.3".to_string(),
            ResolvedPackage {
                name: "fsevents".to_string(),
                version: "2.3.3".to_string(),
                tarball_url: "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz".to_string(),
                integrity: "sha512-abc".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: "https://registry.npmjs.org/zod/-/zod-3.24.4.tgz".to_string(),
                integrity: "sha512-def".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let mut deps = BTreeMap::new();
        deps.insert("fsevents".to_string(), "^2.3.0".to_string());
        deps.insert("zod".to_string(), "^3.24.0".to_string());

        let mut optional_names = HashSet::new();
        optional_names.insert("fsevents".to_string());

        let lockfile = graph_to_lockfile(&graph, &deps, &[], &optional_names);

        // fsevents should be marked optional
        let fs_entry = &lockfile.entries["fsevents@^2.3.0"];
        assert!(fs_entry.optional, "fsevents should be marked optional");

        // zod should NOT be marked optional
        let zod_entry = &lockfile.entries["zod@^3.24.0"];
        assert!(!zod_entry.optional, "zod should not be marked optional");
    }

    #[test]
    fn test_graph_to_lockfile_github_root_dep() {
        // A GitHub dep as a root dependency should appear in the lockfile
        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "my-lib@a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2".to_string(),
            ResolvedPackage {
                name: "my-lib".to_string(),
                version: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2".to_string(),
                tarball_url: "https://codeload.github.com/user/my-lib/tar.gz/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2".to_string(),
                integrity: "sha512-fakehash".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let mut deps = BTreeMap::new();
        deps.insert(
            "my-lib".to_string(),
            "github:user/my-lib#v2.1.0".to_string(),
        );

        let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());
        assert_eq!(lockfile.entries.len(), 1);
        let entry = &lockfile.entries["my-lib@github:user/my-lib#v2.1.0"];
        assert_eq!(entry.version, "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2");
        assert_eq!(
            entry.resolved,
            "https://codeload.github.com/user/my-lib/tar.gz/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
        );
    }

    #[test]
    fn test_graph_to_lockfile_github_transitive_dep() {
        // An npm package depends on a GitHub package transitively
        let mut graph = ResolvedGraph::default();

        // GitHub package
        graph.packages.insert(
            "gh-lib@abc123def456abc123def456abc123def456abc1".to_string(),
            ResolvedPackage {
                name: "gh-lib".to_string(),
                version: "abc123def456abc123def456abc123def456abc1".to_string(),
                tarball_url: "https://codeload.github.com/user/gh-lib/tar.gz/abc123def456abc123def456abc123def456abc1".to_string(),
                integrity: "sha512-ghash".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        // npm parent that depends on the GitHub package
        let mut parent_deps = BTreeMap::new();
        parent_deps.insert("gh-lib".to_string(), "github:user/gh-lib".to_string());

        graph.packages.insert(
            "parent@1.0.0".to_string(),
            ResolvedPackage {
                name: "parent".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: "url-parent".to_string(),
                integrity: "hash-parent".to_string(),
                dependencies: parent_deps,
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let mut deps = BTreeMap::new();
        deps.insert("parent".to_string(), "^1.0.0".to_string());

        let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());

        // Both parent AND the GitHub transitive dep should be in lockfile
        assert!(lockfile.entries.contains_key("parent@^1.0.0"));
        assert!(
            lockfile.entries.contains_key("gh-lib@github:user/gh-lib"),
            "GitHub transitive dep should be in lockfile"
        );
    }

    #[test]
    fn test_graph_to_lockfile_lockfile_roundtrip_github() {
        // Verify a GitHub lockfile entry survives write/read round-trip
        use crate::pm::lockfile;

        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "my-lib@a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2".to_string(),
            ResolvedPackage {
                name: "my-lib".to_string(),
                version: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2".to_string(),
                tarball_url: "https://codeload.github.com/user/my-lib/tar.gz/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2".to_string(),
                integrity: "sha512-fakehash".to_string(),
                dependencies: BTreeMap::from([("zod".to_string(), "^3.24.0".to_string())]),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: "https://registry.npmjs.org/zod/-/zod-3.24.4.tgz".to_string(),
                integrity: "sha512-zodhash".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let mut deps = BTreeMap::new();
        deps.insert(
            "my-lib".to_string(),
            "github:user/my-lib#v2.1.0".to_string(),
        );

        let lf = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());

        // Write and re-read
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vertz.lock");
        lockfile::write_lockfile(&path, &lf).unwrap();
        let parsed = lockfile::read_lockfile(&path).unwrap();

        let entry = &parsed.entries["my-lib@github:user/my-lib#v2.1.0"];
        assert_eq!(entry.name, "my-lib");
        assert_eq!(entry.range, "github:user/my-lib#v2.1.0");
        assert_eq!(entry.version, "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2");
        assert_eq!(entry.dependencies["zod"], "^3.24.0");

        // Transitive zod should also be there
        assert!(parsed.entries.contains_key("zod@^3.24.0"));
    }
}
