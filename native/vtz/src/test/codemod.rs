use std::path::{Path, PathBuf};

use deno_core::error::AnyError;

use super::collector::{discover_test_files, DiscoveryMode};

/// Result of migrating a single file.
#[derive(Debug)]
pub struct MigrateFileResult {
    pub path: PathBuf,
    pub changed: bool,
    pub changes: Vec<String>,
}

/// Result of migrating a directory.
#[derive(Debug)]
pub struct MigrateResult {
    pub files: Vec<MigrateFileResult>,
    pub total_files: usize,
    pub files_changed: usize,
}

/// Run the migration codemod on a directory.
pub fn migrate_tests(root_dir: &Path, dry_run: bool) -> Result<MigrateResult, AnyError> {
    let test_files = discover_test_files(root_dir, &[], &[], &[], DiscoveryMode::Unit);

    let mut results = Vec::new();
    let mut files_changed = 0;

    for file_path in &test_files {
        let source = std::fs::read_to_string(file_path)?;
        let (migrated, changes) = migrate_source(&source);

        let changed = !changes.is_empty();
        if changed {
            files_changed += 1;
            if !dry_run {
                std::fs::write(file_path, &migrated)?;
            }
        }

        results.push(MigrateFileResult {
            path: file_path.clone(),
            changed,
            changes,
        });
    }

    Ok(MigrateResult {
        total_files: test_files.len(),
        files_changed,
        files: results,
    })
}

/// Migrate a single source file's content. Returns (migrated_source, list_of_changes).
pub fn migrate_source(source: &str) -> (String, Vec<String>) {
    let mut result = source.to_string();
    let mut changes = Vec::new();

    // 1. Rewrite import source: 'bun:test' → '@vertz/test'
    if result.contains("'bun:test'") || result.contains("\"bun:test\"") {
        result = result.replace("'bun:test'", "'@vertz/test'");
        result = result.replace("\"bun:test\"", "\"@vertz/test\"");
        changes.push("Rewrote import from 'bun:test' to '@vertz/test'".to_string());
    }

    // 2. Rewrite vi.fn() → mock()
    if result.contains("vi.fn(") {
        result = result.replace("vi.fn(", "mock(");
        changes.push("Rewrote vi.fn() to mock()".to_string());
    }

    // 3. Rewrite vi.spyOn() → spyOn()
    if result.contains("vi.spyOn(") {
        result = result.replace("vi.spyOn(", "spyOn(");
        changes.push("Rewrote vi.spyOn() to spyOn()".to_string());
    }

    // 4. Remove vi from import if it's now unused
    // After rewriting vi.fn() and vi.spyOn(), check if vi is still used
    if !changes.is_empty() && !result.contains("vi.") {
        // Remove vi from import destructuring
        // Patterns: `vi, ` or `, vi` or `vi`
        let patterns = [
            (", vi ", ", "),
            (", vi}", "}"),
            ("vi, ", ""),
            ("{ vi }", "{}"),
        ];
        for (from, to) in &patterns {
            if result.contains(from) {
                result = result.replace(from, to);
                changes.push("Removed unused vi from import".to_string());
                break;
            }
        }
    }

    // 5. Add mock/spyOn to import if they were added via vi.fn()/vi.spyOn()
    // Check if mock() is used but not imported
    if result.contains("mock(") && !result.contains("import") {
        // File uses globals — no import needed
    } else if result.contains("mock(") {
        // Check if mock is already in the import
        if let Some(import_line) = find_vertz_test_import(&result) {
            if !import_line.contains("mock") && result.contains("mock(") {
                let updated = add_to_import(&result, "mock");
                if updated != result {
                    result = updated;
                    changes.push("Added mock to import".to_string());
                }
            }
            if !import_line.contains("spyOn") && result.contains("spyOn(") {
                let updated = add_to_import(&result, "spyOn");
                if updated != result {
                    result = updated;
                    changes.push("Added spyOn to import".to_string());
                }
            }
        }
    }

    (result, changes)
}

/// Find the @vertz/test import line.
fn find_vertz_test_import(source: &str) -> Option<String> {
    for line in source.lines() {
        if line.contains("@vertz/test") && line.contains("import") {
            return Some(line.to_string());
        }
    }
    None
}

/// Add a name to the @vertz/test import destructuring.
fn add_to_import(source: &str, name: &str) -> String {
    let mut result = String::new();
    for line in source.lines() {
        if line.contains("@vertz/test") && line.contains("import") && line.contains('}') {
            // Add the name before the closing brace
            let new_line = line.replace(" }", &format!(", {} }}", name));
            result.push_str(&new_line);
        } else {
            result.push_str(line);
        }
        result.push('\n');
    }
    // Remove trailing newline if original didn't have one
    if !source.ends_with('\n') {
        result.pop();
    }
    result
}

/// Format migration results for terminal output.
pub fn format_migrate_output(result: &MigrateResult, dry_run: bool) -> String {
    let mut output = String::new();

    if dry_run {
        output.push_str("Dry run — no files modified\n\n");
    }

    for file_result in &result.files {
        if file_result.changed {
            output.push_str(&format!(
                "  {} {}\n",
                if dry_run { "~" } else { "✓" },
                file_result.path.display()
            ));
            for change in &file_result.changes {
                output.push_str(&format!("    - {}\n", change));
            }
        }
    }

    if result.files_changed == 0 {
        output.push_str("No files needed migration.\n");
    } else {
        output.push_str(&format!(
            "\n{} of {} file(s) {}.\n",
            result.files_changed,
            result.total_files,
            if dry_run {
                "would be migrated"
            } else {
                "migrated"
            }
        ));
    }

    output
}

/// Update package.json in the given directory to add `@vertz/test` as a devDependency.
/// Returns true if the file was modified.
pub fn add_vertz_test_dep(root_dir: &Path, dry_run: bool) -> Result<bool, AnyError> {
    let pkg_path = root_dir.join("package.json");
    if !pkg_path.exists() {
        return Ok(false);
    }

    let content = std::fs::read_to_string(&pkg_path)?;
    let mut pkg: serde_json::Value = serde_json::from_str(&content)?;

    // Check if already present
    if pkg
        .get("devDependencies")
        .and_then(|d| d.get("@vertz/test"))
        .is_some()
    {
        return Ok(false);
    }

    // Determine version from existing vertz or @vertz/* deps (read before mutating)
    let version = ["devDependencies", "dependencies"]
        .iter()
        .filter_map(|section| pkg.get(*section)?.as_object())
        .flat_map(|deps| deps.iter())
        .find(|(k, _)| *k == "vertz" || k.starts_with("@vertz/"))
        .and_then(|(_, v)| v.as_str())
        .unwrap_or("^0.2.0")
        .to_string();

    // Ensure devDependencies exists and insert
    let obj = pkg
        .as_object_mut()
        .ok_or_else(|| deno_core::error::generic_error("package.json is not an object"))?;
    let dev_deps = obj
        .entry("devDependencies")
        .or_insert_with(|| serde_json::json!({}));
    let dev_deps = dev_deps
        .as_object_mut()
        .ok_or_else(|| deno_core::error::generic_error("devDependencies is not an object"))?;

    dev_deps.insert(
        "@vertz/test".to_string(),
        serde_json::Value::String(version),
    );

    if !dry_run {
        let formatted = serde_json::to_string_pretty(&pkg)? + "\n";
        std::fs::write(&pkg_path, formatted)?;
    }

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_migrate_bun_test_import_single_quotes() {
        let source = "import { describe, it, expect } from 'bun:test';\n\ndescribe('x', () => {});";
        let (result, changes) = migrate_source(source);
        assert!(result.contains("'@vertz/test'"));
        assert!(!result.contains("'bun:test'"));
        assert_eq!(changes.len(), 1);
    }

    #[test]
    fn test_migrate_bun_test_import_double_quotes() {
        let source = "import { describe, it } from \"bun:test\";\n";
        let (result, changes) = migrate_source(source);
        assert!(result.contains("\"@vertz/test\""));
        assert!(!changes.is_empty());
    }

    #[test]
    fn test_migrate_vi_fn_to_mock() {
        let source = "const fn = vi.fn();\nconst fn2 = vi.fn(() => 42);\n";
        let (result, changes) = migrate_source(source);
        assert!(result.contains("mock()"));
        assert!(result.contains("mock(() => 42)"));
        assert!(!result.contains("vi.fn("));
        assert!(changes.iter().any(|c| c.contains("vi.fn()")));
    }

    #[test]
    fn test_migrate_vi_spyon_to_spyon() {
        let source = "const spy = vi.spyOn(obj, 'method');\n";
        let (result, changes) = migrate_source(source);
        assert!(result.contains("spyOn(obj, 'method')"));
        assert!(!result.contains("vi.spyOn("));
        assert!(changes.iter().any(|c| c.contains("vi.spyOn()")));
    }

    #[test]
    fn test_migrate_no_changes_needed() {
        let source =
            "import { describe, it, expect } from '@vertz/test';\n\ndescribe('x', () => {});";
        let (result, changes) = migrate_source(source);
        assert_eq!(result, source);
        assert!(changes.is_empty());
    }

    #[test]
    fn test_migrate_combined_changes() {
        let source = r#"import { describe, it, expect, vi } from 'bun:test';

describe('test', () => {
  const fn = vi.fn();
  const spy = vi.spyOn(console, 'log');
  it('works', () => {
    expect(fn).toHaveBeenCalled();
  });
});
"#;
        let (result, changes) = migrate_source(source);
        assert!(result.contains("'@vertz/test'"));
        assert!(result.contains("mock("));
        assert!(result.contains("spyOn(console"));
        assert!(!result.contains("vi.fn("));
        assert!(!result.contains("vi.spyOn("));
        assert!(changes.len() >= 3);
    }

    #[test]
    fn test_migrate_tests_dry_run() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir_all(tmp.path().join("src")).unwrap();
        let file = tmp.path().join("src/math.test.ts");
        let original = "import { describe, it, expect } from 'bun:test';\ndescribe('x', () => { it('y', () => { expect(1).toBe(1); }); });";
        fs::write(&file, original).unwrap();

        let result = migrate_tests(tmp.path(), true).unwrap();

        assert_eq!(result.total_files, 1);
        assert_eq!(result.files_changed, 1);
        // File should NOT be modified in dry-run
        let actual = fs::read_to_string(&file).unwrap();
        assert_eq!(actual, original);
    }

    #[test]
    fn test_migrate_tests_writes_files() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir_all(tmp.path().join("src")).unwrap();
        let file = tmp.path().join("src/math.test.ts");
        fs::write(&file, "import { describe, it, expect } from 'bun:test';\ndescribe('x', () => { it('y', () => { expect(1).toBe(1); }); });").unwrap();

        let result = migrate_tests(tmp.path(), false).unwrap();

        assert_eq!(result.files_changed, 1);
        let migrated = fs::read_to_string(&file).unwrap();
        assert!(migrated.contains("'@vertz/test'"));
    }

    #[test]
    fn test_format_migrate_output_dry_run() {
        let result = MigrateResult {
            total_files: 3,
            files_changed: 2,
            files: vec![
                MigrateFileResult {
                    path: PathBuf::from("src/a.test.ts"),
                    changed: true,
                    changes: vec!["Rewrote import".to_string()],
                },
                MigrateFileResult {
                    path: PathBuf::from("src/b.test.ts"),
                    changed: false,
                    changes: vec![],
                },
                MigrateFileResult {
                    path: PathBuf::from("src/c.test.ts"),
                    changed: true,
                    changes: vec!["Rewrote vi.fn()".to_string()],
                },
            ],
        };

        let output = format_migrate_output(&result, true);
        assert!(output.contains("Dry run"));
        assert!(output.contains("2 of 3"));
        assert!(output.contains("would be migrated"));
    }

    #[test]
    fn test_format_migrate_output_no_changes() {
        let result = MigrateResult {
            total_files: 5,
            files_changed: 0,
            files: vec![],
        };

        let output = format_migrate_output(&result, false);
        assert!(output.contains("No files needed migration"));
    }

    #[test]
    fn test_add_vertz_test_dep_adds_to_dev_dependencies() {
        let tmp = tempfile::tempdir().unwrap();
        let pkg_json = tmp.path().join("package.json");
        fs::write(
            &pkg_json,
            r#"{
  "name": "my-app",
  "devDependencies": {
    "@vertz/cli": "^0.2.0",
    "typescript": "^5.8.0"
  }
}"#,
        )
        .unwrap();

        let changed = add_vertz_test_dep(tmp.path(), false).unwrap();
        assert!(changed);

        let updated: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&pkg_json).unwrap()).unwrap();
        assert_eq!(
            updated["devDependencies"]["@vertz/test"].as_str().unwrap(),
            "^0.2.0"
        );
    }

    #[test]
    fn test_add_vertz_test_dep_uses_existing_vertz_version() {
        let tmp = tempfile::tempdir().unwrap();
        let pkg_json = tmp.path().join("package.json");
        fs::write(
            &pkg_json,
            r#"{
  "name": "my-app",
  "dependencies": {
    "vertz": "^0.3.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}"#,
        )
        .unwrap();

        add_vertz_test_dep(tmp.path(), false).unwrap();

        let updated: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&pkg_json).unwrap()).unwrap();
        assert_eq!(
            updated["devDependencies"]["@vertz/test"].as_str().unwrap(),
            "^0.3.0"
        );
    }

    #[test]
    fn test_add_vertz_test_dep_skips_if_already_present() {
        let tmp = tempfile::tempdir().unwrap();
        let pkg_json = tmp.path().join("package.json");
        fs::write(
            &pkg_json,
            r#"{
  "name": "my-app",
  "devDependencies": {
    "@vertz/test": "^0.2.0"
  }
}"#,
        )
        .unwrap();

        let changed = add_vertz_test_dep(tmp.path(), false).unwrap();
        assert!(!changed);
    }

    #[test]
    fn test_add_vertz_test_dep_dry_run_does_not_write() {
        let tmp = tempfile::tempdir().unwrap();
        let pkg_json = tmp.path().join("package.json");
        let original = r#"{
  "name": "my-app",
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}"#;
        fs::write(&pkg_json, original).unwrap();

        let changed = add_vertz_test_dep(tmp.path(), true).unwrap();
        assert!(changed);

        let actual = fs::read_to_string(&pkg_json).unwrap();
        assert_eq!(actual, original);
    }

    #[test]
    fn test_add_vertz_test_dep_no_package_json() {
        let tmp = tempfile::tempdir().unwrap();
        let changed = add_vertz_test_dep(tmp.path(), false).unwrap();
        assert!(!changed);
    }

    #[test]
    fn test_add_vertz_test_dep_preserves_key_order() {
        let tmp = tempfile::tempdir().unwrap();
        let pkg_json = tmp.path().join("package.json");
        fs::write(
            &pkg_json,
            r#"{
  "name": "my-app",
  "version": "1.0.0",
  "scripts": {},
  "dependencies": {
    "vertz": "^0.2.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}"#,
        )
        .unwrap();

        add_vertz_test_dep(tmp.path(), false).unwrap();

        let content = fs::read_to_string(&pkg_json).unwrap();
        let name_pos = content.find("\"name\"").unwrap();
        let version_pos = content.find("\"version\"").unwrap();
        let scripts_pos = content.find("\"scripts\"").unwrap();
        let deps_pos = content.find("\"dependencies\"").unwrap();
        let dev_deps_pos = content.find("\"devDependencies\"").unwrap();

        assert!(name_pos < version_pos);
        assert!(version_pos < scripts_pos);
        assert!(scripts_pos < deps_pos);
        assert!(deps_pos < dev_deps_pos);
    }
}
