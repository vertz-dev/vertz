use std::path::{Path, PathBuf};

/// Resolve a package specifier from node_modules using package.json exports.
///
/// Returns the fully-resolved file path within node_modules.
///
/// Handles:
/// - `@vertz/ui` → node_modules/@vertz/ui/dist/src/index.js (via "." export)
/// - `@vertz/ui/internals` → node_modules/@vertz/ui/dist/src/internals.js (via "./internals" export)
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
            if full_path.is_file() {
                return Some(full_path);
            }
        }
    }

    // Fallback: try "module" then "main" field
    if subpath.is_empty() {
        if let Some(module) = pkg.get("module").and_then(|v| v.as_str()) {
            let full_path = pkg_dir.join(module);
            if full_path.is_file() {
                return Some(full_path);
            }
        }
        if let Some(main) = pkg.get("main").and_then(|v| v.as_str()) {
            let full_path = pkg_dir.join(main);
            if full_path.is_file() {
                return Some(full_path);
            }
        }
    }

    None
}

/// Convert a resolved file path back to a `/@deps/` URL that preserves
/// the file tree structure within node_modules.
///
/// This is critical: by using the full file path (e.g., `/@deps/@vertz/ui/dist/src/internals.js`)
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
            if key == "." {
                Some(s.clone())
            } else {
                None
            }
        }
        serde_json::Value::Object(map) => {
            if let Some(entry) = map.get(key) {
                // Entry can be a string or a conditions object
                match entry {
                    serde_json::Value::String(s) => Some(s.clone()),
                    serde_json::Value::Object(conditions) => {
                        // Try: import > module > default
                        resolve_condition_value(conditions)
                    }
                    _ => None,
                }
            } else {
                None
            }
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
                serde_json::Value::String(s) => return Some(s.clone()),
                serde_json::Value::Object(nested) => {
                    // Nested conditions (e.g., import: { types: "...", default: "..." })
                    // Skip "types" entries, look for "default" or any non-types string
                    if let Some(default_val) = nested.get("default") {
                        if let Some(s) = default_val.as_str() {
                            return Some(s.to_string());
                        }
                    }
                    // Try any string value that isn't a .d.ts
                    for (_, v) in nested {
                        if let Some(s) = v.as_str() {
                            if !s.ends_with(".d.ts") && !s.ends_with(".d.mts") {
                                return Some(s.to_string());
                            }
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

        // Create @vertz/ui package with exports
        let pkg_dir = root.join("node_modules/@vertz/ui");
        std::fs::create_dir_all(pkg_dir.join("dist/src")).unwrap();
        std::fs::write(pkg_dir.join("dist/src/index.js"), "export {}").unwrap();
        std::fs::write(pkg_dir.join("dist/src/internals.js"), "export {}").unwrap();
        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{
                "name": "@vertz/ui",
                "exports": {
                    ".": "./dist/src/index.js",
                    "./internals": "./dist/src/internals.js"
                }
            }"#,
        )
        .unwrap();

        let resolved = resolve_from_node_modules("@vertz/ui", root);
        assert_eq!(resolved, Some(pkg_dir.join("dist/src/index.js")));

        let resolved = resolve_from_node_modules("@vertz/ui/internals", root);
        assert_eq!(resolved, Some(pkg_dir.join("dist/src/internals.js")));
    }

    #[test]
    fn test_resolve_to_deps_url() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        let pkg_dir = root.join("node_modules/@vertz/ui");
        std::fs::create_dir_all(pkg_dir.join("dist/src")).unwrap();
        std::fs::write(pkg_dir.join("dist/src/internals.js"), "export {}").unwrap();
        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{
                "name": "@vertz/ui",
                "exports": {
                    "./internals": "./dist/src/internals.js"
                }
            }"#,
        )
        .unwrap();

        let url = resolve_to_deps_url("@vertz/ui/internals", root);
        assert_eq!(url, "/@deps/@vertz/ui/dist/src/internals.js");
    }

    #[test]
    fn test_resolve_to_deps_url_fallback() {
        let tmp = tempfile::tempdir().unwrap();
        // No node_modules — should fall back
        let url = resolve_to_deps_url("unknown-pkg", tmp.path());
        assert_eq!(url, "/@deps/unknown-pkg");
    }
}
