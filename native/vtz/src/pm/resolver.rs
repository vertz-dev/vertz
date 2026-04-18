use crate::pm::overrides::OverrideMap;
use crate::pm::platform;
use crate::pm::registry::RegistryClient;
use crate::pm::types::{
    Lockfile, LockfileEntry, PackageMetadata, ResolvedPackage, VersionMetadata,
};
use futures_util::stream::{FuturesUnordered, StreamExt};
use node_semver::{Range, Version};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

/// Returns true iff `version_str` satisfies `range_str` under npm semver rules.
///
/// Both inputs must parse successfully; otherwise returns false (fail-closed).
/// `"github:..."` specifiers and other non-semver ranges always return false —
/// callers must route those through their own equality check.
pub fn version_satisfies_range(version_str: &str, range_str: &str) -> bool {
    let Ok(version) = Version::parse(version_str) else {
        return false;
    };
    let Ok(range) = Range::parse(range_str) else {
        return false;
    };
    range.satisfies(&version)
}

/// Returns true iff `range_str` is a non-semver dependency specifier that
/// `graph_to_lockfile` must match by name alone (no semver range check).
///
/// Includes `github:` specifiers, `link:` workspace refs, and dist-tag-shaped
/// strings (`latest`, `next`, `beta`, or custom tags). Excludes semver ranges
/// (`^1.2.3`, `1.x`, `*`, etc.) and protocol specs (`file:`, `workspace:`,
/// `npm:`, `http://`) — those are filtered out by `is_dist_tag_shape` and
/// never reach the graph anyway.
fn is_non_semver_spec(range_str: &str) -> bool {
    range_str.starts_with("github:")
        || range_str.starts_with("link:")
        || is_dist_tag_shape(range_str)
}

/// Returns true iff `s` looks like an npm dist-tag name.
///
/// Rules:
/// - Non-empty
/// - First char is ASCII alphabetic — excludes semver (`1.2.3`), operators (`~1.0`),
///   and the `*` wildcard.
/// - All chars are ASCII alphanumeric or `-` / `_` / `.` — excludes protocol
///   specs (`file:`, `npm:`, `http://`), paths (`./x`), and ranges with
///   whitespace (`>=1.0.0 <2.0.0`).
/// - Does not parse as a semver range — rejects `x` / `x.x.x` wildcards that
///   pass the shape check.
fn is_dist_tag_shape(s: &str) -> bool {
    let Some(first) = s.chars().next() else {
        return false;
    };
    if !first.is_ascii_alphabetic() {
        return false;
    }
    if !s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return false;
    }
    Range::parse(s).is_err()
}

/// Returns true iff a lockfile entry's pinned version still satisfies `range_str`.
///
/// This guards the lockfile-reuse fast path in `resolve_one_task`: a stale entry
/// (e.g. `esbuild@^0.27.3` → 0.25.12, left over from a prior install where the
/// range or registry state differed) must NOT be silently trusted. If the pinned
/// version no longer satisfies the range, callers must fall through to a fresh
/// registry resolve.
///
/// GitHub entries (range starts with `github:`) are treated as always-valid here,
/// because they are pinned by SHA — semver has no meaning for them.
///
/// Dist-tag specs (`"latest"`, `"next"`, etc.) intentionally return `false` here
/// (they fall through to `version_satisfies_range`, which fails on `Range::parse`).
/// The consequence is that every `vtz install` re-fetches registry metadata for
/// dist-tag deps to verify the lockfile pin is still current. See #2794 for the
/// lockfile-write fix and the deferred fast-path optimization.
pub fn lockfile_entry_satisfies_range(entry: &LockfileEntry, range_str: &str) -> bool {
    if range_str.starts_with("github:") || range_str.starts_with("link:") {
        return true;
    }
    version_satisfies_range(&entry.version, range_str)
}

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
                .chain(pkg.optional_dependencies.iter())
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
        // If override is active, ignore lockfile version — use override instead.
        // Also require the pinned version to still satisfy the requested range.
        // A stale or corrupted lockfile entry (e.g. `esbuild@^0.27.3` → 0.25.12
        // left over from an earlier install) must NOT be silently trusted —
        // fall through to the registry-resolve path so a fresh pick is made.
        if effective_range == *range && lockfile_entry_satisfies_range(entry, range) {
            let graph_key = ResolvedGraph::key(name, &entry.version);

            let resolved = ResolvedPackage {
                name: name.to_string(),
                version: entry.version.clone(),
                tarball_url: entry.resolved.clone(),
                integrity: entry.integrity.clone(),
                dependencies: entry.dependencies.clone(),
                optional_dependencies: entry.optional_dependencies.clone(),
                bin: entry.bin.clone(),
                nest_path: vec![],
                os: entry.os.clone(),
                cpu: entry.cpu.clone(),
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
            let mut deps: Vec<ResolveTask> = entry
                .dependencies
                .iter()
                .map(|(n, r)| ResolveTask {
                    name: n.clone(),
                    range: r.clone(),
                    parent_chain: child_chain.clone(),
                })
                .collect();

            // Also queue optional deps from lockfile (platform-specific binaries)
            for (n, r) in &entry.optional_dependencies {
                deps.push(ResolveTask {
                    name: n.clone(),
                    range: r.clone(),
                    parent_chain: child_chain.clone(),
                });
            }

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

    // Skip packages that don't match the current platform (e.g., lightningcss-linux-x64
    // on a darwin-arm64 machine). These are typically platform-specific optional deps.
    if !platform::matches_platform(&version_meta.os, &version_meta.cpu) {
        return Ok((false, vec![]));
    }

    let graph_key = ResolvedGraph::key(name, &version_meta.version);

    let resolved = ResolvedPackage {
        name: name.to_string(),
        version: version_meta.version.clone(),
        tarball_url: version_meta.dist.tarball.clone(),
        integrity: version_meta.dist.integrity.clone(),
        dependencies: version_meta.dependencies.clone(),
        optional_dependencies: version_meta.optional_dependencies.clone(),
        bin: version_meta.bin.to_map(name),
        nest_path: vec![],
        os: version_meta.os.clone(),
        cpu: version_meta.cpu.clone(),
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
    let mut deps: Vec<ResolveTask> = version_meta
        .dependencies
        .iter()
        .map(|(n, r)| ResolveTask {
            name: n.clone(),
            range: r.clone(),
            parent_chain: child_chain.clone(),
        })
        .collect();

    // Also queue transitive optional deps — these are platform-specific binaries
    // (e.g., lightningcss-darwin-arm64). Platform filtering happens when the
    // optional dep is itself resolved: its os/cpu fields will be checked.
    for (n, r) in &version_meta.optional_dependencies {
        deps.push(ResolveTask {
            name: n.clone(),
            range: r.clone(),
            parent_chain: child_chain.clone(),
        });
    }

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
                    p.dependencies
                        .iter()
                        .chain(p.optional_dependencies.iter())
                        .any(|(dep_name, _dep_range)| {
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
                            p.dependencies
                                .iter()
                                .chain(p.optional_dependencies.iter())
                                .any(|(dep_name, dep_range)| {
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
        // Find the resolved version for this dep. Match by name AND by semver range:
        // without the range check, a root dep would get wired to whichever version was
        // hoisted, even if that version doesn't satisfy the declared range (see #2738).
        // Fall back to name-only for non-semver specs — `github:`, `link:`, or
        // dist-tags like `"latest"` / `"next"` (see #2794). Dist-tag resolution
        // happens in `resolve_version`; this site just needs to honor the graph.
        let is_non_semver = is_non_semver_spec(range);
        if let Some(pkg) = graph.packages.values().find(|p| {
            p.name == *name
                && p.nest_path.is_empty()
                && (is_non_semver || version_satisfies_range(&p.version, range))
        }) {
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
                    optional_dependencies: pkg.optional_dependencies.clone(),
                    bin: pkg.bin.clone(),
                    scripts,
                    optional: optional_names.contains(name),
                    overridden: false,
                    os: pkg.os.clone(),
                    cpu: pkg.cpu.clone(),
                },
            );
        }
    }

    // Also add transitive deps — match by semver range, not just name.
    // For github: ranges, match by exact string equality (not semver).
    // Iterate both dependencies and optional_dependencies to capture
    // platform-specific binaries (e.g., lightningcss-darwin-arm64).
    for pkg in graph.packages.values() {
        let all_transitive = pkg
            .dependencies
            .iter()
            .chain(pkg.optional_dependencies.iter());
        for (dep_name, dep_range) in all_transitive {
            let key = Lockfile::spec_key(dep_name, dep_range);
            if let std::collections::btree_map::Entry::Vacant(entry) = lockfile.entries.entry(key) {
                let dep_pkg = if is_non_semver_spec(dep_range) {
                    // Non-semver dep (`github:`, `link:`, or dist-tag like `"latest"`):
                    // match by name only. Dist-tags are resolved upstream in
                    // `resolve_version`, so a matching name in the graph is the
                    // correct lockfile target (see #2794).
                    //
                    // Known edge: when `graph.packages` holds multiple versions
                    // of the same name (e.g. sibling dep pulls a different
                    // range), `find()` returns first-by-key (lexicographically
                    // lowest version) instead of the dist-tag-resolved version.
                    // Tracked in #2796.
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
                        optional_dependencies: dep_pkg.optional_dependencies.clone(),
                        bin: dep_pkg.bin.clone(),
                        scripts: dep_scripts,
                        optional: false,
                        overridden: false,
                        os: dep_pkg.os.clone(),
                        cpu: dep_pkg.cpu.clone(),
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
                os: None,
                cpu: None,
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

    // Regression tests for #2738: `^0.27.3` must never match 0.25.12.
    // Bug: the resolver was trusting stale lockfile entries without revalidating
    // that the pinned version actually satisfies the range.
    #[test]
    fn test_resolve_version_caret_rejects_lower_minor() {
        // esbuild scenario: range `^0.27.3` must pick 0.27.3, not 0.25.12.
        let meta = make_metadata(
            "esbuild",
            vec![
                make_version("esbuild", "0.25.12", &[]),
                make_version("esbuild", "0.27.0", &[]),
                make_version("esbuild", "0.27.3", &[]),
            ],
        );
        let result = resolve_version("^0.27.3", &meta.versions, &meta.dist_tags).unwrap();
        assert_eq!(
            result.version, "0.27.3",
            "^0.27.3 must pick the highest version in [0.27.3, 0.28.0), not 0.25.12"
        );
    }

    #[test]
    fn test_version_satisfies_range_caret_zero_x() {
        // Directly validate the bounded-caret semantics we rely on at the lockfile-reuse
        // path in `resolve_one_task`: a pinned 0.25.12 must NOT be treated as satisfying
        // `^0.27.3`.
        assert!(
            !version_satisfies_range("0.25.12", "^0.27.3"),
            "0.25.12 must NOT satisfy ^0.27.3"
        );
        assert!(
            version_satisfies_range("0.27.3", "^0.27.3"),
            "0.27.3 must satisfy ^0.27.3"
        );
        assert!(
            version_satisfies_range("0.27.5", "^0.27.3"),
            "0.27.5 must satisfy ^0.27.3"
        );
        assert!(
            !version_satisfies_range("0.28.0", "^0.27.3"),
            "0.28.0 must NOT satisfy ^0.27.3"
        );
    }

    #[test]
    fn test_version_satisfies_range_tilde() {
        // `~0.27.3` == [0.27.3, 0.28.0)
        assert!(
            !version_satisfies_range("0.25.12", "~0.27.3"),
            "0.25.12 must NOT satisfy ~0.27.3"
        );
        assert!(
            version_satisfies_range("0.27.3", "~0.27.3"),
            "0.27.3 must satisfy ~0.27.3"
        );
        assert!(
            version_satisfies_range("0.27.5", "~0.27.3"),
            "0.27.5 must satisfy ~0.27.3"
        );
        assert!(
            !version_satisfies_range("0.28.0", "~0.27.3"),
            "0.28.0 must NOT satisfy ~0.27.3"
        );
    }

    #[test]
    fn test_version_satisfies_range_explicit() {
        // Explicit range `>=0.27.3 <0.28.0` accepts 0.27.3 and 0.27.5, rejects 0.25.12.
        assert!(
            !version_satisfies_range("0.25.12", ">=0.27.3 <0.28.0"),
            "0.25.12 must NOT satisfy >=0.27.3 <0.28.0"
        );
        assert!(
            version_satisfies_range("0.27.3", ">=0.27.3 <0.28.0"),
            "0.27.3 must satisfy >=0.27.3 <0.28.0"
        );
        assert!(
            version_satisfies_range("0.27.5", ">=0.27.3 <0.28.0"),
            "0.27.5 must satisfy >=0.27.3 <0.28.0"
        );
    }

    // #2794: dist-tag classifier — recognizes npm dist-tag specs like "latest",
    // "next", and custom tags as non-semver, distinct from both `github:`/`link:`
    // specifiers and semver ranges. Used by `graph_to_lockfile` to match by name
    // when the range string isn't a valid semver range.
    #[test]
    fn test_is_non_semver_spec_dist_tag_latest() {
        assert!(
            is_non_semver_spec("latest"),
            "'latest' must be classified as a non-semver (dist-tag) spec"
        );
    }

    #[test]
    fn test_is_non_semver_spec_github_prefix() {
        assert!(is_non_semver_spec("github:owner/repo"));
        assert!(is_non_semver_spec("github:owner/repo#main"));
    }

    #[test]
    fn test_is_non_semver_spec_link_prefix() {
        assert!(is_non_semver_spec("link:../ws-pkg"));
    }

    #[test]
    fn test_is_non_semver_spec_other_dist_tags() {
        // Standard and custom tag names are all dist-tag-shaped.
        assert!(is_non_semver_spec("next"));
        assert!(is_non_semver_spec("beta"));
        assert!(is_non_semver_spec("canary-build"));
        assert!(is_non_semver_spec("alpha_1"));
    }

    #[test]
    fn test_is_non_semver_spec_rejects_semver_ranges() {
        assert!(!is_non_semver_spec("1.2.3"));
        assert!(!is_non_semver_spec("^1.2.3"));
        assert!(!is_non_semver_spec("~1.0.0"));
        assert!(!is_non_semver_spec(">=1.0.0 <2.0.0"));
        assert!(!is_non_semver_spec("1.x"));
        assert!(
            !is_non_semver_spec("*"),
            "'*' is a semver wildcard, not a tag"
        );
    }

    #[test]
    fn test_is_non_semver_spec_rejects_protocol_specs() {
        // Protocol specs (file:, workspace:, npm:) don't reach the graph via
        // resolve_version. Even if they did, the shape check keeps them out
        // of the dist-tag class.
        assert!(!is_non_semver_spec("file:./x"));
        assert!(!is_non_semver_spec("workspace:*"));
        assert!(!is_non_semver_spec("npm:react@1.0.0"));
        assert!(!is_non_semver_spec("http://example.com/pkg.tgz"));
    }

    #[test]
    fn test_is_non_semver_spec_edge_cases() {
        assert!(!is_non_semver_spec(""), "empty string is not a dist-tag");
        assert!(
            !is_non_semver_spec("1latest"),
            "digit-prefixed strings aren't tag-shaped"
        );
    }

    #[test]
    fn test_is_dist_tag_shape_rejects_semver_wildcards() {
        // `x` and `x.x.x` pass the char shape check but parse as semver
        // wildcards — Range::parse accepts them, so they must NOT be classified
        // as dist-tags.
        assert!(!is_dist_tag_shape("x"));
        assert!(!is_dist_tag_shape("x.x.x"));
    }

    #[test]
    fn test_graph_to_lockfile_rejects_hoisted_version_outside_range() {
        // Regression for #2738: if the hoisted package version does not satisfy
        // the declared range, `graph_to_lockfile` must NOT wire the lockfile
        // entry for that range to it. Only a version that actually satisfies
        // the range should be picked.
        let mut graph = ResolvedGraph::default();
        // Pretend hoisting picked an older `esbuild@0.25.12` (maybe from a
        // stray transitive in a prior state). A newer `0.27.3` is nested.
        graph.packages.insert(
            "esbuild@0.25.12".to_string(),
            ResolvedPackage {
                name: "esbuild".to_string(),
                version: "0.25.12".to_string(),
                tarball_url: "https://registry.npmjs.org/esbuild/-/esbuild-0.25.12.tgz".to_string(),
                integrity: "sha512-stale".to_string(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![], // hoisted to root
                os: None,
                cpu: None,
            },
        );
        graph.packages.insert(
            "esbuild@0.27.3".to_string(),
            ResolvedPackage {
                name: "esbuild".to_string(),
                version: "0.27.3".to_string(),
                tarball_url: "https://registry.npmjs.org/esbuild/-/esbuild-0.27.3.tgz".to_string(),
                integrity: "sha512-correct".to_string(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec!["some-parent".to_string()], // nested
                os: None,
                cpu: None,
            },
        );

        let mut deps = BTreeMap::new();
        deps.insert("esbuild".to_string(), "^0.27.3".to_string());

        let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());

        // Before the fix, the hoisted-by-name lookup picked 0.25.12 and wrote it
        // under the `esbuild@^0.27.3` key even though it doesn't satisfy the range.
        // After the fix, the lookup must skip non-matching hoisted versions;
        // the only entry the test can assert on is that 0.25.12 is NOT wired here.
        if let Some(entry) = lockfile.entries.get("esbuild@^0.27.3") {
            assert_ne!(
                entry.version, "0.25.12",
                "graph_to_lockfile must not wire ^0.27.3 to a hoisted 0.25.12"
            );
        }
    }

    #[test]
    fn test_lockfile_entry_satisfies_for_current_range_rejects_stale() {
        // Simulates a lockfile left over from an earlier install, pinned to 0.25.12
        // under the key `esbuild@^0.27.3`. On the next install the resolver must NOT
        // reuse this stale pin; it must re-resolve against the registry.
        let stale = LockfileEntry {
            name: "esbuild".to_string(),
            range: "^0.27.3".to_string(),
            version: "0.25.12".to_string(),
            resolved: String::new(),
            integrity: String::new(),
            dependencies: BTreeMap::new(),
            optional_dependencies: BTreeMap::new(),
            bin: BTreeMap::new(),
            scripts: BTreeMap::new(),
            optional: false,
            overridden: false,
            os: None,
            cpu: None,
        };

        assert!(
            !lockfile_entry_satisfies_range(&stale, "^0.27.3"),
            "stale lockfile entry pinned to 0.25.12 must not satisfy ^0.27.3"
        );

        let fresh = LockfileEntry {
            version: "0.27.3".to_string(),
            ..stale
        };
        assert!(
            lockfile_entry_satisfies_range(&fresh, "^0.27.3"),
            "fresh lockfile entry pinned to 0.27.3 must satisfy ^0.27.3"
        );
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        hoist(&mut graph);

        // Single version should remain at root
        assert!(graph.packages["zod@3.24.4"].nest_path.is_empty());
    }

    // #2794: when the graph has both a root and a nested version of the same
    // package, a dist-tag root dep must pick the root (hoisted) version.
    #[test]
    fn test_graph_to_lockfile_dist_tag_respects_nest_path() {
        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: "root-url".to_string(),
                integrity: "root-integrity".to_string(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );
        graph.packages.insert(
            "zod@4.0.0".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "4.0.0".to_string(),
                tarball_url: "nested-url".to_string(),
                integrity: "nested-integrity".to_string(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec!["some-parent".to_string()],
                os: None,
                cpu: None,
            },
        );

        let mut deps = BTreeMap::new();
        deps.insert("zod".to_string(), "latest".to_string());

        let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());
        let entry = &lockfile.entries["zod@latest"];
        assert_eq!(
            entry.version, "3.24.4",
            "dist-tag root dep must pick the root (nest_path=[]) version, not nested"
        );
        assert_eq!(entry.resolved, "root-url");
    }

    // #2794: a transitive dep declared with a dist-tag spec (e.g. `"bar": "latest"`
    // inside another package's `dependencies`) must also land in the lockfile.
    // Separate match site from the root-dep loop — has its own code path.
    #[test]
    fn test_graph_to_lockfile_dist_tag_transitive_dep() {
        let mut graph = ResolvedGraph::default();

        // foo@1.0.0 depends on bar@latest
        let mut foo_deps = BTreeMap::new();
        foo_deps.insert("bar".to_string(), "latest".to_string());
        graph.packages.insert(
            "foo@1.0.0".to_string(),
            ResolvedPackage {
                name: "foo".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: "foo-url".to_string(),
                integrity: "foo-integrity".to_string(),
                dependencies: foo_deps,
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        // bar@2.5.0 — what `latest` resolved to
        graph.packages.insert(
            "bar@2.5.0".to_string(),
            ResolvedPackage {
                name: "bar".to_string(),
                version: "2.5.0".to_string(),
                tarball_url: "bar-url".to_string(),
                integrity: "bar-integrity".to_string(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        let mut deps = BTreeMap::new();
        deps.insert("foo".to_string(), "^1.0.0".to_string());

        let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());
        let entry = lockfile
            .entries
            .get("bar@latest")
            .expect("transitive dist-tag dep must be written to the lockfile");
        assert_eq!(entry.version, "2.5.0");
        assert_eq!(entry.resolved, "bar-url");
    }

    // #2796: documents the current (wrong) behavior when a transitive dist-tag
    // dep collides with a sibling that pulls a different version of the same
    // name. Name-only `find()` returns first-by-key, not the dist-tag-resolved
    // version. Real fix needs `resolved_from_tag` plumbing — tracked separately.
    #[test]
    fn test_graph_to_lockfile_dist_tag_transitive_multi_version_is_first_by_key() {
        let mut graph = ResolvedGraph::default();

        // foo@1.0.0 declares "bar": "latest" — resolves to bar@2.5.0
        let mut foo_deps = BTreeMap::new();
        foo_deps.insert("bar".to_string(), "latest".to_string());
        graph.packages.insert(
            "foo@1.0.0".to_string(),
            ResolvedPackage {
                name: "foo".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: "foo-url".to_string(),
                integrity: "foo-integrity".to_string(),
                dependencies: foo_deps,
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        // baz@1.0.0 declares "bar": "^1.0.0" — resolves to bar@1.0.0
        let mut baz_deps = BTreeMap::new();
        baz_deps.insert("bar".to_string(), "^1.0.0".to_string());
        graph.packages.insert(
            "baz@1.0.0".to_string(),
            ResolvedPackage {
                name: "baz".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: "baz-url".to_string(),
                integrity: "baz-integrity".to_string(),
                dependencies: baz_deps,
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        graph.packages.insert(
            "bar@1.0.0".to_string(),
            ResolvedPackage {
                name: "bar".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: "bar-1-url".to_string(),
                integrity: "bar-1-integrity".to_string(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        graph.packages.insert(
            "bar@2.5.0".to_string(),
            ResolvedPackage {
                name: "bar".to_string(),
                version: "2.5.0".to_string(),
                tarball_url: "bar-2-url".to_string(),
                integrity: "bar-2-integrity".to_string(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        let mut deps = BTreeMap::new();
        deps.insert("foo".to_string(), "^1.0.0".to_string());
        deps.insert("baz".to_string(), "^1.0.0".to_string());

        let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());
        let entry = lockfile
            .entries
            .get("bar@latest")
            .expect("transitive dist-tag entry must exist");
        // Current behavior: first-by-key wins. Once #2796 is fixed, this should
        // assert "2.5.0" instead.
        assert_eq!(
            entry.version, "1.0.0",
            "documents #2796 — rewrite when fix lands"
        );
    }

    // #2794: a root dep declared with a dist-tag spec (`"latest"`) must land
    // in the lockfile pinned to the resolved version, not be silently dropped.
    #[test]
    fn test_graph_to_lockfile_dist_tag_root_dep() {
        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "@types/bun@1.3.12".to_string(),
            ResolvedPackage {
                name: "@types/bun".to_string(),
                version: "1.3.12".to_string(),
                tarball_url: "https://registry.npmjs.org/@types/bun/-/bun-1.3.12.tgz".to_string(),
                integrity: "sha512-bun-tag".to_string(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        let mut deps = BTreeMap::new();
        deps.insert("@types/bun".to_string(), "latest".to_string());

        let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());
        assert_eq!(
            lockfile.entries.len(),
            1,
            "dist-tag dep must produce a lockfile entry"
        );

        let entry = &lockfile.entries["@types/bun@latest"];
        assert_eq!(entry.version, "1.3.12");
        assert_eq!(
            entry.resolved,
            "https://registry.npmjs.org/@types/bun/-/bun-1.3.12.tgz"
        );
        assert_eq!(entry.integrity, "sha512-bun-tag");
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec!["other".to_string()],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
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

    #[test]
    fn test_platform_filtering_skips_incompatible() {
        // Verify that a package with os/cpu constraints that don't match
        // the current platform is correctly stored with those constraints
        let mut v = make_version("lightningcss-linux-x64", "1.31.1", &[]);
        v.os = Some(vec!["linux".to_string()]);
        v.cpu = Some(vec!["x64".to_string()]);

        let resolved = ResolvedPackage {
            name: "lightningcss-linux-x64".to_string(),
            version: "1.31.1".to_string(),
            tarball_url: String::new(),
            integrity: String::new(),
            dependencies: BTreeMap::new(),
            optional_dependencies: BTreeMap::new(),
            bin: BTreeMap::new(),
            nest_path: vec![],
            os: v.os.clone(),
            cpu: v.cpu.clone(),
        };

        // Platform filtering is applied via matches_platform
        let matches = platform::matches_platform(&resolved.os, &resolved.cpu);

        // On macOS ARM, this should NOT match (linux/x64)
        // On Linux x64, this WOULD match
        // The test just verifies the filtering logic is wired correctly
        if platform::current_os() == "linux" && platform::current_cpu() == "x64" {
            assert!(matches, "linux-x64 package should match on linux-x64");
        } else {
            assert!(
                !matches,
                "linux-x64 package should not match on {}-{}",
                platform::current_os(),
                platform::current_cpu()
            );
        }
    }

    #[test]
    fn test_platform_filtering_allows_unconstrained() {
        let resolved = ResolvedPackage {
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
        };

        assert!(
            platform::matches_platform(&resolved.os, &resolved.cpu),
            "unconstrained packages should always match"
        );
    }

    #[test]
    fn test_graph_to_lockfile_includes_transitive_optional_deps() {
        // Simulates lightningcss having optional platform-specific binaries.
        // The lockfile must include the platform-matching optional dep.
        let mut graph = ResolvedGraph::default();

        // lightningcss — parent with optional platform-specific deps
        let mut opt_deps = BTreeMap::new();
        opt_deps.insert(
            "lightningcss-darwin-arm64".to_string(),
            "1.32.0".to_string(),
        );
        opt_deps.insert("lightningcss-linux-x64".to_string(), "1.32.0".to_string());

        graph.packages.insert(
            "lightningcss@1.32.0".to_string(),
            ResolvedPackage {
                name: "lightningcss".to_string(),
                version: "1.32.0".to_string(),
                tarball_url: "https://registry.npmjs.org/lightningcss/-/lightningcss-1.32.0.tgz"
                    .to_string(),
                integrity: "sha512-lcss".to_string(),
                dependencies: BTreeMap::from([("detect-libc".to_string(), "^2.0.3".to_string())]),
                optional_dependencies: opt_deps,
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        // The platform-matching optional dep (resolved by the resolver)
        graph.packages.insert(
            "lightningcss-darwin-arm64@1.32.0".to_string(),
            ResolvedPackage {
                name: "lightningcss-darwin-arm64".to_string(),
                version: "1.32.0".to_string(),
                tarball_url: "https://registry.npmjs.org/lightningcss-darwin-arm64/-/lightningcss-darwin-arm64-1.32.0.tgz".to_string(),
                integrity: "sha512-darwinarm64".to_string(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: Some(vec!["darwin".to_string()]),
                cpu: Some(vec!["arm64".to_string()]),
            },
        );

        // detect-libc (regular transitive dep)
        graph.packages.insert(
            "detect-libc@2.0.3".to_string(),
            ResolvedPackage {
                name: "detect-libc".to_string(),
                version: "2.0.3".to_string(),
                tarball_url: "https://registry.npmjs.org/detect-libc/-/detect-libc-2.0.3.tgz"
                    .to_string(),
                integrity: "sha512-libc".to_string(),
                dependencies: BTreeMap::new(),
                optional_dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        let mut root_deps = BTreeMap::new();
        root_deps.insert("lightningcss".to_string(), "^1.30.0".to_string());

        let lockfile = graph_to_lockfile(&graph, &root_deps, &[], &HashSet::new());

        // lightningcss itself should be in lockfile
        assert!(
            lockfile.entries.contains_key("lightningcss@^1.30.0"),
            "lightningcss should be in lockfile"
        );

        // lightningcss entry should have optional_dependencies
        let lcss = &lockfile.entries["lightningcss@^1.30.0"];
        assert!(
            lcss.optional_dependencies
                .contains_key("lightningcss-darwin-arm64"),
            "lockfile entry should record optional_dependencies"
        );

        // The platform-specific optional dep should be in lockfile as a transitive entry
        assert!(
            lockfile
                .entries
                .contains_key("lightningcss-darwin-arm64@1.32.0"),
            "platform-specific optional dep should be in lockfile as transitive entry"
        );

        // The non-matching platform optional dep should NOT be in lockfile
        // (it wasn't in the graph because platform filtering skipped it)
        assert!(
            !lockfile
                .entries
                .contains_key("lightningcss-linux-x64@1.32.0"),
            "non-matching platform dep should not be in lockfile"
        );

        // Regular transitive dep should also be present
        assert!(
            lockfile.entries.contains_key("detect-libc@^2.0.3"),
            "regular transitive dep should be in lockfile"
        );
    }

    #[test]
    fn test_graph_to_lockfile_optional_deps_stored_on_entry() {
        // Verify that optional_dependencies are stored on the lockfile entry itself
        let mut graph = ResolvedGraph::default();

        let mut opt_deps = BTreeMap::new();
        opt_deps.insert("pkg-darwin-arm64".to_string(), "1.0.0".to_string());

        graph.packages.insert(
            "pkg@1.0.0".to_string(),
            ResolvedPackage {
                name: "pkg".to_string(),
                version: "1.0.0".to_string(),
                tarball_url: "url".to_string(),
                integrity: "hash".to_string(),
                dependencies: BTreeMap::new(),
                optional_dependencies: opt_deps.clone(),
                bin: BTreeMap::new(),
                nest_path: vec![],
                os: None,
                cpu: None,
            },
        );

        let mut root_deps = BTreeMap::new();
        root_deps.insert("pkg".to_string(), "^1.0.0".to_string());

        let lockfile = graph_to_lockfile(&graph, &root_deps, &[], &HashSet::new());
        let entry = &lockfile.entries["pkg@^1.0.0"];

        assert_eq!(
            entry.optional_dependencies, opt_deps,
            "lockfile entry should preserve optional_dependencies"
        );
    }
}
