use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::SystemTime;

/// A cached compilation result for a single module.
#[derive(Debug, Clone)]
pub struct CachedModule {
    /// The compiled JavaScript code (with imports rewritten).
    pub code: String,
    /// The source map JSON, if available.
    pub source_map: Option<String>,
    /// Extracted CSS, if any.
    pub css: Option<String>,
    /// File modification time at the time of compilation.
    pub mtime: SystemTime,
}

/// Thread-safe in-memory compilation cache.
///
/// Keyed by absolute file path. Invalidated when the file's mtime changes.
#[derive(Debug, Clone)]
pub struct CompilationCache {
    inner: Arc<RwLock<HashMap<PathBuf, CachedModule>>>,
}

impl CompilationCache {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get a cached module if it exists and the file hasn't been modified.
    ///
    /// Returns `None` if:
    /// - The file is not in the cache
    /// - The file's mtime has changed since it was cached
    /// - The file's mtime cannot be read
    pub fn get(&self, path: &Path) -> Option<CachedModule> {
        let current_mtime = get_file_mtime(path)?;

        let cache = self.inner.read().ok()?;
        let entry = cache.get(path)?;

        if entry.mtime == current_mtime {
            Some(entry.clone())
        } else {
            None
        }
    }

    /// Get a cached module without checking mtime.
    ///
    /// Used by the source mapper to look up source maps for error resolution
    /// even if the file has been modified since compilation.
    pub fn get_unchecked(&self, path: &Path) -> Option<CachedModule> {
        let cache = self.inner.read().ok()?;
        cache.get(path).cloned()
    }

    /// Insert a compiled module into the cache.
    pub fn insert(&self, path: PathBuf, module: CachedModule) {
        if let Ok(mut cache) = self.inner.write() {
            cache.insert(path, module);
        }
    }

    /// Invalidate a specific path in the cache.
    pub fn invalidate(&self, path: &Path) {
        if let Ok(mut cache) = self.inner.write() {
            cache.remove(path);
        }
    }

    /// Clear the entire cache.
    pub fn clear(&self) {
        if let Ok(mut cache) = self.inner.write() {
            cache.clear();
        }
    }

    /// Return the number of entries in the cache.
    pub fn len(&self) -> usize {
        self.inner.read().map(|c| c.len()).unwrap_or(0)
    }

    /// Return whether the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl Default for CompilationCache {
    fn default() -> Self {
        Self::new()
    }
}

/// Get the modification time of a file, or None if it can't be read.
fn get_file_mtime(path: &Path) -> Option<SystemTime> {
    std::fs::metadata(path).ok().and_then(|m| m.modified().ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_cache_miss_on_empty() {
        let cache = CompilationCache::new();
        assert!(cache.get(Path::new("/nonexistent")).is_none());
        assert!(cache.is_empty());
    }

    #[test]
    fn test_cache_hit_after_insert() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("test.tsx");
        std::fs::write(&file, "const x = 1;").unwrap();
        let mtime = get_file_mtime(&file).unwrap();

        let cache = CompilationCache::new();
        cache.insert(
            file.clone(),
            CachedModule {
                code: "compiled code".to_string(),
                source_map: None,
                css: None,
                mtime,
            },
        );

        let result = cache.get(&file);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "compiled code");
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn test_cache_invalidation_on_mtime_change() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("test.tsx");
        std::fs::write(&file, "const x = 1;").unwrap();
        let old_mtime = get_file_mtime(&file).unwrap();

        let cache = CompilationCache::new();
        cache.insert(
            file.clone(),
            CachedModule {
                code: "compiled code".to_string(),
                source_map: None,
                css: None,
                mtime: old_mtime,
            },
        );

        // Modify the file to change mtime
        std::thread::sleep(std::time::Duration::from_millis(10));
        std::fs::write(&file, "const x = 2;").unwrap();

        // Cache should now be a miss since mtime changed
        let result = cache.get(&file);
        assert!(result.is_none());
    }

    #[test]
    fn test_cache_explicit_invalidation() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("test.tsx");
        std::fs::write(&file, "const x = 1;").unwrap();
        let mtime = get_file_mtime(&file).unwrap();

        let cache = CompilationCache::new();
        cache.insert(
            file.clone(),
            CachedModule {
                code: "compiled code".to_string(),
                source_map: None,
                css: None,
                mtime,
            },
        );

        cache.invalidate(&file);
        assert!(cache.get(&file).is_none());
        assert!(cache.is_empty());
    }

    #[test]
    fn test_cache_clear() {
        let tmp = tempfile::tempdir().unwrap();
        let file1 = tmp.path().join("a.tsx");
        let file2 = tmp.path().join("b.tsx");
        std::fs::write(&file1, "a").unwrap();
        std::fs::write(&file2, "b").unwrap();

        let cache = CompilationCache::new();
        let mtime1 = get_file_mtime(&file1).unwrap();
        let mtime2 = get_file_mtime(&file2).unwrap();

        cache.insert(
            file1.clone(),
            CachedModule {
                code: "a".to_string(),
                source_map: None,
                css: None,
                mtime: mtime1,
            },
        );
        cache.insert(
            file2.clone(),
            CachedModule {
                code: "b".to_string(),
                source_map: None,
                css: None,
                mtime: mtime2,
            },
        );

        assert_eq!(cache.len(), 2);
        cache.clear();
        assert!(cache.is_empty());
    }

    #[test]
    fn test_cache_thread_safety() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("test.tsx");
        std::fs::write(&file, "const x = 1;").unwrap();
        let mtime = get_file_mtime(&file).unwrap();

        let cache = CompilationCache::new();
        cache.insert(
            file.clone(),
            CachedModule {
                code: "compiled".to_string(),
                source_map: None,
                css: None,
                mtime,
            },
        );

        let cache_clone = cache.clone();
        let file_clone = file.clone();

        let handle = thread::spawn(move || {
            let result = cache_clone.get(&file_clone);
            assert!(result.is_some());
            result.unwrap().code
        });

        let result = handle.join().unwrap();
        assert_eq!(result, "compiled");
    }

    #[test]
    fn test_cache_with_source_map_and_css() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("test.tsx");
        std::fs::write(&file, "const x = 1;").unwrap();
        let mtime = get_file_mtime(&file).unwrap();

        let cache = CompilationCache::new();
        cache.insert(
            file.clone(),
            CachedModule {
                code: "compiled".to_string(),
                source_map: Some(r#"{"version":3}"#.to_string()),
                css: Some(".btn { color: red; }".to_string()),
                mtime,
            },
        );

        let result = cache.get(&file).unwrap();
        assert_eq!(result.source_map, Some(r#"{"version":3}"#.to_string()));
        assert_eq!(result.css, Some(".btn { color: red; }".to_string()));
    }
}
