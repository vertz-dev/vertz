use std::time::Duration;
use tokio::time::timeout;
use vertz_runtime::deps::linked::WatchTarget;
use vertz_runtime::errors::broadcaster::ErrorBroadcaster;
use vertz_runtime::server::auto_installer::AutoInstaller;
use vertz_runtime::watcher::dep_watcher::{DepWatcher, DepWatcherConfig};

/// Parity #54: Auto-install missing packages — coordination logic.
/// Tests the AutoInstaller's blacklist and dedup behavior without network calls.
#[tokio::test]
async fn auto_installer_detects_missing_package() {
    let tmp = tempfile::tempdir().unwrap();
    let installer = AutoInstaller::new(tmp.path().to_path_buf(), ErrorBroadcaster::new());

    // Initially, nothing is blacklisted
    assert!(
        !installer.is_blacklisted("nonexistent-pkg"),
        "Package should not be blacklisted before install attempt"
    );

    // Attempt to install a non-existent package — this will fail
    // (no node_modules, no registry) and the package gets blacklisted
    let result = installer.install("nonexistent-pkg").await;
    assert!(
        result.is_err(),
        "Installing a nonexistent package should fail"
    );

    // After failure, the package should be blacklisted (for 35s)
    assert!(
        installer.is_blacklisted("nonexistent-pkg"),
        "Failed package should be blacklisted"
    );

    // A second install should return immediately (dedup via blacklist)
    let result2 = installer.install("nonexistent-pkg").await;
    assert!(
        result2.is_err(),
        "Blacklisted package install should fail immediately"
    );

    // clear_failed resets the blacklist
    installer.clear_failed();
    assert!(
        !installer.is_blacklisted("nonexistent-pkg"),
        "Package should not be blacklisted after clear_failed"
    );
}

/// Parity #55: Upstream dependency watching detects file changes in linked packages.
#[tokio::test]
async fn dep_watcher_detects_linked_package_changes() {
    let tmp = tempfile::tempdir().unwrap();

    // Create a mock linked package structure: node_modules/@mock/ui/dist/
    let pkg_dir = tmp.path().join("node_modules/@mock/ui");
    let dist_dir = pkg_dir.join("dist");
    std::fs::create_dir_all(&dist_dir).unwrap();
    std::fs::write(dist_dir.join("index.js"), "export default {}").unwrap();

    // Canonicalize path (DepWatcher requires canonical paths for FSEvents/inotify)
    let canonical_pkg = std::fs::canonicalize(&pkg_dir).unwrap();

    let targets = vec![WatchTarget {
        watch_dir: canonical_pkg,
        output_dir_name: Some("dist".to_string()),
        package_name: Some("@mock/ui".to_string()),
    }];

    let (_watcher, mut rx) = DepWatcher::start(&targets, DepWatcherConfig::default()).unwrap();

    // Give the watcher time to initialize
    tokio::time::sleep(Duration::from_millis(200)).await;

    // Modify a file in the dist directory
    std::fs::write(dist_dir.join("index.js"), "export default { v: 2 }").unwrap();

    // Wait for the change event
    let change = timeout(Duration::from_secs(5), rx.recv())
        .await
        .expect("no dep change detected within 5s")
        .expect("dep watcher channel closed");

    assert!(
        change.path.ends_with("index.js"),
        "Changed path should be index.js, got: {:?}",
        change.path
    );
    assert_eq!(
        change.package.as_deref(),
        Some("@mock/ui"),
        "Change should reference the watched package"
    );
}
