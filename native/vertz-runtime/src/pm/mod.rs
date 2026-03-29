pub mod bin;
pub mod linker;
pub mod lockfile;
pub mod registry;
pub mod resolver;
pub mod tarball;
pub mod types;

use futures_util::stream::{self, StreamExt};
use registry::RegistryClient;
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;
use tarball::TarballManager;

/// Install all dependencies from package.json
pub async fn install(
    root_dir: &Path,
    frozen: bool,
    _ignore_scripts: bool,
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
    eprintln!("Resolving dependencies...");
    let mut graph = resolver::resolve_all(
        &pkg.dependencies,
        &pkg.dev_dependencies,
        &registry_client,
        &existing_lockfile,
    )
    .await
    .map_err(|e| format!("{}", e))?;

    eprintln!("Resolved {} packages", graph.packages.len());

    // Apply hoisting
    resolver::hoist(&mut graph);

    // Download and extract tarballs in parallel
    eprintln!("Downloading packages...");
    let packages_to_download: Vec<_> = graph
        .packages
        .values()
        .filter(|pkg| !tarball_mgr.is_cached(&pkg.name, &pkg.version))
        .collect();

    let download_count = packages_to_download.len();
    if download_count > 0 {
        let results: Vec<Result<_, Box<dyn std::error::Error + Send + Sync>>> =
            stream::iter(packages_to_download)
                .map(|pkg| {
                    let mgr = Arc::clone(&tarball_mgr);
                    let name = pkg.name.clone();
                    let version = pkg.version.clone();
                    let url = pkg.tarball_url.clone();
                    let integrity = pkg.integrity.clone();
                    async move {
                        mgr.fetch_and_extract(&name, &version, &url, &integrity)
                            .await?;
                        Ok(())
                    }
                })
                .buffer_unordered(16)
                .collect()
                .await;

        // Check for download errors
        for result in results {
            result.map_err(|e| format!("{}", e))?;
        }

        eprintln!("Downloaded {} packages", download_count);
    }

    // Link packages into node_modules
    eprintln!("Linking packages...");
    let store_dir = cache_dir.join("store");
    let link_result = linker::link_packages(root_dir, &graph, &store_dir)?;
    eprintln!(
        "Linked {} packages ({} files)",
        link_result.packages_linked, link_result.files_linked
    );

    // Generate .bin/ stubs
    let bin_count = bin::generate_bin_stubs(root_dir, &graph)?;
    if bin_count > 0 {
        eprintln!("Created {} bin stubs", bin_count);
    }

    // Write lockfile
    let new_lockfile = resolver::graph_to_lockfile(&graph, &all_deps);
    lockfile::write_lockfile(&lockfile_path, &new_lockfile)?;

    let elapsed = start.elapsed();
    eprintln!("Done in {:.1}s", elapsed.as_secs_f64());

    Ok(())
}

/// Add a package to dependencies
pub async fn add(
    root_dir: &Path,
    package: &str,
    dev: bool,
    exact: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut pkg = types::read_package_json(root_dir)?;

    let (name, version_spec) = types::parse_package_specifier(package);

    let cache_dir = registry::default_cache_dir();
    let registry_client = RegistryClient::new(&cache_dir);

    // Fetch metadata to determine the version
    let metadata = registry_client
        .fetch_metadata(name)
        .await
        .map_err(|e| format!("{}", e))?;

    let resolved_version = if let Some(spec) = version_spec {
        // User specified a version
        let v = resolver::resolve_version(spec, &metadata.versions, &metadata.dist_tags)
            .ok_or_else(|| format!("No version of '{}' matches '{}'", name, spec))?;
        v.version.clone()
    } else {
        // Use latest
        metadata
            .dist_tags
            .get("latest")
            .cloned()
            .ok_or_else(|| format!("No 'latest' tag for '{}'", name))?
    };

    // Format the range
    let range = if exact {
        resolved_version.clone()
    } else {
        format!("^{}", resolved_version)
    };

    // Add to package.json
    if dev {
        pkg.dev_dependencies.insert(name.to_string(), range.clone());
    } else {
        pkg.dependencies.insert(name.to_string(), range.clone());
    }

    types::write_package_json(root_dir, &pkg)?;
    eprintln!("+ {}@{}", name, range);

    // Re-run install
    install(root_dir, false, false).await
}

/// Remove a package from dependencies
pub async fn remove(root_dir: &Path, package: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut pkg = types::read_package_json(root_dir)?;

    let removed = pkg.dependencies.remove(package).is_some()
        || pkg.dev_dependencies.remove(package).is_some();

    if !removed {
        return Err(format!("Package '{}' not found in dependencies", package).into());
    }

    types::write_package_json(root_dir, &pkg)?;
    eprintln!("- {}", package);

    // Re-run install to clean orphaned deps
    install(root_dir, false, false).await
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

    #[test]
    fn test_verify_frozen_passes() {
        let mut pkg = types::PackageJson {
            name: Some("test".to_string()),
            version: Some("1.0.0".to_string()),
            dependencies: BTreeMap::new(),
            dev_dependencies: BTreeMap::new(),
            peer_dependencies: BTreeMap::new(),
            optional_dependencies: BTreeMap::new(),
            bundled_dependencies: vec![],
            bin: types::BinField::default(),
            scripts: BTreeMap::new(),
        };
        pkg.dependencies
            .insert("zod".to_string(), "^3.24.0".to_string());

        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(),
            LockfileEntry {
                name: "zod".to_string(),
                range: "^3.24.0".to_string(),
                version: "3.24.4".to_string(),
                resolved: "url".to_string(),
                integrity: "hash".to_string(),
                dependencies: BTreeMap::new(),
            },
        );

        assert!(verify_frozen(&pkg, &lockfile).is_ok());
    }

    #[test]
    fn test_verify_frozen_fails_missing_dep() {
        let mut pkg = types::PackageJson {
            name: Some("test".to_string()),
            version: Some("1.0.0".to_string()),
            dependencies: BTreeMap::new(),
            dev_dependencies: BTreeMap::new(),
            peer_dependencies: BTreeMap::new(),
            optional_dependencies: BTreeMap::new(),
            bundled_dependencies: vec![],
            bin: types::BinField::default(),
            scripts: BTreeMap::new(),
        };
        pkg.dependencies
            .insert("zod".to_string(), "^3.24.0".to_string());

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
        let mut pkg = types::PackageJson {
            name: Some("test".to_string()),
            version: Some("1.0.0".to_string()),
            dependencies: BTreeMap::new(),
            dev_dependencies: BTreeMap::new(),
            peer_dependencies: BTreeMap::new(),
            optional_dependencies: BTreeMap::new(),
            bundled_dependencies: vec![],
            bin: types::BinField::default(),
            scripts: BTreeMap::new(),
        };
        pkg.dependencies
            .insert("zod".to_string(), "^4.0.0".to_string()); // Changed range

        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(), // Old range in lockfile
            LockfileEntry {
                name: "zod".to_string(),
                range: "^3.24.0".to_string(),
                version: "3.24.4".to_string(),
                resolved: "url".to_string(),
                integrity: "hash".to_string(),
                dependencies: BTreeMap::new(),
            },
        );

        let result = verify_frozen(&pkg, &lockfile);
        assert!(result.is_err());
    }
}
