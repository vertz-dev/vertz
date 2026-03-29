use crate::pm::registry::RegistryClient;
use crate::pm::types::{
    Lockfile, LockfileEntry, PackageMetadata, ResolvedPackage, VersionMetadata,
};
use node_semver::{Range, Version};
use std::collections::{BTreeMap, HashMap, HashSet};

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

/// Mutable state shared across recursive resolution calls
struct ResolveState<'a> {
    registry: &'a RegistryClient,
    lockfile: &'a Lockfile,
    graph: ResolvedGraph,
    visited: HashSet<String>,
    metadata_cache: HashMap<String, PackageMetadata>,
}

/// Recursively resolve all dependencies starting from root deps
pub async fn resolve_all(
    root_deps: &BTreeMap<String, String>,
    root_dev_deps: &BTreeMap<String, String>,
    registry: &RegistryClient,
    lockfile: &Lockfile,
) -> Result<ResolvedGraph, Box<dyn std::error::Error + Send + Sync>> {
    let mut state = ResolveState {
        registry,
        lockfile,
        graph: ResolvedGraph::default(),
        visited: HashSet::new(),
        metadata_cache: HashMap::new(),
    };

    // Resolve regular dependencies
    for (name, range) in root_deps {
        resolve_recursive(name, range, &mut state).await?;
    }

    // Resolve dev dependencies (but their transitive devDeps will be skipped)
    for (name, range) in root_dev_deps {
        resolve_recursive(name, range, &mut state).await?;
    }

    Ok(state.graph)
}

#[async_recursion::async_recursion]
async fn resolve_recursive(
    name: &str,
    range: &str,
    state: &mut ResolveState<'_>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let visit_key = format!("{}@{}", name, range);

    // Break cycles
    if state.visited.contains(&visit_key) {
        return Ok(());
    }
    state.visited.insert(visit_key);

    // Check lockfile first for pinned version
    let lockfile_key = Lockfile::spec_key(name, range);
    if let Some(entry) = state.lockfile.entries.get(&lockfile_key) {
        let graph_key = ResolvedGraph::key(name, &entry.version);
        if state.graph.packages.contains_key(&graph_key) {
            return Ok(());
        }

        // Use lockfile version — still need metadata for transitive deps
        let metadata =
            get_or_fetch_metadata(name, state.registry, &mut state.metadata_cache).await?;
        if let Some(version_meta) = metadata.versions.get(&entry.version) {
            let resolved = ResolvedPackage {
                name: name.to_string(),
                version: entry.version.clone(),
                tarball_url: version_meta.dist.tarball.clone(),
                integrity: version_meta.dist.integrity.clone(),
                dependencies: version_meta.dependencies.clone(),
                bin: version_meta.bin.to_map(name),
                nest_path: vec![],
            };
            if !version_meta.scripts.is_empty() {
                state
                    .graph
                    .scripts
                    .insert(graph_key.clone(), version_meta.scripts.clone());
            }
            state.graph.packages.insert(graph_key, resolved);

            // Resolve transitive deps (skip transitive devDeps)
            for (dep_name, dep_range) in &version_meta.dependencies {
                resolve_recursive(dep_name, dep_range, state).await?;
            }

            return Ok(());
        }
    }

    // Fetch metadata from registry
    let metadata = get_or_fetch_metadata(name, state.registry, &mut state.metadata_cache).await?;

    // Resolve version
    let version_meta = resolve_version(range, &metadata.versions, &metadata.dist_tags)
        .ok_or_else(|| format!("No version of '{}' matches range '{}'", name, range))?;

    let graph_key = ResolvedGraph::key(name, &version_meta.version);
    if state.graph.packages.contains_key(&graph_key) {
        return Ok(());
    }

    let resolved = ResolvedPackage {
        name: name.to_string(),
        version: version_meta.version.clone(),
        tarball_url: version_meta.dist.tarball.clone(),
        integrity: version_meta.dist.integrity.clone(),
        dependencies: version_meta.dependencies.clone(),
        bin: version_meta.bin.to_map(name),
        nest_path: vec![],
    };
    if !version_meta.scripts.is_empty() {
        state
            .graph
            .scripts
            .insert(graph_key.clone(), version_meta.scripts.clone());
    }
    state.graph.packages.insert(graph_key, resolved);

    // Resolve transitive deps (skip transitive devDeps — only root devDeps are resolved)
    let deps = version_meta.dependencies.clone();
    for (dep_name, dep_range) in &deps {
        resolve_recursive(dep_name, dep_range, state).await?;
    }

    Ok(())
}

async fn get_or_fetch_metadata(
    name: &str,
    registry: &RegistryClient,
    cache: &mut HashMap<String, PackageMetadata>,
) -> Result<PackageMetadata, Box<dyn std::error::Error + Send + Sync>> {
    if let Some(meta) = cache.get(name) {
        return Ok(meta.clone());
    }
    let meta = registry.fetch_metadata(name).await?;
    cache.insert(name.to_string(), meta.clone());
    Ok(meta)
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

/// Convert resolved graph to lockfile entries
pub fn graph_to_lockfile(graph: &ResolvedGraph, all_deps: &BTreeMap<String, String>) -> Lockfile {
    let mut lockfile = Lockfile::default();

    for (name, range) in all_deps {
        let key = Lockfile::spec_key(name, range);
        // Find the resolved version for this dep
        if let Some(pkg) = graph
            .packages
            .values()
            .find(|p| p.name == *name && p.nest_path.is_empty())
        {
            lockfile.entries.insert(
                key,
                LockfileEntry {
                    name: name.clone(),
                    range: range.clone(),
                    version: pkg.version.clone(),
                    resolved: pkg.tarball_url.clone(),
                    integrity: pkg.integrity.clone(),
                    dependencies: pkg.dependencies.clone(),
                },
            );
        }
    }

    // Also add transitive deps — match by semver range, not just name
    for pkg in graph.packages.values() {
        for (dep_name, dep_range) in &pkg.dependencies {
            let key = Lockfile::spec_key(dep_name, dep_range);
            if let std::collections::btree_map::Entry::Vacant(entry) = lockfile.entries.entry(key) {
                // Find the resolved package that matches both name AND semver range.
                // Fail-closed: no name-only fallback — if range doesn't match, skip.
                let dep_pkg = graph.packages.values().find(|p| {
                    p.name == *dep_name
                        && Range::parse(dep_range)
                            .ok()
                            .and_then(|r| Version::parse(&p.version).ok().map(|v| r.satisfies(&v)))
                            .unwrap_or(false)
                });

                if let Some(dep_pkg) = dep_pkg {
                    entry.insert(LockfileEntry {
                        name: dep_name.clone(),
                        range: dep_range.clone(),
                        version: dep_pkg.version.clone(),
                        resolved: dep_pkg.tarball_url.clone(),
                        integrity: dep_pkg.integrity.clone(),
                        dependencies: dep_pkg.dependencies.clone(),
                    });
                }
            }
        }
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

        let lockfile = graph_to_lockfile(&graph, &deps);
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

        let lockfile = graph_to_lockfile(&graph, &deps);

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

        let lockfile = graph_to_lockfile(&graph, &deps);
        // Should have react, loose-envify, and js-tokens
        assert!(lockfile.entries.contains_key("react@^18.3.0"));
        assert!(lockfile.entries.contains_key("loose-envify@^1.1.0"));
        assert!(lockfile.entries.contains_key("js-tokens@^3.0.0 || ^4.0.0"));
    }
}
