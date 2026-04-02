use std::path::Path;

/// Check whether pre-bundled dependencies are still valid.
///
/// The cache is keyed by a hash of `package.json` + lockfile content.
/// If neither has changed, the cached deps are still valid.
pub fn is_deps_cache_valid(root_dir: &Path, deps_dir: &Path) -> bool {
    let hash_file = deps_dir.join(".cache_hash");

    // If the hash file doesn't exist, cache is invalid
    let stored_hash = match std::fs::read_to_string(&hash_file) {
        Ok(h) => h,
        Err(_) => return false,
    };

    // If deps dir doesn't have any .js files, cache is invalid
    let has_js_files = std::fs::read_dir(deps_dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .any(|e| e.path().extension().is_some_and(|ext| ext == "js"))
        })
        .unwrap_or(false);

    if !has_js_files {
        return false;
    }

    let current_hash = compute_deps_hash(root_dir);
    stored_hash.trim() == current_hash.trim()
}

/// Write the current deps hash so subsequent starts can skip pre-bundling.
pub fn write_deps_cache_hash(root_dir: &Path, deps_dir: &Path) {
    let hash = compute_deps_hash(root_dir);
    let hash_file = deps_dir.join(".cache_hash");
    let _ = std::fs::write(hash_file, hash);
}

/// Compute a hash of package.json + lockfile content.
fn compute_deps_hash(root_dir: &Path) -> String {
    let mut content = String::new();

    // Read package.json
    let pkg_json = root_dir.join("package.json");
    if let Ok(s) = std::fs::read_to_string(&pkg_json) {
        content.push_str(&s);
    }

    // Read lockfile (try multiple lockfile formats)
    let lockfiles = [
        "bun.lock",
        "bun.lockb",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
    ];
    for lockfile in &lockfiles {
        let path = root_dir.join(lockfile);
        if let Ok(s) = std::fs::read_to_string(&path) {
            content.push_str(&s);
            break;
        }
    }

    format!("{:x}", simple_hash(&content))
}

/// Simple hash function for cache invalidation.
fn simple_hash(s: &str) -> u64 {
    let mut hash: u64 = 5381;
    for byte in s.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(u64::from(byte));
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_invalid_when_no_deps_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let deps_dir = tmp.path().join(".vertz/deps");
        // deps_dir doesn't exist
        assert!(!is_deps_cache_valid(tmp.path(), &deps_dir));
    }

    #[test]
    fn test_cache_invalid_when_no_hash_file() {
        let tmp = tempfile::tempdir().unwrap();
        let deps_dir = tmp.path().join(".vertz/deps");
        std::fs::create_dir_all(&deps_dir).unwrap();
        std::fs::write(deps_dir.join("zod.js"), "export default {};").unwrap();

        assert!(!is_deps_cache_valid(tmp.path(), &deps_dir));
    }

    #[test]
    fn test_cache_valid_after_write() {
        let tmp = tempfile::tempdir().unwrap();
        let deps_dir = tmp.path().join(".vertz/deps");
        std::fs::create_dir_all(&deps_dir).unwrap();

        // Write a package.json
        std::fs::write(
            tmp.path().join("package.json"),
            r#"{"dependencies":{"zod":"3.0.0"}}"#,
        )
        .unwrap();

        // Write a js file so cache has content
        std::fs::write(deps_dir.join("zod.js"), "export default {};").unwrap();

        // Write cache hash
        write_deps_cache_hash(tmp.path(), &deps_dir);

        // Should now be valid
        assert!(is_deps_cache_valid(tmp.path(), &deps_dir));
    }

    #[test]
    fn test_cache_invalid_after_package_json_change() {
        let tmp = tempfile::tempdir().unwrap();
        let deps_dir = tmp.path().join(".vertz/deps");
        std::fs::create_dir_all(&deps_dir).unwrap();

        // Write initial package.json
        std::fs::write(
            tmp.path().join("package.json"),
            r#"{"dependencies":{"zod":"3.0.0"}}"#,
        )
        .unwrap();

        std::fs::write(deps_dir.join("zod.js"), "export default {};").unwrap();
        write_deps_cache_hash(tmp.path(), &deps_dir);

        // Modify package.json
        std::fs::write(
            tmp.path().join("package.json"),
            r#"{"dependencies":{"zod":"4.0.0"}}"#,
        )
        .unwrap();

        // Should now be invalid
        assert!(!is_deps_cache_valid(tmp.path(), &deps_dir));
    }

    #[test]
    fn test_cache_invalid_when_no_js_files() {
        let tmp = tempfile::tempdir().unwrap();
        let deps_dir = tmp.path().join(".vertz/deps");
        std::fs::create_dir_all(&deps_dir).unwrap();

        std::fs::write(tmp.path().join("package.json"), r#"{"dependencies":{}}"#).unwrap();

        // Write hash but no js files
        write_deps_cache_hash(tmp.path(), &deps_dir);

        assert!(!is_deps_cache_valid(tmp.path(), &deps_dir));
    }

    #[test]
    fn test_compute_deps_hash_deterministic() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(
            tmp.path().join("package.json"),
            r#"{"dependencies":{"zod":"3.0.0"}}"#,
        )
        .unwrap();

        let h1 = compute_deps_hash(tmp.path());
        let h2 = compute_deps_hash(tmp.path());
        assert_eq!(h1, h2);
    }
}
