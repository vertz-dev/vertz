use crate::ci::types::{TaskCacheConfig, TaskDef, WorkspacePackage};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;

// ---------------------------------------------------------------------------
// CacheBackend trait
// ---------------------------------------------------------------------------

/// Trait for cache storage backends (local, GitHub Actions, S3/R2).
#[async_trait::async_trait]
pub trait CacheBackend: Send + Sync {
    /// Try to get a cache entry. Returns `(matched_key, data)` if found.
    /// Tries exact key first, then restore_keys in order (prefix match).
    async fn get(
        &self,
        key: &str,
        restore_keys: &[String],
    ) -> Result<Option<(String, Vec<u8>)>, String>;

    /// Store a cache entry.
    async fn put(&self, key: &str, data: &[u8]) -> Result<(), String>;

    /// Check if a key exists without downloading.
    async fn exists(&self, key: &str) -> Result<bool, String>;
}

// ---------------------------------------------------------------------------
// Cache key computation
// ---------------------------------------------------------------------------

/// Compute a content-addressable cache key for a task+package.
///
/// Inputs hashed (sha256):
/// 1. Command/steps strings
/// 2. Sorted env var keys+values (secret names only, not values)
/// 3. Content hash of input files matching cache.inputs globs
/// 4. vtz binary version
/// 5. Platform string
/// 6. Lockfile hash
pub fn compute_cache_key(
    task: &TaskDef,
    cache_config: &TaskCacheConfig,
    package: Option<&WorkspacePackage>,
    root_dir: &Path,
    platform: &str,
    lockfile_hash: &str,
    secret_names: &[String],
) -> Result<String, String> {
    let mut hasher = Sha256::new();

    // 1. Command/steps
    let cmd_str = match task {
        TaskDef::Command(c) => c.command.clone(),
        TaskDef::Steps(s) => s.steps.join("\n"),
    };
    hasher.update(cmd_str.as_bytes());

    // 2. Env vars (keys + values, sorted; for secrets, use name only)
    let mut env_pairs: Vec<(String, String)> = task
        .base()
        .env
        .iter()
        .map(|(k, v)| {
            if secret_names.contains(k) {
                (k.clone(), format!("__secret:{k}"))
            } else {
                (k.clone(), v.clone())
            }
        })
        .collect();
    env_pairs.sort();
    for (k, v) in &env_pairs {
        hasher.update(k.as_bytes());
        hasher.update(b"=");
        hasher.update(v.as_bytes());
        hasher.update(b"\n");
    }

    // 3. Input file content hashes
    let pkg_dir = match package {
        Some(pkg) => root_dir.join(&pkg.path),
        None => root_dir.to_path_buf(),
    };

    let input_hash = hash_input_files(&cache_config.inputs, &pkg_dir)?;
    hasher.update(input_hash.as_bytes());

    // 4. vtz version
    let version = env!("CARGO_PKG_VERSION");
    hasher.update(version.as_bytes());

    // 5. Platform
    hasher.update(platform.as_bytes());

    // 6. Lockfile hash
    hasher.update(lockfile_hash.as_bytes());

    let hash = hex::encode(hasher.finalize());
    Ok(hash[..16].to_string())
}

/// Build the full cache key string.
pub fn cache_key(task_name: &str, package: Option<&str>, platform: &str, hash: &str) -> String {
    match package {
        Some(pkg) => format!("pipe-v1-{platform}-{task_name}-{pkg}-{hash}"),
        None => format!("pipe-v1-{platform}-{task_name}-root-{hash}"),
    }
}

/// Generate restore key prefixes for fallback matching.
///
/// Fallback is scoped to the same `(task, package)` pair. A broader
/// task-only fallback would let one package's build tarball be restored
/// into another package's working directory, silently corrupting `dist/`.
pub fn restore_keys(task_name: &str, package: Option<&str>, platform: &str) -> Vec<String> {
    match package {
        Some(pkg) => vec![format!("pipe-v1-{platform}-{task_name}-{pkg}-")],
        None => vec![format!("pipe-v1-{platform}-{task_name}-root-")],
    }
}

/// Get the platform string (e.g., "darwin-aarch64", "linux-x86_64").
pub fn platform_string() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

/// Compute a combined hash of all lockfiles found in the project root.
/// Hashes all present lockfiles (not just the first) so that changes to
/// any lockfile (e.g., Cargo.lock in a mixed TS/Rust monorepo) invalidate caches.
pub fn lockfile_hash(root_dir: &Path) -> String {
    let mut hasher = Sha256::new();
    let mut found = false;
    for name in &["bun.lock", "Cargo.lock", "package-lock.json", "yarn.lock"] {
        let path = root_dir.join(name);
        if path.exists() {
            if let Ok(content) = std::fs::read(&path) {
                hasher.update(name.as_bytes());
                hasher.update(&content);
                found = true;
            }
        }
    }
    if found {
        hex::encode(&hasher.finalize()[..8])
    } else {
        "no-lockfile".to_string()
    }
}

/// Hash input files matching glob patterns under a directory.
/// Hashes incrementally (doesn't load all files into memory).
/// Normalize glob patterns for the Rust `glob` crate: `dir/**` → `dir/**/*`.
/// The crate treats `**` as matching directory components only, so `dist/**`
/// won't match `dist/index.js`. Appending `/*` fixes this.
fn normalize_glob(pattern: &str) -> String {
    if pattern.ends_with("/**") {
        format!("{}/*", pattern)
    } else {
        pattern.to_string()
    }
}

fn hash_input_files(patterns: &[String], base_dir: &Path) -> Result<String, String> {
    let mut all_files = Vec::new();

    for pattern in patterns {
        let normalized = normalize_glob(pattern);
        let full_pattern = base_dir.join(&normalized).display().to_string();
        match glob::glob(&full_pattern) {
            Ok(entries) => {
                for path in entries.flatten() {
                    if path.is_file() {
                        all_files.push(path);
                    }
                }
            }
            Err(e) => {
                return Err(format!("invalid glob pattern \"{pattern}\": {e}"));
            }
        }
    }

    // Sort for deterministic hashing
    all_files.sort();
    all_files.dedup();

    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];

    for path in &all_files {
        // Include relative path in hash for rename detection
        if let Ok(rel) = path.strip_prefix(base_dir) {
            hasher.update(rel.to_string_lossy().as_bytes());
        }

        let mut file = std::fs::File::open(path)
            .map_err(|e| format!("failed to read {}: {e}", path.display()))?;

        loop {
            let n = file
                .read(&mut buf)
                .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }
    }

    Ok(hex::encode(hasher.finalize()))
}

// Inline hex encoding (avoid adding a `hex` crate dependency)
mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes.as_ref().iter().map(|b| format!("{b:02x}")).collect()
    }
}

// ---------------------------------------------------------------------------
// Local cache backend
// ---------------------------------------------------------------------------

/// Manifest entry for a cached item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub size: u64,
    pub created_at: u64,
    pub last_accessed: u64,
}

/// Cache manifest stored as JSON alongside cache entries.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CacheManifest {
    pub entries: BTreeMap<String, ManifestEntry>,
}

/// Local file-system cache using tar+zstd compression.
///
/// Uses an internal Mutex to serialize manifest read/write operations,
/// preventing race conditions when concurrent workers access the cache.
/// All file I/O is offloaded to `spawn_blocking` to avoid starving
/// the tokio executor.
#[derive(Clone)]
pub struct LocalCache {
    cache_dir: PathBuf,
    max_size: u64,
    /// Guards manifest file operations against concurrent access.
    /// Wrapped in `Arc` so the struct can be cheaply cloned into
    /// `spawn_blocking` closures while sharing the same lock.
    manifest_lock: Arc<std::sync::Mutex<()>>,
}

impl LocalCache {
    /// Create a new local cache.
    /// `cache_dir` defaults to `.pipe/cache` under the root.
    /// `max_size` defaults to 2 GB.
    pub fn new(cache_dir: PathBuf, max_size: Option<u64>) -> Self {
        Self {
            cache_dir,
            max_size: max_size.unwrap_or(2 * 1024 * 1024 * 1024), // 2 GB
            manifest_lock: Arc::new(std::sync::Mutex::new(())),
        }
    }

    /// Maximum cache size in bytes.
    pub fn max_size(&self) -> u64 {
        self.max_size
    }

    /// Path to the manifest file.
    fn manifest_path(&self) -> PathBuf {
        self.cache_dir.join("manifest.json")
    }

    /// Path to a cache entry file.
    /// Replaces `/` in the key with `__` to produce a flat, filesystem-safe filename.
    fn entry_path(&self, key: &str) -> PathBuf {
        let safe_key = key.replace('/', "__");
        self.cache_dir.join(format!("{safe_key}.tar.zst"))
    }

    /// Load the manifest from disk.
    fn load_manifest(&self) -> CacheManifest {
        let path = self.manifest_path();
        if !path.exists() {
            return CacheManifest::default();
        }
        match std::fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => CacheManifest::default(),
        }
    }

    /// Save the manifest to disk.
    fn save_manifest(&self, manifest: &CacheManifest) -> Result<(), String> {
        let path = self.manifest_path();
        let json = serde_json::to_string_pretty(manifest)
            .map_err(|e| format!("failed to serialize manifest: {e}"))?;
        std::fs::write(&path, json).map_err(|e| format!("failed to write manifest: {e}"))
    }

    /// Run LRU eviction if total size exceeds max_size.
    fn evict_if_needed(&self, manifest: &mut CacheManifest) -> Result<(), String> {
        let total: u64 = manifest.entries.values().map(|e| e.size).sum();
        if total <= self.max_size {
            return Ok(());
        }

        // Sort by last_accessed ascending (oldest first)
        let mut entries: Vec<(String, ManifestEntry)> = manifest
            .entries
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        entries.sort_by_key(|e| e.1.last_accessed);

        let mut current_size = total;
        for (key, entry) in entries {
            if current_size <= self.max_size {
                break;
            }
            // Remove entry
            let path = self.entry_path(&key);
            let _ = std::fs::remove_file(&path);
            current_size = current_size.saturating_sub(entry.size);
            manifest.entries.remove(&key);
        }

        Ok(())
    }

    /// Get the current Unix timestamp in seconds.
    fn now_unix_secs() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    /// Get total cache size and entry count.
    pub fn status(&self) -> (u64, usize) {
        let manifest = self.load_manifest();
        let total: u64 = manifest.entries.values().map(|e| e.size).sum();
        (total, manifest.entries.len())
    }

    /// Remove all cache entries and manifest.
    pub fn clean(&self) -> Result<(usize, u64), String> {
        let manifest = self.load_manifest();
        let count = manifest.entries.len();
        let total: u64 = manifest.entries.values().map(|e| e.size).sum();

        if self.cache_dir.exists() {
            std::fs::remove_dir_all(&self.cache_dir)
                .map_err(|e| format!("failed to clean cache: {e}"))?;
        }

        Ok((count, total))
    }
}

/// Private synchronous implementations, called via `spawn_blocking`
/// in the `CacheBackend` async trait methods.
impl LocalCache {
    fn get_sync(
        &self,
        key: &str,
        restore_keys: &[String],
    ) -> Result<Option<(String, Vec<u8>)>, String> {
        let _lock = self
            .manifest_lock
            .lock()
            .map_err(|e| format!("manifest lock poisoned: {e}"))?;

        let mut manifest = self.load_manifest();

        // Try exact key
        let entry_path = self.entry_path(key);
        if entry_path.exists() {
            let data = std::fs::read(&entry_path)
                .map_err(|e| format!("failed to read cache entry: {e}"))?;

            // Update last_accessed
            if let Some(entry) = manifest.entries.get_mut(key) {
                entry.last_accessed = Self::now_unix_secs();
                let _ = self.save_manifest(&manifest);
            }

            return Ok(Some((key.to_string(), data)));
        }

        // Try restore keys (prefix match)
        for prefix in restore_keys {
            let mut best_key: Option<&str> = None;
            let mut best_created: u64 = 0;

            for (k, entry) in &manifest.entries {
                if k.starts_with(prefix.as_str())
                    && (best_key.is_none() || entry.created_at > best_created)
                {
                    best_key = Some(k.as_str());
                    best_created = entry.created_at;
                }
            }

            if let Some(matched_key) = best_key {
                let path = self.entry_path(matched_key);
                if path.exists() {
                    let data = std::fs::read(&path)
                        .map_err(|e| format!("failed to read cache entry: {e}"))?;

                    // Update last_accessed
                    let matched_key = matched_key.to_string();
                    if let Some(entry) = manifest.entries.get_mut(&matched_key) {
                        entry.last_accessed = Self::now_unix_secs();
                        let _ = self.save_manifest(&manifest);
                    }

                    return Ok(Some((matched_key, data)));
                }
            }
        }

        Ok(None)
    }

    fn put_sync(&self, key: &str, data: &[u8]) -> Result<(), String> {
        // Ensure cache directory exists
        std::fs::create_dir_all(&self.cache_dir)
            .map_err(|e| format!("failed to create cache dir: {e}"))?;

        // Lock before writing the file so concurrent puts for the same key
        // cannot race on file data vs. manifest metadata.
        let _lock = self
            .manifest_lock
            .lock()
            .map_err(|e| format!("manifest lock poisoned: {e}"))?;

        let entry_path = self.entry_path(key);
        std::fs::write(&entry_path, data)
            .map_err(|e| format!("failed to write cache entry: {e}"))?;

        // Update manifest
        let mut manifest = self.load_manifest();
        let now = Self::now_unix_secs();
        manifest.entries.insert(
            key.to_string(),
            ManifestEntry {
                size: data.len() as u64,
                created_at: now,
                last_accessed: now,
            },
        );

        // LRU eviction
        self.evict_if_needed(&mut manifest)?;
        self.save_manifest(&manifest)?;

        Ok(())
    }

    fn exists_sync(&self, key: &str) -> Result<bool, String> {
        Ok(self.entry_path(key).exists())
    }
}

#[async_trait::async_trait]
impl CacheBackend for LocalCache {
    async fn get(
        &self,
        key: &str,
        restore_keys: &[String],
    ) -> Result<Option<(String, Vec<u8>)>, String> {
        let this = self.clone();
        let key = key.to_string();
        let restore_keys = restore_keys.to_vec();
        tokio::task::spawn_blocking(move || this.get_sync(&key, &restore_keys))
            .await
            .map_err(|e| format!("cache get task failed: {e}"))?
    }

    async fn put(&self, key: &str, data: &[u8]) -> Result<(), String> {
        let this = self.clone();
        let key = key.to_string();
        let data = data.to_vec();
        tokio::task::spawn_blocking(move || this.put_sync(&key, &data))
            .await
            .map_err(|e| format!("cache put task failed: {e}"))?
    }

    async fn exists(&self, key: &str) -> Result<bool, String> {
        let this = self.clone();
        let key = key.to_string();
        tokio::task::spawn_blocking(move || this.exists_sync(&key))
            .await
            .map_err(|e| format!("cache exists task failed: {e}"))?
    }
}

// ---------------------------------------------------------------------------
// Pack / restore outputs
// ---------------------------------------------------------------------------

/// Sentinel data stored for tasks with no output files (typecheck, test, etc.).
/// On cache hit the scheduler checks for this marker to skip execution without
/// attempting to unpack a tar archive.
pub const SENTINEL_DATA: &[u8] = b"__pipe_ok__";

/// Returns `true` if `data` is the no-output sentinel (not a tar+zstd archive).
pub fn is_sentinel(data: &[u8]) -> bool {
    data == SENTINEL_DATA
}

/// Pack output files into a tar+zstd archive.
pub fn pack_outputs(output_patterns: &[String], base_dir: &Path) -> Result<Vec<u8>, String> {
    let mut files = Vec::new();
    for pattern in output_patterns {
        let normalized = normalize_glob(pattern);
        let full_pattern = base_dir.join(&normalized).display().to_string();
        match glob::glob(&full_pattern) {
            Ok(entries) => {
                for path in entries.flatten() {
                    if path.is_file() {
                        files.push(path);
                    }
                }
            }
            Err(e) => {
                return Err(format!("invalid output glob \"{pattern}\": {e}"));
            }
        }
    }

    files.sort();
    files.dedup();

    // No files matched — return empty to skip caching
    if files.is_empty() {
        return Ok(Vec::new());
    }

    // Create tar archive in memory
    let mut tar_data = Vec::new();
    {
        let mut builder = tar::Builder::new(&mut tar_data);
        for file_path in &files {
            let rel_path = file_path
                .strip_prefix(base_dir)
                .map_err(|_| format!("file {} is outside base dir", file_path.display()))?;

            // Validate no path traversal
            for component in rel_path.components() {
                if let std::path::Component::ParentDir = component {
                    return Err(format!(
                        "path traversal detected in output: {}",
                        rel_path.display()
                    ));
                }
            }

            builder
                .append_path_with_name(file_path, rel_path)
                .map_err(|e| format!("failed to add {} to archive: {e}", file_path.display()))?;
        }
        builder
            .finish()
            .map_err(|e| format!("failed to finalize archive: {e}"))?;
    }

    // Compress with zstd
    let compressed = zstd::encode_all(tar_data.as_slice(), 3)
        .map_err(|e| format!("zstd compression failed: {e}"))?;

    Ok(compressed)
}

/// Restore outputs from a tar+zstd archive to the target directory.
pub fn restore_outputs(data: &[u8], target_dir: &Path) -> Result<usize, String> {
    // Decompress
    let decompressed =
        zstd::decode_all(data).map_err(|e| format!("zstd decompression failed: {e}"))?;

    // Extract tar
    let mut archive = tar::Archive::new(decompressed.as_slice());
    let mut count = 0;

    for entry_result in archive
        .entries()
        .map_err(|e| format!("failed to read archive: {e}"))?
    {
        let mut entry = entry_result.map_err(|e| format!("invalid archive entry: {e}"))?;

        // Validate path — prevent path traversal
        let path = entry
            .path()
            .map_err(|e| format!("invalid path in archive: {e}"))?
            .to_path_buf();

        for component in path.components() {
            match component {
                std::path::Component::ParentDir
                | std::path::Component::RootDir
                | std::path::Component::Prefix(_) => {
                    return Err(format!("unsafe path in archive entry: {}", path.display()));
                }
                _ => {}
            }
        }

        let target_path = target_dir.join(&path);
        if let Some(parent) = target_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("failed to create dir {}: {e}", parent.display()))?;
        }

        let mut output = std::fs::File::create(&target_path)
            .map_err(|e| format!("failed to create {}: {e}", target_path.display()))?;

        std::io::copy(&mut entry, &mut output)
            .map_err(|e| format!("failed to extract {}: {e}", path.display()))?;

        count += 1;
    }

    Ok(count)
}

// ---------------------------------------------------------------------------
// Cache manager (selects backend)
// ---------------------------------------------------------------------------

/// Create the appropriate cache backend from config.
pub fn create_cache_backend(
    root_dir: &Path,
    local_path: Option<&str>,
    max_size: Option<u64>,
) -> Box<dyn CacheBackend> {
    let cache_dir = match local_path {
        Some(p) => {
            let path = Path::new(p);
            if path.is_absolute() {
                path.to_path_buf()
            } else {
                root_dir.join(p)
            }
        }
        None => root_dir.join(".pipe").join("cache"),
    };
    Box::new(LocalCache::new(cache_dir, max_size))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ci::types::{CommandTask, TaskBase, TaskScope};

    fn test_cache_dir() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let cache_dir = dir.path().join("cache");
        (dir, cache_dir)
    }

    // -- hex encoding --

    #[test]
    fn hex_encode_basic() {
        assert_eq!(hex::encode([0x00, 0xff, 0xab]), "00ffab");
        assert_eq!(hex::encode([]), "");
    }

    // -- cache key computation --

    #[test]
    fn cache_key_format() {
        let key = cache_key("build", Some("@vertz/ui"), "darwin-aarch64", "abc123");
        assert_eq!(key, "pipe-v1-darwin-aarch64-build-@vertz/ui-abc123");
    }

    #[test]
    fn cache_key_root_task() {
        let key = cache_key("lint", None, "linux-x86_64", "def456");
        assert_eq!(key, "pipe-v1-linux-x86_64-lint-root-def456");
    }

    // -- restore keys --

    #[test]
    fn restore_keys_package_scoped_to_same_package() {
        // Fallback must only match entries from the SAME package.
        // A task-only fallback (no package) would let one package's build
        // tarball overwrite another package's dist on restore.
        let keys = restore_keys("build", Some("@vertz/ui"), "darwin-aarch64");
        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0], "pipe-v1-darwin-aarch64-build-@vertz/ui-");
    }

    #[test]
    fn restore_keys_root_scoped_to_root() {
        let keys = restore_keys("lint", None, "linux-x86_64");
        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0], "pipe-v1-linux-x86_64-lint-root-");
    }

    #[tokio::test]
    async fn fallback_never_matches_other_package_entry() {
        // Regression: `restore_keys` used to include a package-less fallback
        // (`pipe-v1-{platform}-{task}-`) that matched ANY package's entry.
        // When @vertz/ci's build key missed, the scheduler warm-restored
        // @vertz/test's build tarball into @vertz/ci's working dir, silently
        // corrupting packages/ci/dist/ with @vertz/test's dist files.
        let (_dir, cache_dir) = test_cache_dir();
        let cache = LocalCache::new(cache_dir, None);

        // Another package's prior build cache exists.
        cache
            .put(
                "pipe-v1-darwin-aarch64-build-@vertz/test-abc123",
                b"other-package-data",
            )
            .await
            .unwrap();

        // Look up @vertz/ci's build key (miss).
        let restore = restore_keys("build", Some("@vertz/ci"), "darwin-aarch64");
        let result = cache
            .get("pipe-v1-darwin-aarch64-build-@vertz/ci-def456", &restore)
            .await
            .unwrap();

        assert!(
            result.is_none(),
            "fallback must not match a different package's entry (got {:?})",
            result.map(|(k, _)| k),
        );
    }

    #[tokio::test]
    async fn fallback_matches_same_package_with_different_hash() {
        // Counterpart to `fallback_never_matches_other_package_entry`: prove the
        // narrow per-package prefix still serves its purpose — restoring a prior
        // build tarball for the same (task, package) when only the input hash
        // changed.
        let (_dir, cache_dir) = test_cache_dir();
        let cache = LocalCache::new(cache_dir, None);

        cache
            .put(
                "pipe-v1-darwin-aarch64-build-@vertz/ci-old-hash",
                b"prior-ci-build",
            )
            .await
            .unwrap();

        let restore = restore_keys("build", Some("@vertz/ci"), "darwin-aarch64");
        let result = cache
            .get("pipe-v1-darwin-aarch64-build-@vertz/ci-new-hash", &restore)
            .await
            .unwrap();

        let (matched_key, data) = result.expect("same-package fallback should hit");
        assert_eq!(
            matched_key,
            "pipe-v1-darwin-aarch64-build-@vertz/ci-old-hash"
        );
        assert_eq!(&data[..], b"prior-ci-build");
    }

    // -- platform string --

    #[test]
    fn platform_string_not_empty() {
        let p = platform_string();
        assert!(!p.is_empty());
        assert!(p.contains('-'));
    }

    // -- lockfile_hash --

    #[test]
    fn lockfile_hash_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(lockfile_hash(dir.path()), "no-lockfile");
    }

    #[test]
    fn lockfile_hash_exists() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("bun.lock"), "some-lock-content").unwrap();
        let hash = lockfile_hash(dir.path());
        assert_ne!(hash, "no-lockfile");
        assert_eq!(hash.len(), 16); // 8 bytes = 16 hex chars
    }

    #[test]
    fn lockfile_hash_deterministic() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("bun.lock"), "fixed-content").unwrap();
        let h1 = lockfile_hash(dir.path());
        let h2 = lockfile_hash(dir.path());
        assert_eq!(h1, h2);
    }

    #[test]
    fn lockfile_hash_multiple_lockfiles_differ_from_single() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("bun.lock"), "bun-content").unwrap();
        let single = lockfile_hash(dir.path());

        std::fs::write(dir.path().join("Cargo.lock"), "cargo-content").unwrap();
        let combined = lockfile_hash(dir.path());

        assert_ne!(
            single, combined,
            "adding a second lockfile must change the hash"
        );
    }

    #[test]
    fn lockfile_hash_changes_when_second_lockfile_changes() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("bun.lock"), "bun-content").unwrap();
        std::fs::write(dir.path().join("Cargo.lock"), "cargo-v1").unwrap();
        let h1 = lockfile_hash(dir.path());

        std::fs::write(dir.path().join("Cargo.lock"), "cargo-v2").unwrap();
        let h2 = lockfile_hash(dir.path());

        assert_ne!(h1, h2, "changing Cargo.lock must invalidate the cache key");
    }

    #[test]
    fn lockfile_hash_all_four_lockfiles() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("bun.lock"), "a").unwrap();
        std::fs::write(dir.path().join("Cargo.lock"), "b").unwrap();
        std::fs::write(dir.path().join("package-lock.json"), "c").unwrap();
        std::fs::write(dir.path().join("yarn.lock"), "d").unwrap();
        let hash = lockfile_hash(dir.path());

        assert_ne!(hash, "no-lockfile");
        assert_eq!(hash.len(), 16);
    }

    // -- hash_input_files --

    #[test]
    fn hash_input_files_empty_patterns() {
        let dir = tempfile::tempdir().unwrap();
        let hash = hash_input_files(&[], dir.path()).unwrap();
        assert!(!hash.is_empty());
    }

    #[test]
    fn hash_input_files_deterministic() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.ts"), "export const a = 1;").unwrap();
        std::fs::write(dir.path().join("b.ts"), "export const b = 2;").unwrap();

        let patterns = vec!["*.ts".to_string()];
        let h1 = hash_input_files(&patterns, dir.path()).unwrap();
        let h2 = hash_input_files(&patterns, dir.path()).unwrap();
        assert_eq!(h1, h2);
    }

    #[test]
    fn hash_input_files_different_content() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.ts"), "v1").unwrap();
        let h1 = hash_input_files(&["*.ts".to_string()], dir.path()).unwrap();

        std::fs::write(dir.path().join("a.ts"), "v2").unwrap();
        let h2 = hash_input_files(&["*.ts".to_string()], dir.path()).unwrap();

        assert_ne!(h1, h2);
    }

    // -- compute_cache_key --

    #[test]
    fn compute_key_same_inputs_same_hash() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("src.ts"), "code").unwrap();

        let task = TaskDef::Command(CommandTask {
            command: "bun run build".to_string(),
            base: TaskBase {
                scope: TaskScope::Package,
                ..Default::default()
            },
        });
        let cache_cfg = TaskCacheConfig {
            inputs: vec!["*.ts".to_string()],
            outputs: vec!["dist/**".to_string()],
        };
        let pkg = WorkspacePackage {
            name: "@vertz/ui".to_string(),
            version: "0.1.0".to_string(),
            path: PathBuf::from("."),
            internal_deps: vec![],
        };

        let h1 = compute_cache_key(
            &task,
            &cache_cfg,
            Some(&pkg),
            dir.path(),
            "darwin-aarch64",
            "lock123",
            &[],
        )
        .unwrap();
        let h2 = compute_cache_key(
            &task,
            &cache_cfg,
            Some(&pkg),
            dir.path(),
            "darwin-aarch64",
            "lock123",
            &[],
        )
        .unwrap();
        assert_eq!(h1, h2);
    }

    #[test]
    fn compute_key_different_platform_different_hash() {
        let dir = tempfile::tempdir().unwrap();

        let task = TaskDef::Command(CommandTask {
            command: "build".to_string(),
            base: TaskBase::default(),
        });
        let cache_cfg = TaskCacheConfig {
            inputs: vec![],
            outputs: vec![],
        };

        let h1 = compute_cache_key(
            &task,
            &cache_cfg,
            None,
            dir.path(),
            "darwin-aarch64",
            "lock",
            &[],
        )
        .unwrap();
        let h2 = compute_cache_key(
            &task,
            &cache_cfg,
            None,
            dir.path(),
            "linux-x86_64",
            "lock",
            &[],
        )
        .unwrap();
        assert_ne!(h1, h2);
    }

    #[test]
    fn compute_key_different_lockfile_different_hash() {
        let dir = tempfile::tempdir().unwrap();

        let task = TaskDef::Command(CommandTask {
            command: "build".to_string(),
            base: TaskBase::default(),
        });
        let cache_cfg = TaskCacheConfig {
            inputs: vec![],
            outputs: vec![],
        };

        let h1 =
            compute_cache_key(&task, &cache_cfg, None, dir.path(), "darwin", "lock1", &[]).unwrap();
        let h2 =
            compute_cache_key(&task, &cache_cfg, None, dir.path(), "darwin", "lock2", &[]).unwrap();
        assert_ne!(h1, h2);
    }

    // -- pack/restore outputs --

    #[test]
    fn pack_restore_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("file1.txt"), "hello").unwrap();
        std::fs::write(src.join("file2.txt"), "world").unwrap();

        let data = pack_outputs(&["src/*.txt".to_string()], dir.path()).unwrap();
        assert!(!data.is_empty());

        let restore_dir = dir.path().join("restored");
        std::fs::create_dir_all(&restore_dir).unwrap();
        let count = restore_outputs(&data, &restore_dir).unwrap();
        assert_eq!(count, 2);

        assert_eq!(
            std::fs::read_to_string(restore_dir.join("src/file1.txt")).unwrap(),
            "hello"
        );
        assert_eq!(
            std::fs::read_to_string(restore_dir.join("src/file2.txt")).unwrap(),
            "world"
        );
    }

    #[test]
    fn pack_no_files_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        let data = pack_outputs(&["*.nonexistent".to_string()], dir.path()).unwrap();
        // No files matched → empty vec (skips caching)
        assert!(data.is_empty());
    }

    #[test]
    fn restore_path_traversal_rejected() {
        // Create a malicious tar by writing raw bytes with a ../  path.
        // The `tar` crate's builder rejects `..` paths, so we construct
        // the archive bytes manually.
        let mut tar_data = Vec::new();
        {
            // GNU tar header: 512 bytes
            let mut header = [0u8; 512];
            let path_bytes = b"../../../etc/passwd";
            header[..path_bytes.len()].copy_from_slice(path_bytes);
            // Size field at offset 124 (11 octal chars + null)
            let size_str = format!("{:011o}\0", 9); // 9 bytes of data
            header[124..136].copy_from_slice(size_str.as_bytes());
            // Mode
            header[100..107].copy_from_slice(b"0000644");
            // Magic
            header[257..263].copy_from_slice(b"ustar\0");
            // Version
            header[263..265].copy_from_slice(b"00");
            // Compute checksum
            // Set checksum field to spaces first
            header[148..156].fill(b' ');
            let cksum: u32 = header.iter().map(|&b| b as u32).sum();
            let cksum_str = format!("{:06o}\0 ", cksum);
            header[148..156].copy_from_slice(cksum_str.as_bytes());

            tar_data.extend_from_slice(&header);
            // Data block (padded to 512)
            let mut data_block = [0u8; 512];
            data_block[..9].copy_from_slice(b"malicious");
            tar_data.extend_from_slice(&data_block);
            // Two blocks of zeros to end archive
            tar_data.extend_from_slice(&[0u8; 1024]);
        }

        let compressed = zstd::encode_all(tar_data.as_slice(), 3).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let result = restore_outputs(&compressed, dir.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unsafe path"));
    }

    #[test]
    fn restore_absolute_path_rejected() {
        // Construct a tar with an absolute path entry
        let mut tar_data = Vec::new();
        {
            let mut header = [0u8; 512];
            let path_bytes = b"/tmp/malicious";
            header[..path_bytes.len()].copy_from_slice(path_bytes);
            let size_str = format!("{:011o}\0", 5);
            header[124..136].copy_from_slice(size_str.as_bytes());
            header[100..107].copy_from_slice(b"0000644");
            header[257..263].copy_from_slice(b"ustar\0");
            header[263..265].copy_from_slice(b"00");
            header[148..156].fill(b' ');
            let cksum: u32 = header.iter().map(|&b| b as u32).sum();
            let cksum_str = format!("{:06o}\0 ", cksum);
            header[148..156].copy_from_slice(cksum_str.as_bytes());

            tar_data.extend_from_slice(&header);
            let mut data_block = [0u8; 512];
            data_block[..5].copy_from_slice(b"hello");
            tar_data.extend_from_slice(&data_block);
            tar_data.extend_from_slice(&[0u8; 1024]);
        }

        let compressed = zstd::encode_all(tar_data.as_slice(), 3).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let result = restore_outputs(&compressed, dir.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unsafe path"));
    }

    // -- LocalCache --

    #[tokio::test]
    async fn local_cache_put_get_exact() {
        let (_dir, cache_dir) = test_cache_dir();
        let cache = LocalCache::new(cache_dir, None);

        cache.put("key1", b"data1").await.unwrap();
        let result = cache.get("key1", &[]).await.unwrap();
        assert!(result.is_some());
        let (key, data) = result.unwrap();
        assert_eq!(key, "key1");
        assert_eq!(data, b"data1");
    }

    #[tokio::test]
    async fn local_cache_get_miss() {
        let (_dir, cache_dir) = test_cache_dir();
        let cache = LocalCache::new(cache_dir, None);

        let result = cache.get("nonexistent", &[]).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn local_cache_fallback_key() {
        let (_dir, cache_dir) = test_cache_dir();
        let cache = LocalCache::new(cache_dir, None);

        cache
            .put("pipe-v1-darwin-build-ui-abc", b"old-data")
            .await
            .unwrap();

        let restore = vec!["pipe-v1-darwin-build-ui-".to_string()];
        let result = cache
            .get("pipe-v1-darwin-build-ui-def", &restore)
            .await
            .unwrap();
        assert!(result.is_some());
        let (key, data) = result.unwrap();
        assert_eq!(key, "pipe-v1-darwin-build-ui-abc");
        assert_eq!(data, b"old-data");
    }

    #[tokio::test]
    async fn local_cache_exists() {
        let (_dir, cache_dir) = test_cache_dir();
        let cache = LocalCache::new(cache_dir, None);

        assert!(!cache.exists("key1").await.unwrap());
        cache.put("key1", b"data").await.unwrap();
        assert!(cache.exists("key1").await.unwrap());
    }

    #[tokio::test]
    async fn local_cache_lru_eviction() {
        let (_dir, cache_dir) = test_cache_dir();
        // Very small max size to trigger eviction
        let cache = LocalCache::new(cache_dir, Some(100));

        // Put entries that total > 100 bytes
        cache.put("key1", &[0u8; 50]).await.unwrap();
        cache.put("key2", &[0u8; 50]).await.unwrap();
        cache.put("key3", &[0u8; 50]).await.unwrap(); // should evict key1

        let manifest = cache.load_manifest();
        // key1 should have been evicted (oldest)
        assert!(!manifest.entries.contains_key("key1"));
        assert!(manifest.entries.contains_key("key3"));
    }

    #[tokio::test]
    async fn local_cache_clean() {
        let (_dir, cache_dir) = test_cache_dir();
        let cache = LocalCache::new(cache_dir.clone(), None);

        cache.put("key1", b"data1").await.unwrap();
        cache.put("key2", b"data2").await.unwrap();

        let (count, _size) = cache.clean().unwrap();
        assert_eq!(count, 2);
        assert!(!cache_dir.exists());
    }

    #[tokio::test]
    async fn local_cache_status() {
        let (_dir, cache_dir) = test_cache_dir();
        let cache = LocalCache::new(cache_dir, None);

        cache.put("key1", &[0u8; 100]).await.unwrap();
        cache.put("key2", &[0u8; 200]).await.unwrap();

        let (total, count) = cache.status();
        assert_eq!(count, 2);
        assert_eq!(total, 300);
    }

    #[tokio::test]
    async fn local_cache_concurrent_put_get() {
        let (_dir, cache_dir) = test_cache_dir();
        let cache = std::sync::Arc::new(LocalCache::new(cache_dir, None));

        // Spawn multiple concurrent puts
        let mut handles = Vec::new();
        for i in 0..10u8 {
            let c = cache.clone();
            let key = format!("concurrent-key-{i}");
            let data = vec![i; 64];
            handles.push(tokio::spawn(async move {
                c.put(&key, &data).await.unwrap();
            }));
        }
        for h in handles {
            h.await.unwrap();
        }

        // All entries must be readable with correct data
        for i in 0..10u8 {
            let key = format!("concurrent-key-{i}");
            let result = cache.get(&key, &[]).await.unwrap();
            assert!(result.is_some(), "key {key} missing after concurrent puts");
            let (matched, data) = result.unwrap();
            assert_eq!(matched, key);
            assert_eq!(data, vec![i; 64]);
        }

        // Manifest entry count must match
        let (_, count) = cache.status();
        assert_eq!(count, 10);
    }

    // -- compute_cache_key with secrets --

    #[test]
    fn secret_names_not_values_in_key() {
        let dir = tempfile::tempdir().unwrap();

        let mut env = BTreeMap::new();
        env.insert("API_KEY".to_string(), "actual-secret-value".to_string());
        env.insert("DEBUG".to_string(), "true".to_string());

        let task = TaskDef::Command(CommandTask {
            command: "deploy".to_string(),
            base: TaskBase {
                env,
                ..Default::default()
            },
        });
        let cache_cfg = TaskCacheConfig {
            inputs: vec![],
            outputs: vec![],
        };

        let h1 = compute_cache_key(
            &task,
            &cache_cfg,
            None,
            dir.path(),
            "darwin",
            "lock",
            &["API_KEY".to_string()],
        )
        .unwrap();

        // Same task but different actual secret value — key should be identical
        // because we only hash the name, not the value
        let mut env2 = BTreeMap::new();
        env2.insert("API_KEY".to_string(), "different-secret".to_string());
        env2.insert("DEBUG".to_string(), "true".to_string());

        let task2 = TaskDef::Command(CommandTask {
            command: "deploy".to_string(),
            base: TaskBase {
                env: env2,
                ..Default::default()
            },
        });

        let h2 = compute_cache_key(
            &task2,
            &cache_cfg,
            None,
            dir.path(),
            "darwin",
            "lock",
            &["API_KEY".to_string()],
        )
        .unwrap();

        assert_eq!(h1, h2);
    }

    // -- pack with ** glob --

    #[test]
    fn pack_outputs_double_star_glob() {
        let dir = tempfile::tempdir().unwrap();
        let dist = dir.path().join("dist");
        std::fs::create_dir_all(&dist).unwrap();
        std::fs::write(dist.join("index.js"), "code").unwrap();
        std::fs::write(dist.join("index.d.ts"), "types").unwrap();

        let data = pack_outputs(&["dist/**".to_string()], dir.path()).unwrap();
        assert!(
            !data.is_empty(),
            "dist/** should match files in dist/ directory"
        );
    }

    // -- sentinel --

    #[test]
    fn sentinel_is_detected() {
        assert!(is_sentinel(SENTINEL_DATA));
        assert!(!is_sentinel(b"other data"));
        assert!(!is_sentinel(&[]));
    }

    #[tokio::test]
    async fn local_cache_sentinel_roundtrip() {
        let (_dir, cache_dir) = test_cache_dir();
        let cache = LocalCache::new(cache_dir, None);

        cache.put("sentinel-key", SENTINEL_DATA).await.unwrap();
        let result = cache.get("sentinel-key", &[]).await.unwrap();
        assert!(result.is_some());
        let (key, data) = result.unwrap();
        assert_eq!(key, "sentinel-key");
        assert!(is_sentinel(&data));
    }

    // -- create_cache_backend with custom path --

    #[test]
    fn create_cache_backend_default_path() {
        let dir = tempfile::tempdir().unwrap();
        let _backend = create_cache_backend(dir.path(), None, None);
        // Should not panic — backend created with default .pipe/cache
    }

    #[test]
    fn create_cache_backend_custom_relative_path() {
        let dir = tempfile::tempdir().unwrap();
        let _backend = create_cache_backend(dir.path(), Some("my-cache"), None);
        // Relative path resolved against root_dir
    }

    #[test]
    fn create_cache_backend_custom_absolute_path() {
        let dir = tempfile::tempdir().unwrap();
        let abs_path = dir.path().join("abs-cache");
        let _backend = create_cache_backend(dir.path(), Some(abs_path.to_str().unwrap()), None);
    }

    #[tokio::test]
    async fn create_cache_backend_custom_path_writes_to_correct_dir() {
        let dir = tempfile::tempdir().unwrap();
        let backend = create_cache_backend(dir.path(), Some("custom-cache"), None);

        backend.put("test-key", b"test-data").await.unwrap();

        let cache_dir = dir.path().join("custom-cache");
        assert!(cache_dir.exists(), "custom cache dir should be created");
        assert!(
            cache_dir.join("manifest.json").exists(),
            "manifest should exist"
        );
    }
}
