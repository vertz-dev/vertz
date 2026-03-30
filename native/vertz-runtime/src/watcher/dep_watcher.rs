use crate::deps::linked::WatchTarget;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::sync::mpsc;

/// Configuration for the dependency watcher.
#[derive(Debug, Clone)]
pub struct DepWatcherConfig {
    /// Debounce duration for build output (default: 200ms).
    /// Higher than source watcher because build tools emit many files rapidly.
    pub debounce_ms: u64,
    /// File extensions to watch in output dirs.
    /// Default: [".js", ".mjs", ".cjs", ".css", ".d.ts"].
    pub extensions: Vec<String>,
    /// Directory names to ignore within watched package roots.
    /// Default: ["node_modules", "src", ".git"].
    pub ignore_dirs: Vec<String>,
}

impl Default for DepWatcherConfig {
    fn default() -> Self {
        Self {
            debounce_ms: 200,
            extensions: vec![
                ".js".to_string(),
                ".mjs".to_string(),
                ".cjs".to_string(),
                ".css".to_string(),
                ".d.ts".to_string(),
            ],
            ignore_dirs: vec![
                "node_modules".to_string(),
                "src".to_string(),
                ".git".to_string(),
            ],
        }
    }
}

/// A dependency change event.
#[derive(Debug, Clone)]
pub struct DepChange {
    /// The package name (e.g., "@vertz/ui"). None for extraWatchPaths.
    pub package: Option<String>,
    /// The changed file path.
    pub path: PathBuf,
}

/// Watches linked workspace packages for output directory changes.
/// Uses a single RecommendedWatcher with multiple watch() calls
/// to avoid exhausting OS file watcher limits.
pub struct DepWatcher {
    _watcher: RecommendedWatcher,
}

impl DepWatcher {
    /// Start watching the given targets for dependency changes.
    ///
    /// Creates a single `RecommendedWatcher` with `watch()` called for each target.
    /// Events are filtered by extension and output directory, then sent to the
    /// returned receiver as `DepChange` events.
    pub fn start(
        targets: &[WatchTarget],
        config: DepWatcherConfig,
    ) -> Result<(Self, mpsc::Receiver<DepChange>), notify::Error> {
        let (tx, rx) = mpsc::channel(256);
        let extensions = config.extensions.clone();
        let ignore_dirs = config.ignore_dirs.clone();

        // Clone targets for use inside the closure
        let targets_for_closure: Vec<WatchTarget> = targets.to_vec();

        let notify_config =
            Config::default().with_poll_interval(Duration::from_millis(config.debounce_ms));

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let is_relevant = matches!(
                        event.kind,
                        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                    );

                    if is_relevant {
                        for path in &event.paths {
                            if should_process_dep_file(
                                path,
                                &extensions,
                                &ignore_dirs,
                                &targets_for_closure,
                            ) {
                                let package = map_path_to_package(path, &targets_for_closure);
                                let change = DepChange {
                                    package,
                                    path: path.clone(),
                                };
                                let _ = tx.try_send(change);
                            }
                        }
                    }
                }
            },
            notify_config,
        )?;

        // Watch each target directory
        for target in targets {
            watcher.watch(&target.watch_dir, RecursiveMode::Recursive)?;
        }

        Ok((Self { _watcher: watcher }, rx))
    }
}

/// Check if a file path should trigger a dep change event.
///
/// Criteria:
/// 1. File is not hidden (doesn't start with .)
/// 2. File extension matches configured extensions
/// 3. Path is inside a watched target directory
/// 4. If target has an output dir, path must be inside it
/// 5. If target has no output dir (extraWatchPaths), path must NOT be in ignore dirs
///
/// Note: ignore dirs (node_modules, src, .git) are checked relative to the
/// target root, but NOT inside the output directory. A file at
/// `packages/ui/dist/src/Button.js` is valid — the `src` there is output,
/// not the package's source directory.
pub fn should_process_dep_file(
    path: &Path,
    extensions: &[String],
    ignore_dirs: &[String],
    targets: &[WatchTarget],
) -> bool {
    let path_str = path.to_string_lossy();

    // Ignore hidden files
    if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
        if filename.starts_with('.') {
            return false;
        }
    }

    // Check extension
    let has_ext = extensions
        .iter()
        .any(|ext| path_str.ends_with(ext.as_str()));
    if !has_ext {
        return false;
    }

    // Check if the path is inside a watched target
    for target in targets {
        let target_str = target.watch_dir.to_string_lossy();
        if !path_str.starts_with(target_str.as_ref()) {
            continue;
        }

        let relative = &path_str[target_str.len()..];
        let relative = relative.trim_start_matches('/').trim_start_matches('\\');

        if let Some(ref output_dir) = target.output_dir_name {
            // Target has an output dir — file must be inside it.
            // Ignore dirs are checked on the path between target root and output dir,
            // NOT inside the output dir itself.
            if relative.starts_with(output_dir.as_str())
                && relative
                    .as_bytes()
                    .get(output_dir.len())
                    .is_some_and(|&b| b == b'/' || b == b'\\')
            {
                return true;
            }
            // File is inside the target but NOT inside the output dir — reject.
            // This implicitly handles ignore dirs like src/ and node_modules/
            // because they are outside the output dir.
            return false;
        }

        // No output_dir_name (extraWatchPaths) — apply ignore dirs to the full relative path
        for dir in ignore_dirs {
            if relative.starts_with(&format!("{}/", dir))
                || relative.contains(&format!("/{}/", dir))
            {
                return false;
            }
        }
        return true;
    }

    false
}

/// Map a changed file path back to a package name using the watch targets list.
pub fn map_path_to_package(path: &Path, targets: &[WatchTarget]) -> Option<String> {
    let path_str = path.to_string_lossy();
    for target in targets {
        let target_str = target.watch_dir.to_string_lossy();
        if path_str.starts_with(target_str.as_ref()) {
            return target.package_name.clone();
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dep_watcher_config_defaults() {
        let config = DepWatcherConfig::default();
        assert_eq!(config.debounce_ms, 200);
        assert!(config.extensions.contains(&".js".to_string()));
        assert!(config.extensions.contains(&".mjs".to_string()));
        assert!(config.extensions.contains(&".cjs".to_string()));
        assert!(config.extensions.contains(&".css".to_string()));
        assert!(config.extensions.contains(&".d.ts".to_string()));
        assert_eq!(config.extensions.len(), 5);
        assert!(config.ignore_dirs.contains(&"node_modules".to_string()));
        assert!(config.ignore_dirs.contains(&"src".to_string()));
        assert!(config.ignore_dirs.contains(&".git".to_string()));
        assert_eq!(config.ignore_dirs.len(), 3);
    }

    fn default_extensions() -> Vec<String> {
        DepWatcherConfig::default().extensions
    }

    fn default_ignore_dirs() -> Vec<String> {
        DepWatcherConfig::default().ignore_dirs
    }

    fn make_target(watch_dir: &str, output_dir: Option<&str>, pkg: Option<&str>) -> WatchTarget {
        WatchTarget {
            watch_dir: PathBuf::from(watch_dir),
            output_dir_name: output_dir.map(|s| s.to_string()),
            package_name: pkg.map(|s| s.to_string()),
        }
    }

    // --- should_process_dep_file tests ---

    #[test]
    fn test_accepts_js_file_in_output_dir() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert!(should_process_dep_file(
            Path::new("/packages/ui/dist/index.js"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    #[test]
    fn test_accepts_mjs_file_in_output_dir() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert!(should_process_dep_file(
            Path::new("/packages/ui/dist/index.mjs"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    #[test]
    fn test_accepts_css_file_in_output_dir() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert!(should_process_dep_file(
            Path::new("/packages/ui/dist/styles.css"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    #[test]
    fn test_accepts_dts_file_in_output_dir() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert!(should_process_dep_file(
            Path::new("/packages/ui/dist/index.d.ts"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    #[test]
    fn test_rejects_map_file_in_output_dir() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert!(!should_process_dep_file(
            Path::new("/packages/ui/dist/index.js.map"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    #[test]
    fn test_rejects_tsbuildinfo_file() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert!(!should_process_dep_file(
            Path::new("/packages/ui/dist/tsconfig.tsbuildinfo"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    #[test]
    fn test_rejects_file_outside_output_dir() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        // File in src/ should be rejected because it's not in dist/
        assert!(!should_process_dep_file(
            Path::new("/packages/ui/README.md"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    #[test]
    fn test_rejects_js_file_in_src_within_package() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert!(!should_process_dep_file(
            Path::new("/packages/ui/src/index.js"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    #[test]
    fn test_rejects_file_in_node_modules_within_package() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert!(!should_process_dep_file(
            Path::new("/packages/ui/node_modules/dep/index.js"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    #[test]
    fn test_rejects_hidden_file() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert!(!should_process_dep_file(
            Path::new("/packages/ui/dist/.hidden.js"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    #[test]
    fn test_accepts_any_file_for_extra_watch_path() {
        // Extra watch paths have no output_dir_name
        let targets = vec![make_target("/shared-lib/build", None, None)];
        assert!(should_process_dep_file(
            Path::new("/shared-lib/build/index.js"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    #[test]
    fn test_rejects_file_not_matching_any_target() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert!(!should_process_dep_file(
            Path::new("/some/other/path/index.js"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    #[test]
    fn test_accepts_nested_file_in_output_dir() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert!(should_process_dep_file(
            Path::new("/packages/ui/dist/src/components/Button.js"),
            &default_extensions(),
            &default_ignore_dirs(),
            &targets,
        ));
    }

    // --- map_path_to_package tests ---

    #[test]
    fn test_maps_path_to_package_name() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert_eq!(
            map_path_to_package(Path::new("/packages/ui/dist/index.js"), &targets),
            Some("@myorg/ui".to_string()),
        );
    }

    #[test]
    fn test_maps_extra_watch_path_to_none() {
        let targets = vec![make_target("/shared-lib/build", None, None)];
        assert_eq!(
            map_path_to_package(Path::new("/shared-lib/build/index.js"), &targets),
            None,
        );
    }

    #[test]
    fn test_maps_unknown_path_to_none() {
        let targets = vec![make_target("/packages/ui", Some("dist"), Some("@myorg/ui"))];
        assert_eq!(
            map_path_to_package(Path::new("/other/path/index.js"), &targets),
            None,
        );
    }

    #[test]
    fn test_maps_correct_package_among_multiple() {
        let targets = vec![
            make_target("/packages/ui", Some("dist"), Some("@myorg/ui")),
            make_target("/packages/server", Some("dist"), Some("@myorg/server")),
        ];
        assert_eq!(
            map_path_to_package(Path::new("/packages/server/dist/index.js"), &targets),
            Some("@myorg/server".to_string()),
        );
    }

    // --- Integration: DepWatcher::start ---

    #[tokio::test]
    async fn test_dep_watcher_start_and_detect_change() {
        let tmp = tempfile::tempdir().unwrap();
        let pkg_dir = tmp.path().join("packages").join("ui");
        let dist_dir = pkg_dir.join("dist");
        std::fs::create_dir_all(&dist_dir).unwrap();
        std::fs::write(dist_dir.join("index.js"), "export default {}").unwrap();

        let targets = vec![WatchTarget {
            watch_dir: std::fs::canonicalize(&pkg_dir).unwrap(),
            output_dir_name: Some("dist".to_string()),
            package_name: Some("@myorg/ui".to_string()),
        }];

        let config = DepWatcherConfig::default();
        let (watcher, mut rx) = DepWatcher::start(&targets, config).unwrap();

        // Give the watcher time to initialize
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Modify a file in dist/
        std::fs::write(dist_dir.join("index.js"), "export default { v: 2 }").unwrap();

        // Wait for the change event
        let result = tokio::time::timeout(Duration::from_secs(3), rx.recv()).await;
        assert!(result.is_ok(), "Should receive a dep change event");
        let change = result.unwrap().unwrap();
        assert_eq!(change.package, Some("@myorg/ui".to_string()));
        assert!(change.path.to_string_lossy().contains("index.js"));

        drop(watcher);
    }

    #[tokio::test]
    async fn test_dep_watcher_ignores_non_matching_extension() {
        let tmp = tempfile::tempdir().unwrap();
        let pkg_dir = tmp.path().join("packages").join("ui");
        let dist_dir = pkg_dir.join("dist");
        std::fs::create_dir_all(&dist_dir).unwrap();

        let targets = vec![WatchTarget {
            watch_dir: std::fs::canonicalize(&pkg_dir).unwrap(),
            output_dir_name: Some("dist".to_string()),
            package_name: Some("@myorg/ui".to_string()),
        }];

        let config = DepWatcherConfig::default();
        let (watcher, mut rx) = DepWatcher::start(&targets, config).unwrap();

        tokio::time::sleep(Duration::from_millis(100)).await;

        // Write a .map file (should be ignored)
        std::fs::write(dist_dir.join("index.js.map"), "{}").unwrap();

        let result = tokio::time::timeout(Duration::from_millis(500), rx.recv()).await;
        assert!(result.is_err(), "Should NOT receive event for .map file");

        drop(watcher);
    }

    #[tokio::test]
    async fn test_dep_watcher_multiple_targets() {
        let tmp = tempfile::tempdir().unwrap();

        let ui_dir = tmp.path().join("packages").join("ui");
        let ui_dist = ui_dir.join("dist");
        std::fs::create_dir_all(&ui_dist).unwrap();

        let server_dir = tmp.path().join("packages").join("server");
        let server_dist = server_dir.join("dist");
        std::fs::create_dir_all(&server_dist).unwrap();

        let targets = vec![
            WatchTarget {
                watch_dir: std::fs::canonicalize(&ui_dir).unwrap(),
                output_dir_name: Some("dist".to_string()),
                package_name: Some("@myorg/ui".to_string()),
            },
            WatchTarget {
                watch_dir: std::fs::canonicalize(&server_dir).unwrap(),
                output_dir_name: Some("dist".to_string()),
                package_name: Some("@myorg/server".to_string()),
            },
        ];

        let config = DepWatcherConfig::default();
        let (watcher, mut rx) = DepWatcher::start(&targets, config).unwrap();

        tokio::time::sleep(Duration::from_millis(100)).await;

        // Modify server dist
        std::fs::write(server_dist.join("index.js"), "export {}").unwrap();

        let result = tokio::time::timeout(Duration::from_secs(3), rx.recv()).await;
        assert!(result.is_ok(), "Should receive event from server package");
        let change = result.unwrap().unwrap();
        assert_eq!(change.package, Some("@myorg/server".to_string()));

        drop(watcher);
    }
}
