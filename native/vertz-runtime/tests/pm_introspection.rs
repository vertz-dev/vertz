/// Package Manager introspection integration tests
///
/// These tests exercise `vertz list`, `vertz why`, and `vertz outdated`
/// against the real npm registry. They require network access and are
/// intentionally slow — run with:
///
///   cargo test --test pm_introspection
///
/// They are NOT included in the default `cargo test` suite.
use std::sync::Arc;
use tempfile::TempDir;
use vertz_runtime::pm::output::{PmOutput, TextOutput};
use vertz_runtime::pm::vertzrc::ScriptPolicy;
use vertz_runtime::pm::{self, ListOptions};

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

// --- vertz list integration tests ---

#[tokio::test]
async fn test_list_direct_deps_after_add() {
    let dir = create_project("");

    pm::add(
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

    let entries = pm::list(
        dir.path(),
        &ListOptions {
            all: false,
            depth: None,
            filter: None,
        },
    )
    .unwrap();

    assert!(!entries.is_empty(), "list should return entries");
    assert!(
        entries.iter().any(|e| e.name == "is-number"),
        "is-number should be in the list"
    );
    // Direct dep at depth 0
    let is_number = entries.iter().find(|e| e.name == "is-number").unwrap();
    assert_eq!(is_number.depth, 0);
    assert!(is_number.version.is_some());
}

#[tokio::test]
async fn test_list_with_package_filter() {
    let dir = create_project("");

    pm::add(
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

    let entries = pm::list(
        dir.path(),
        &ListOptions {
            all: false,
            depth: None,
            filter: Some("is-number".to_string()),
        },
    )
    .unwrap();

    assert!(
        entries.iter().all(|e| e.name == "is-number"),
        "filtered list should only show is-number"
    );
}

#[tokio::test]
async fn test_list_all_shows_transitive_deps() {
    let dir = create_project("");

    // is-odd depends on is-number, so --all should show is-number as transitive
    pm::add(
        dir.path(),
        &["is-odd"],
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

    let entries = pm::list(
        dir.path(),
        &ListOptions {
            all: true,
            depth: None,
            filter: None,
        },
    )
    .unwrap();

    // Should have is-odd (depth 0) and is-number (depth 1)
    assert!(
        entries.iter().any(|e| e.name == "is-odd" && e.depth == 0),
        "is-odd should be at depth 0"
    );
    assert!(
        entries.iter().any(|e| e.name == "is-number" && e.depth > 0),
        "is-number should be a transitive dep at depth > 0"
    );
}

#[tokio::test]
async fn test_list_text_format() {
    let dir = create_project("");

    pm::add(
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

    let entries = pm::list(
        dir.path(),
        &ListOptions {
            all: false,
            depth: None,
            filter: None,
        },
    )
    .unwrap();

    let text = pm::format_list_text(&entries);
    assert!(text.contains("dependencies:"), "should have header");
    assert!(text.contains("is-number@"), "should show is-number");
}

#[tokio::test]
async fn test_list_json_format() {
    let dir = create_project("");

    pm::add(
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

    let entries = pm::list(
        dir.path(),
        &ListOptions {
            all: false,
            depth: None,
            filter: None,
        },
    )
    .unwrap();

    let json = pm::format_list_json(&entries);
    let lines: Vec<&str> = json.trim().lines().collect();
    assert!(!lines.is_empty());

    let first: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
    assert_eq!(first["type"], "dependency");
    assert_eq!(first["name"], "is-number");
    assert_eq!(first["depth"], 0);
    assert!(first["version"].is_string());
}

#[tokio::test]
async fn test_list_no_lockfile() {
    let dir = create_project(r#""dependencies": {"is-number": "^7.0.0"}"#);

    // No lockfile — should list with version=None
    let entries = pm::list(
        dir.path(),
        &ListOptions {
            all: false,
            depth: None,
            filter: None,
        },
    )
    .unwrap();

    assert!(
        entries
            .iter()
            .any(|e| e.name == "is-number" && e.version.is_none()),
        "should show is-number with no version (not installed)"
    );

    let text = pm::format_list_text(&entries);
    assert!(text.contains("(not installed)"));
}

// --- vertz why integration tests ---

#[tokio::test]
async fn test_why_direct_dependency() {
    let dir = create_project("");

    pm::add(
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

    let result = pm::why(dir.path(), "is-number").unwrap();
    assert_eq!(result.name, "is-number");
    assert!(!result.versions.is_empty());

    // Should have a direct path (empty path)
    assert!(
        result
            .versions
            .iter()
            .any(|v| v.paths.iter().any(|p| p.is_empty())),
        "direct dependency should have an empty path"
    );
}

#[tokio::test]
async fn test_why_transitive_dependency() {
    let dir = create_project("");

    // is-odd depends on is-number
    pm::add(
        dir.path(),
        &["is-odd"],
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

    let result = pm::why(dir.path(), "is-number").unwrap();
    assert_eq!(result.name, "is-number");
    assert!(!result.versions.is_empty());

    // Should have a non-empty path through is-odd
    assert!(
        result.versions.iter().any(|v| v
            .paths
            .iter()
            .any(|p| !p.is_empty() && p.iter().any(|e| e.name == "is-odd"))),
        "is-number should be reachable via is-odd"
    );
}

#[tokio::test]
async fn test_why_not_installed() {
    let dir = create_project("");

    let result = pm::why(dir.path(), "nonexistent-pkg-xyz");
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("is not installed"));
}

#[tokio::test]
async fn test_why_json_format() {
    let dir = create_project("");

    pm::add(
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

    let result = pm::why(dir.path(), "is-number").unwrap();
    let json = pm::format_why_json(&result);
    let parsed: serde_json::Value = serde_json::from_str(json.trim()).unwrap();

    assert_eq!(parsed["name"], "is-number");
    assert!(parsed["version"].is_string());
    assert!(parsed["paths"].is_array());
}

// --- vertz outdated integration tests ---

#[tokio::test]
async fn test_outdated_with_installed_package() {
    let dir = create_project("");

    pm::add(
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

    let (entries, _warnings) = pm::outdated(dir.path()).await.unwrap();

    // is-number may or may not be outdated — if it is, verify fields
    // If all packages are up to date, entries will be empty (which is correct)
    for entry in &entries {
        assert!(!entry.current.is_empty());
        assert!(!entry.wanted.is_empty());
        assert!(!entry.latest.is_empty());
        assert!(!entry.range.is_empty());
    }
}

#[tokio::test]
async fn test_outdated_no_deps() {
    let dir = create_project("");

    let (entries, warnings) = pm::outdated(dir.path()).await.unwrap();
    assert!(entries.is_empty(), "no deps = empty outdated list");
    assert!(warnings.is_empty(), "no deps = no warnings");
}

#[tokio::test]
async fn test_outdated_no_lockfile() {
    let dir = create_project(r#""dependencies": {"is-number": "^7.0.0"}"#);

    let result = pm::outdated(dir.path()).await;
    assert!(result.is_err(), "should error when no lockfile exists");
    assert!(result.unwrap_err().to_string().contains("No lockfile"));
}

#[tokio::test]
async fn test_outdated_json_format() {
    let dir = create_project("");

    pm::add(
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

    let (entries, _warnings) = pm::outdated(dir.path()).await.unwrap();
    let json = pm::format_outdated_json(&entries);

    if !entries.is_empty() {
        let first_line = json.lines().next().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(first_line).unwrap();
        assert!(parsed["name"].is_string());
        assert!(parsed["current"].is_string());
        assert!(parsed["wanted"].is_string());
        assert!(parsed["latest"].is_string());
        assert!(parsed["range"].is_string());
        assert!(parsed["dev"].is_boolean());
    }
}

#[tokio::test]
async fn test_outdated_text_format() {
    let dir = create_project("");

    pm::add(
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

    let (entries, _warnings) = pm::outdated(dir.path()).await.unwrap();

    if !entries.is_empty() {
        let text = pm::format_outdated_text(&entries);
        assert!(text.contains("Package"));
        assert!(text.contains("Current"));
        assert!(text.contains("Wanted"));
        assert!(text.contains("Latest"));
    }
}

#[tokio::test]
async fn test_outdated_dev_dependency() {
    let dir = create_project("");

    pm::add(
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

    let (entries, _warnings) = pm::outdated(dir.path()).await.unwrap();

    // If is-number is outdated, it should be marked as dev dep
    if let Some(entry) = entries.iter().find(|e| e.name == "is-number") {
        assert!(entry.dev, "is-number should be marked as dev dep");
    }
    // If is-number is up to date, it won't appear in entries (correct behavior)
}
