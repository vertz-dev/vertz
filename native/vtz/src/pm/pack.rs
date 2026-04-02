use flate2::write::GzEncoder;
use flate2::Compression;
use glob::Pattern;
use ring::digest;
use sha2::{Digest, Sha512};
use std::io::Write;
use std::path::Path;
use walkdir::WalkDir;

use crate::pm::types::PackageJson;
use base64::Engine;

/// A single file included in the packed tarball
#[derive(Debug, Clone)]
pub struct PackedFile {
    pub path: String,
    pub size: u64,
}

/// Result of packing a directory into a publishable tarball
#[derive(Debug)]
pub struct PackResult {
    /// The gzipped tarball bytes
    pub tarball: Vec<u8>,
    /// Files included in the tarball
    pub files: Vec<PackedFile>,
    /// Compressed tarball size in bytes
    pub packed_size: u64,
    /// Total uncompressed file sizes
    pub unpacked_size: u64,
    /// Subresource integrity hash (sha512-<base64>)
    pub integrity: String,
    /// SHA-1 hex digest (for npm shasum field)
    pub shasum: String,
}

/// Always-included file prefixes (case-insensitive matching)
const ALWAYS_INCLUDE_PREFIXES: &[&str] = &["readme", "license", "licence", "changelog"];

/// Always-excluded directories and files
const ALWAYS_EXCLUDE: &[&str] = &[
    ".git",
    "node_modules",
    ".npmrc",
    ".gitignore",
    ".npmignore",
    ".DS_Store",
];

/// Collect files from a package directory based on package.json `files` field
/// or .npmignore/.gitignore fallback.
pub fn collect_files(
    root_dir: &Path,
    pkg: &PackageJson,
) -> Result<Vec<PackedFile>, Box<dyn std::error::Error>> {
    let mut files = Vec::new();

    if let Some(ref file_patterns) = pkg.files {
        // Whitelist mode: only include matched files + always-included
        collect_whitelist(root_dir, file_patterns, &mut files)?;
    } else {
        // Blacklist mode: include everything except ignored patterns
        collect_blacklist(root_dir, &mut files)?;
    }

    // Always include package.json
    let pkg_json_path = root_dir.join("package.json");
    if pkg_json_path.exists() && !files.iter().any(|f| f.path == "package.json") {
        let size = std::fs::metadata(&pkg_json_path)?.len();
        files.push(PackedFile {
            path: "package.json".to_string(),
            size,
        });
    }

    // Always include README*, LICENSE*, LICENCE*, CHANGELOG*
    add_always_included_files(root_dir, &mut files)?;

    // Sort for deterministic output
    files.sort_by(|a, b| a.path.cmp(&b.path));

    // Deduplicate (always-included may overlap with whitelist/blacklist)
    files.dedup_by(|a, b| a.path == b.path);

    Ok(files)
}

/// Pack a directory into a gzipped tarball ready for npm publish
pub fn pack_tarball(
    root_dir: &Path,
    pkg: &PackageJson,
) -> Result<PackResult, Box<dyn std::error::Error>> {
    let files = collect_files(root_dir, pkg)?;

    let unpacked_size: u64 = files.iter().map(|f| f.size).sum();

    // Build tar archive
    let mut tar_builder = tar::Builder::new(Vec::new());

    for file in &files {
        let file_path = root_dir.join(&file.path);
        let tar_path = format!("package/{}", file.path);

        let content = std::fs::read(&file_path)?;
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        tar_builder.append_data(&mut header, &tar_path, &content[..])?;
    }

    let tar_bytes = tar_builder.into_inner()?;

    // Gzip compress
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&tar_bytes)?;
    let tarball = encoder.finish()?;

    let packed_size = tarball.len() as u64;

    // Calculate SHA-512 integrity
    let mut sha512 = Sha512::new();
    sha512.update(&tarball);
    let sha512_hash = sha512.finalize();
    let integrity = format!(
        "sha512-{}",
        base64::engine::general_purpose::STANDARD.encode(sha512_hash)
    );

    // Calculate SHA-1 shasum using ring
    let sha1_digest = digest::digest(&digest::SHA1_FOR_LEGACY_USE_ONLY, &tarball);
    let shasum = sha1_digest
        .as_ref()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>();

    Ok(PackResult {
        tarball,
        files,
        packed_size,
        unpacked_size,
        integrity,
        shasum,
    })
}

/// Whitelist mode: collect files matching the `files` patterns
fn collect_whitelist(
    root_dir: &Path,
    patterns: &[String],
    files: &mut Vec<PackedFile>,
) -> Result<(), Box<dyn std::error::Error>> {
    for entry in WalkDir::new(root_dir)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_always_excluded(e.file_name().to_string_lossy().as_ref()))
    {
        let entry = entry?;
        if entry.file_type().is_dir() || entry.file_type().is_symlink() {
            continue;
        }

        let rel_path = entry.path().strip_prefix(root_dir).unwrap_or(entry.path());
        let rel_str = normalize_path_separators(&rel_path.to_string_lossy());

        if matches_any_pattern(&rel_str, patterns) {
            let size = entry.metadata()?.len();
            files.push(PackedFile {
                path: rel_str,
                size,
            });
        }
    }

    Ok(())
}

/// Blacklist mode: collect all files except those matching ignore patterns
fn collect_blacklist(
    root_dir: &Path,
    files: &mut Vec<PackedFile>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Load ignore patterns from .npmignore or .gitignore
    let ignore_patterns = load_ignore_patterns(root_dir);

    for entry in WalkDir::new(root_dir)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_always_excluded(e.file_name().to_string_lossy().as_ref()))
    {
        let entry = entry?;
        if entry.file_type().is_dir() || entry.file_type().is_symlink() {
            continue;
        }

        let rel_path = entry.path().strip_prefix(root_dir).unwrap_or(entry.path());
        let rel_str = normalize_path_separators(&rel_path.to_string_lossy());

        if !matches_any_pattern(&rel_str, &ignore_patterns) {
            let size = entry.metadata()?.len();
            files.push(PackedFile {
                path: rel_str,
                size,
            });
        }
    }

    Ok(())
}

/// Normalize path separators to forward slashes (for Windows compatibility)
fn normalize_path_separators(path: &str) -> String {
    path.replace('\\', "/")
}

/// Check if a filename matches any of the always-excluded names
fn is_always_excluded(name: &str) -> bool {
    ALWAYS_EXCLUDE.contains(&name)
}

/// Check if a relative path matches any of the given glob patterns.
/// Supports directory patterns: "dist" or "dist/" matches everything under dist/
fn matches_any_pattern(rel_path: &str, patterns: &[String]) -> bool {
    for pattern in patterns {
        let pat = pattern.trim_end_matches('/');

        // Direct path match
        if rel_path == pat {
            return true;
        }

        // Directory prefix match: pattern "dist" matches "dist/index.js"
        if rel_path.starts_with(&format!("{}/", pat)) {
            return true;
        }

        // Glob match
        if let Ok(glob) = Pattern::new(pat) {
            if glob.matches(rel_path) {
                return true;
            }
        }

        // Glob with ** prefix for directory patterns
        let glob_pat = format!("{}/**", pat);
        if let Ok(glob) = Pattern::new(&glob_pat) {
            if glob.matches(rel_path) {
                return true;
            }
        }
    }
    false
}

/// Load ignore patterns from .npmignore (preferred) or .gitignore (fallback)
fn load_ignore_patterns(root_dir: &Path) -> Vec<String> {
    let npmignore = root_dir.join(".npmignore");
    let gitignore = root_dir.join(".gitignore");

    let content = if npmignore.exists() {
        std::fs::read_to_string(&npmignore).unwrap_or_default()
    } else if gitignore.exists() {
        std::fs::read_to_string(&gitignore).unwrap_or_default()
    } else {
        return Vec::new();
    };

    content
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(|l| l.to_string())
        .collect()
}

/// Add always-included files (README*, LICENSE*, LICENCE*, CHANGELOG*)
fn add_always_included_files(
    root_dir: &Path,
    files: &mut Vec<PackedFile>,
) -> Result<(), Box<dyn std::error::Error>> {
    let entries = std::fs::read_dir(root_dir)?;
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        let name_lower = name.to_lowercase();

        let is_always_included = ALWAYS_INCLUDE_PREFIXES
            .iter()
            .any(|prefix| name_lower.starts_with(prefix));

        if is_always_included && !files.iter().any(|f| f.path == name) {
            let size = entry.metadata()?.len();
            files.push(PackedFile { path: name, size });
        }
    }

    Ok(())
}

/// Read the raw package.json as a serde_json::Value (preserves all fields)
pub fn read_package_json_raw(
    root_dir: &Path,
) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let path = root_dir.join("package.json");
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Could not read {}: {}", path.display(), e))?;
    let value: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid package.json: {}", e))?;
    Ok(value)
}

/// Normalize package.json for inclusion in publish document.
/// Removes devDependencies and non-install scripts (matching npm behavior).
pub fn normalize_package_json(raw: &serde_json::Value) -> serde_json::Value {
    let mut normalized = raw.clone();
    if let Some(obj) = normalized.as_object_mut() {
        obj.remove("devDependencies");
        obj.remove("files");

        // Remove scripts except install-related ones
        if let Some(scripts) = obj.get("scripts").cloned() {
            if let Some(scripts_obj) = scripts.as_object() {
                let install_scripts: serde_json::Map<String, serde_json::Value> = scripts_obj
                    .iter()
                    .filter(|(k, _)| {
                        matches!(
                            k.as_str(),
                            "preinstall" | "install" | "postinstall" | "preuninstall" | "uninstall"
                        )
                    })
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();
                if install_scripts.is_empty() {
                    obj.remove("scripts");
                } else {
                    obj.insert(
                        "scripts".to_string(),
                        serde_json::Value::Object(install_scripts),
                    );
                }
            }
        }
    }
    normalized
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pm::types::PackageJson;

    fn create_test_package(dir: &Path, name: &str, version: &str) {
        std::fs::write(
            dir.join("package.json"),
            format!(r#"{{"name": "{}", "version": "{}"}}"#, name, version),
        )
        .unwrap();
    }

    fn create_test_package_with_files(dir: &Path, name: &str, version: &str, files: &[&str]) {
        let files_json: Vec<String> = files.iter().map(|f| format!("\"{}\"", f)).collect();
        std::fs::write(
            dir.join("package.json"),
            format!(
                r#"{{"name": "{}", "version": "{}", "files": [{}]}}"#,
                name,
                version,
                files_json.join(", ")
            ),
        )
        .unwrap();
    }

    fn read_pkg(dir: &Path) -> PackageJson {
        crate::pm::types::read_package_json(dir).unwrap()
    }

    // ─── collect_files: whitelist mode ───

    #[test]
    fn test_whitelist_includes_only_matched_files_and_always_included() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        create_test_package_with_files(root, "test-pkg", "1.0.0", &["dist/"]);
        std::fs::create_dir_all(root.join("dist")).unwrap();
        std::fs::write(root.join("dist/index.js"), "module.exports = {}").unwrap();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/main.ts"), "export default {}").unwrap();

        let pkg = read_pkg(root);
        let files = collect_files(root, &pkg).unwrap();
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();

        assert!(
            paths.contains(&"dist/index.js"),
            "should include dist/index.js"
        );
        assert!(
            paths.contains(&"package.json"),
            "should always include package.json"
        );
        assert!(
            !paths.contains(&"src/main.ts"),
            "should NOT include src/main.ts"
        );
    }

    #[test]
    fn test_whitelist_excludes_node_modules_and_git() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        // Use a broad wildcard but node_modules and .git should still be excluded
        create_test_package_with_files(root, "test-pkg", "1.0.0", &["**/*"]);
        std::fs::create_dir_all(root.join("node_modules/foo")).unwrap();
        std::fs::write(root.join("node_modules/foo/index.js"), "").unwrap();
        std::fs::create_dir_all(root.join(".git/objects")).unwrap();
        std::fs::write(root.join(".git/objects/abc"), "").unwrap();
        std::fs::write(root.join("index.js"), "hello").unwrap();

        let pkg = read_pkg(root);
        let files = collect_files(root, &pkg).unwrap();
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();

        assert!(paths.contains(&"index.js"));
        assert!(!paths.iter().any(|p| p.contains("node_modules")));
        assert!(!paths.iter().any(|p| p.contains(".git")));
    }

    #[test]
    fn test_whitelist_produces_valid_gzipped_tar_with_package_prefix() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        create_test_package_with_files(root, "test-pkg", "1.0.0", &["dist/"]);
        std::fs::create_dir_all(root.join("dist")).unwrap();
        std::fs::write(root.join("dist/index.js"), "console.log('hello')").unwrap();

        let pkg = read_pkg(root);
        let result = pack_tarball(root, &pkg).unwrap();

        // Verify it's a valid gzip
        use flate2::read::GzDecoder;
        use std::io::Read;
        let mut gz = GzDecoder::new(&result.tarball[..]);
        let mut tar_bytes = Vec::new();
        gz.read_to_end(&mut tar_bytes).unwrap();

        // Verify tar entries have package/ prefix
        let mut archive = tar::Archive::new(&tar_bytes[..]);
        let entry_paths: Vec<String> = archive
            .entries()
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.path().unwrap().to_string_lossy().to_string())
            .collect();

        assert!(
            entry_paths.iter().all(|p| p.starts_with("package/")),
            "all entries should have package/ prefix, got: {:?}",
            entry_paths
        );
        assert!(entry_paths.contains(&"package/dist/index.js".to_string()));
        assert!(entry_paths.contains(&"package/package.json".to_string()));
    }

    #[test]
    fn test_pack_calculates_correct_sha512_integrity() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        create_test_package_with_files(root, "test-pkg", "1.0.0", &["dist/"]);
        std::fs::create_dir_all(root.join("dist")).unwrap();
        std::fs::write(root.join("dist/index.js"), "hello").unwrap();

        let pkg = read_pkg(root);
        let result = pack_tarball(root, &pkg).unwrap();

        // Verify integrity format
        assert!(
            result.integrity.starts_with("sha512-"),
            "integrity should start with sha512-"
        );

        // Verify by recomputing
        let mut hasher = Sha512::new();
        hasher.update(&result.tarball);
        let expected = format!(
            "sha512-{}",
            base64::engine::general_purpose::STANDARD.encode(hasher.finalize())
        );
        assert_eq!(result.integrity, expected);
    }

    #[test]
    fn test_pack_calculates_correct_sha1_shasum() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        create_test_package_with_files(root, "test-pkg", "1.0.0", &["dist/"]);
        std::fs::create_dir_all(root.join("dist")).unwrap();
        std::fs::write(root.join("dist/index.js"), "hello").unwrap();

        let pkg = read_pkg(root);
        let result = pack_tarball(root, &pkg).unwrap();

        // Verify shasum is a 40-char hex string (SHA-1)
        assert_eq!(result.shasum.len(), 40, "SHA-1 hex should be 40 chars");
        assert!(
            result.shasum.chars().all(|c| c.is_ascii_hexdigit()),
            "shasum should be hex"
        );

        // Verify by recomputing
        let sha1 = digest::digest(&digest::SHA1_FOR_LEGACY_USE_ONLY, &result.tarball);
        let expected: String = sha1.as_ref().iter().map(|b| format!("{:02x}", b)).collect();
        assert_eq!(result.shasum, expected);
    }

    #[test]
    fn test_pack_reports_correct_sizes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        create_test_package_with_files(root, "test-pkg", "1.0.0", &["dist/"]);
        std::fs::create_dir_all(root.join("dist")).unwrap();
        std::fs::write(root.join("dist/index.js"), "x".repeat(1000)).unwrap();

        let pkg = read_pkg(root);
        let result = pack_tarball(root, &pkg).unwrap();

        assert_eq!(result.packed_size, result.tarball.len() as u64);
        assert!(result.unpacked_size > 0);
        // Packed should be smaller than unpacked for non-trivial content
        assert!(
            result.packed_size < result.unpacked_size,
            "packed ({}) should be < unpacked ({})",
            result.packed_size,
            result.unpacked_size
        );
    }

    // ─── collect_files: blacklist mode ───

    #[test]
    fn test_blacklist_excludes_npmignore_patterns() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        create_test_package(root, "test-pkg", "1.0.0");
        std::fs::write(root.join(".npmignore"), "src/\n*.test.js\n").unwrap();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/main.ts"), "export {}").unwrap();
        std::fs::write(root.join("index.js"), "module.exports = {}").unwrap();
        std::fs::write(root.join("foo.test.js"), "test()").unwrap();

        let pkg = read_pkg(root);
        let files = collect_files(root, &pkg).unwrap();
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();

        assert!(paths.contains(&"index.js"));
        assert!(
            !paths.contains(&"src/main.ts"),
            "src/ should be excluded by .npmignore"
        );
        assert!(
            !paths.contains(&"foo.test.js"),
            "*.test.js should be excluded by .npmignore"
        );
    }

    #[test]
    fn test_blacklist_falls_back_to_gitignore() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        create_test_package(root, "test-pkg", "1.0.0");
        std::fs::write(root.join(".gitignore"), "build/\n").unwrap();
        std::fs::create_dir_all(root.join("build")).unwrap();
        std::fs::write(root.join("build/out.js"), "").unwrap();
        std::fs::write(root.join("index.js"), "module.exports = {}").unwrap();

        let pkg = read_pkg(root);
        let files = collect_files(root, &pkg).unwrap();
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();

        assert!(paths.contains(&"index.js"));
        assert!(
            !paths.contains(&"build/out.js"),
            "build/ should be excluded by .gitignore fallback"
        );
    }

    // ─── always-included files ───

    #[test]
    fn test_always_includes_package_json() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        // files field does NOT list package.json, but it should still be included
        create_test_package_with_files(root, "test-pkg", "1.0.0", &["dist/"]);
        std::fs::create_dir_all(root.join("dist")).unwrap();
        std::fs::write(root.join("dist/index.js"), "").unwrap();

        let pkg = read_pkg(root);
        let files = collect_files(root, &pkg).unwrap();
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();

        assert!(paths.contains(&"package.json"));
    }

    #[test]
    fn test_always_includes_readme() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        create_test_package_with_files(root, "test-pkg", "1.0.0", &["dist/"]);
        std::fs::create_dir_all(root.join("dist")).unwrap();
        std::fs::write(root.join("dist/index.js"), "").unwrap();
        std::fs::write(root.join("README.md"), "# Hello").unwrap();

        let pkg = read_pkg(root);
        let files = collect_files(root, &pkg).unwrap();
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();

        assert!(paths.contains(&"README.md"));
    }

    #[test]
    fn test_always_includes_license() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        create_test_package_with_files(root, "test-pkg", "1.0.0", &["dist/"]);
        std::fs::create_dir_all(root.join("dist")).unwrap();
        std::fs::write(root.join("dist/index.js"), "").unwrap();
        std::fs::write(root.join("LICENSE"), "MIT").unwrap();

        let pkg = read_pkg(root);
        let files = collect_files(root, &pkg).unwrap();
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();

        assert!(paths.contains(&"LICENSE"));
    }

    // ─── normalize_package_json ───

    #[test]
    fn test_normalize_removes_dev_dependencies() {
        let raw: serde_json::Value = serde_json::json!({
            "name": "test-pkg",
            "version": "1.0.0",
            "dependencies": { "zod": "^3.0.0" },
            "devDependencies": { "typescript": "^5.0.0" }
        });

        let normalized = normalize_package_json(&raw);
        assert!(normalized.get("dependencies").is_some());
        assert!(normalized.get("devDependencies").is_none());
    }

    #[test]
    fn test_normalize_removes_non_install_scripts() {
        let raw: serde_json::Value = serde_json::json!({
            "name": "test-pkg",
            "version": "1.0.0",
            "scripts": {
                "build": "tsc",
                "test": "vitest",
                "postinstall": "node setup.js"
            }
        });

        let normalized = normalize_package_json(&raw);
        let scripts = normalized.get("scripts").unwrap().as_object().unwrap();
        assert!(scripts.contains_key("postinstall"));
        assert!(!scripts.contains_key("build"));
        assert!(!scripts.contains_key("test"));
    }

    #[test]
    fn test_normalize_removes_scripts_if_none_install_related() {
        let raw: serde_json::Value = serde_json::json!({
            "name": "test-pkg",
            "version": "1.0.0",
            "scripts": {
                "build": "tsc",
                "test": "vitest"
            }
        });

        let normalized = normalize_package_json(&raw);
        assert!(normalized.get("scripts").is_none());
    }

    // ─── read_package_json_raw ───

    #[test]
    fn test_read_package_json_raw_preserves_all_fields() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "test", "version": "1.0.0", "type": "module", "main": "./dist/index.js"}"#,
        )
        .unwrap();

        let raw = read_package_json_raw(dir.path()).unwrap();
        assert_eq!(raw["name"], "test");
        assert_eq!(raw["type"], "module");
        assert_eq!(raw["main"], "./dist/index.js");
    }

    #[test]
    fn test_read_package_json_raw_missing_file() {
        let dir = tempfile::tempdir().unwrap();
        let result = read_package_json_raw(dir.path());
        assert!(result.is_err());
    }

    // ─── normalize strips files field ───

    #[test]
    fn test_normalize_removes_files_field() {
        let raw: serde_json::Value = serde_json::json!({
            "name": "test-pkg",
            "version": "1.0.0",
            "files": ["dist/", "README.md"]
        });

        let normalized = normalize_package_json(&raw);
        assert!(
            normalized.get("files").is_none(),
            "files field should be stripped from normalized package.json"
        );
    }

    // ─── symlinks are skipped ───

    #[cfg(unix)]
    #[test]
    fn test_whitelist_skips_symlinks() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        create_test_package_with_files(root, "test-pkg", "1.0.0", &["dist/"]);
        std::fs::create_dir_all(root.join("dist")).unwrap();
        std::fs::write(root.join("dist/index.js"), "hello").unwrap();

        // Create a symlink pointing outside the project
        std::os::unix::fs::symlink("/etc/passwd", root.join("dist/evil-link")).unwrap();

        let pkg = read_pkg(root);
        let files = collect_files(root, &pkg).unwrap();
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();

        assert!(
            paths.contains(&"dist/index.js"),
            "regular file should be included"
        );
        assert!(
            !paths.contains(&"dist/evil-link"),
            "symlink should NOT be included"
        );
    }

    // ─── path separator normalization ───

    #[test]
    fn test_normalize_path_separators() {
        assert_eq!(normalize_path_separators("dist\\index.js"), "dist/index.js");
        assert_eq!(
            normalize_path_separators("src\\lib\\utils.ts"),
            "src/lib/utils.ts"
        );
        assert_eq!(
            normalize_path_separators("already/forward/slash"),
            "already/forward/slash"
        );
    }
}
