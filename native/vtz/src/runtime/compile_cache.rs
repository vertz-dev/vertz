//! Disk-backed compilation cache for the module loader.
//!
//! Caches compiled TypeScript → JavaScript on disk, keyed by
//! `SHA-256(source_content + CACHE_VERSION + compilation_target)`.
//! Skips recompilation for unchanged files across test runs.
//!
//! Cache location: `<root_dir>/.vertz/compile-cache/<sha256-prefix>/<sha256>.json`

use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

/// Cache version — includes the crate version to invalidate on updates.
const CACHE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Cached compilation result.
pub struct CachedCompilation {
    pub code: String,
    pub source_map: Option<String>,
    pub css: Option<String>,
}

/// Disk-backed compilation cache.
pub struct CompileCache {
    cache_dir: PathBuf,
    enabled: bool,
}

impl CompileCache {
    /// Create a new compile cache rooted at `<root_dir>/.vertz/compile-cache/`.
    pub fn new(root_dir: &Path, enabled: bool) -> Self {
        let cache_dir = root_dir.join(".vertz").join("compile-cache");
        Self { cache_dir, enabled }
    }

    /// Compute the SHA-256 cache key for a source + target pair.
    fn cache_key(source: &str, target: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(source.as_bytes());
        hasher.update(b"|");
        hasher.update(CACHE_VERSION.as_bytes());
        hasher.update(b"|");
        hasher.update(target.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Derive the on-disk path for a cache key (2-char prefix subdirectory).
    fn cache_path(&self, key: &str) -> PathBuf {
        let prefix = &key[..2];
        self.cache_dir.join(prefix).join(format!("{}.json", key))
    }

    /// Look up a cached compilation. Returns `None` on miss or if disabled.
    pub fn get(&self, source: &str, target: &str) -> Option<CachedCompilation> {
        if !self.enabled {
            return None;
        }
        let key = Self::cache_key(source, target);
        let path = self.cache_path(&key);
        let content = std::fs::read_to_string(&path).ok()?;
        let parsed: serde_json::Value = serde_json::from_str(&content).ok()?;

        Some(CachedCompilation {
            code: parsed["code"].as_str()?.to_string(),
            source_map: parsed["sourceMap"].as_str().map(|s| s.to_string()),
            css: parsed["css"].as_str().map(|s| s.to_string()),
        })
    }

    /// Store a compilation result in the cache. No-op if disabled.
    pub fn put(&self, source: &str, target: &str, compilation: &CachedCompilation) {
        if !self.enabled {
            return;
        }
        let key = Self::cache_key(source, target);
        let path = self.cache_path(&key);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let json = serde_json::json!({
            "code": compilation.code,
            "sourceMap": compilation.source_map,
            "css": compilation.css,
        });
        let _ = std::fs::write(&path, serde_json::to_string(&json).unwrap_or_default());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_miss_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), true);
        assert!(cache.get("const x = 1;", "ssr").is_none());
    }

    #[test]
    fn test_cache_put_then_get() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), true);
        let source = "const x: number = 1;";
        let target = "ssr";

        cache.put(
            source,
            target,
            &CachedCompilation {
                code: "const x = 1;".to_string(),
                source_map: Some("{\"mappings\":\"AAAA\"}".to_string()),
                css: None,
            },
        );

        let cached = cache.get(source, target).expect("Should hit cache");
        assert_eq!(cached.code, "const x = 1;");
        assert_eq!(
            cached.source_map.as_deref(),
            Some("{\"mappings\":\"AAAA\"}")
        );
        assert!(cached.css.is_none());
    }

    #[test]
    fn test_cache_put_with_css() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), true);

        cache.put(
            "const x = css({});",
            "ssr",
            &CachedCompilation {
                code: "const x = { root: 'abc' };".to_string(),
                source_map: None,
                css: Some(".abc { color: red; }".to_string()),
            },
        );

        let cached = cache.get("const x = css({});", "ssr").unwrap();
        assert_eq!(cached.css.as_deref(), Some(".abc { color: red; }"));
    }

    #[test]
    fn test_cache_disabled_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), false);

        cache.put(
            "const x = 1;",
            "ssr",
            &CachedCompilation {
                code: "const x = 1;".to_string(),
                source_map: None,
                css: None,
            },
        );

        assert!(cache.get("const x = 1;", "ssr").is_none());
    }

    #[test]
    fn test_cache_different_source_misses() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), true);

        cache.put(
            "const x = 1;",
            "ssr",
            &CachedCompilation {
                code: "const x = 1;".to_string(),
                source_map: None,
                css: None,
            },
        );

        assert!(cache.get("const x = 2;", "ssr").is_none());
    }

    #[test]
    fn test_cache_different_target_misses() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), true);

        cache.put(
            "const x = 1;",
            "ssr",
            &CachedCompilation {
                code: "const x = 1;".to_string(),
                source_map: None,
                css: None,
            },
        );

        assert!(cache.get("const x = 1;", "dom").is_none());
    }

    #[test]
    fn test_cache_files_stored_in_prefix_subdirectory() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), true);

        cache.put(
            "test",
            "ssr",
            &CachedCompilation {
                code: "output".to_string(),
                source_map: None,
                css: None,
            },
        );

        let cache_dir = tmp.path().join(".vertz").join("compile-cache");
        assert!(cache_dir.exists(), "Cache directory should be created");

        // Should have a 2-char prefix subdirectory
        let entries: Vec<_> = std::fs::read_dir(&cache_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(entries.len(), 1);
        let subdir_name = entries[0].file_name();
        assert_eq!(
            subdir_name.to_string_lossy().len(),
            2,
            "Subdirectory should be 2-char prefix"
        );
    }
}
