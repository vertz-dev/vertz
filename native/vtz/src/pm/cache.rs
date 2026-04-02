use std::path::Path;

/// Stats about cache contents
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CacheStats {
    pub location: String,
    pub metadata_bytes: u64,
    pub metadata_entries: usize,
    pub store_bytes: u64,
    pub store_packages: usize,
}

/// Collect cache statistics by walking directory contents
pub fn cache_stats(cache_dir: &Path) -> CacheStats {
    let metadata_dir = cache_dir.join("registry-metadata");
    let store_dir = cache_dir.join("store");

    let (metadata_bytes, metadata_entries) = dir_stats(&metadata_dir);
    let (store_bytes, store_packages) = if store_dir.exists() {
        // Count top-level directories in store as packages
        let count = std::fs::read_dir(&store_dir)
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_dir())
                    .count()
            })
            .unwrap_or(0);
        let bytes = dir_size_recursive(&store_dir);
        (bytes, count)
    } else {
        (0, 0)
    };

    CacheStats {
        location: cache_dir.to_string_lossy().to_string(),
        metadata_bytes,
        metadata_entries,
        store_bytes,
        store_packages,
    }
}

/// Clean cache — remove all or just metadata
pub fn cache_clean(cache_dir: &Path, metadata_only: bool) -> CacheCleanResult {
    let stats = cache_stats(cache_dir);

    if metadata_only {
        let metadata_dir = cache_dir.join("registry-metadata");
        let removed = stats.metadata_bytes;
        let entries = stats.metadata_entries;
        if metadata_dir.exists() {
            let _ = std::fs::remove_dir_all(&metadata_dir);
        }
        CacheCleanResult {
            bytes_removed: removed,
            packages_removed: 0,
            metadata_entries_removed: entries,
        }
    } else {
        let removed = stats.metadata_bytes + stats.store_bytes;
        let packages = stats.store_packages;
        let entries = stats.metadata_entries;
        if cache_dir.exists() {
            let _ = std::fs::remove_dir_all(cache_dir);
        }
        CacheCleanResult {
            bytes_removed: removed,
            packages_removed: packages,
            metadata_entries_removed: entries,
        }
    }
}

/// Result of cache clean operation
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CacheCleanResult {
    pub bytes_removed: u64,
    pub packages_removed: usize,
    pub metadata_entries_removed: usize,
}

/// Format cache stats as human-readable text
pub fn format_cache_list_text(stats: &CacheStats) -> String {
    let mut output = String::new();
    output.push_str(&format!("Cache location: {}\n", stats.location));
    output.push_str(&format!(
        "  Registry metadata: {} ({} entries)\n",
        format_bytes(stats.metadata_bytes),
        stats.metadata_entries
    ));
    output.push_str(&format!(
        "  Package store: {} ({} packages)\n",
        format_bytes(stats.store_bytes),
        stats.store_packages
    ));
    output.push_str(&format!(
        "  Total: {}\n",
        format_bytes(stats.metadata_bytes + stats.store_bytes)
    ));
    output
}

/// Format cache stats as JSON (single line)
pub fn format_cache_list_json(stats: &CacheStats) -> String {
    let obj = serde_json::json!({
        "location": stats.location,
        "metadata_bytes": stats.metadata_bytes,
        "metadata_entries": stats.metadata_entries,
        "store_bytes": stats.store_bytes,
        "store_packages": stats.store_packages,
    });
    format!("{}\n", obj)
}

/// Format cache clean result as human-readable text
pub fn format_cache_clean_text(result: &CacheCleanResult) -> String {
    format!(
        "Removed {} from cache ({} packages, {} metadata entries)\n",
        format_bytes(result.bytes_removed),
        result.packages_removed,
        result.metadata_entries_removed
    )
}

/// Format cache clean result as JSON
pub fn format_cache_clean_json(result: &CacheCleanResult) -> String {
    let obj = serde_json::json!({
        "event": "cache_cleaned",
        "bytes_removed": result.bytes_removed,
        "packages_removed": result.packages_removed,
        "metadata_entries_removed": result.metadata_entries_removed,
    });
    format!("{}\n", obj)
}

/// Format bytes in human-readable form
fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.1} MB", bytes as f64 / 1_048_576.0)
    } else if bytes >= 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}

/// Count files and total size in a directory (non-recursive — files only in top level)
fn dir_stats(dir: &Path) -> (u64, usize) {
    if !dir.exists() {
        return (0, 0);
    }
    let mut total_bytes: u64 = 0;
    let mut count: usize = 0;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total_bytes += meta.len();
                    count += 1;
                }
            }
        }
    }
    (total_bytes, count)
}

/// Calculate total size of a directory recursively
fn dir_size_recursive(dir: &Path) -> u64 {
    let mut total: u64 = 0;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total += meta.len();
                } else if meta.is_dir() {
                    total += dir_size_recursive(&entry.path());
                }
            }
        }
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_bytes_bytes() {
        assert_eq!(format_bytes(0), "0 B");
        assert_eq!(format_bytes(512), "512 B");
        assert_eq!(format_bytes(1023), "1023 B");
    }

    #[test]
    fn test_format_bytes_kb() {
        assert_eq!(format_bytes(1024), "1.0 KB");
        assert_eq!(format_bytes(1536), "1.5 KB");
    }

    #[test]
    fn test_format_bytes_mb() {
        assert_eq!(format_bytes(1_048_576), "1.0 MB");
        assert_eq!(format_bytes(12_400_000), "11.8 MB");
    }

    #[test]
    fn test_format_bytes_gb() {
        assert_eq!(format_bytes(1_073_741_824), "1.0 GB");
        assert_eq!(format_bytes(1_200_000_000), "1.1 GB");
    }

    #[test]
    fn test_cache_stats_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        let stats = cache_stats(dir.path());
        assert_eq!(stats.metadata_bytes, 0);
        assert_eq!(stats.metadata_entries, 0);
        assert_eq!(stats.store_bytes, 0);
        assert_eq!(stats.store_packages, 0);
    }

    #[test]
    fn test_cache_stats_with_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let metadata_dir = dir.path().join("registry-metadata");
        std::fs::create_dir_all(&metadata_dir).unwrap();
        std::fs::write(metadata_dir.join("react.json"), "{}").unwrap();
        std::fs::write(metadata_dir.join("zod.json"), "{\"name\":\"zod\"}").unwrap();

        let stats = cache_stats(dir.path());
        assert_eq!(stats.metadata_entries, 2);
        assert!(stats.metadata_bytes > 0);
        assert_eq!(stats.store_packages, 0);
    }

    #[test]
    fn test_cache_stats_with_store() {
        let dir = tempfile::tempdir().unwrap();
        let store_dir = dir.path().join("store");
        let pkg_dir = store_dir.join("zod-3.24.4");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        std::fs::write(pkg_dir.join("index.js"), "module.exports = {}").unwrap();

        let stats = cache_stats(dir.path());
        assert_eq!(stats.store_packages, 1);
        assert!(stats.store_bytes > 0);
    }

    #[test]
    fn test_cache_clean_all() {
        let dir = tempfile::tempdir().unwrap();
        let metadata_dir = dir.path().join("registry-metadata");
        let store_dir = dir.path().join("store").join("zod");
        std::fs::create_dir_all(&metadata_dir).unwrap();
        std::fs::create_dir_all(&store_dir).unwrap();
        std::fs::write(metadata_dir.join("react.json"), "{}").unwrap();
        std::fs::write(store_dir.join("index.js"), "module.exports = {}").unwrap();

        let result = cache_clean(dir.path(), false);
        assert!(result.bytes_removed > 0);
        assert_eq!(result.packages_removed, 1);
        assert_eq!(result.metadata_entries_removed, 1);
        assert!(!dir.path().exists());
    }

    #[test]
    fn test_cache_clean_metadata_only() {
        let dir = tempfile::tempdir().unwrap();
        let metadata_dir = dir.path().join("registry-metadata");
        let store_dir = dir.path().join("store").join("zod");
        std::fs::create_dir_all(&metadata_dir).unwrap();
        std::fs::create_dir_all(&store_dir).unwrap();
        std::fs::write(metadata_dir.join("react.json"), "{}").unwrap();
        std::fs::write(store_dir.join("index.js"), "module.exports = {}").unwrap();

        let result = cache_clean(dir.path(), true);
        assert!(result.bytes_removed > 0);
        assert_eq!(result.packages_removed, 0);
        assert_eq!(result.metadata_entries_removed, 1);
        // Store should still exist
        assert!(store_dir.exists());
        // Metadata should be removed
        assert!(!metadata_dir.exists());
    }

    #[test]
    fn test_cache_clean_nonexistent() {
        let dir = tempfile::tempdir().unwrap();
        let nonexistent = dir.path().join("does-not-exist");
        let result = cache_clean(&nonexistent, false);
        assert_eq!(result.bytes_removed, 0);
        assert_eq!(result.packages_removed, 0);
        assert_eq!(result.metadata_entries_removed, 0);
    }

    #[test]
    fn test_format_cache_list_text() {
        let stats = CacheStats {
            location: "/home/dev/.vertz/cache/npm".to_string(),
            metadata_bytes: 12_400_000,
            metadata_entries: 342,
            store_bytes: 1_200_000_000,
            store_packages: 1847,
        };
        let output = format_cache_list_text(&stats);
        assert!(output.contains("/home/dev/.vertz/cache/npm"));
        assert!(output.contains("342 entries"));
        assert!(output.contains("1847 packages"));
    }

    #[test]
    fn test_format_cache_list_json() {
        let stats = CacheStats {
            location: "/home/dev/.vertz/cache/npm".to_string(),
            metadata_bytes: 12_400_000,
            metadata_entries: 342,
            store_bytes: 1_200_000_000,
            store_packages: 1847,
        };
        let json = format_cache_list_json(&stats);
        let parsed: serde_json::Value = serde_json::from_str(json.trim()).unwrap();
        assert_eq!(parsed["location"], "/home/dev/.vertz/cache/npm");
        assert_eq!(parsed["metadata_bytes"], 12_400_000);
        assert_eq!(parsed["metadata_entries"], 342);
        assert_eq!(parsed["store_bytes"], 1_200_000_000_u64);
        assert_eq!(parsed["store_packages"], 1847);
    }

    #[test]
    fn test_format_cache_clean_text() {
        let result = CacheCleanResult {
            bytes_removed: 1_200_000_000,
            packages_removed: 1847,
            metadata_entries_removed: 342,
        };
        let text = format_cache_clean_text(&result);
        assert!(text.contains("1847 packages"));
        assert!(text.contains("342 metadata entries"));
    }

    #[test]
    fn test_format_cache_clean_json() {
        let result = CacheCleanResult {
            bytes_removed: 1_200_000_000,
            packages_removed: 1847,
            metadata_entries_removed: 342,
        };
        let json = format_cache_clean_json(&result);
        let parsed: serde_json::Value = serde_json::from_str(json.trim()).unwrap();
        assert_eq!(parsed["event"], "cache_cleaned");
        assert_eq!(parsed["bytes_removed"], 1_200_000_000_u64);
        assert_eq!(parsed["packages_removed"], 1847);
    }
}
