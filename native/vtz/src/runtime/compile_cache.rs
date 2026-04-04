//! Compilation cache for the module loader.
//!
//! Two layers:
//! - **Disk cache** (`CompileCache`): persists compiled TS → JS across process
//!   runs, keyed by `SHA-256(source + version + target)`.
//! - **In-memory shared cache** (`SharedSourceCache`): thread-safe cache shared
//!   across worker threads within a single process. Eliminates redundant disk
//!   reads when multiple test-file isolates import the same module.
//!
//! Cache location: `<root_dir>/.vertz/compile-cache/<sha256-prefix>/<sha256>.json`

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

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

    /// Compute the SHA-256 cache key for a source + target + options combination.
    ///
    /// The `options_hash` parameter encodes compile option flags (e.g., `"css:0,mock:1"`)
    /// so that the same source compiled with different options produces different cache keys.
    fn cache_key(source: &str, target: &str, options_hash: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(source.as_bytes());
        hasher.update(b"|");
        hasher.update(CACHE_VERSION.as_bytes());
        hasher.update(b"|");
        hasher.update(target.as_bytes());
        hasher.update(b"|");
        hasher.update(options_hash.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Derive the on-disk path for a cache key (2-char prefix subdirectory).
    fn cache_path(&self, key: &str) -> PathBuf {
        let prefix = &key[..2];
        self.cache_dir.join(prefix).join(format!("{}.json", key))
    }

    /// Look up a cached compilation. Returns `None` on miss or if disabled.
    ///
    /// `options_hash` encodes compile flags (e.g., `"css:0,mock:1"`) — must match
    /// the value passed to `put()` for the same compilation.
    pub fn get(&self, source: &str, target: &str, options_hash: &str) -> Option<CachedCompilation> {
        if !self.enabled {
            return None;
        }
        let key = Self::cache_key(source, target, options_hash);
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
    ///
    /// `options_hash` must match the value used in `get()` for the same source + target.
    pub fn put(
        &self,
        source: &str,
        target: &str,
        options_hash: &str,
        compilation: &CachedCompilation,
    ) {
        if !self.enabled {
            return;
        }
        let key = Self::cache_key(source, target, options_hash);
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

/// Thread-safe in-memory cache for compiled module sources.
///
/// Shared across worker threads to avoid redundant disk I/O. Once a module
/// is compiled and loaded by any isolate, subsequent isolates get the compiled
/// source from memory (zero disk I/O).
///
/// Uses `RwLock<HashMap>` instead of `DashMap` to avoid a new dependency.
/// The access pattern is low-contention: populated during the first few test
/// files per thread, then read-mostly for the rest of the run.
pub struct SharedSourceCache {
    inner: RwLock<HashMap<PathBuf, Arc<CachedCompilation>>>,
}

impl Default for SharedSourceCache {
    fn default() -> Self {
        Self::new()
    }
}

impl SharedSourceCache {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(HashMap::new()),
        }
    }

    /// Look up a compiled module by its canonical filesystem path.
    pub fn get(&self, path: &Path) -> Option<Arc<CachedCompilation>> {
        self.inner.read().unwrap().get(path).cloned()
    }

    /// Store a compiled module. If the path already exists (race), the first
    /// write wins — both compilations produce identical output for the same
    /// source, so either value is correct.
    pub fn insert(&self, path: PathBuf, compilation: Arc<CachedCompilation>) {
        let mut map = self.inner.write().unwrap();
        map.entry(path).or_insert(compilation);
    }
}

/// A single V8 bytecode cache entry.
struct V8CodeCacheEntry {
    hash: u64,
    data: Vec<u8>,
}

/// Thread-safe in-memory cache for V8 compiled bytecode.
///
/// Shared across worker threads. When V8 compiles a module to bytecode in one
/// isolate, the bytecode is stored here. Subsequent isolates skip V8's parsing
/// step by providing the cached bytecode back via `SourceCodeCacheInfo`.
///
/// Zero benefit for single-file runs (only one isolate exists).
pub struct V8CodeCache {
    inner: RwLock<HashMap<String, V8CodeCacheEntry>>,
    enabled: bool,
}

impl V8CodeCache {
    pub fn new(enabled: bool) -> Self {
        Self {
            inner: RwLock::new(HashMap::new()),
            enabled,
        }
    }

    /// Store bytecode for a module specifier. No-op if disabled.
    /// First write wins (same as `SharedSourceCache`).
    pub fn store(&self, specifier: &str, hash: u64, data: &[u8]) {
        if !self.enabled {
            return;
        }
        let mut map = self.inner.write().unwrap();
        map.entry(specifier.to_string())
            .or_insert_with(|| V8CodeCacheEntry {
                hash,
                data: data.to_vec(),
            });
    }

    /// Retrieve cached bytecode for a module specifier.
    /// Returns `None` when disabled or on cache miss.
    pub fn get(&self, specifier: &str) -> Option<deno_core::SourceCodeCacheInfo> {
        if !self.enabled {
            return None;
        }
        let map = self.inner.read().unwrap();
        map.get(specifier)
            .map(|entry| deno_core::SourceCodeCacheInfo {
                hash: entry.hash,
                data: Some(std::borrow::Cow::Owned(entry.data.clone())),
            })
    }
}

/// Thread-safe cache for module resolution results.
///
/// Maps `(specifier, referrer_directory)` → resolved canonical path.
/// Always active (not affected by `--no-cache`) because resolution is
/// deterministic: same specifier + same referrer directory = same result.
pub struct SharedResolutionCache {
    inner: RwLock<HashMap<(String, PathBuf), PathBuf>>,
}

impl Default for SharedResolutionCache {
    fn default() -> Self {
        Self::new()
    }
}

impl SharedResolutionCache {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(HashMap::new()),
        }
    }

    /// Look up a cached resolution result.
    pub fn get(&self, specifier: &str, referrer_dir: &Path) -> Option<PathBuf> {
        let key = (specifier.to_string(), referrer_dir.to_path_buf());
        self.inner.read().unwrap().get(&key).cloned()
    }

    /// Store a resolution result. First insert wins (race-safe).
    pub fn insert(&self, specifier: &str, referrer_dir: &Path, resolved: PathBuf) {
        let key = (specifier.to_string(), referrer_dir.to_path_buf());
        let mut map = self.inner.write().unwrap();
        map.entry(key).or_insert(resolved);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_miss_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), true);
        assert!(cache.get("const x = 1;", "ssr", "").is_none());
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
            "",
            &CachedCompilation {
                code: "const x = 1;".to_string(),
                source_map: Some("{\"mappings\":\"AAAA\"}".to_string()),
                css: None,
            },
        );

        let cached = cache.get(source, target, "").expect("Should hit cache");
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
            "",
            &CachedCompilation {
                code: "const x = { root: 'abc' };".to_string(),
                source_map: None,
                css: Some(".abc { color: red; }".to_string()),
            },
        );

        let cached = cache.get("const x = css({});", "ssr", "").unwrap();
        assert_eq!(cached.css.as_deref(), Some(".abc { color: red; }"));
    }

    #[test]
    fn test_cache_disabled_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), false);

        cache.put(
            "const x = 1;",
            "ssr",
            "",
            &CachedCompilation {
                code: "const x = 1;".to_string(),
                source_map: None,
                css: None,
            },
        );

        assert!(cache.get("const x = 1;", "ssr", "").is_none());
    }

    #[test]
    fn test_cache_different_source_misses() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), true);

        cache.put(
            "const x = 1;",
            "ssr",
            "",
            &CachedCompilation {
                code: "const x = 1;".to_string(),
                source_map: None,
                css: None,
            },
        );

        assert!(cache.get("const x = 2;", "ssr", "").is_none());
    }

    #[test]
    fn test_cache_different_target_misses() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), true);

        cache.put(
            "const x = 1;",
            "ssr",
            "",
            &CachedCompilation {
                code: "const x = 1;".to_string(),
                source_map: None,
                css: None,
            },
        );

        assert!(cache.get("const x = 1;", "dom", "").is_none());
    }

    #[test]
    fn test_cache_different_options_misses() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), true);

        cache.put(
            "const x = 1;",
            "ssr",
            "css:0,mock:0",
            &CachedCompilation {
                code: "const x = 1;".to_string(),
                source_map: None,
                css: None,
            },
        );

        // Same source + target but different options should miss
        assert!(cache.get("const x = 1;", "ssr", "css:1,mock:0").is_none());
        assert!(cache.get("const x = 1;", "ssr", "css:0,mock:1").is_none());
        // Same options should hit
        assert!(cache.get("const x = 1;", "ssr", "css:0,mock:0").is_some());
    }

    #[test]
    fn test_cache_files_stored_in_prefix_subdirectory() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CompileCache::new(tmp.path(), true);

        cache.put(
            "test",
            "ssr",
            "",
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

    // --- SharedSourceCache tests ---

    #[test]
    fn test_shared_cache_miss_returns_none() {
        let cache = SharedSourceCache::new();
        assert!(cache.get(Path::new("/foo/bar.ts")).is_none());
    }

    #[test]
    fn test_shared_cache_insert_then_get() {
        let cache = SharedSourceCache::new();
        let path = PathBuf::from("/foo/bar.ts");
        let compilation = Arc::new(CachedCompilation {
            code: "const x = 1;".to_string(),
            source_map: Some("{\"mappings\":\"AAAA\"}".to_string()),
            css: Some(".a { color: red; }".to_string()),
        });

        cache.insert(path.clone(), compilation);

        let cached = cache.get(&path).expect("Should hit cache");
        assert_eq!(cached.code, "const x = 1;");
        assert_eq!(
            cached.source_map.as_deref(),
            Some("{\"mappings\":\"AAAA\"}")
        );
        assert_eq!(cached.css.as_deref(), Some(".a { color: red; }"));
    }

    #[test]
    fn test_shared_cache_first_insert_wins() {
        let cache = SharedSourceCache::new();
        let path = PathBuf::from("/foo/bar.ts");

        cache.insert(
            path.clone(),
            Arc::new(CachedCompilation {
                code: "first".to_string(),
                source_map: None,
                css: None,
            }),
        );

        cache.insert(
            path.clone(),
            Arc::new(CachedCompilation {
                code: "second".to_string(),
                source_map: None,
                css: None,
            }),
        );

        let cached = cache.get(&path).unwrap();
        assert_eq!(cached.code, "first", "First insert should win");
    }

    #[test]
    fn test_shared_cache_concurrent_access() {
        let cache = Arc::new(SharedSourceCache::new());
        let mut handles = vec![];

        for i in 0..10 {
            let cache = cache.clone();
            handles.push(std::thread::spawn(move || {
                let path = PathBuf::from(format!("/module_{}.ts", i));
                cache.insert(
                    path.clone(),
                    Arc::new(CachedCompilation {
                        code: format!("code_{}", i),
                        source_map: None,
                        css: None,
                    }),
                );
                let cached = cache.get(&path).unwrap();
                assert_eq!(cached.code, format!("code_{}", i));
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }
    }

    // --- V8CodeCache tests ---

    #[test]
    fn test_v8_cache_miss_returns_none() {
        let cache = V8CodeCache::new(true);
        assert!(cache.get("file:///foo/bar.ts").is_none());
    }

    #[test]
    fn test_v8_cache_store_then_get() {
        let cache = V8CodeCache::new(true);
        let specifier = "file:///foo/bar.ts";
        let hash = 12345u64;
        let data = vec![1, 2, 3, 4, 5];

        cache.store(specifier, hash, &data);

        let cached = cache.get(specifier).expect("Should hit cache");
        assert_eq!(cached.hash, hash);
        assert_eq!(cached.data.as_deref(), Some(data.as_slice()));
    }

    #[test]
    fn test_v8_cache_disabled_returns_none() {
        let cache = V8CodeCache::new(false);
        cache.store("file:///foo/bar.ts", 123, &[1, 2, 3]);
        assert!(cache.get("file:///foo/bar.ts").is_none());
    }

    #[test]
    fn test_v8_cache_first_store_wins() {
        let cache = V8CodeCache::new(true);
        let specifier = "file:///foo/bar.ts";

        cache.store(specifier, 100, &[1, 2, 3]);
        cache.store(specifier, 200, &[4, 5, 6]);

        let cached = cache.get(specifier).unwrap();
        assert_eq!(cached.hash, 100, "First store should win");
        assert_eq!(cached.data.as_deref(), Some([1u8, 2, 3].as_slice()));
    }

    #[test]
    fn test_v8_cache_concurrent_access() {
        let cache = Arc::new(V8CodeCache::new(true));
        let mut handles = vec![];

        for i in 0..10 {
            let cache = cache.clone();
            handles.push(std::thread::spawn(move || {
                let specifier = format!("file:///module_{}.ts", i);
                let data = vec![i as u8; 4];
                cache.store(&specifier, i as u64, &data);
                let cached = cache.get(&specifier).unwrap();
                assert_eq!(cached.hash, i as u64);
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }
    }

    // --- SharedResolutionCache tests ---

    #[test]
    fn test_resolution_cache_miss_returns_none() {
        let cache = SharedResolutionCache::new();
        assert!(cache.get("@vertz/schema", Path::new("/app/src")).is_none());
    }

    #[test]
    fn test_resolution_cache_insert_then_get() {
        let cache = SharedResolutionCache::new();
        let specifier = "@vertz/schema";
        let referrer = Path::new("/app/src");
        let resolved = PathBuf::from("/app/node_modules/@vertz/schema/src/index.ts");

        cache.insert(specifier, referrer, resolved.clone());

        let cached = cache.get(specifier, referrer).expect("Should hit cache");
        assert_eq!(cached, resolved);
    }

    #[test]
    fn test_resolution_cache_different_referrer_misses() {
        let cache = SharedResolutionCache::new();
        let specifier = "./utils";
        let resolved = PathBuf::from("/app/src/utils.ts");

        cache.insert(specifier, Path::new("/app/src"), resolved);

        assert!(
            cache.get(specifier, Path::new("/app/lib")).is_none(),
            "Different referrer dir should miss"
        );
    }

    #[test]
    fn test_resolution_cache_concurrent_access() {
        let cache = Arc::new(SharedResolutionCache::new());
        let mut handles = vec![];

        for i in 0..10 {
            let cache = cache.clone();
            handles.push(std::thread::spawn(move || {
                let specifier = format!("./module_{}", i);
                let referrer = PathBuf::from("/app/src");
                let resolved = PathBuf::from(format!("/app/src/module_{}.ts", i));
                cache.insert(&specifier, &referrer, resolved.clone());
                let cached = cache.get(&specifier, &referrer).unwrap();
                assert_eq!(cached, resolved);
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }
    }
}
