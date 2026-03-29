pub mod bin;
pub mod linker;
pub mod lockfile;
pub mod registry;
pub mod resolver;
pub mod tarball;
pub mod types;

use futures_util::stream::{self, StreamExt};
use indicatif::{ProgressBar, ProgressStyle};
use registry::RegistryClient;
use std::collections::BTreeMap;
use std::io::IsTerminal;
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

    let is_tty = std::io::stderr().is_terminal();

    // Resolve dependency graph
    let resolve_spinner = if is_tty {
        let sp = ProgressBar::new_spinner();
        sp.set_style(ProgressStyle::default_spinner().template("{spinner} {msg}").unwrap());
        sp.set_message("Resolving dependencies...");
        sp.enable_steady_tick(std::time::Duration::from_millis(80));
        Some(sp)
    } else {
        eprintln!("Resolving dependencies...");
        None
    };

    let mut graph = resolver::resolve_all(
        &pkg.dependencies,
        &pkg.dev_dependencies,
        &registry_client,
        &existing_lockfile,
    )
    .await
    .map_err(|e| format!("{}", e))?;

    if let Some(sp) = resolve_spinner {
        sp.finish_and_clear();
    }
    eprintln!("Resolved {} packages", graph.packages.len());

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
        let download_bar = if is_tty {
            let pb = ProgressBar::new(download_count as u64);
            pb.set_style(
                ProgressStyle::default_bar()
                    .template("Downloading packages {bar:24} {pos}/{len}")
                    .unwrap()
                    .progress_chars("█▓░"),
            );
            Some(pb)
        } else {
            eprintln!("Downloading packages...");
            None
        };

        let bar_clone = download_bar.clone();
        let results: Vec<Result<_, Box<dyn std::error::Error + Send + Sync>>> =
            stream::iter(packages_to_download)
                .map(|pkg| {
                    let mgr = Arc::clone(&tarball_mgr);
                    let name = pkg.name.clone();
                    let version = pkg.version.clone();
                    let url = pkg.tarball_url.clone();
                    let integrity = pkg.integrity.clone();
                    let bar = bar_clone.clone();
                    async move {
                        mgr.fetch_and_extract(&name, &version, &url, &integrity)
                            .await?;
                        if let Some(b) = bar {
                            b.inc(1);
                        }
                        Ok(())
                    }
                })
                .buffer_unordered(16)
                .collect()
                .await;

        if let Some(pb) = download_bar {
            pb.finish_and_clear();
        }

        // Check for download errors — collect all failures
        let download_errors: Vec<_> = results
            .into_iter()
            .filter_map(|r| r.err())
            .collect();
        if !download_errors.is_empty() {
            let msgs: Vec<_> = download_errors.iter().map(|e| e.to_string()).collect();
            return Err(format!(
                "Failed to download {} package(s):\n  {}",
                msgs.len(),
                msgs.join("\n  ")
            )
            .into());
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

/// Add packages to dependencies (batch — single install pass)
pub async fn add(
    root_dir: &Path,
    packages: &[&str],
    dev: bool,
    exact: bool,
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
                            metadata.dist_tags.get("latest").unwrap_or(&"unknown".to_string())
                        )
                    })?;
                Some(v.version.clone())
            }
        } else {
            // Use latest
            let latest = metadata
                .dist_tags
                .get("latest")
                .cloned()
                .ok_or_else(|| {
                    format!("error: package \"{}\" not found in npm registry", name)
                })?;
            Some(latest)
        };

        // Format the range
        let range = if let Some(version) = resolved_version {
            if exact {
                version
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

        eprintln!("+ {}@{}", name, range);
    }

    types::write_package_json(root_dir, &pkg)?;

    // Single install pass for all packages
    install(root_dir, false, false).await
}

/// Remove packages from dependencies (batch — single install pass)
pub async fn remove(root_dir: &Path, packages: &[&str]) -> Result<(), Box<dyn std::error::Error>> {
    let mut pkg = types::read_package_json(root_dir)?;
    let mut not_found: Vec<&str> = Vec::new();

    for package in packages {
        let removed = pkg.dependencies.remove(*package).is_some()
            || pkg.dev_dependencies.remove(*package).is_some();

        if !removed {
            not_found.push(package);
        } else {
            eprintln!("- {}", package);
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
