use std::path::{Path, PathBuf};

/// Resolve a package specifier from node_modules using package.json exports.
///
/// Returns the fully-resolved file path within node_modules.
///
/// Handles:
/// - `@vertz/ui` → node_modules/@vertz/ui/dist/index.js (via "." export)
/// - `@vertz/ui/internals` → node_modules/@vertz/ui/dist/internals.js (via "./internals" export)
/// - `zod` → node_modules/zod/lib/index.mjs (via "." export)
pub fn resolve_from_node_modules(specifier: &str, root_dir: &Path) -> Option<PathBuf> {
    let (pkg_name, subpath) = split_package_specifier(specifier);

    // Walk up directories looking for node_modules/<pkg> (monorepo support).
    // Start from root_dir, walk up to filesystem root.
    let mut search_dir = Some(root_dir.to_path_buf());
    while let Some(dir) = search_dir {
        let pkg_dir = dir.join("node_modules").join(pkg_name);
        if let Some(resolved) = resolve_package_entry(&pkg_dir, subpath) {
            return Some(resolved);
        }
        search_dir = dir.parent().map(|p| p.to_path_buf());
    }

    None
}

/// Try to resolve the entry point from a package directory.
fn resolve_package_entry(pkg_dir: &Path, subpath: &str) -> Option<PathBuf> {
    let pkg_json_path = pkg_dir.join("package.json");
    let pkg_json = std::fs::read_to_string(&pkg_json_path).ok()?;
    let pkg: serde_json::Value = serde_json::from_str(&pkg_json).ok()?;

    // Try exports field first
    if let Some(exports) = pkg.get("exports") {
        let export_key = if subpath.is_empty() {
            ".".to_string()
        } else {
            format!("./{}", subpath)
        };

        if let Some(resolved) = resolve_export_entry(exports, &export_key) {
            let full_path = pkg_dir.join(resolved.trim_start_matches("./"));
            // is_file() must precede path_stays_within() so canonicalize() succeeds
            if full_path.is_file() && path_stays_within(pkg_dir, &full_path) {
                return Some(full_path);
            }
        }
    }

    // Fallback: try "module" then "main" field
    if subpath.is_empty() {
        if let Some(module) = pkg.get("module").and_then(|v| v.as_str()) {
            let full_path = pkg_dir.join(module);
            // is_file() must precede path_stays_within() so canonicalize() succeeds
            if full_path.is_file() && path_stays_within(pkg_dir, &full_path) {
                return Some(full_path);
            }
        }
        if let Some(main) = pkg.get("main").and_then(|v| v.as_str()) {
            let full_path = pkg_dir.join(main);
            // is_file() must precede path_stays_within() so canonicalize() succeeds
            if full_path.is_file() && path_stays_within(pkg_dir, &full_path) {
                return Some(full_path);
            }
        }
    }

    None
}

/// Convert a resolved file path back to a `/@deps/` URL that preserves
/// the file tree structure within node_modules.
///
/// This is critical: by using the full file path (e.g., `/@deps/@vertz/ui/dist/internals.js`)
/// instead of just the specifier (e.g., `/@deps/@vertz/ui/internals`), relative imports
/// within the package (like `../shared/chunk-xyz.js`) resolve correctly in the browser.
pub fn resolve_to_deps_url(specifier: &str, root_dir: &Path) -> String {
    resolve_to_deps_url_from(specifier, root_dir, root_dir)
}

/// Resolve a bare specifier to a `/@deps/` URL, starting resolution from `resolve_from`.
///
/// When rewriting imports in dependency files (served from `/@deps/`), `resolve_from`
/// should be the file's parent directory — matching Node.js resolution behavior where
/// packages are found by walking up from the importing file.
pub fn resolve_to_deps_url_from(specifier: &str, _root_dir: &Path, resolve_from: &Path) -> String {
    if let Some(resolved_path) = resolve_from_node_modules(specifier, resolve_from) {
        // Extract the path relative to the nearest `node_modules/` ancestor.
        // The resolved path may be in root_dir/node_modules or a parent's node_modules.
        let path_str = resolved_path.to_string_lossy();
        if let Some(nm_idx) = path_str.rfind("/node_modules/") {
            let rel = &path_str[nm_idx + "/node_modules/".len()..];
            return format!("/@deps/{}", rel);
        }
    }

    // Fallback: just prepend /@deps/
    format!("/@deps/{}", specifier)
}

/// Split a package specifier into (package_name, subpath).
///
/// - `@vertz/ui/internals` → (`@vertz/ui`, `internals`)
/// - `@vertz/ui` → (`@vertz/ui`, ``)
/// - `zod` → (`zod`, ``)
/// - `zod/lib/something` → (`zod`, `lib/something`)
pub fn split_package_specifier(specifier: &str) -> (&str, &str) {
    if specifier.starts_with('@') {
        // Scoped package: @scope/name[/subpath]
        if let Some(slash_pos) = specifier.find('/') {
            if let Some(second_slash) = specifier[slash_pos + 1..].find('/') {
                let split_at = slash_pos + 1 + second_slash;
                (&specifier[..split_at], &specifier[split_at + 1..])
            } else {
                (specifier, "")
            }
        } else {
            (specifier, "")
        }
    } else {
        // Regular package: name[/subpath]
        if let Some(slash_pos) = specifier.find('/') {
            (&specifier[..slash_pos], &specifier[slash_pos + 1..])
        } else {
            (specifier, "")
        }
    }
}

/// Resolve a single export entry from the exports map.
/// Handles both string values and condition objects.
fn resolve_export_entry(exports: &serde_json::Value, key: &str) -> Option<String> {
    match exports {
        serde_json::Value::String(s) => {
            // Simple string export: "exports": "./dist/index.js"
            if key == "." && is_safe_export_target(s) {
                Some(s.clone())
            } else {
                None
            }
        }
        // Top-level array fallback: "exports": [{ "import": "./esm.js" }, "./fallback.js"]
        serde_json::Value::Array(_) => {
            if key == "." {
                resolve_condition_value_from_entry(exports)
            } else {
                None
            }
        }
        serde_json::Value::Object(map) => {
            if let Some(entry) = map.get(key) {
                resolve_condition_value_from_entry(entry)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Check that an export target is safe: starts with "./" and contains no ".." traversal.
fn is_safe_export_target(target: &str) -> bool {
    target.starts_with("./") && !target.contains("..")
}

/// Check that a resolved path stays within the package directory.
/// Uses canonicalization to resolve symlinks and `..` components.
fn path_stays_within(pkg_dir: &Path, full_path: &Path) -> bool {
    match (pkg_dir.canonicalize(), full_path.canonicalize()) {
        (Ok(canon_dir), Ok(canon_path)) => canon_path.starts_with(&canon_dir),
        _ => false,
    }
}

/// Resolve a condition value from an exports entry.
/// Handles strings, condition objects, and array fallbacks.
/// Rejects targets that don't start with "./" or contain path traversal.
fn resolve_condition_value_from_entry(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(s) => {
            if is_safe_export_target(s) {
                Some(s.clone())
            } else {
                None
            }
        }
        serde_json::Value::Object(conditions) => resolve_condition_value(conditions),
        serde_json::Value::Array(arr) => {
            // Array fallback: first matching entry wins
            for entry in arr {
                if let Some(resolved) = resolve_condition_value_from_entry(entry) {
                    return Some(resolved);
                }
            }
            None
        }
        _ => None,
    }
}

/// Resolve a condition value, handling both string and nested object values.
///
/// Handles cases like:
/// - `"import": "./dist/index.mjs"` → `Some("./dist/index.mjs")`
/// - `"import": { "types": "...", "default": "./dist/index.mjs" }` → `Some("./dist/index.mjs")`
fn resolve_condition_value(
    conditions: &serde_json::Map<String, serde_json::Value>,
) -> Option<String> {
    // Priority: import > module > default
    for key in &["import", "module", "default"] {
        if let Some(val) = conditions.get(*key) {
            match val {
                serde_json::Value::String(s) => {
                    if is_safe_export_target(s) {
                        return Some(s.clone());
                    }
                }
                serde_json::Value::Object(nested) => {
                    // Nested conditions (e.g., import: { types: "...", default: "..." })
                    // Skip "types" entries, look for "default" or any non-types string
                    if let Some(default_val) = nested.get("default") {
                        if let Some(s) = default_val.as_str() {
                            if is_safe_export_target(s) {
                                return Some(s.to_string());
                            }
                        }
                    }
                    // Try any string value that isn't a .d.ts
                    for (_, v) in nested {
                        if let Some(s) = v.as_str() {
                            if !s.ends_with(".d.ts")
                                && !s.ends_with(".d.mts")
                                && is_safe_export_target(s)
                            {
                                return Some(s.to_string());
                            }
                        }
                    }
                }
                serde_json::Value::Array(arr) => {
                    // Array fallback within a condition
                    for entry in arr {
                        if let Some(resolved) = resolve_condition_value_from_entry(entry) {
                            return Some(resolved);
                        }
                    }
                }
                _ => {}
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_package_specifier_scoped() {
        assert_eq!(split_package_specifier("@vertz/ui"), ("@vertz/ui", ""));
    }

    #[test]
    fn test_split_package_specifier_scoped_with_subpath() {
        assert_eq!(
            split_package_specifier("@vertz/ui/internals"),
            ("@vertz/ui", "internals")
        );
    }

    #[test]
    fn test_split_package_specifier_scoped_with_deep_subpath() {
        assert_eq!(
            split_package_specifier("@vertz/ui/components/Button"),
            ("@vertz/ui", "components/Button")
        );
    }

    #[test]
    fn test_split_package_specifier_unscoped() {
        assert_eq!(split_package_specifier("zod"), ("zod", ""));
    }

    #[test]
    fn test_split_package_specifier_unscoped_with_subpath() {
        assert_eq!(
            split_package_specifier("zod/lib/something"),
            ("zod", "lib/something")
        );
    }

    #[test]
    fn test_resolve_export_entry_string() {
        let exports = serde_json::json!("./dist/index.js");
        assert_eq!(
            resolve_export_entry(&exports, "."),
            Some("./dist/index.js".to_string())
        );
        assert_eq!(resolve_export_entry(&exports, "./internals"), None);
    }

    #[test]
    fn test_resolve_export_entry_object_string_values() {
        let exports = serde_json::json!({
            ".": "./dist/index.js",
            "./internals": "./dist/internals.js"
        });
        assert_eq!(
            resolve_export_entry(&exports, "."),
            Some("./dist/index.js".to_string())
        );
        assert_eq!(
            resolve_export_entry(&exports, "./internals"),
            Some("./dist/internals.js".to_string())
        );
    }

    #[test]
    fn test_resolve_export_entry_conditions() {
        let exports = serde_json::json!({
            ".": {
                "import": "./dist/index.mjs",
                "require": "./dist/index.cjs",
                "default": "./dist/index.js"
            }
        });
        assert_eq!(
            resolve_export_entry(&exports, "."),
            Some("./dist/index.mjs".to_string())
        );
    }

    #[test]
    fn test_resolve_export_entry_conditions_default_fallback() {
        let exports = serde_json::json!({
            ".": {
                "require": "./dist/index.cjs",
                "default": "./dist/index.js"
            }
        });
        assert_eq!(
            resolve_export_entry(&exports, "."),
            Some("./dist/index.js".to_string())
        );
    }

    #[test]
    fn test_resolve_from_node_modules_with_exports() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        // Create @vertz/ui package with exports (matching real package structure)
        let pkg_dir = root.join("node_modules/@vertz/ui");
        std::fs::create_dir_all(pkg_dir.join("dist")).unwrap();
        std::fs::write(pkg_dir.join("dist/index.js"), "export {}").unwrap();
        std::fs::write(pkg_dir.join("dist/internals.js"), "export {}").unwrap();
        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{
                "name": "@vertz/ui",
                "exports": {
                    ".": "./dist/index.js",
                    "./internals": "./dist/internals.js"
                }
            }"#,
        )
        .unwrap();

        let resolved = resolve_from_node_modules("@vertz/ui", root);
        assert_eq!(resolved, Some(pkg_dir.join("dist/index.js")));

        let resolved = resolve_from_node_modules("@vertz/ui/internals", root);
        assert_eq!(resolved, Some(pkg_dir.join("dist/internals.js")));
    }

    #[test]
    fn test_resolve_to_deps_url() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        let pkg_dir = root.join("node_modules/@vertz/ui");
        std::fs::create_dir_all(pkg_dir.join("dist")).unwrap();
        std::fs::write(pkg_dir.join("dist/internals.js"), "export {}").unwrap();
        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{
                "name": "@vertz/ui",
                "exports": {
                    "./internals": "./dist/internals.js"
                }
            }"#,
        )
        .unwrap();

        let url = resolve_to_deps_url("@vertz/ui/internals", root);
        assert_eq!(url, "/@deps/@vertz/ui/dist/internals.js");
    }

    #[test]
    fn test_resolve_to_deps_url_fallback() {
        let tmp = tempfile::tempdir().unwrap();
        // No node_modules — should fall back
        let url = resolve_to_deps_url("unknown-pkg", tmp.path());
        assert_eq!(url, "/@deps/unknown-pkg");
    }

    #[test]
    fn test_resolve_export_entry_array_fallback() {
        // Array fallback: first matching string wins
        let exports = serde_json::json!({
            ".": ["./dist/main.js", "./dist/alt.js"]
        });
        assert_eq!(
            resolve_export_entry(&exports, "."),
            Some("./dist/main.js".to_string())
        );
    }

    #[test]
    fn test_resolve_export_entry_array_with_conditions() {
        // Array fallback with condition objects
        let exports = serde_json::json!({
            ".": [{ "import": "./dist/esm.js" }, "./dist/fallback.js"]
        });
        assert_eq!(
            resolve_export_entry(&exports, "."),
            Some("./dist/esm.js".to_string())
        );
    }

    #[test]
    fn test_resolve_export_entry_rejects_path_traversal() {
        // Direct parent traversal
        let exports = serde_json::json!("../../etc/passwd");
        assert_eq!(resolve_export_entry(&exports, "."), None);

        // Traversal hidden after "./"
        let exports = serde_json::json!("./../../etc/passwd");
        assert_eq!(resolve_export_entry(&exports, "."), None);

        // Absolute path
        let exports = serde_json::json!("/etc/passwd");
        assert_eq!(resolve_export_entry(&exports, "."), None);

        // Bare filename (no ./ prefix)
        let exports = serde_json::json!("dist/index.js");
        assert_eq!(resolve_export_entry(&exports, "."), None);
    }

    #[test]
    fn test_resolve_export_entry_rejects_buried_traversal() {
        // Traversal hidden deep in a valid-looking path
        let exports = serde_json::json!("./dist/../../../etc/passwd");
        assert_eq!(resolve_export_entry(&exports, "."), None);

        let exports = serde_json::json!({
            ".": "./lib/utils/../../secret.js"
        });
        assert_eq!(resolve_export_entry(&exports, "."), None);
    }

    #[test]
    fn test_resolve_export_entry_rejects_traversal_in_conditions() {
        let exports = serde_json::json!({
            ".": {
                "import": "../../etc/passwd",
                "default": "../secret.js"
            }
        });
        assert_eq!(resolve_export_entry(&exports, "."), None);
    }

    #[test]
    fn test_resolve_export_entry_rejects_traversal_in_object_values() {
        let exports = serde_json::json!({
            ".": "../../etc/passwd",
            "./utils": "../../../secret.js"
        });
        assert_eq!(resolve_export_entry(&exports, "."), None);
        assert_eq!(resolve_export_entry(&exports, "./utils"), None);
    }

    #[test]
    fn test_resolve_export_entry_rejects_traversal_in_array_fallback() {
        let exports = serde_json::json!({
            ".": ["../../etc/passwd", "../secret.js"]
        });
        assert_eq!(resolve_export_entry(&exports, "."), None);
    }

    #[test]
    fn test_resolve_export_entry_rejects_traversal_in_nested_conditions() {
        let exports = serde_json::json!({
            ".": {
                "import": {
                    "types": "./types.d.ts",
                    "default": "./../../etc/passwd"
                }
            }
        });
        assert_eq!(resolve_export_entry(&exports, "."), None);
    }

    #[test]
    fn test_resolve_package_entry_rejects_traversal_in_module_field() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        let pkg_dir = root.join("node_modules/evil-pkg");
        std::fs::create_dir_all(&pkg_dir).unwrap();

        // Create a file outside the package that the traversal would resolve to
        std::fs::write(root.join("secret.js"), "secret").unwrap();

        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{ "name": "evil-pkg", "module": "../../secret.js" }"#,
        )
        .unwrap();

        let resolved = resolve_from_node_modules("evil-pkg", root);
        assert_eq!(resolved, None);
    }

    #[test]
    fn test_resolve_package_entry_rejects_traversal_in_main_field() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        let pkg_dir = root.join("node_modules/evil-pkg");
        std::fs::create_dir_all(&pkg_dir).unwrap();

        // Create a file outside the package that the traversal would resolve to
        std::fs::write(root.join("secret.js"), "secret").unwrap();

        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{ "name": "evil-pkg", "main": "../../secret.js" }"#,
        )
        .unwrap();

        let resolved = resolve_from_node_modules("evil-pkg", root);
        assert_eq!(resolved, None);
    }

    #[test]
    fn test_resolve_package_entry_rejects_traversal_in_exports() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        let pkg_dir = root.join("node_modules/evil-pkg");
        std::fs::create_dir_all(pkg_dir.join("dist")).unwrap();

        // Create a file outside the package that the traversal would resolve to
        std::fs::write(root.join("secret.js"), "secret").unwrap();

        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{ "name": "evil-pkg", "exports": { ".": "../../secret.js" } }"#,
        )
        .unwrap();

        let resolved = resolve_from_node_modules("evil-pkg", root);
        assert_eq!(resolved, None);
    }

    #[test]
    fn test_resolve_export_entry_top_level_array() {
        // Top-level array: "exports": [{ "import": "./esm.js" }, "./fallback.js"]
        let exports = serde_json::json!([{ "import": "./dist/esm.js" }, "./dist/fallback.js"]);
        assert_eq!(
            resolve_export_entry(&exports, "."),
            Some("./dist/esm.js".to_string())
        );
        // Subpath on top-level array should return None
        assert_eq!(resolve_export_entry(&exports, "./utils"), None);
    }
}
