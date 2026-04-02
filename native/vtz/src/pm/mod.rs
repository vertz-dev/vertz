pub mod bin;
pub mod cache;
pub mod config;
pub mod create;
pub mod github;
pub mod linker;
pub mod lockfile;
pub mod output;
pub mod overrides;
pub mod pack;
pub mod patch;
pub mod registry;
pub mod resolver;
pub mod scripts;
pub mod tarball;
pub mod types;
pub mod vertzrc;
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
    script_policy: vertzrc::ScriptPolicy,
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

    // Collect optional dependency names for lockfile marking
    let optional_names: HashSet<String> = pkg.optional_dependencies.keys().cloned().collect();

    let mut all_deps = resolved_deps.clone();
    for (k, v) in &resolved_dev_deps {
        all_deps.insert(k.clone(), v.clone());
    }
    // Include optional deps in all_deps for resolution
    for (k, v) in &pkg.optional_dependencies {
        all_deps.insert(k.clone(), v.clone());
    }

    // Frozen mode: verify lockfile matches merged deps (after workspace merging)
    if frozen {
        verify_frozen_deps(&all_deps, &existing_lockfile)?;
    }

    // Parse overrides from package.json (check both "overrides" and "resolutions")
    let raw_pkg_json = {
        let content = std::fs::read_to_string(root_dir.join("package.json"))
            .map_err(|e| format!("Could not read package.json: {}", e))?;
        serde_json::from_str::<serde_json::Value>(&content)
            .map_err(|e| format!("Invalid package.json: {}", e))?
    };
    let (raw_overrides, override_warnings) = overrides::extract_overrides_from_raw(&raw_pkg_json);
    for w in &override_warnings {
        output.warning(w);
    }
    let override_map = if raw_overrides.is_empty() {
        overrides::OverrideMap::default()
    } else {
        overrides::parse_overrides(&raw_overrides, &resolved_deps, &resolved_dev_deps)?
    };

    let cache_dir = registry::default_cache_dir();
    let registry_client = RegistryClient::new(&cache_dir);
    let tarball_mgr = Arc::new(TarballManager::new(&cache_dir));

    // Pre-resolve GitHub dependencies before resolver runs
    let mut pre_resolved = Vec::new();
    let gh_client_install = github::GitHubClient::new();
    for (name, range) in &all_deps {
        if !range.starts_with("github:") {
            continue;
        }
        let lockfile_key = types::Lockfile::spec_key(name, range);
        if let Some(entry) = existing_lockfile.entries.get(&lockfile_key) {
            // Lockfile has this GitHub dep — reconstruct ResolvedPackage from it.
            // Read bin entries from cached package.json if available.
            let bin = {
                let cached_path = tarball_mgr.store_path(&entry.name, &entry.version);
                if cached_path.exists() {
                    types::read_package_json(&cached_path)
                        .map(|p| p.bin.to_map(&entry.name))
                        .unwrap_or_default()
                } else {
                    BTreeMap::new()
                }
            };
            pre_resolved.push(types::ResolvedPackage {
                name: entry.name.clone(),
                version: entry.version.clone(),
                tarball_url: entry.resolved.clone(),
                integrity: entry.integrity.clone(),
                dependencies: entry.dependencies.clone(),
                bin,
                nest_path: vec![],
            });
        } else if !frozen {
            // No lockfile entry — resolve from GitHub API using parse_package_specifier
            output.github_resolve_started(range);

            let parsed = types::parse_package_specifier(range);
            let gh = match parsed {
                types::ParsedSpecifier::GitHub(gh) => gh,
                types::ParsedSpecifier::Error(msg) => {
                    return Err(msg.into());
                }
                _ => {
                    return Err(
                        format!("unexpected specifier type for GitHub range: {}", range).into(),
                    );
                }
            };

            let sha = gh_client_install
                .resolve_ref(&gh.owner, &gh.repo, gh.ref_.as_deref())
                .await
                .map_err(|e| format!("{}", e))?;
            let sha_abbrev = &sha[..7.min(sha.len())];

            let tarball_url = github::GitHubClient::tarball_url(&gh.owner, &gh.repo, &sha);
            let (extracted_path, integrity) = tarball_mgr
                .fetch_and_extract_github(name, &sha, &tarball_url)
                .await
                .map_err(|e| format!("{}", e))?;

            // Read package.json from extracted tarball for transitive deps and bin
            let gh_pkg = types::read_package_json(&extracted_path)?;

            output.github_resolve_complete(name, sha_abbrev);

            pre_resolved.push(types::ResolvedPackage {
                name: name.clone(),
                version: sha.clone(),
                tarball_url,
                integrity,
                dependencies: gh_pkg.dependencies.clone(),
                bin: gh_pkg.bin.to_map(name),
                nest_path: vec![],
            });
        }
        // frozen + no lockfile entry → verify_frozen_deps already caught this
    }

    // Resolve dependency graph (required deps)
    output.resolve_started();

    let progress_output = output.clone();
    let on_progress = move |resolved: usize| {
        progress_output.resolve_progress(resolved);
    };

    let (mut graph, override_applications) = resolver::resolve_all(
        &resolved_deps,
        &resolved_dev_deps,
        &registry_client,
        &existing_lockfile,
        &override_map,
        pre_resolved,
        Some(&on_progress),
    )
    .await
    .map_err(|e| format!("{}", e))?;

    // Resolve optional deps — failures are warnings, not errors
    let empty_overrides = overrides::OverrideMap::default();
    for (name, range) in &pkg.optional_dependencies {
        let mut optional_deps = BTreeMap::new();
        optional_deps.insert(name.clone(), range.clone());
        match resolver::resolve_all(
            &optional_deps,
            &BTreeMap::new(),
            &registry_client,
            &existing_lockfile,
            &empty_overrides,
            Vec::new(),
            None,
        )
        .await
        {
            Ok((optional_graph, _)) => {
                // Merge optional packages into the main graph
                for (key, pkg) in optional_graph.packages {
                    graph.packages.entry(key).or_insert(pkg);
                }
                for (key, scripts) in optional_graph.scripts {
                    graph.scripts.entry(key).or_insert(scripts);
                }
            }
            Err(e) => {
                output.warning(&format!(
                    "optional dependency {} failed to resolve: {}",
                    name, e
                ));
            }
        }
    }

    // Report override applications
    for app in &override_applications {
        output.info(&format!(
            "Override: {}@{} → {} (forced by overrides[\"{}\"])",
            app.target, app.original_range, app.forced_version, app.pattern
        ));
    }

    // Check for stale overrides
    if !override_map.is_empty() {
        let original_ranges: Vec<(String, String, String)> = override_applications
            .iter()
            .map(|app| {
                (
                    app.target.clone(),
                    app.original_range.clone(),
                    app.pattern.clone(),
                )
            })
            .collect();
        let stale_warnings = overrides::detect_stale_overrides(&override_map, &original_ranges);
        for w in &stale_warnings {
            output.warning(w);
        }
    }

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
                        if url.starts_with("https://codeload.github.com/") {
                            // GitHub tarball — use GitHub-specific extraction
                            let (_path, _integrity) =
                                mgr.fetch_and_extract_github(&name, &version, &url).await?;
                        } else {
                            mgr.fetch_and_extract(&name, &version, &url, &integrity)
                                .await?;
                        }
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

    // Read patched packages from package.json for linker (copy-not-hardlink)
    let patched_packages = patch::read_patched_package_names(root_dir);

    // Link packages into node_modules (incremental unless --force)
    output.link_started();
    let store_dir = cache_dir.join("store");
    let link_result =
        linker::link_packages_incremental(root_dir, &graph, &store_dir, force, &patched_packages)?;
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

    // Apply saved patches (after linking, before postinstall scripts)
    let patch_results = patch::apply_patches(root_dir)?;
    if !patch_results.is_empty() {
        output.info(&format!(
            "Applying {} patch{}:",
            patch_results.len(),
            if patch_results.len() == 1 { "" } else { "es" }
        ));
        for result in &patch_results {
            output.info(&format!("  {} \u{2713}", result.patch_path));
        }
    }

    // Generate .bin/ stubs
    let bin_count = bin::generate_bin_stubs(root_dir, &graph)?;
    output.bin_stubs_created(bin_count);

    // Run postinstall scripts based on policy
    match script_policy {
        vertzrc::ScriptPolicy::IgnoreAll => {
            // --ignore-scripts: skip all
        }
        vertzrc::ScriptPolicy::RunAll => {
            // --run-scripts: run all regardless of trust
            output.warning("--run-scripts bypasses trust list — all postinstall scripts will run");
            let postinstall_pkgs = scripts::packages_with_postinstall(&graph, &graph.scripts);
            if !postinstall_pkgs.is_empty() {
                scripts::run_postinstall_scripts(root_dir, &postinstall_pkgs, Arc::clone(&output))
                    .await;
            }
        }
        vertzrc::ScriptPolicy::TrustBased => {
            let postinstall_pkgs = scripts::packages_with_postinstall(&graph, &graph.scripts);
            if !postinstall_pkgs.is_empty() {
                let vertzrc_config = vertzrc::load_vertzrc(root_dir)?;
                let (trusted, untrusted): (Vec<_>, Vec<_>) =
                    postinstall_pkgs.into_iter().partition(|(name, _, _)| {
                        vertzrc::match_trust_pattern(name, &vertzrc_config.trust_scripts)
                    });

                // Run trusted scripts
                if !trusted.is_empty() {
                    scripts::run_postinstall_scripts(root_dir, &trusted, Arc::clone(&output)).await;
                }

                // Warn about untrusted scripts (non-interactive mode for now)
                if !untrusted.is_empty() {
                    for (name, _version, script) in &untrusted {
                        output.warning(&format!(
                            "skipping untrusted postinstall for \"{}\" ({})",
                            name, script
                        ));
                    }
                    let skipped_names: Vec<&str> =
                        untrusted.iter().map(|(name, _, _)| name.as_str()).collect();
                    output.warning(&format!(
                        "fix: vertz config add trust-scripts {}",
                        skipped_names.join(" ")
                    ));
                }
            }
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
    let mut new_lockfile =
        resolver::graph_to_lockfile(&graph, &all_deps, &ws_info, &optional_names);

    // Mark overridden entries in lockfile
    for app in &override_applications {
        // Find the lockfile entry for this override target + original range
        let key = types::Lockfile::spec_key(&app.target, &app.original_range);
        if let Some(entry) = new_lockfile.entries.get_mut(&key) {
            entry.overridden = true;
        }
    }

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
    optional: bool,
    exact: bool,
    script_policy: vertzrc::ScriptPolicy,
    workspace_target: Option<&str>,
    output: Arc<dyn PmOutput>,
) -> Result<(), Box<dyn std::error::Error>> {
    let exclusive_count = [dev, peer, optional].iter().filter(|&&x| x).count();
    if exclusive_count > 1 {
        return Err("error: --dev, --peer, and --optional are mutually exclusive".into());
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
    let tarball_mgr_add = TarballManager::new(&cache_dir);
    let gh_client_add = github::GitHubClient::new();

    // Resolve all packages first, then mutate package.json once
    for package in packages {
        let parsed = types::parse_package_specifier(package);

        match parsed {
            types::ParsedSpecifier::GitHub(gh) => {
                // GitHub specifier: resolve ref → SHA, download tarball, read package name
                let specifier = if let Some(ref r) = gh.ref_ {
                    format!("github:{}/{}#{}", gh.owner, gh.repo, r)
                } else {
                    format!("github:{}/{}", gh.owner, gh.repo)
                };
                output.github_resolve_started(&specifier);

                let sha = gh_client_add
                    .resolve_ref(&gh.owner, &gh.repo, gh.ref_.as_deref())
                    .await
                    .map_err(|e| format!("{}", e))?;
                let sha_abbrev = &sha[..7.min(sha.len())];

                // Download and extract tarball
                let tarball_url = github::GitHubClient::tarball_url(&gh.owner, &gh.repo, &sha);

                // Use owner/repo as temporary cache key (we don't know the package name yet)
                let temp_cache_name = format!("{}/{}", gh.owner, gh.repo);
                let (extracted_path, _integrity) = tarball_mgr_add
                    .fetch_and_extract_github(&temp_cache_name, &sha, &tarball_url)
                    .await
                    .map_err(|e| format!("{}", e))?;

                // Read package.json from extracted tarball
                let gh_pkg = types::read_package_json(&extracted_path)?;
                let pkg_name = gh_pkg.name.ok_or_else(|| {
                    format!(
                        "package.json in \"{}/{}\" is missing the \"name\" field",
                        gh.owner, gh.repo
                    )
                })?;

                // Re-key cache from owner/repo to real package name so install() can find it
                let correct_cache_path = tarball_mgr_add.store_path(&pkg_name, &sha);
                if extracted_path != correct_cache_path && !correct_cache_path.exists() {
                    if let Err(e) = std::fs::rename(&extracted_path, &correct_cache_path) {
                        // Cross-filesystem rename (EXDEV) — fall back to copy + delete
                        copy_dir_recursive(&extracted_path, &correct_cache_path).map_err(
                            |copy_err| {
                                format!(
                                    "failed to cache GitHub package {} (rename: {}, copy: {})",
                                    pkg_name, e, copy_err
                                )
                            },
                        )?;
                        std::fs::remove_dir_all(&extracted_path).ok();
                    }
                    // Also re-key the integrity sidecar file
                    let old_integrity_path = tarball_mgr_add.integrity_path(&temp_cache_name, &sha);
                    let new_integrity_path = tarball_mgr_add.integrity_path(&pkg_name, &sha);
                    if old_integrity_path.exists() {
                        std::fs::rename(&old_integrity_path, &new_integrity_path).ok();
                    }
                }

                output.github_resolve_complete(&pkg_name, sha_abbrev);

                // Insert into the appropriate dependency section
                if peer {
                    pkg.peer_dependencies
                        .insert(pkg_name.clone(), specifier.clone());
                } else if dev {
                    pkg.dev_dependencies
                        .insert(pkg_name.clone(), specifier.clone());
                } else if optional {
                    pkg.optional_dependencies
                        .insert(pkg_name.clone(), specifier.clone());
                } else {
                    pkg.dependencies.insert(pkg_name.clone(), specifier.clone());
                }

                output.package_added(&pkg_name, sha_abbrev, &specifier);
                continue;
            }
            types::ParsedSpecifier::Error(msg) => {
                return Err(msg.into());
            }
            types::ParsedSpecifier::Npm { .. } => {}
        }

        // npm specifier path
        let (name, version_spec) = match parsed {
            types::ParsedSpecifier::Npm { name, version_spec } => (name, version_spec),
            _ => unreachable!(),
        };

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
        } else if optional {
            pkg.optional_dependencies
                .insert(name.to_string(), range.clone());
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
        install(root_dir, false, script_policy, false, output).await
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
            || pkg.peer_dependencies.remove(*package).is_some()
            || pkg.optional_dependencies.remove(*package).is_some();

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
    install(
        root_dir,
        false,
        vertzrc::ScriptPolicy::IgnoreAll,
        false,
        output,
    )
    .await
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

    // Process optionalDependencies
    for (name, range) in &pkg.optional_dependencies {
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
    // Collect all root deps (regular, dev, and optional)
    let mut all_root_deps: BTreeMap<String, String> = BTreeMap::new();
    for (k, v) in &pkg.dependencies {
        all_root_deps.insert(k.clone(), v.clone());
    }
    for (k, v) in &pkg.dev_dependencies {
        all_root_deps.insert(k.clone(), v.clone());
    }
    for (k, v) in &pkg.optional_dependencies {
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

    if pkg.dependencies.is_empty()
        && pkg.dev_dependencies.is_empty()
        && pkg.optional_dependencies.is_empty()
    {
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
    for (name, range) in &pkg.optional_dependencies {
        let spec_key = types::Lockfile::spec_key(name, range);
        if let Some(entry) = lockfile.entries.get(&spec_key) {
            dep_tasks.push((name.clone(), range.clone(), entry.version.clone(), false));
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

        // Re-install to resolve and link updated packages.
        // IgnoreAll: update only re-links — postinstall scripts should be run
        // via a separate `vertz install` after updating, not implicitly here.
        install(
            root_dir,
            false,
            vertzrc::ScriptPolicy::IgnoreAll,
            false,
            output.clone(),
        )
        .await?;
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

/// List scripts from package.json in the given directory (or workspace)
pub fn list_scripts(
    root_dir: &Path,
    workspace_target: Option<&str>,
) -> Result<BTreeMap<String, String>, Box<dyn std::error::Error>> {
    let target_dir = if let Some(ws) = workspace_target {
        workspace::resolve_workspace_dir(root_dir, ws)?
    } else {
        root_dir.to_path_buf()
    };
    let pkg = types::read_package_json(&target_dir)?;
    Ok(pkg.scripts)
}

/// Run a named script from package.json
pub async fn run_script(
    root_dir: &Path,
    script_name: &str,
    extra_args: &[String],
    workspace_target: Option<&str>,
) -> Result<i32, Box<dyn std::error::Error>> {
    let target_dir = if let Some(ws) = workspace_target {
        workspace::resolve_workspace_dir(root_dir, ws)?
    } else {
        root_dir.to_path_buf()
    };

    let pkg = types::read_package_json(&target_dir)?;

    let script_cmd = pkg
        .scripts
        .get(script_name)
        .ok_or_else(|| format!("error: script not found: \"{}\"", script_name))?;

    // Append extra args (shell-escaped) if provided
    let full_cmd = if extra_args.is_empty() {
        script_cmd.clone()
    } else {
        let escaped: Vec<String> = extra_args.iter().map(|a| shell_escape(a)).collect();
        format!("{} {}", script_cmd, escaped.join(" "))
    };

    // Build PATH with node_modules/.bin prepended
    let bin_dir = root_dir.join("node_modules").join(".bin");
    let mut path_parts = vec![bin_dir.to_string_lossy().to_string()];

    // If workspace, also add workspace's .bin
    if workspace_target.is_some() && target_dir != root_dir.to_path_buf() {
        let ws_bin_dir = target_dir.join("node_modules").join(".bin");
        path_parts.insert(0, ws_bin_dir.to_string_lossy().to_string());
    }

    if let Ok(existing_path) = std::env::var("PATH") {
        path_parts.push(existing_path);
    }
    let new_path = path_parts.join(scripts::path_separator());

    scripts::exec_inherit_stdio(&target_dir, &full_cmd, &[("PATH", new_path)]).await
}

/// Execute a command with node_modules/.bin on PATH
pub async fn exec_command(
    root_dir: &Path,
    command: &str,
    args: &[String],
    workspace_target: Option<&str>,
) -> Result<i32, Box<dyn std::error::Error>> {
    let target_dir = if let Some(ws) = workspace_target {
        workspace::resolve_workspace_dir(root_dir, ws)?
    } else {
        root_dir.to_path_buf()
    };

    // Build the full command string (escape both command and args)
    let full_cmd = if args.is_empty() {
        shell_escape(command)
    } else {
        let escaped_cmd = shell_escape(command);
        let args_str: Vec<String> = args.iter().map(|a| shell_escape(a)).collect();
        format!("{} {}", escaped_cmd, args_str.join(" "))
    };

    // Build PATH with node_modules/.bin prepended
    let bin_dir = root_dir.join("node_modules").join(".bin");
    let mut path_parts = vec![bin_dir.to_string_lossy().to_string()];

    if workspace_target.is_some() && target_dir != root_dir.to_path_buf() {
        let ws_bin_dir = target_dir.join("node_modules").join(".bin");
        path_parts.insert(0, ws_bin_dir.to_string_lossy().to_string());
    }

    if let Ok(existing_path) = std::env::var("PATH") {
        path_parts.push(existing_path);
    }
    let new_path = path_parts.join(scripts::path_separator());

    scripts::exec_inherit_stdio(&target_dir, &full_cmd, &[("PATH", new_path)]).await
}

/// Escape a shell argument for the current platform.
///
/// On Unix (sh -c): single-quote if it contains metacharacters.
/// On Windows (cmd.exe /C): double-quote if it contains metacharacters.
fn shell_escape(s: &str) -> String {
    if cfg!(target_os = "windows") {
        shell_escape_windows(s)
    } else {
        shell_escape_unix(s)
    }
}

/// Unix shell escaping: wrap in single quotes, escape embedded single quotes.
fn shell_escape_unix(s: &str) -> String {
    if s.is_empty() {
        return "''".to_string();
    }
    if s.chars()
        .any(|c| !c.is_ascii_alphanumeric() && !matches!(c, '-' | '_' | '.' | '/' | ':' | '@'))
    {
        format!("'{}'", s.replace('\'', "'\\''"))
    } else {
        s.to_string()
    }
}

/// Windows cmd.exe escaping: wrap in double quotes, escape embedded double quotes.
fn shell_escape_windows(s: &str) -> String {
    if s.is_empty() {
        return "\"\"".to_string();
    }
    // cmd.exe metacharacters that require quoting
    if s.chars().any(|c| {
        !c.is_ascii_alphanumeric() && !matches!(c, '-' | '_' | '.' | '/' | ':' | '@' | '\\')
    }) {
        // Escape internal double quotes by doubling them
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// Recursively copy a directory — used as fallback when rename() fails (cross-filesystem).
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
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

/// Publish a package to the npm registry.
///
/// Orchestrates the full publish flow:
/// 1. Read and validate package.json
/// 2. Run prepublish/prepare lifecycle scripts
/// 3. Pack the tarball
/// 4. Build publish document
/// 5. Upload to registry (unless --dry-run)
pub async fn publish(
    root_dir: &Path,
    tag: &str,
    access: Option<&str>,
    dry_run: bool,
    output: Arc<dyn PmOutput>,
) -> Result<(), Box<dyn std::error::Error>> {
    // 1. Read and validate package.json
    let pkg = types::read_package_json(root_dir)?;
    let name = pkg
        .name
        .as_ref()
        .ok_or("Cannot publish: package.json is missing required field 'name'")?
        .clone();
    let version = pkg
        .version
        .as_ref()
        .ok_or("Cannot publish: package.json is missing required field 'version'")?
        .clone();

    // Validate access value
    if let Some(a) = access {
        if a != "public" && a != "restricted" {
            return Err(format!(
                "Invalid access value: \"{}\". Must be \"public\" or \"restricted\"",
                a
            )
            .into());
        }
    }

    // 2. Run lifecycle scripts (npm order: prepublish → prepare → prepublishOnly)
    scripts::run_lifecycle_script(root_dir, &pkg.scripts, "prepublish", output.clone()).await?;
    scripts::run_lifecycle_script(root_dir, &pkg.scripts, "prepare", output.clone()).await?;
    scripts::run_lifecycle_script(root_dir, &pkg.scripts, "prepublishOnly", output.clone()).await?;

    // 3. Pack the tarball
    output.publish_packing(&name, &version);
    let pack_result = pack::pack_tarball(root_dir, &pkg)?;

    output.publish_packed(
        &name,
        &version,
        pack_result.files.len(),
        pack_result.packed_size,
        pack_result.unpacked_size,
    );

    // 4. Dry run: list files and exit
    if dry_run {
        for file in &pack_result.files {
            output.publish_file_list(&file.path, file.size);
        }
        output.publish_dry_run(
            &name,
            &version,
            tag,
            access.unwrap_or(if name.starts_with('@') {
                "restricted"
            } else {
                "public"
            }),
        );
        return Ok(());
    }

    // 5. Load registry config for auth
    let reg_config = config::load_registry_config(root_dir, None)?;
    let registry_url = reg_config.registry_url_for_package(&name).to_string();
    // Auth matching uses prefix comparison — append "/" so "host:port" matches "host:port/"
    let auth_match_url = format!("{}/", registry_url.trim_end_matches('/'));
    let auth_header = reg_config
        .auth_header_for_url(&auth_match_url)
        .ok_or_else(|| {
            format!(
                "Authentication required. Add an auth token to .npmrc for {}",
                registry_url
            )
        })?;

    // 6. Build publish document
    let raw_pkg = pack::read_package_json_raw(root_dir)?;
    let normalized = pack::normalize_package_json(&raw_pkg);

    let tarball_base64 = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &pack_result.tarball,
    );

    let document = registry::build_publish_document(&registry::PublishParams {
        name: &name,
        version: &version,
        tag,
        access,
        tarball_base64: &tarball_base64,
        tarball_length: pack_result.packed_size,
        integrity: &pack_result.integrity,
        shasum: &pack_result.shasum,
        normalized_pkg: &normalized,
        registry_url: &registry_url,
    });

    // 7. Upload
    output.publish_uploading(&name, &version, tag);

    let cache_dir = registry::default_cache_dir();
    let client = RegistryClient::new(&cache_dir);
    client
        .publish_package(&registry_url, &auth_header, &document)
        .await?;

    output.publish_complete(&name, &version, tag);

    Ok(())
}

/// A batch error from the advisory API
#[derive(Debug)]
pub struct BatchError {
    pub batch: usize,
    pub error: String,
}

/// Result of running `vertz audit`
#[derive(Debug)]
pub struct AuditResult {
    pub entries: Vec<types::AuditEntry>,
    pub warnings: Vec<String>,
    pub batch_errors: Vec<BatchError>,
    pub total_packages: usize,
    /// Number of entries excluded by severity filter
    pub below_threshold: usize,
}

/// Run a vulnerability audit against the npm advisory API.
/// Reads the lockfile, deduplicates packages, queries the bulk advisory endpoint,
/// resolves parent dependencies, and filters by severity threshold.
pub async fn audit(
    root_dir: &Path,
    severity_threshold: types::Severity,
) -> Result<AuditResult, Box<dyn std::error::Error>> {
    let lockfile_path = root_dir.join("vertz.lock");
    if !lockfile_path.exists() {
        return Err("No lockfile found. Run `vertz install` first.".into());
    }

    let lockfile = lockfile::read_lockfile(&lockfile_path)?;
    let pkg = types::read_package_json(root_dir)?;

    // Collect unique (name, version) pairs, skipping link: entries (workspace packages)
    let mut package_versions: BTreeMap<String, HashSet<String>> = BTreeMap::new();
    for entry in lockfile.entries.values() {
        if entry.resolved.starts_with("link:") {
            continue;
        }
        package_versions
            .entry(entry.name.clone())
            .or_default()
            .insert(entry.version.clone());
    }

    let total_packages = package_versions.len();

    // Build bulk request map: name → [versions]
    let bulk_request: BTreeMap<String, Vec<String>> = package_versions
        .iter()
        .map(|(name, versions)| {
            let mut v: Vec<String> = versions.iter().cloned().collect();
            v.sort();
            (name.clone(), v)
        })
        .collect();

    if bulk_request.is_empty() {
        return Ok(AuditResult {
            entries: Vec::new(),
            warnings: Vec::new(),
            batch_errors: Vec::new(),
            total_packages: 0,
            below_threshold: 0,
        });
    }

    // Batch into chunks of 100 packages
    let batches: Vec<BTreeMap<String, Vec<String>>> = {
        let items: Vec<(String, Vec<String>)> = bulk_request.into_iter().collect();
        items
            .chunks(100)
            .map(|chunk| chunk.iter().cloned().collect())
            .collect()
    };

    let cache_dir = registry::default_cache_dir();
    let client = Arc::new(RegistryClient::new(&cache_dir));

    // Fetch advisories with buffer_unordered(4) concurrency
    let batch_results: Vec<_> = stream::iter(batches)
        .map(|batch| {
            let client = client.clone();
            async move { client.fetch_advisories_bulk(&batch).await }
        })
        .buffer_unordered(4)
        .collect()
        .await;

    // Merge batch results
    let mut all_advisories: BTreeMap<String, Vec<types::Advisory>> = BTreeMap::new();
    let mut warnings = Vec::new();
    let mut batch_errors = Vec::new();
    for (batch_idx, result) in batch_results.into_iter().enumerate() {
        match result {
            Ok(advisories) => {
                for (name, advs) in advisories {
                    all_advisories.entry(name).or_default().extend(advs);
                }
            }
            Err(e) => {
                let error_msg = e.to_string();
                warnings.push(format!(
                    "warning: advisory batch {} failed: {}",
                    batch_idx + 1,
                    error_msg
                ));
                batch_errors.push(BatchError {
                    batch: batch_idx + 1,
                    error: error_msg,
                });
            }
        }
    }

    // Build direct dependency set for parent resolution
    let mut direct_deps: HashSet<String> = HashSet::new();
    for name in pkg.dependencies.keys() {
        direct_deps.insert(name.clone());
    }
    for name in pkg.dev_dependencies.keys() {
        direct_deps.insert(name.clone());
    }
    for name in pkg.optional_dependencies.keys() {
        direct_deps.insert(name.clone());
    }

    // Build reverse dependency map: package → direct dep that requires it
    let reverse_deps = build_reverse_dep_map(&lockfile, &direct_deps);

    // Convert advisories to AuditEntry list
    let mut all_entries: Vec<types::AuditEntry> = Vec::new();
    for (name, advisories) in &all_advisories {
        if let Some(versions) = package_versions.get(name) {
            for version in versions {
                for advisory in advisories {
                    let severity = match types::Severity::parse(&advisory.severity) {
                        Some(s) => s,
                        None => {
                            warnings.push(format!(
                                "warning: unknown severity '{}' for advisory {} on {} — treating as low",
                                advisory.severity, advisory.id, name
                            ));
                            types::Severity::Low
                        }
                    };
                    let parent = if direct_deps.contains(name) {
                        None
                    } else {
                        reverse_deps.get(name).cloned()
                    };

                    all_entries.push(types::AuditEntry {
                        name: name.clone(),
                        version: version.clone(),
                        severity,
                        title: advisory.title.clone(),
                        url: advisory.url.clone(),
                        patched: advisory.patched_versions.clone(),
                        id: advisory.id,
                        parent,
                    });
                }
            }
        }
    }

    // Sort by severity (critical first), then by name
    all_entries.sort_by(|a, b| {
        a.severity
            .rank()
            .cmp(&b.severity.rank())
            .then(a.name.cmp(&b.name))
    });

    // Filter by severity threshold
    let total_before_filter = all_entries.len();
    let entries: Vec<types::AuditEntry> = all_entries
        .into_iter()
        .filter(|e| e.severity.at_or_above(severity_threshold))
        .collect();
    let below_threshold = total_before_filter - entries.len();

    Ok(AuditResult {
        entries,
        warnings,
        batch_errors,
        total_packages,
        below_threshold,
    })
}

/// Result of a single fix attempt
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FixApplied {
    pub name: String,
    pub from: String,
    pub to: String,
}

/// A vulnerability that requires manual intervention
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FixManual {
    pub name: String,
    pub from: String,
    pub patched: String,
    pub range: String,
    pub reason: String,
}

/// Result of `vertz audit --fix`
#[derive(Debug)]
pub struct AuditFixResult {
    pub audit: AuditResult,
    pub fixed: Vec<FixApplied>,
    pub manual: Vec<FixManual>,
}

/// Given a declared range, a patched_versions range, and available versions from the registry,
/// find the highest version satisfying both ranges. Returns None if no such version exists.
pub fn resolve_fix_version(
    declared_range_str: &str,
    patched_range_str: &str,
    available_versions: &BTreeMap<String, serde_json::Value>,
) -> Option<String> {
    let declared = match node_semver::Range::parse(declared_range_str) {
        Ok(r) => r,
        Err(_) => return None,
    };
    let patched = match node_semver::Range::parse(patched_range_str) {
        Ok(r) => r,
        Err(_) => return None,
    };

    let mut best: Option<(node_semver::Version, String)> = None;
    for key in available_versions.keys() {
        if let Ok(ver) = node_semver::Version::parse(key) {
            if declared.satisfies(&ver) && patched.satisfies(&ver) {
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

/// Compute the strictest patched range when a package has multiple advisories.
/// Returns the range where all patched_versions ranges intersect (i.e., the version
/// must satisfy ALL patched ranges simultaneously). For ">=" ranges, this is the
/// highest minimum.
pub fn merge_patched_ranges(patched_ranges: &[&str]) -> Option<String> {
    if patched_ranges.is_empty() {
        return None;
    }
    if patched_ranges.len() == 1 {
        return Some(patched_ranges[0].to_string());
    }

    // For multiple ranges, we need ALL to be satisfied — AND semantics.
    // Build a combined range string: ">=4.17.19 >=4.17.20 >=4.17.21"
    // node_semver parses space-separated comparators as AND (intersection).
    let combined = patched_ranges.join(" ");
    // Verify it parses
    node_semver::Range::parse(&combined).ok()?;
    Some(combined)
}

/// Run audit with --fix: audit packages, then attempt to update vulnerable ones.
pub async fn audit_fix(
    root_dir: &Path,
    severity_threshold: types::Severity,
    dry_run: bool,
) -> Result<AuditFixResult, Box<dyn std::error::Error>> {
    let audit_result = audit(root_dir, severity_threshold).await?;

    if audit_result.entries.is_empty() {
        return Ok(AuditFixResult {
            audit: audit_result,
            fixed: Vec::new(),
            manual: Vec::new(),
        });
    }

    let pkg = types::read_package_json(root_dir)?;
    let lockfile_path = root_dir.join("vertz.lock");
    let mut lockfile = lockfile::read_lockfile(&lockfile_path)?;

    // Collect all declared ranges from package.json
    let mut declared_ranges: BTreeMap<String, String> = BTreeMap::new();
    for (name, range) in &pkg.dependencies {
        declared_ranges.insert(name.clone(), range.clone());
    }
    for (name, range) in &pkg.dev_dependencies {
        declared_ranges.insert(name.clone(), range.clone());
    }
    for (name, range) in &pkg.optional_dependencies {
        declared_ranges.insert(name.clone(), range.clone());
    }

    // Group advisories by package name for multi-advisory merging
    let mut patched_by_pkg: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for entry in &audit_result.entries {
        patched_by_pkg
            .entry(entry.name.clone())
            .or_default()
            .push(entry.patched.clone());
    }

    // Deduplicate packages to fix (a package may have multiple advisories)
    let mut packages_to_fix: Vec<(String, String, String)> = Vec::new(); // (name, version, merged_patched)
    let mut seen: HashSet<String> = HashSet::new();
    for entry in &audit_result.entries {
        if seen.contains(&entry.name) {
            continue;
        }
        seen.insert(entry.name.clone());

        let patched_refs: Vec<&str> = patched_by_pkg[&entry.name]
            .iter()
            .map(|s| s.as_str())
            .collect();
        let merged = merge_patched_ranges(&patched_refs).unwrap_or_else(|| entry.patched.clone());

        packages_to_fix.push((entry.name.clone(), entry.version.clone(), merged));
    }

    let cache_dir = registry::default_cache_dir();
    let client = Arc::new(RegistryClient::new(&cache_dir));

    let mut fixed = Vec::new();
    let mut manual = Vec::new();

    // Resolve fix versions in parallel
    let fix_results: Vec<_> = stream::iter(packages_to_fix)
        .map(|(name, current_version, merged_patched)| {
            let client = client.clone();
            let declared = declared_ranges.get(&name).cloned();
            async move {
                let declared_range = match declared {
                    Some(r) => r,
                    None => {
                        // Transitive dependency — we can't fix it directly
                        return (
                            name.clone(),
                            current_version,
                            merged_patched,
                            None::<String>,
                            None::<BTreeMap<String, serde_json::Value>>,
                            Some("transitive dependency — update the parent package".to_string()),
                        );
                    }
                };

                match client.fetch_metadata_abbreviated(&name).await {
                    Ok(meta) => {
                        let fix_version =
                            resolve_fix_version(&declared_range, &merged_patched, &meta.versions);
                        (
                            name,
                            current_version,
                            merged_patched,
                            fix_version,
                            Some(meta.versions),
                            None,
                        )
                    }
                    Err(e) => (
                        name,
                        current_version,
                        merged_patched,
                        None,
                        None,
                        Some(format!("failed to fetch metadata: {}", e)),
                    ),
                }
            }
        })
        .buffer_unordered(16)
        .collect()
        .await;

    for (name, current_version, merged_patched, fix_version, versions_meta, error) in fix_results {
        let declared_range = declared_ranges.get(&name).cloned().unwrap_or_default();

        if let Some(ref err) = error {
            manual.push(FixManual {
                name,
                from: current_version,
                patched: merged_patched,
                range: declared_range,
                reason: err.clone(),
            });
            continue;
        }

        match fix_version {
            Some(ref to_version) if *to_version == current_version => {
                // Already at a patched version — no action needed
            }
            Some(to_version) => {
                fixed.push(FixApplied {
                    name: name.clone(),
                    from: current_version.clone(),
                    to: to_version.clone(),
                });

                if !dry_run {
                    // Extract tarball URL and integrity from metadata
                    let (resolved_url, integrity) =
                        extract_version_dist(&name, &to_version, versions_meta.as_ref());

                    // Update the lockfile entry
                    let spec_key = types::Lockfile::spec_key(&name, &declared_range);
                    if let Some(entry) = lockfile.entries.get_mut(&spec_key) {
                        entry.version = to_version.clone();
                        entry.resolved = resolved_url;
                        entry.integrity = integrity;
                    }
                }
            }
            None => {
                let reason = if merged_patched == "<0.0.0" {
                    "no patched version available".to_string()
                } else {
                    format!("patched version outside declared range {}", declared_range)
                };
                manual.push(FixManual {
                    name,
                    from: current_version,
                    patched: merged_patched,
                    range: declared_range.clone(),
                    reason,
                });
            }
        }
    }

    // Write updated lockfile if not dry-run and we fixed something
    if !dry_run && !fixed.is_empty() {
        lockfile::write_lockfile(&lockfile_path, &lockfile)?;
    }

    // Re-install fixed packages (download tarball + extract + link to node_modules)
    if !dry_run && !fixed.is_empty() {
        let tarball_mgr = TarballManager::new(&registry::default_cache_dir());
        let node_modules = root_dir.join("node_modules");
        for f in &fixed {
            let spec_key = types::Lockfile::spec_key(
                &f.name,
                &declared_ranges.get(&f.name).cloned().unwrap_or_default(),
            );
            if let Some(entry) = lockfile.entries.get(&spec_key) {
                // Download and extract the new tarball to cache
                match tarball_mgr
                    .fetch_and_extract(&f.name, &f.to, &entry.resolved, &entry.integrity)
                    .await
                {
                    Ok(store_path) => {
                        // Link from cache to node_modules
                        let target = node_modules.join(&f.name);
                        if target.exists() {
                            std::fs::remove_dir_all(&target).ok();
                        }
                        if let Some(parent) = target.parent() {
                            std::fs::create_dir_all(parent).ok();
                        }
                        if let Err(e) = linker::link_directory_recursive(&store_path, &target) {
                            eprintln!(
                                "warning: failed to link {} {}: {}. Run `vertz install` to complete.",
                                f.name, f.to, e
                            );
                        }
                    }
                    Err(e) => {
                        // Non-fatal: lockfile is already updated, user can run `vertz install`
                        eprintln!(
                            "warning: failed to install {} {}: {}. Run `vertz install` to complete.",
                            f.name, f.to, e
                        );
                    }
                }
            }
        }
    }

    Ok(AuditFixResult {
        audit: audit_result,
        fixed,
        manual,
    })
}

/// Format the fix results as text for stderr
pub fn format_fix_text(fixed: &[FixApplied], manual: &[FixManual], dry_run: bool) -> String {
    let mut output = String::new();

    if !fixed.is_empty() {
        if dry_run {
            output.push_str(&format!(
                "\nWould fix {} {}:\n",
                fixed.len(),
                if fixed.len() == 1 {
                    "vulnerability"
                } else {
                    "vulnerabilities"
                }
            ));
        } else {
            output.push_str(&format!(
                "\nFixed {} {}:\n",
                fixed.len(),
                if fixed.len() == 1 {
                    "vulnerability"
                } else {
                    "vulnerabilities"
                }
            ));
        }
        for f in fixed {
            output.push_str(&format!("  {} {} → {}\n", f.name, f.from, f.to));
        }
    }

    if !manual.is_empty() {
        output.push_str(&format!(
            "\n{} {} manual update:\n",
            manual.len(),
            if manual.len() == 1 {
                "vulnerability requires"
            } else {
                "vulnerabilities require"
            }
        ));
        for m in manual {
            output.push_str(&format!(
                "  {} {} ({})\n    Patched versions: {}\n    Run: vertz add {}@\"<patched-version>\"\n",
                m.name, m.from, m.reason, m.patched, m.name
            ));
        }
    }

    output
}

/// Format the fix results as NDJSON
pub fn format_fix_json(fixed: &[FixApplied], manual: &[FixManual]) -> String {
    let mut output = String::new();

    for f in fixed {
        let obj = serde_json::json!({
            "event": "fix_applied",
            "name": f.name,
            "from": f.from,
            "to": f.to,
        });
        output.push_str(&obj.to_string());
        output.push('\n');
    }

    for m in manual {
        let obj = serde_json::json!({
            "event": "fix_manual",
            "name": m.name,
            "from": m.from,
            "patched": m.patched,
            "range": m.range,
            "reason": m.reason,
            "suggestion": format!("vertz add {}@\"<patched-version>\"", m.name),
        });
        output.push_str(&obj.to_string());
        output.push('\n');
    }

    let complete = serde_json::json!({
        "event": "audit_fix_complete",
        "fixed": fixed.len(),
        "manual": manual.len(),
    });
    output.push_str(&complete.to_string());
    output.push('\n');

    output
}

/// Extract tarball URL and integrity hash from abbreviated metadata for a specific version.
/// Falls back to a constructed URL if metadata doesn't contain dist info.
fn extract_version_dist(
    name: &str,
    version: &str,
    versions_meta: Option<&BTreeMap<String, serde_json::Value>>,
) -> (String, String) {
    if let Some(versions) = versions_meta {
        if let Some(ver_data) = versions.get(version) {
            let tarball = ver_data
                .pointer("/dist/tarball")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let integrity = ver_data
                .pointer("/dist/integrity")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if !tarball.is_empty() {
                return (tarball, integrity);
            }
        }
    }

    // Fallback: construct URL (won't have integrity)
    let unscoped = name.rsplit('/').next().unwrap_or(name);
    (
        format!(
            "https://registry.npmjs.org/{}/-/{}-{}.tgz",
            name, unscoped, version
        ),
        String::new(),
    )
}

/// Build a reverse dependency map: for each transitive package, find the direct
/// dependency that pulls it in. Uses BFS from each direct dependency to walk
/// the full transitive tree (not just one level).
fn build_reverse_dep_map(
    lockfile: &types::Lockfile,
    direct_deps: &HashSet<String>,
) -> BTreeMap<String, String> {
    let mut reverse: BTreeMap<String, String> = BTreeMap::new();

    // Build a name → LockfileEntry lookup for BFS
    let mut by_name: BTreeMap<String, Vec<&types::LockfileEntry>> = BTreeMap::new();
    for entry in lockfile.entries.values() {
        by_name.entry(entry.name.clone()).or_default().push(entry);
    }

    // BFS from each direct dependency
    for direct_name in direct_deps {
        let mut queue: std::collections::VecDeque<String> = std::collections::VecDeque::new();

        // Seed queue with the direct dep's transitive deps
        if let Some(entries) = by_name.get(direct_name) {
            for entry in entries {
                for dep_name in entry.dependencies.keys() {
                    if !direct_deps.contains(dep_name) && !reverse.contains_key(dep_name) {
                        queue.push_back(dep_name.clone());
                    }
                }
            }
        }

        // BFS: walk transitive deps, attributing all to this direct dep
        while let Some(name) = queue.pop_front() {
            if reverse.contains_key(&name) {
                continue;
            }
            reverse.insert(name.clone(), direct_name.clone());

            // Enqueue this package's own dependencies
            if let Some(entries) = by_name.get(&name) {
                for entry in entries {
                    for dep_name in entry.dependencies.keys() {
                        if !direct_deps.contains(dep_name) && !reverse.contains_key(dep_name) {
                            queue.push_back(dep_name.clone());
                        }
                    }
                }
            }
        }
    }

    reverse
}

/// Format audit entries as a human-readable table for stdout.
pub fn format_audit_text(entries: &[types::AuditEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }

    // Calculate column widths
    let sev_width = entries
        .iter()
        .map(|e| e.severity.as_str().len())
        .max()
        .unwrap_or(8)
        .max(8);
    let pkg_width = entries
        .iter()
        .map(|e| e.name.len())
        .max()
        .unwrap_or(7)
        .max(7);
    let ver_width = entries
        .iter()
        .map(|e| e.version.len())
        .max()
        .unwrap_or(7)
        .max(7);
    let patch_width = entries
        .iter()
        .map(|e| e.patched.len())
        .max()
        .unwrap_or(7)
        .max(7);
    let title_width = entries
        .iter()
        .map(|e| e.title.len().max(e.url.len()))
        .max()
        .unwrap_or(5)
        .max(5);

    let mut output = String::new();

    // Top border
    output.push_str(&format!(
        "┌{:─<sw$}┬{:─<pw$}┬{:─<vw$}┬{:─<ptw$}┬{:─<tw$}┐\n",
        "",
        "",
        "",
        "",
        "",
        sw = sev_width + 2,
        pw = pkg_width + 2,
        vw = ver_width + 2,
        ptw = patch_width + 2,
        tw = title_width + 2,
    ));

    // Header
    output.push_str(&format!(
        "│ {:<sw$} │ {:<pw$} │ {:<vw$} │ {:<ptw$} │ {:<tw$} │\n",
        "Severity",
        "Package",
        "Version",
        "Patched",
        "Title",
        sw = sev_width,
        pw = pkg_width,
        vw = ver_width,
        ptw = patch_width,
        tw = title_width,
    ));

    // Header separator
    output.push_str(&format!(
        "├{:─<sw$}┼{:─<pw$}┼{:─<vw$}┼{:─<ptw$}┼{:─<tw$}┤\n",
        "",
        "",
        "",
        "",
        "",
        sw = sev_width + 2,
        pw = pkg_width + 2,
        vw = ver_width + 2,
        ptw = patch_width + 2,
        tw = title_width + 2,
    ));

    // Data rows
    for entry in entries {
        let parent_label = match &entry.parent {
            Some(p) => format!("via {}", p),
            None => "(direct)".to_string(),
        };

        // First line: severity, package, version, patched, title
        output.push_str(&format!(
            "│ {:<sw$} │ {:<pw$} │ {:<vw$} │ {:<ptw$} │ {:<tw$} │\n",
            entry.severity.as_str(),
            entry.name,
            entry.version,
            entry.patched,
            entry.title,
            sw = sev_width,
            pw = pkg_width,
            vw = ver_width,
            ptw = patch_width,
            tw = title_width,
        ));

        // Second line: parent info and URL
        output.push_str(&format!(
            "│ {:<sw$} │ {:<pw$} │ {:<vw$} │ {:<ptw$} │ {:<tw$} │\n",
            "",
            parent_label,
            "",
            "",
            entry.url,
            sw = sev_width,
            pw = pkg_width,
            vw = ver_width,
            ptw = patch_width,
            tw = title_width,
        ));
    }

    // Bottom border
    output.push_str(&format!(
        "└{:─<sw$}┴{:─<pw$}┴{:─<vw$}┴{:─<ptw$}┴{:─<tw$}┘\n",
        "",
        "",
        "",
        "",
        "",
        sw = sev_width + 2,
        pw = pkg_width + 2,
        vw = ver_width + 2,
        ptw = patch_width + 2,
        tw = title_width + 2,
    ));

    output
}

/// Format the audit summary line for stderr.
pub fn format_audit_summary(entries: &[types::AuditEntry], below_threshold: usize) -> String {
    if entries.is_empty() && below_threshold == 0 {
        return "No vulnerabilities found.".to_string();
    }

    if entries.is_empty() && below_threshold > 0 {
        return format!(
            "No vulnerabilities found at or above threshold. {} below threshold not shown.",
            below_threshold
        );
    }

    let total = entries.len();
    let critical = entries
        .iter()
        .filter(|e| e.severity == types::Severity::Critical)
        .count();
    let high = entries
        .iter()
        .filter(|e| e.severity == types::Severity::High)
        .count();
    let moderate = entries
        .iter()
        .filter(|e| e.severity == types::Severity::Moderate)
        .count();
    let low = entries
        .iter()
        .filter(|e| e.severity == types::Severity::Low)
        .count();

    let mut parts = Vec::new();
    if critical > 0 {
        parts.push(format!("{} critical", critical));
    }
    if high > 0 {
        parts.push(format!("{} high", high));
    }
    if moderate > 0 {
        parts.push(format!("{} moderate", moderate));
    }
    if low > 0 {
        parts.push(format!("{} low", low));
    }

    let vuln_word = if total == 1 {
        "vulnerability"
    } else {
        "vulnerabilities"
    };

    let mut summary = format!("{} {} found ({})", total, vuln_word, parts.join(", "));

    if below_threshold > 0 {
        summary.push_str(&format!(". {} below threshold not shown.", below_threshold));
    }

    summary
}

/// Format audit entries as NDJSON for stdout.
pub fn format_audit_json(
    entries: &[types::AuditEntry],
    total_packages: usize,
    below_threshold: usize,
) -> String {
    let mut output = String::new();

    // audit_start event
    let start = serde_json::json!({"event": "audit_start", "packages": total_packages});
    output.push_str(&start.to_string());
    output.push('\n');

    // advisory events
    for entry in entries {
        let obj = serde_json::json!({
            "event": "advisory",
            "name": entry.name,
            "version": entry.version,
            "severity": entry.severity.as_str(),
            "title": entry.title,
            "url": entry.url,
            "patched": entry.patched,
            "id": entry.id,
            "parent": entry.parent,
        });
        output.push_str(&obj.to_string());
        output.push('\n');
    }

    // audit_complete event
    let critical = entries
        .iter()
        .filter(|e| e.severity == types::Severity::Critical)
        .count();
    let high = entries
        .iter()
        .filter(|e| e.severity == types::Severity::High)
        .count();
    let moderate = entries
        .iter()
        .filter(|e| e.severity == types::Severity::Moderate)
        .count();
    let low = entries
        .iter()
        .filter(|e| e.severity == types::Severity::Low)
        .count();

    let complete = serde_json::json!({
        "event": "audit_complete",
        "vulnerabilities": entries.len(),
        "critical": critical,
        "high": high,
        "moderate": moderate,
        "low": low,
        "below_threshold": below_threshold,
    });
    output.push_str(&complete.to_string());
    output.push('\n');

    output
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
            overrides: BTreeMap::new(),
            files: None,
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
            bin: BTreeMap::new(),
            scripts: BTreeMap::new(),
            optional: false,
            overridden: false,
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

    // --- list_scripts tests ---

    #[test]
    fn test_list_scripts() {
        let dir = tempfile::tempdir().unwrap();
        let pkg_json = r#"{"scripts": {"build": "tsc", "test": "bun test"}}"#;
        std::fs::write(dir.path().join("package.json"), pkg_json).unwrap();

        let scripts = list_scripts(dir.path(), None).unwrap();
        assert_eq!(scripts.len(), 2);
        assert_eq!(scripts["build"], "tsc");
        assert_eq!(scripts["test"], "bun test");
    }

    #[test]
    fn test_list_scripts_empty() {
        let dir = tempfile::tempdir().unwrap();
        let pkg_json = r#"{"name": "test"}"#;
        std::fs::write(dir.path().join("package.json"), pkg_json).unwrap();

        let scripts = list_scripts(dir.path(), None).unwrap();
        assert!(scripts.is_empty());
    }

    // --- run_script tests ---

    #[tokio::test]
    async fn test_run_script_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let pkg_json = r#"{"scripts": {"build": "tsc"}}"#;
        std::fs::write(dir.path().join("package.json"), pkg_json).unwrap();

        let result = run_script(dir.path(), "nonexistent", &[], None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("script not found"));
    }

    #[tokio::test]
    async fn test_run_script_success() {
        let dir = tempfile::tempdir().unwrap();
        let pkg_json = r#"{"scripts": {"greet": "echo hello"}}"#;
        std::fs::write(dir.path().join("package.json"), pkg_json).unwrap();

        let code = run_script(dir.path(), "greet", &[], None).await.unwrap();
        assert_eq!(code, 0);
    }

    #[tokio::test]
    async fn test_run_script_path_prepend() {
        let dir = tempfile::tempdir().unwrap();

        // Create a fake binary in node_modules/.bin/
        let bin_dir = dir.path().join("node_modules").join(".bin");
        std::fs::create_dir_all(&bin_dir).unwrap();
        let bin_path = bin_dir.join("mybin");
        std::fs::write(&bin_path, "#!/bin/sh\nexit 0").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&bin_path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }

        let pkg_json = r#"{"scripts": {"mybuild": "mybin"}}"#;
        std::fs::write(dir.path().join("package.json"), pkg_json).unwrap();

        let code = run_script(dir.path(), "mybuild", &[], None).await.unwrap();
        assert_eq!(code, 0);
    }

    // --- exec_command tests ---

    #[tokio::test]
    async fn test_exec_command_success() {
        let dir = tempfile::tempdir().unwrap();

        // Create fake binary
        let bin_dir = dir.path().join("node_modules").join(".bin");
        std::fs::create_dir_all(&bin_dir).unwrap();
        let bin_path = bin_dir.join("mybin");
        std::fs::write(&bin_path, "#!/bin/sh\nexit 0").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&bin_path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }

        let code = exec_command(dir.path(), "mybin", &[], None).await.unwrap();
        assert_eq!(code, 0);
    }

    // --- shell_escape tests ---

    #[test]
    fn test_shell_escape_simple() {
        assert_eq!(shell_escape("hello"), "hello");
    }

    #[test]
    fn test_shell_escape_with_spaces() {
        assert_eq!(shell_escape("hello world"), "'hello world'");
    }

    #[test]
    fn test_shell_escape_with_quotes() {
        assert_eq!(shell_escape("it's"), "'it'\\''s'");
    }

    #[test]
    fn test_shell_escape_metacharacters() {
        // Dollar sign, semicolons, pipes, backticks, etc. must be quoted
        assert_eq!(shell_escape("$HOME"), "'$HOME'");
        assert_eq!(shell_escape("foo;bar"), "'foo;bar'");
        assert_eq!(shell_escape("a|b"), "'a|b'");
        assert_eq!(shell_escape("a&b"), "'a&b'");
        assert_eq!(shell_escape("`cmd`"), "'`cmd`'");
    }

    #[test]
    fn test_shell_escape_empty() {
        assert_eq!(shell_escape(""), "''");
    }

    #[test]
    fn test_shell_escape_safe_chars() {
        // Alphanumeric, dash, underscore, dot, slash, colon, @ are safe
        assert_eq!(shell_escape("foo-bar_baz.ts"), "foo-bar_baz.ts");
        assert_eq!(shell_escape("/usr/bin/node"), "/usr/bin/node");
        assert_eq!(shell_escape("@myorg/pkg"), "@myorg/pkg");
    }

    #[test]
    fn test_shell_escape_unix_directly() {
        assert_eq!(shell_escape_unix("hello world"), "'hello world'");
        assert_eq!(shell_escape_unix("it's"), "'it'\\''s'");
        assert_eq!(shell_escape_unix(""), "''");
        assert_eq!(shell_escape_unix("simple"), "simple");
    }

    #[test]
    fn test_shell_escape_windows_directly() {
        assert_eq!(shell_escape_windows("hello world"), "\"hello world\"");
        assert_eq!(shell_escape_windows("say \"hi\""), "\"say \"\"hi\"\"\"");
        assert_eq!(shell_escape_windows(""), "\"\"");
        assert_eq!(shell_escape_windows("simple"), "simple");
        assert_eq!(shell_escape_windows("foo;bar"), "\"foo;bar\"");
        assert_eq!(shell_escape_windows("a&b"), "\"a&b\"");
        // Backslash is safe on Windows (path separator)
        assert_eq!(shell_escape_windows("C:\\Users\\test"), "C:\\Users\\test");
    }

    #[tokio::test]
    async fn test_run_script_with_extra_args() {
        let dir = tempfile::tempdir().unwrap();
        let pkg_json = r#"{"scripts": {"test": "echo test"}}"#;
        std::fs::write(dir.path().join("package.json"), pkg_json).unwrap();

        let code = run_script(
            dir.path(),
            "test",
            &["--bail".to_string(), "--verbose".to_string()],
            None,
        )
        .await
        .unwrap();
        assert_eq!(code, 0);
    }

    #[tokio::test]
    async fn test_exec_command_with_args() {
        let dir = tempfile::tempdir().unwrap();

        // Create fake binary that checks args
        let bin_dir = dir.path().join("node_modules").join(".bin");
        std::fs::create_dir_all(&bin_dir).unwrap();
        let bin_path = bin_dir.join("mybin");
        std::fs::write(&bin_path, "#!/bin/sh\nexit 0").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&bin_path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }

        let code = exec_command(dir.path(), "mybin", &["--version".to_string()], None)
            .await
            .unwrap();
        assert_eq!(code, 0);
    }

    #[tokio::test]
    async fn test_exec_command_nonexistent() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("node_modules").join(".bin")).unwrap();

        let code = exec_command(dir.path(), "nonexistent-cmd-xyz", &[], None)
            .await
            .unwrap();
        assert_ne!(code, 0);
    }

    // --- audit formatter tests ---

    fn make_audit_entry(
        name: &str,
        version: &str,
        severity: types::Severity,
        title: &str,
        patched: &str,
        parent: Option<&str>,
    ) -> types::AuditEntry {
        types::AuditEntry {
            name: name.to_string(),
            version: version.to_string(),
            severity,
            title: title.to_string(),
            url: format!("https://github.com/advisories/GHSA-{}", name),
            patched: patched.to_string(),
            id: 1234,
            parent: parent.map(|s| s.to_string()),
        }
    }

    #[test]
    fn test_format_audit_text_with_entries() {
        let entries = vec![
            make_audit_entry(
                "lodash",
                "4.17.15",
                types::Severity::Critical,
                "Prototype Pollution",
                ">=4.17.21",
                None,
            ),
            make_audit_entry(
                "tar",
                "6.1.0",
                types::Severity::Moderate,
                "Arbitrary File Overwrite",
                ">=6.1.9",
                Some("npm"),
            ),
        ];

        let text = format_audit_text(&entries);
        assert!(text.contains("Severity"));
        assert!(text.contains("Package"));
        assert!(text.contains("Version"));
        assert!(text.contains("Patched"));
        assert!(text.contains("Title"));
        assert!(text.contains("lodash"));
        assert!(text.contains("4.17.15"));
        assert!(text.contains("critical"));
        assert!(text.contains("Prototype Pollution"));
        assert!(text.contains(">=4.17.21"));
        assert!(text.contains("(direct)"));
        assert!(text.contains("tar"));
        assert!(text.contains("via npm"));
        // Box-drawing characters
        assert!(text.contains("┌"));
        assert!(text.contains("┘"));
        assert!(text.contains("│"));
    }

    #[test]
    fn test_format_audit_text_empty() {
        let entries: Vec<types::AuditEntry> = Vec::new();
        let text = format_audit_text(&entries);
        assert!(text.is_empty());
    }

    #[test]
    fn test_format_audit_summary_with_vulns() {
        let entries = vec![
            make_audit_entry(
                "lodash",
                "4.17.15",
                types::Severity::Critical,
                "PP",
                ">=4.17.21",
                None,
            ),
            make_audit_entry(
                "axios",
                "0.21.1",
                types::Severity::High,
                "SSRF",
                ">=0.21.2",
                None,
            ),
            make_audit_entry(
                "tar",
                "6.1.0",
                types::Severity::Moderate,
                "AFO",
                ">=6.1.9",
                Some("npm"),
            ),
        ];

        let summary = format_audit_summary(&entries, 0);
        assert!(summary.contains("3 vulnerabilities found"));
        assert!(summary.contains("1 critical"));
        assert!(summary.contains("1 high"));
        assert!(summary.contains("1 moderate"));
    }

    #[test]
    fn test_format_audit_summary_single_vuln() {
        let entries = vec![make_audit_entry(
            "lodash",
            "4.17.15",
            types::Severity::Critical,
            "PP",
            ">=4.17.21",
            None,
        )];

        let summary = format_audit_summary(&entries, 0);
        assert!(summary.contains("1 vulnerability found"));
        assert!(!summary.contains("vulnerabilities"));
    }

    #[test]
    fn test_format_audit_summary_no_vulns() {
        let entries: Vec<types::AuditEntry> = Vec::new();
        let summary = format_audit_summary(&entries, 0);
        assert_eq!(summary, "No vulnerabilities found.");
    }

    #[test]
    fn test_format_audit_summary_below_threshold() {
        let entries = vec![make_audit_entry(
            "lodash",
            "4.17.15",
            types::Severity::Critical,
            "PP",
            ">=4.17.21",
            None,
        )];

        let summary = format_audit_summary(&entries, 3);
        assert!(summary.contains("1 vulnerability found"));
        assert!(summary.contains("3 below threshold not shown."));
    }

    #[test]
    fn test_format_audit_summary_all_below_threshold() {
        let entries: Vec<types::AuditEntry> = Vec::new();
        let summary = format_audit_summary(&entries, 5);
        assert!(summary.contains("No vulnerabilities found at or above threshold"));
        assert!(summary.contains("5 below threshold not shown."));
    }

    #[test]
    fn test_format_audit_json_basic() {
        let entries = vec![make_audit_entry(
            "lodash",
            "4.17.15",
            types::Severity::Critical,
            "Prototype Pollution",
            ">=4.17.21",
            None,
        )];

        let json = format_audit_json(&entries, 142, 0);
        let lines: Vec<&str> = json.trim().lines().collect();
        assert_eq!(lines.len(), 3); // start + 1 advisory + complete

        let start: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(start["event"], "audit_start");
        assert_eq!(start["packages"], 142);

        let advisory: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(advisory["event"], "advisory");
        assert_eq!(advisory["name"], "lodash");
        assert_eq!(advisory["version"], "4.17.15");
        assert_eq!(advisory["severity"], "critical");
        assert_eq!(advisory["title"], "Prototype Pollution");
        assert_eq!(advisory["patched"], ">=4.17.21");
        assert_eq!(advisory["id"], 1234);
        assert!(advisory["parent"].is_null());

        let complete: serde_json::Value = serde_json::from_str(lines[2]).unwrap();
        assert_eq!(complete["event"], "audit_complete");
        assert_eq!(complete["vulnerabilities"], 1);
        assert_eq!(complete["critical"], 1);
        assert_eq!(complete["high"], 0);
    }

    #[test]
    fn test_format_audit_json_with_parent() {
        let entries = vec![make_audit_entry(
            "tar",
            "6.1.0",
            types::Severity::High,
            "AFO",
            ">=6.1.9",
            Some("npm"),
        )];

        let json = format_audit_json(&entries, 50, 0);
        let lines: Vec<&str> = json.trim().lines().collect();
        let advisory: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(advisory["parent"], "npm");
    }

    #[test]
    fn test_format_audit_json_empty() {
        let entries: Vec<types::AuditEntry> = Vec::new();
        let json = format_audit_json(&entries, 50, 0);
        let lines: Vec<&str> = json.trim().lines().collect();
        assert_eq!(lines.len(), 2); // start + complete

        let complete: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(complete["vulnerabilities"], 0);
    }

    #[test]
    fn test_format_audit_json_below_threshold() {
        let entries: Vec<types::AuditEntry> = Vec::new();
        let json = format_audit_json(&entries, 50, 3);
        let lines: Vec<&str> = json.trim().lines().collect();
        let complete: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(complete["below_threshold"], 3);
    }

    // --- build_reverse_dep_map tests ---

    #[test]
    fn test_build_reverse_dep_map_direct() {
        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "express@^4.0.0".to_string(),
            make_lockfile_entry("express", "^4.0.0", "4.18.2", &[("body-parser", "^1.20.0")]),
        );
        lockfile.entries.insert(
            "body-parser@^1.20.0".to_string(),
            make_lockfile_entry("body-parser", "^1.20.0", "1.20.2", &[]),
        );

        let mut direct = HashSet::new();
        direct.insert("express".to_string());

        let reverse = build_reverse_dep_map(&lockfile, &direct);
        assert_eq!(reverse.get("body-parser"), Some(&"express".to_string()));
    }

    #[test]
    fn test_build_reverse_dep_map_no_transitive() {
        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "zod@^3.0.0".to_string(),
            make_lockfile_entry("zod", "^3.0.0", "3.24.4", &[]),
        );

        let mut direct = HashSet::new();
        direct.insert("zod".to_string());

        let reverse = build_reverse_dep_map(&lockfile, &direct);
        assert!(reverse.is_empty());
    }

    #[test]
    fn test_build_reverse_dep_map_deep_transitive() {
        let mut lockfile = Lockfile::default();
        // express -> body-parser -> raw-body
        lockfile.entries.insert(
            "express@^4.0.0".to_string(),
            make_lockfile_entry("express", "^4.0.0", "4.18.2", &[("body-parser", "^1.20.0")]),
        );
        lockfile.entries.insert(
            "body-parser@^1.20.0".to_string(),
            make_lockfile_entry(
                "body-parser",
                "^1.20.0",
                "1.20.2",
                &[("raw-body", "^2.5.0")],
            ),
        );
        lockfile.entries.insert(
            "raw-body@^2.5.0".to_string(),
            make_lockfile_entry("raw-body", "^2.5.0", "2.5.2", &[]),
        );

        let mut direct = HashSet::new();
        direct.insert("express".to_string());

        let reverse = build_reverse_dep_map(&lockfile, &direct);
        // Both body-parser and raw-body should be attributed to express
        assert_eq!(reverse.get("body-parser"), Some(&"express".to_string()));
        assert_eq!(reverse.get("raw-body"), Some(&"express".to_string()));
    }

    // --- audit() unit tests ---

    #[tokio::test]
    async fn test_audit_no_lockfile() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "test", "dependencies": {"zod": "^3.0.0"}}"#,
        )
        .unwrap();

        let result = audit(dir.path(), types::Severity::Low).await;
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("No lockfile found"), "got: {}", err);
    }

    #[tokio::test]
    async fn test_audit_empty_lockfile() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("package.json"), r#"{"name": "test"}"#).unwrap();
        // Write a valid but empty lockfile
        std::fs::write(
            dir.path().join("vertz.lock"),
            "# vertz.lock v1 (custom format) — DO NOT EDIT\n# Run \"vertz install\" to regenerate\n",
        )
        .unwrap();

        let result = audit(dir.path(), types::Severity::Low).await.unwrap();
        assert!(result.entries.is_empty());
        assert_eq!(result.total_packages, 0);
    }

    #[tokio::test]
    async fn test_audit_all_link_entries() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "test", "dependencies": {"@vertz/ui": "workspace:*"}}"#,
        )
        .unwrap();
        // Write a lockfile with only link: entries
        std::fs::write(
            dir.path().join("vertz.lock"),
            "# vertz.lock v1 (custom format) — DO NOT EDIT\n# Run \"vertz install\" to regenerate\n\n@vertz/ui@workspace:*:\n  version \"0.1.0\"\n  resolved \"link:../ui\"\n  integrity \"\"\n\n",
        )
        .unwrap();

        let result = audit(dir.path(), types::Severity::Low).await.unwrap();
        assert!(result.entries.is_empty());
        assert_eq!(result.total_packages, 0);
    }

    // --- resolve_fix_version tests ---

    #[test]
    fn test_resolve_fix_version_compatible() {
        let mut versions = BTreeMap::new();
        versions.insert("4.17.15".to_string(), serde_json::json!({}));
        versions.insert("4.17.19".to_string(), serde_json::json!({}));
        versions.insert("4.17.20".to_string(), serde_json::json!({}));
        versions.insert("4.17.21".to_string(), serde_json::json!({}));
        versions.insert("4.17.25".to_string(), serde_json::json!({}));

        // declared ^4.17.0, patched >=4.17.21 → should pick 4.17.25 (highest in both)
        let result = resolve_fix_version("^4.17.0", ">=4.17.21", &versions);
        assert_eq!(result, Some("4.17.25".to_string()));
    }

    #[test]
    fn test_resolve_fix_version_incompatible() {
        let mut versions = BTreeMap::new();
        versions.insert("3.21.2".to_string(), serde_json::json!({}));
        versions.insert("4.18.2".to_string(), serde_json::json!({}));

        // declared ^3.0.0, patched >=4.18.2 → no version in ^3.0.0 satisfies >=4.18.2
        let result = resolve_fix_version("^3.0.0", ">=4.18.2", &versions);
        assert_eq!(result, None);
    }

    #[test]
    fn test_resolve_fix_version_picks_highest() {
        let mut versions = BTreeMap::new();
        versions.insert("0.21.1".to_string(), serde_json::json!({}));
        versions.insert("0.21.2".to_string(), serde_json::json!({}));
        versions.insert("0.21.3".to_string(), serde_json::json!({}));
        versions.insert("1.0.0".to_string(), serde_json::json!({}));

        // declared ^0.21.0, patched >=0.21.2 → should pick 0.21.3
        let result = resolve_fix_version("^0.21.0", ">=0.21.2", &versions);
        assert_eq!(result, Some("0.21.3".to_string()));
    }

    #[test]
    fn test_resolve_fix_version_no_versions_available() {
        let versions = BTreeMap::new();
        let result = resolve_fix_version("^1.0.0", ">=1.0.1", &versions);
        assert_eq!(result, None);
    }

    #[test]
    fn test_resolve_fix_version_invalid_declared_range() {
        let mut versions = BTreeMap::new();
        versions.insert("1.0.0".to_string(), serde_json::json!({}));
        let result = resolve_fix_version("not-a-range", ">=1.0.0", &versions);
        assert_eq!(result, None);
    }

    #[test]
    fn test_resolve_fix_version_invalid_patched_range() {
        let mut versions = BTreeMap::new();
        versions.insert("1.0.0".to_string(), serde_json::json!({}));
        let result = resolve_fix_version("^1.0.0", "not-a-range", &versions);
        assert_eq!(result, None);
    }

    // --- merge_patched_ranges tests ---

    #[test]
    fn test_merge_patched_ranges_single() {
        let result = merge_patched_ranges(&[">=4.17.21"]);
        assert_eq!(result, Some(">=4.17.21".to_string()));
    }

    #[test]
    fn test_merge_patched_ranges_multiple() {
        let result = merge_patched_ranges(&[">=4.17.19", ">=4.17.20", ">=4.17.21"]);
        assert!(result.is_some());
        // The combined range should satisfy 4.17.21 but not 4.17.20
        let combined = result.unwrap();
        let range = node_semver::Range::parse(&combined).unwrap();
        let v21 = node_semver::Version::parse("4.17.21").unwrap();
        let v20 = node_semver::Version::parse("4.17.20").unwrap();
        assert!(range.satisfies(&v21));
        assert!(!range.satisfies(&v20));
    }

    #[test]
    fn test_merge_patched_ranges_empty() {
        let result = merge_patched_ranges(&[]);
        assert_eq!(result, None);
    }

    // --- format_fix_text tests ---

    #[test]
    fn test_format_fix_text_applied() {
        let fixed = vec![FixApplied {
            name: "lodash".to_string(),
            from: "4.17.15".to_string(),
            to: "4.17.21".to_string(),
        }];
        let manual: Vec<FixManual> = Vec::new();

        let text = format_fix_text(&fixed, &manual, false);
        assert!(text.contains("Fixed 1 vulnerability"));
        assert!(text.contains("lodash 4.17.15 → 4.17.21"));
    }

    #[test]
    fn test_format_fix_text_manual() {
        let fixed: Vec<FixApplied> = Vec::new();
        let manual = vec![FixManual {
            name: "express".to_string(),
            from: "3.21.2".to_string(),
            patched: ">=4.18.2".to_string(),
            range: "^3.0.0".to_string(),
            reason: "patched version outside declared range ^3.0.0".to_string(),
        }];

        let text = format_fix_text(&fixed, &manual, false);
        assert!(text.contains("1 vulnerability requires manual update"));
        assert!(text.contains("express 3.21.2"));
        assert!(text.contains("Patched versions: >=4.18.2"));
        assert!(text.contains("vertz add express@\"<patched-version>\""));
    }

    #[test]
    fn test_format_fix_text_dry_run() {
        let fixed = vec![FixApplied {
            name: "lodash".to_string(),
            from: "4.17.15".to_string(),
            to: "4.17.21".to_string(),
        }];

        let text = format_fix_text(&fixed, &[], true);
        assert!(text.contains("Would fix 1 vulnerability"));
    }

    // --- format_fix_json tests ---

    #[test]
    fn test_format_fix_json_applied() {
        let fixed = vec![FixApplied {
            name: "lodash".to_string(),
            from: "4.17.15".to_string(),
            to: "4.17.21".to_string(),
        }];

        let json = format_fix_json(&fixed, &[]);
        let lines: Vec<&str> = json.trim().lines().collect();
        assert_eq!(lines.len(), 2); // fix_applied + audit_fix_complete

        let applied: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(applied["event"], "fix_applied");
        assert_eq!(applied["name"], "lodash");
        assert_eq!(applied["from"], "4.17.15");
        assert_eq!(applied["to"], "4.17.21");

        let complete: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(complete["event"], "audit_fix_complete");
        assert_eq!(complete["fixed"], 1);
        assert_eq!(complete["manual"], 0);
    }

    #[test]
    fn test_format_fix_json_manual() {
        let manual = vec![FixManual {
            name: "express".to_string(),
            from: "3.21.2".to_string(),
            patched: ">=4.18.2".to_string(),
            range: "^3.0.0".to_string(),
            reason: "patched version outside declared range".to_string(),
        }];

        let json = format_fix_json(&[], &manual);
        let lines: Vec<&str> = json.trim().lines().collect();
        assert_eq!(lines.len(), 2); // fix_manual + audit_fix_complete

        let manual_ev: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(manual_ev["event"], "fix_manual");
        assert_eq!(manual_ev["name"], "express");
        assert_eq!(
            manual_ev["reason"],
            "patched version outside declared range"
        );
        assert!(manual_ev["suggestion"]
            .as_str()
            .unwrap()
            .contains("vertz add express@\"<patched-version>\""));
    }

    // --- GitHub deps in verify_frozen ---

    #[test]
    fn test_verify_frozen_passes_with_github_dep() {
        let deps = make_deps(&[("zod", "^3.24.0"), ("my-lib", "github:user/my-lib#v2.1.0")]);

        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(),
            make_lockfile_entry("zod", "^3.24.0", "3.24.4", &[]),
        );
        lockfile.entries.insert(
            "my-lib@github:user/my-lib#v2.1.0".to_string(),
            LockfileEntry {
                name: "my-lib".to_string(),
                range: "github:user/my-lib#v2.1.0".to_string(),
                version: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2".to_string(),
                resolved: "https://codeload.github.com/user/my-lib/tar.gz/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2".to_string(),
                integrity: "sha512-fakehash".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );

        assert!(verify_frozen_deps(&deps, &lockfile).is_ok());
    }

    #[test]
    fn test_verify_frozen_fails_missing_github_dep() {
        let deps = make_deps(&[("my-lib", "github:user/my-lib")]);
        let lockfile = Lockfile::default();

        let result = verify_frozen_deps(&deps, &lockfile);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("lockfile is out of date"));
    }

    // --- build_list with GitHub deps ---

    #[test]
    fn test_list_github_dep() {
        let pkg = make_pkg(
            &[("zod", "^3.24.0"), ("my-lib", "github:user/my-lib#v2.1.0")],
            &[],
        );
        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(),
            make_lockfile_entry("zod", "^3.24.0", "3.24.4", &[]),
        );
        lockfile.entries.insert(
            "my-lib@github:user/my-lib#v2.1.0".to_string(),
            LockfileEntry {
                name: "my-lib".to_string(),
                range: "github:user/my-lib#v2.1.0".to_string(),
                version: "a1b2c3d".to_string(),
                resolved: "https://codeload.github.com/user/my-lib/tar.gz/a1b2c3d".to_string(),
                integrity: "sha512-fakehash".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );

        let options = ListOptions {
            all: false,
            depth: None,
            filter: None,
        };
        let entries = build_list(&pkg, &lockfile, &options);

        assert_eq!(entries.len(), 2);
        let my_lib = entries.iter().find(|e| e.name == "my-lib").unwrap();
        assert_eq!(my_lib.version, Some("a1b2c3d".to_string()));
        assert_eq!(my_lib.range, "github:user/my-lib#v2.1.0");
    }
}
