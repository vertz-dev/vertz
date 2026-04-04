// ---------------------------------------------------------------------------
// Disk cache for optimized images at .vertz/images/.
// Cache key includes source file mtime for automatic invalidation.
// ---------------------------------------------------------------------------

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Cache key — deterministic SHA-256 hash of source path, mtime, and all params.
#[derive(Debug, Clone)]
pub struct CacheKey {
    pub hash: String,
    pub extension: String,
}

impl CacheKey {
    /// Compute cache key from request parameters and source file metadata.
    pub fn compute(
        source_path: &Path,
        source_mtime: SystemTime,
        width: Option<u32>,
        height: Option<u32>,
        format_ext: &str,
        quality: u8,
        fit: &str,
    ) -> Self {
        let mtime_nanos = source_mtime
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();

        let mut hasher = Sha256::new();
        hasher.update(source_path.to_string_lossy().as_bytes());
        hasher.update(mtime_nanos.to_le_bytes());
        hasher.update(width.unwrap_or(0).to_le_bytes());
        hasher.update(height.unwrap_or(0).to_le_bytes());
        hasher.update(format_ext.as_bytes());
        hasher.update([quality]);
        hasher.update(fit.as_bytes());

        let hash = format!("{:x}", hasher.finalize());

        CacheKey {
            hash,
            extension: format_ext.to_string(),
        }
    }

    /// Full filename: `<hash>.<extension>`
    pub fn filename(&self) -> String {
        format!("{}.{}", self.hash, self.extension)
    }
}

/// Disk cache for processed images.
pub struct ImageCache {
    cache_dir: PathBuf,
}

impl ImageCache {
    pub fn new(cache_dir: PathBuf) -> Self {
        ImageCache { cache_dir }
    }

    /// Ensure the cache directory exists.
    pub fn ensure_dir(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.cache_dir)
    }

    /// Try to read a cached image. Returns `None` on miss.
    pub fn get(&self, key: &CacheKey) -> Option<Vec<u8>> {
        let path = self.path_for(key);
        std::fs::read(&path).ok()
    }

    /// Write a processed image to cache.
    pub fn put(&self, key: &CacheKey, bytes: &[u8]) -> std::io::Result<()> {
        self.ensure_dir()?;
        let path = self.path_for(key);
        std::fs::write(&path, bytes)
    }

    fn path_for(&self, key: &CacheKey) -> PathBuf {
        self.cache_dir.join(key.filename())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    // --- CacheKey tests ---

    #[test]
    fn cache_key_is_deterministic() {
        let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let k1 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            Some(600),
            "webp",
            80,
            "cover",
        );
        let k2 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            Some(600),
            "webp",
            80,
            "cover",
        );
        assert_eq!(k1.hash, k2.hash);
    }

    #[test]
    fn cache_key_hash_is_64_chars() {
        let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let key = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        assert_eq!(key.hash.len(), 64);
    }

    #[test]
    fn cache_key_different_mtime_different_hash() {
        let m1 = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let m2 = SystemTime::UNIX_EPOCH + Duration::from_secs(2000);
        let k1 = CacheKey::compute(
            Path::new("hero.png"),
            m1,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        let k2 = CacheKey::compute(
            Path::new("hero.png"),
            m2,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        assert_ne!(k1.hash, k2.hash);
    }

    #[test]
    fn cache_key_different_width_different_hash() {
        let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let k1 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        let k2 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(400),
            None,
            "webp",
            80,
            "cover",
        );
        assert_ne!(k1.hash, k2.hash);
    }

    #[test]
    fn cache_key_different_quality_different_hash() {
        let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let k1 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        let k2 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            60,
            "cover",
        );
        assert_ne!(k1.hash, k2.hash);
    }

    #[test]
    fn cache_key_different_format_different_hash() {
        let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let k1 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        let k2 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "png",
            80,
            "cover",
        );
        assert_ne!(k1.hash, k2.hash);
    }

    #[test]
    fn cache_key_different_fit_different_hash() {
        let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let k1 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        let k2 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "contain",
        );
        assert_ne!(k1.hash, k2.hash);
    }

    #[test]
    fn cache_key_different_path_different_hash() {
        let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let k1 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        let k2 = CacheKey::compute(
            Path::new("logo.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        assert_ne!(k1.hash, k2.hash);
    }

    #[test]
    fn cache_key_filename_format() {
        let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let key = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        let filename = key.filename();
        assert!(filename.ends_with(".webp"));
        assert_eq!(filename.len(), 64 + 1 + 4); // hash.webp
    }

    // --- ImageCache tests ---

    #[test]
    fn cache_get_returns_none_for_missing_key() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(dir.path().to_path_buf());
        let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let key = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        assert!(cache.get(&key).is_none());
    }

    #[test]
    fn cache_put_then_get_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(dir.path().to_path_buf());
        let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let key = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        let bytes = b"fake image data";
        cache.put(&key, bytes).unwrap();
        let retrieved = cache.get(&key).unwrap();
        assert_eq!(retrieved, bytes);
    }

    #[test]
    fn cache_put_creates_directory() {
        let dir = tempfile::tempdir().unwrap();
        let cache_dir = dir.path().join("nested").join("images");
        let cache = ImageCache::new(cache_dir.clone());
        let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let key = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        // Directory doesn't exist yet
        assert!(!cache_dir.exists());
        cache.put(&key, b"data").unwrap();
        assert!(cache_dir.exists());
    }

    #[test]
    fn cache_ensure_dir_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(dir.path().to_path_buf());
        cache.ensure_dir().unwrap();
        cache.ensure_dir().unwrap(); // second call should not fail
    }

    #[test]
    fn cache_different_keys_independent() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(dir.path().to_path_buf());
        let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let k1 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(800),
            None,
            "webp",
            80,
            "cover",
        );
        let k2 = CacheKey::compute(
            Path::new("hero.png"),
            mtime,
            Some(400),
            None,
            "webp",
            80,
            "cover",
        );

        cache.put(&k1, b"big image").unwrap();
        cache.put(&k2, b"small image").unwrap();

        assert_eq!(cache.get(&k1).unwrap(), b"big image");
        assert_eq!(cache.get(&k2).unwrap(), b"small image");
    }
}
