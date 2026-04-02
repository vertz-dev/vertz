use std::path::{Path, PathBuf};

/// A linked workspace package discovered in node_modules/.
#[derive(Debug, Clone)]
pub struct LinkedPackage {
    /// Package name (e.g., "@vertz/ui").
    pub name: String,
    /// Canonicalized symlink target (absolute path to workspace package root).
    pub target: PathBuf,
    /// Name of the output directory (e.g., "dist", "build"), if detected.
    pub output_dir_name: Option<String>,
}

/// A watched target — either an auto-discovered linked package or an explicit extra path.
#[derive(Debug, Clone)]
pub struct WatchTarget {
    /// The directory to watch (canonicalized absolute path).
    pub watch_dir: PathBuf,
    /// The output subdirectory name to filter events to (e.g., "dist", "build").
    /// None for extraWatchPaths (watch everything in the directory).
    pub output_dir_name: Option<String>,
    /// The package name, if this is an auto-discovered linked package.
    /// None for extraWatchPaths.
    pub package_name: Option<String>,
}

/// Discover linked workspace packages by scanning node_modules/ for symlinks.
///
/// All symlink targets are canonicalized via `fs::canonicalize()`.
/// This is required because FSEvents (macOS) and inotify (Linux) do NOT
/// follow symlinks — watching a symlink path produces zero events.
pub fn discover_linked_packages(root_dir: &Path) -> Vec<LinkedPackage> {
    let nm_dir = root_dir.join("node_modules");
    if !nm_dir.exists() {
        return Vec::new();
    }

    let mut packages = Vec::new();

    let entries = match std::fs::read_dir(&nm_dir) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        if name.starts_with('@') {
            // Scoped package — scan subdirectory
            let scope_dir = entry.path();
            if scope_dir.is_dir() {
                if let Ok(sub_entries) = std::fs::read_dir(&scope_dir) {
                    for sub in sub_entries.flatten() {
                        let sub_name = format!("{}/{}", name, sub.file_name().to_string_lossy());
                        if let Some(pkg) = check_symlink_entry(&sub.path(), &sub_name) {
                            packages.push(pkg);
                        }
                    }
                }
            }
        } else if let Some(pkg) = check_symlink_entry(&entry.path(), &name) {
            packages.push(pkg);
        }
    }

    packages
}

/// Check if a node_modules entry is a symlink and, if so, build a LinkedPackage.
fn check_symlink_entry(path: &Path, name: &str) -> Option<LinkedPackage> {
    // Check if the entry is a symlink using symlink_metadata
    let metadata = std::fs::symlink_metadata(path).ok()?;
    if !metadata.file_type().is_symlink() {
        return None;
    }

    // Canonicalize the symlink target
    let target = std::fs::canonicalize(path).ok()?;

    // Detect output directory from package.json
    let output_dir_name = detect_output_dir(&target);

    Some(LinkedPackage {
        name: name.to_string(),
        target,
        output_dir_name,
    })
}

/// Detect the output directory for a package by reading its package.json.
///
/// Priority:
/// 1. exports["."].import or exports["."].default → extract directory
/// 2. module field → extract directory
/// 3. main field → extract directory
/// 4. dist/ directory exists
/// 5. build/ directory exists
/// 6. None
fn detect_output_dir(pkg_root: &Path) -> Option<String> {
    let pkg_json_path = pkg_root.join("package.json");
    let content = std::fs::read_to_string(&pkg_json_path).ok()?;
    let pkg: serde_json::Value = serde_json::from_str(&content).ok()?;

    // Try exports field first
    if let Some(exports) = pkg.get("exports") {
        if let Some(dir) = extract_dir_from_exports(exports) {
            return Some(dir);
        }
    }

    // Try module field
    if let Some(module) = pkg.get("module").and_then(|v| v.as_str()) {
        if let Some(dir) = extract_first_dir(module) {
            return Some(dir);
        }
    }

    // Try main field
    if let Some(main) = pkg.get("main").and_then(|v| v.as_str()) {
        if let Some(dir) = extract_first_dir(main) {
            return Some(dir);
        }
    }

    // Fallback: check if dist/ or build/ exists
    if pkg_root.join("dist").is_dir() {
        return Some("dist".to_string());
    }
    if pkg_root.join("build").is_dir() {
        return Some("build".to_string());
    }

    None
}

/// Extract the first directory segment from an export path like "./dist/index.js".
fn extract_first_dir(path: &str) -> Option<String> {
    let cleaned = path.strip_prefix("./").unwrap_or(path);
    let first_segment = cleaned.split('/').next()?;
    if first_segment.is_empty() || first_segment.contains('.') {
        // It's a file directly (e.g., "index.js"), not a directory
        return None;
    }
    Some(first_segment.to_string())
}

/// Extract the output directory from the exports field.
fn extract_dir_from_exports(exports: &serde_json::Value) -> Option<String> {
    match exports {
        serde_json::Value::String(s) => extract_first_dir(s),
        serde_json::Value::Object(map) => {
            // Look for "." entry
            if let Some(entry) = map.get(".") {
                match entry {
                    serde_json::Value::String(s) => extract_first_dir(s),
                    serde_json::Value::Object(conditions) => {
                        // Try import > module > default
                        for key in &["import", "module", "default"] {
                            if let Some(val) = conditions.get(*key) {
                                match val {
                                    serde_json::Value::String(s) => {
                                        if let Some(dir) = extract_first_dir(s) {
                                            return Some(dir);
                                        }
                                    }
                                    serde_json::Value::Object(nested) => {
                                        // Handle nested conditions like import: { types: "...", default: "..." }
                                        if let Some(default_val) = nested.get("default") {
                                            if let Some(s) = default_val.as_str() {
                                                if let Some(dir) = extract_first_dir(s) {
                                                    return Some(dir);
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
                    _ => None,
                }
            } else {
                None
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_returns_empty_when_node_modules_missing() {
        let dir = tempfile::tempdir().unwrap();
        let result = discover_linked_packages(dir.path());
        assert!(result.is_empty());
    }

    #[test]
    fn test_skips_non_symlink_entries() {
        let dir = tempfile::tempdir().unwrap();
        let nm = dir.path().join("node_modules");
        let pkg_dir = nm.join("zod");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "zod", "main": "lib/index.js"}"#,
        )
        .unwrap();

        let result = discover_linked_packages(dir.path());
        assert!(result.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn test_discovers_symlinked_unscoped_package() {
        let dir = tempfile::tempdir().unwrap();
        let nm = dir.path().join("node_modules");
        std::fs::create_dir_all(&nm).unwrap();

        // Create the actual package directory
        let real_pkg = dir.path().join("packages").join("my-lib");
        std::fs::create_dir_all(real_pkg.join("dist")).unwrap();
        std::fs::write(
            real_pkg.join("package.json"),
            r#"{"name": "my-lib", "main": "./dist/index.js"}"#,
        )
        .unwrap();

        // Create symlink in node_modules
        std::os::unix::fs::symlink(&real_pkg, nm.join("my-lib")).unwrap();

        let result = discover_linked_packages(dir.path());
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "my-lib");
        assert_eq!(result[0].target, std::fs::canonicalize(&real_pkg).unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn test_discovers_scoped_symlinked_package() {
        let dir = tempfile::tempdir().unwrap();
        let nm = dir.path().join("node_modules");
        let scope_dir = nm.join("@myorg");
        std::fs::create_dir_all(&scope_dir).unwrap();

        // Create the actual package directory
        let real_pkg = dir.path().join("packages").join("ui");
        std::fs::create_dir_all(real_pkg.join("dist")).unwrap();
        std::fs::write(
            real_pkg.join("package.json"),
            r#"{"name": "@myorg/ui", "exports": {".": "./dist/index.js"}}"#,
        )
        .unwrap();

        // Create symlink in node_modules/@myorg/
        std::os::unix::fs::symlink(&real_pkg, scope_dir.join("ui")).unwrap();

        let result = discover_linked_packages(dir.path());
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "@myorg/ui");
        assert_eq!(result[0].target, std::fs::canonicalize(&real_pkg).unwrap());
        assert_eq!(result[0].output_dir_name, Some("dist".to_string()));
    }

    #[test]
    fn test_detect_output_dir_from_exports_string() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"exports": "./dist/index.js"}"#,
        )
        .unwrap();
        assert_eq!(detect_output_dir(dir.path()), Some("dist".to_string()));
    }

    #[test]
    fn test_detect_output_dir_from_exports_dot_import() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"exports": {".": {"import": "./lib/index.mjs", "default": "./lib/index.js"}}}"#,
        )
        .unwrap();
        assert_eq!(detect_output_dir(dir.path()), Some("lib".to_string()));
    }

    #[test]
    fn test_detect_output_dir_from_exports_dot_string() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"exports": {".": "./out/index.js"}}"#,
        )
        .unwrap();
        assert_eq!(detect_output_dir(dir.path()), Some("out".to_string()));
    }

    #[test]
    fn test_detect_output_dir_from_module_field() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"module": "./esm/index.mjs"}"#,
        )
        .unwrap();
        assert_eq!(detect_output_dir(dir.path()), Some("esm".to_string()));
    }

    #[test]
    fn test_detect_output_dir_from_main_field() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"main": "./lib/index.js"}"#,
        )
        .unwrap();
        assert_eq!(detect_output_dir(dir.path()), Some("lib".to_string()));
    }

    #[test]
    fn test_detect_output_dir_exports_takes_priority_over_main() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"exports": {".": "./dist/index.js"}, "main": "./lib/index.js"}"#,
        )
        .unwrap();
        assert_eq!(detect_output_dir(dir.path()), Some("dist".to_string()));
    }

    #[test]
    fn test_detect_output_dir_fallback_to_dist_dir() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("dist")).unwrap();
        std::fs::write(dir.path().join("package.json"), r#"{"name": "my-lib"}"#).unwrap();
        assert_eq!(detect_output_dir(dir.path()), Some("dist".to_string()));
    }

    #[test]
    fn test_detect_output_dir_fallback_to_build_dir() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("build")).unwrap();
        std::fs::write(dir.path().join("package.json"), r#"{"name": "my-lib"}"#).unwrap();
        assert_eq!(detect_output_dir(dir.path()), Some("build".to_string()));
    }

    #[test]
    fn test_detect_output_dir_dist_preferred_over_build() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("dist")).unwrap();
        std::fs::create_dir(dir.path().join("build")).unwrap();
        std::fs::write(dir.path().join("package.json"), r#"{"name": "my-lib"}"#).unwrap();
        assert_eq!(detect_output_dir(dir.path()), Some("dist".to_string()));
    }

    #[test]
    fn test_detect_output_dir_none_when_no_output_dir() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("package.json"), r#"{"name": "my-lib"}"#).unwrap();
        assert_eq!(detect_output_dir(dir.path()), None);
    }

    #[test]
    fn test_detect_output_dir_nested_export_conditions() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"exports": {".": {"import": {"types": "./dist/index.d.ts", "default": "./dist/index.mjs"}}}}"#,
        )
        .unwrap();
        assert_eq!(detect_output_dir(dir.path()), Some("dist".to_string()));
    }

    #[test]
    fn test_extract_first_dir_simple() {
        assert_eq!(
            extract_first_dir("./dist/index.js"),
            Some("dist".to_string())
        );
    }

    #[test]
    fn test_extract_first_dir_no_prefix() {
        assert_eq!(extract_first_dir("dist/index.js"), Some("dist".to_string()));
    }

    #[test]
    fn test_extract_first_dir_root_file() {
        assert_eq!(extract_first_dir("./index.js"), None);
    }

    #[test]
    fn test_extract_first_dir_empty() {
        assert_eq!(extract_first_dir(""), None);
    }

    #[cfg(unix)]
    #[test]
    fn test_mixed_symlinks_and_real_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let nm = dir.path().join("node_modules");
        std::fs::create_dir_all(&nm).unwrap();

        // Real directory (npm package)
        let zod_dir = nm.join("zod");
        std::fs::create_dir_all(&zod_dir).unwrap();
        std::fs::write(zod_dir.join("package.json"), r#"{"name": "zod"}"#).unwrap();

        // Symlinked workspace package
        let real_pkg = dir.path().join("packages").join("utils");
        std::fs::create_dir_all(real_pkg.join("dist")).unwrap();
        std::fs::write(
            real_pkg.join("package.json"),
            r#"{"name": "my-utils", "main": "./dist/index.js"}"#,
        )
        .unwrap();
        std::os::unix::fs::symlink(&real_pkg, nm.join("my-utils")).unwrap();

        let result = discover_linked_packages(dir.path());
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "my-utils");
    }

    #[cfg(unix)]
    #[test]
    fn test_multiple_scoped_packages() {
        let dir = tempfile::tempdir().unwrap();
        let nm = dir.path().join("node_modules");
        let scope_dir = nm.join("@myorg");
        std::fs::create_dir_all(&scope_dir).unwrap();

        // First scoped package
        let real_ui = dir.path().join("packages").join("ui");
        std::fs::create_dir_all(real_ui.join("dist")).unwrap();
        std::fs::write(
            real_ui.join("package.json"),
            r#"{"name": "@myorg/ui", "main": "./dist/index.js"}"#,
        )
        .unwrap();
        std::os::unix::fs::symlink(&real_ui, scope_dir.join("ui")).unwrap();

        // Second scoped package
        let real_server = dir.path().join("packages").join("server");
        std::fs::create_dir_all(real_server.join("dist")).unwrap();
        std::fs::write(
            real_server.join("package.json"),
            r#"{"name": "@myorg/server", "main": "./dist/index.js"}"#,
        )
        .unwrap();
        std::os::unix::fs::symlink(&real_server, scope_dir.join("server")).unwrap();

        let result = discover_linked_packages(dir.path());
        assert_eq!(result.len(), 2);

        let names: Vec<&str> = result.iter().map(|p| p.name.as_str()).collect();
        assert!(names.contains(&"@myorg/ui"));
        assert!(names.contains(&"@myorg/server"));
    }
}
