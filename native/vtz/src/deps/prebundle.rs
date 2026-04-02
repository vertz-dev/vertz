use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Result of pre-bundling a dependency.
#[derive(Debug)]
pub struct PrebundleResult {
    /// The package name (e.g., "@vertz/ui", "zod").
    pub package: String,
    /// Path to the bundled output file in .vertz/deps/.
    pub output_path: PathBuf,
    /// Whether the bundle was created successfully.
    pub success: bool,
    /// Error message if bundling failed.
    pub error: Option<String>,
}

/// Pre-bundle a set of dependencies using esbuild.
///
/// For each package, runs esbuild to bundle it into a single ESM file
/// stored in the deps_dir (e.g., `.vertz/deps/`).
///
/// Converts CJS to ESM and bundles all sub-dependencies into a single file.
pub fn prebundle_dependencies(
    packages: &HashSet<String>,
    root_dir: &Path,
    deps_dir: &Path,
) -> Vec<PrebundleResult> {
    // Ensure deps directory exists
    if let Err(e) = std::fs::create_dir_all(deps_dir) {
        return packages
            .iter()
            .map(|pkg| PrebundleResult {
                package: pkg.clone(),
                output_path: PathBuf::new(),
                success: false,
                error: Some(format!("Failed to create deps dir: {}", e)),
            })
            .collect();
    }

    packages
        .iter()
        .map(|pkg| prebundle_single(pkg, root_dir, deps_dir))
        .collect()
}

/// Pre-bundle a single dependency using esbuild.
///
/// This is public so that the dep watcher can re-bundle individual packages
/// when upstream dependency changes are detected (via `spawn_blocking`).
pub fn prebundle_single(package: &str, root_dir: &Path, deps_dir: &Path) -> PrebundleResult {
    let output_filename = package_to_filename(package);
    let output_path = deps_dir.join(&output_filename);

    // Create a temporary entry file that re-exports the package
    let entry_content = format!("export * from '{}';\n", package);
    let entry_path = deps_dir.join(format!("_entry_{}.js", output_filename.replace(".js", "")));

    if let Err(e) = std::fs::write(&entry_path, &entry_content) {
        return PrebundleResult {
            package: package.to_string(),
            output_path,
            success: false,
            error: Some(format!("Failed to write entry file: {}", e)),
        };
    }

    // Run esbuild
    let result = Command::new("esbuild")
        .arg(entry_path.to_string_lossy().to_string())
        .arg("--bundle")
        .arg("--format=esm")
        .arg("--platform=browser")
        .arg(format!("--outfile={}", output_path.display()))
        .arg("--resolve-extensions=.ts,.tsx,.js,.jsx,.mjs")
        .current_dir(root_dir)
        .output();

    // Clean up entry file
    let _ = std::fs::remove_file(&entry_path);

    match result {
        Ok(output) => {
            if output.status.success() {
                PrebundleResult {
                    package: package.to_string(),
                    output_path,
                    success: true,
                    error: None,
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                PrebundleResult {
                    package: package.to_string(),
                    output_path,
                    success: false,
                    error: Some(format!("esbuild failed: {}", stderr)),
                }
            }
        }
        Err(e) => PrebundleResult {
            package: package.to_string(),
            output_path,
            success: false,
            error: Some(format!("Failed to run esbuild: {}", e)),
        },
    }
}

/// Convert a package name to a safe filename.
/// `@vertz/ui` → `@vertz__ui.js`
/// `zod` → `zod.js`
pub fn package_to_filename(package: &str) -> String {
    let safe = package.replace('/', "__");
    format!("{}.js", safe)
}

/// Convert a package name to the URL path used for serving.
/// `@vertz/ui` → `/@deps/@vertz/ui`
pub fn package_to_url_path(package: &str) -> String {
    format!("/@deps/{}", package)
}

/// Convert a deps URL path to a package name.
/// `/@deps/@vertz/ui` → `@vertz/ui`
/// `/@deps/zod` → `zod`
pub fn url_path_to_package(path: &str) -> Option<String> {
    path.strip_prefix("/@deps/").map(|s| s.to_string())
}

/// Resolve a deps URL path to the bundled file on disk.
pub fn resolve_deps_file(path: &str, deps_dir: &Path) -> Option<PathBuf> {
    let package = url_path_to_package(path)?;
    let filename = package_to_filename(&package);
    let file_path = deps_dir.join(filename);
    if file_path.is_file() {
        Some(file_path)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_package_to_filename_regular() {
        assert_eq!(package_to_filename("zod"), "zod.js");
        assert_eq!(package_to_filename("react"), "react.js");
    }

    #[test]
    fn test_package_to_filename_scoped() {
        assert_eq!(package_to_filename("@vertz/ui"), "@vertz__ui.js");
        assert_eq!(package_to_filename("@vertz/server"), "@vertz__server.js");
    }

    #[test]
    fn test_package_to_url_path() {
        assert_eq!(package_to_url_path("@vertz/ui"), "/@deps/@vertz/ui");
        assert_eq!(package_to_url_path("zod"), "/@deps/zod");
    }

    #[test]
    fn test_url_path_to_package() {
        assert_eq!(
            url_path_to_package("/@deps/@vertz/ui"),
            Some("@vertz/ui".to_string())
        );
        assert_eq!(url_path_to_package("/@deps/zod"), Some("zod".to_string()));
        assert_eq!(url_path_to_package("/src/app.tsx"), None);
    }

    #[test]
    fn test_resolve_deps_file() {
        let tmp = tempfile::tempdir().unwrap();
        let deps_dir = tmp.path().join("deps");
        std::fs::create_dir_all(&deps_dir).unwrap();
        std::fs::write(deps_dir.join("zod.js"), "export default {};").unwrap();

        let result = resolve_deps_file("/@deps/zod", &deps_dir);
        assert!(result.is_some());
        assert_eq!(result.unwrap(), deps_dir.join("zod.js"));
    }

    #[test]
    fn test_resolve_deps_file_scoped() {
        let tmp = tempfile::tempdir().unwrap();
        let deps_dir = tmp.path().join("deps");
        std::fs::create_dir_all(&deps_dir).unwrap();
        std::fs::write(deps_dir.join("@vertz__ui.js"), "export default {};").unwrap();

        let result = resolve_deps_file("/@deps/@vertz/ui", &deps_dir);
        assert!(result.is_some());
        assert_eq!(result.unwrap(), deps_dir.join("@vertz__ui.js"));
    }

    #[test]
    fn test_resolve_deps_file_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let deps_dir = tmp.path().join("deps");
        std::fs::create_dir_all(&deps_dir).unwrap();

        let result = resolve_deps_file("/@deps/nonexistent", &deps_dir);
        assert!(result.is_none());
    }
}
