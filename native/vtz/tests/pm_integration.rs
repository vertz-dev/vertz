/// Package Manager integration tests
///
/// These tests exercise the full PM lifecycle (add → install → remove)
/// against the real npm registry. They require network access and are
/// intentionally slow — run with:
///
///   cargo test --test pm_integration
///
/// They are NOT included in the default `cargo test` suite (no #[ignore]
/// needed — they're in a separate test binary).
use std::sync::Arc;
use tempfile::TempDir;
use vertz_runtime::pm::output::{PmOutput, TextOutput};
use vertz_runtime::pm::vertzrc::ScriptPolicy;

/// Helper: create a temp project with a minimal package.json
fn create_project(extra_fields: &str) -> TempDir {
    let dir = tempfile::tempdir().unwrap();
    let pkg_json = if extra_fields.is_empty() {
        r#"{
  "name": "test-project",
  "version": "1.0.0",
  "type": "module"
}"#
        .to_string()
    } else {
        format!(
            r#"{{
  "name": "test-project",
  "version": "1.0.0",
  "type": "module",
  {}
}}"#,
            extra_fields
        )
    };
    std::fs::write(dir.path().join("package.json"), pkg_json).unwrap();
    dir
}

/// Helper: create a non-TTY text output for tests
fn test_output() -> Arc<dyn PmOutput> {
    Arc::new(TextOutput::new(false))
}

/// Helper: read package.json as raw JSON Value
fn read_pkg_json(dir: &TempDir) -> serde_json::Value {
    let content = std::fs::read_to_string(dir.path().join("package.json")).unwrap();
    serde_json::from_str(&content).unwrap()
}

#[tokio::test]
async fn test_add_creates_package_json_entry_lockfile_and_node_modules() {
    let dir = create_project("");

    vertz_runtime::pm::add(
        dir.path(),
        &["is-number"],
        false,
        false,
        false,
        false,
        ScriptPolicy::IgnoreAll,
        None,
        test_output(),
    )
    .await
    .unwrap();

    // package.json should have is-number in dependencies with ^ prefix
    let pkg = read_pkg_json(&dir);
    let deps = pkg["dependencies"].as_object().unwrap();
    let is_number_range = deps["is-number"].as_str().unwrap();
    assert!(
        is_number_range.starts_with('^'),
        "Expected ^ prefix, got: {}",
        is_number_range
    );

    // vertz.lock should exist
    let lockfile = dir.path().join("vertz.lock");
    assert!(lockfile.exists(), "vertz.lock should be created");
    let lock_content = std::fs::read_to_string(&lockfile).unwrap();
    assert!(
        lock_content.contains("is-number@"),
        "lockfile should contain is-number entry"
    );

    // node_modules/is-number/package.json should exist
    assert!(
        dir.path()
            .join("node_modules/is-number/package.json")
            .exists(),
        "is-number should be installed in node_modules"
    );
}

#[tokio::test]
async fn test_add_dev_dependency() {
    let dir = create_project("");

    vertz_runtime::pm::add(
        dir.path(),
        &["is-number"],
        true,
        false,
        false,
        false,
        ScriptPolicy::IgnoreAll,
        None,
        test_output(),
    )
    .await
    .unwrap();

    let pkg = read_pkg_json(&dir);
    assert!(
        pkg["devDependencies"]["is-number"].is_string(),
        "is-number should be in devDependencies"
    );
    // Should NOT be in dependencies
    assert!(
        pkg.get("dependencies").is_none()
            || !pkg["dependencies"]
                .as_object()
                .unwrap()
                .contains_key("is-number"),
        "is-number should not be in dependencies"
    );
}

#[tokio::test]
async fn test_add_exact_version() {
    let dir = create_project("");

    vertz_runtime::pm::add(
        dir.path(),
        &["is-number"],
        false,
        false,
        false,
        true,
        ScriptPolicy::IgnoreAll,
        None,
        test_output(),
    )
    .await
    .unwrap();

    let pkg = read_pkg_json(&dir);
    let version = pkg["dependencies"]["is-number"].as_str().unwrap();
    assert!(
        !version.starts_with('^'),
        "Exact version should not have ^ prefix, got: {}",
        version
    );
    // Should be a valid semver (digits and dots)
    assert!(
        version.chars().all(|c| c.is_ascii_digit() || c == '.'),
        "Expected exact version number, got: {}",
        version
    );
}

#[tokio::test]
async fn test_add_with_explicit_range_preserved() {
    let dir = create_project("");

    vertz_runtime::pm::add(
        dir.path(),
        &["is-number@^7.0.0"],
        false,
        false,
        false,
        false,
        ScriptPolicy::IgnoreAll,
        None,
        test_output(),
    )
    .await
    .unwrap();

    let pkg = read_pkg_json(&dir);
    let range = pkg["dependencies"]["is-number"].as_str().unwrap();
    assert_eq!(range, "^7.0.0", "Explicit range should be preserved as-is");
}

#[tokio::test]
async fn test_add_multiple_packages_batch() {
    let dir = create_project("");

    vertz_runtime::pm::add(
        dir.path(),
        &["is-number", "is-odd"],
        false,
        false,
        false,
        false,
        ScriptPolicy::IgnoreAll,
        None,
        test_output(),
    )
    .await
    .unwrap();

    let pkg = read_pkg_json(&dir);
    let deps = pkg["dependencies"].as_object().unwrap();
    assert!(deps.contains_key("is-number"), "is-number should be added");
    assert!(deps.contains_key("is-odd"), "is-odd should be added");

    // Both should be in node_modules
    assert!(dir
        .path()
        .join("node_modules/is-number/package.json")
        .exists());
    assert!(dir.path().join("node_modules/is-odd/package.json").exists());
}

#[tokio::test]
async fn test_install_from_lockfile() {
    let dir = create_project("");

    // First: add a package to create lockfile
    vertz_runtime::pm::add(
        dir.path(),
        &["is-number"],
        false,
        false,
        false,
        false,
        ScriptPolicy::IgnoreAll,
        None,
        test_output(),
    )
    .await
    .unwrap();

    // Delete node_modules
    std::fs::remove_dir_all(dir.path().join("node_modules")).unwrap();

    // Install from lockfile
    vertz_runtime::pm::install(
        dir.path(),
        false,
        vertz_runtime::pm::vertzrc::ScriptPolicy::IgnoreAll,
        false,
        test_output(),
    )
    .await
    .unwrap();

    // node_modules should be repopulated
    assert!(
        dir.path()
            .join("node_modules/is-number/package.json")
            .exists(),
        "is-number should be reinstalled from lockfile"
    );
}

#[tokio::test]
async fn test_install_frozen_fails_when_stale() {
    let dir = create_project(r#""dependencies": {"is-number": "^7.0.0"}"#);

    // No lockfile — frozen should fail
    let result = vertz_runtime::pm::install(
        dir.path(),
        true,
        vertz_runtime::pm::vertzrc::ScriptPolicy::IgnoreAll,
        false,
        test_output(),
    )
    .await;
    assert!(
        result.is_err(),
        "Frozen install should fail without lockfile"
    );
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("lockfile is out of date"),
        "Error should mention stale lockfile, got: {}",
        err
    );
}

#[tokio::test]
async fn test_install_frozen_succeeds_with_valid_lockfile() {
    let dir = create_project("");

    // Add to create lockfile
    vertz_runtime::pm::add(
        dir.path(),
        &["is-number"],
        false,
        false,
        false,
        false,
        ScriptPolicy::IgnoreAll,
        None,
        test_output(),
    )
    .await
    .unwrap();

    // Delete node_modules
    std::fs::remove_dir_all(dir.path().join("node_modules")).unwrap();

    // Frozen install should succeed
    vertz_runtime::pm::install(
        dir.path(),
        true,
        vertz_runtime::pm::vertzrc::ScriptPolicy::IgnoreAll,
        false,
        test_output(),
    )
    .await
    .unwrap();

    assert!(dir
        .path()
        .join("node_modules/is-number/package.json")
        .exists());
}

#[tokio::test]
async fn test_remove_cleans_package_json_and_node_modules() {
    let dir = create_project("");

    // Add first
    vertz_runtime::pm::add(
        dir.path(),
        &["is-number"],
        false,
        false,
        false,
        false,
        ScriptPolicy::IgnoreAll,
        None,
        test_output(),
    )
    .await
    .unwrap();

    assert!(dir
        .path()
        .join("node_modules/is-number/package.json")
        .exists());

    // Remove
    vertz_runtime::pm::remove(dir.path(), &["is-number"], None, test_output())
        .await
        .unwrap();

    // package.json should no longer have is-number
    let pkg = read_pkg_json(&dir);
    assert!(
        pkg.get("dependencies").is_none()
            || !pkg["dependencies"]
                .as_object()
                .unwrap()
                .contains_key("is-number"),
        "is-number should be removed from dependencies"
    );

    // node_modules/is-number should be gone
    assert!(
        !dir.path()
            .join("node_modules/is-number/package.json")
            .exists(),
        "is-number should be removed from node_modules"
    );
}

#[tokio::test]
async fn test_remove_nonexistent_package_errors() {
    let dir = create_project("");

    let result = vertz_runtime::pm::remove(dir.path(), &["nonexistent"], None, test_output()).await;
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("is not a direct dependency"),
        "Error should say 'is not a direct dependency', got: {}",
        err
    );
}

#[tokio::test]
async fn test_package_json_field_preservation_through_lifecycle() {
    // Create package.json with many unmodeled fields
    let dir = create_project(
        r#""main": "./dist/index.js",
  "exports": {".": "./dist/index.js"},
  "engines": {"node": ">=18"},
  "repository": {"type": "git", "url": "https://github.com/test/test.git"},
  "license": "MIT",
  "description": "A test project"
"#,
    );

    // Add a package
    vertz_runtime::pm::add(
        dir.path(),
        &["is-number"],
        false,
        false,
        false,
        false,
        ScriptPolicy::IgnoreAll,
        None,
        test_output(),
    )
    .await
    .unwrap();

    // Verify unmodeled fields survived
    let pkg = read_pkg_json(&dir);
    assert_eq!(pkg["type"], "module");
    assert_eq!(pkg["main"], "./dist/index.js");
    assert!(pkg["exports"].is_object());
    assert!(pkg["engines"].is_object());
    assert!(pkg["repository"].is_object());
    assert_eq!(pkg["license"], "MIT");
    assert_eq!(pkg["description"], "A test project");

    // Remove the package
    vertz_runtime::pm::remove(dir.path(), &["is-number"], None, test_output())
        .await
        .unwrap();

    // Fields should STILL be preserved after remove
    let pkg = read_pkg_json(&dir);
    assert_eq!(pkg["type"], "module");
    assert_eq!(pkg["main"], "./dist/index.js");
    assert_eq!(pkg["license"], "MIT");
}

#[tokio::test]
async fn test_lockfile_updated_after_remove() {
    let dir = create_project("");

    // Add is-number
    vertz_runtime::pm::add(
        dir.path(),
        &["is-number"],
        false,
        false,
        false,
        false,
        ScriptPolicy::IgnoreAll,
        None,
        test_output(),
    )
    .await
    .unwrap();

    let lock_before = std::fs::read_to_string(dir.path().join("vertz.lock")).unwrap();
    assert!(lock_before.contains("is-number@"));

    // Remove is-number
    vertz_runtime::pm::remove(dir.path(), &["is-number"], None, test_output())
        .await
        .unwrap();

    let lock_after = std::fs::read_to_string(dir.path().join("vertz.lock")).unwrap();
    assert!(
        !lock_after.contains("is-number@"),
        "Lockfile should not contain is-number after removal"
    );
}
