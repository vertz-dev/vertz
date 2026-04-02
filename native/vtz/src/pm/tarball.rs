use flate2::read::GzDecoder;
use sha2::{Digest, Sha256, Sha512};
use std::io::Read;
use std::path::{Path, PathBuf};
use tar::Archive;
use tokio::sync::Semaphore;

const MAX_FILE_SIZE: u64 = 100 * 1024 * 1024; // 100 MB per file
const MAX_ARCHIVE_SIZE: u64 = 1024 * 1024 * 1024; // 1 GB total
const MAX_CONCURRENT_DOWNLOADS: usize = 16;

/// Download and extract a tarball to the global store
pub struct TarballManager {
    client: reqwest::Client,
    store_dir: PathBuf,
    semaphore: Semaphore,
}

impl TarballManager {
    pub fn new(cache_dir: &Path) -> Self {
        let store_dir = cache_dir.join("store");
        std::fs::create_dir_all(&store_dir).ok();

        Self {
            client: reqwest::Client::builder()
                .user_agent("vtz/0.1.0")
                .build()
                .expect("Failed to create HTTP client"),
            store_dir,
            semaphore: Semaphore::new(MAX_CONCURRENT_DOWNLOADS),
        }
    }

    /// Get the path where a package is stored after extraction
    pub fn store_path(&self, name: &str, version: &str) -> PathBuf {
        self.store_dir
            .join(format!("{}@{}", name.replace('/', "+"), version))
    }

    /// Check if a package is already extracted in the store
    pub fn is_cached(&self, name: &str, version: &str) -> bool {
        self.store_path(name, version).exists()
    }

    /// Download, verify, and extract a tarball
    pub async fn fetch_and_extract(
        &self,
        name: &str,
        version: &str,
        tarball_url: &str,
        expected_integrity: &str,
    ) -> Result<PathBuf, Box<dyn std::error::Error + Send + Sync>> {
        let final_path = self.store_path(name, version);

        // Skip if already extracted
        if final_path.exists() {
            return Ok(final_path);
        }

        let _permit = self.semaphore.acquire().await?;

        // Double-check after acquiring permit (another task may have completed)
        if final_path.exists() {
            return Ok(final_path);
        }

        // Download tarball
        let response = self.client.get(tarball_url).send().await?;
        if !response.status().is_success() {
            return Err(format!(
                "Failed to download tarball for {}@{}: HTTP {}",
                name,
                version,
                response.status()
            )
            .into());
        }

        let bytes = response.bytes().await?;

        // Verify integrity
        if !expected_integrity.is_empty() {
            verify_integrity(&bytes, expected_integrity)?;
        }

        // Extract to staging directory, then atomic rename
        let staging_dir = self.store_dir.join(format!(
            ".staging/{}@{}-{}",
            name.replace('/', "+"),
            version,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&staging_dir)?;

        // Extract in a blocking task (tar is sync)
        let staging_clone = staging_dir.clone();
        let bytes_clone = bytes.to_vec();
        tokio::task::spawn_blocking(move || extract_tarball(&bytes_clone, &staging_clone))
            .await??;

        // Atomic rename to final path
        match std::fs::rename(&staging_dir, &final_path) {
            Ok(()) => Ok(final_path),
            Err(_) if final_path.exists() => {
                // Another process completed — clean up our staging
                std::fs::remove_dir_all(&staging_dir).ok();
                Ok(final_path)
            }
            Err(e) => {
                std::fs::remove_dir_all(&staging_dir).ok();
                Err(format!("Failed to install {}@{}: {}", name, version, e).into())
            }
        }
    }
    /// Path to the integrity sidecar file for a GitHub package
    pub fn integrity_path(&self, name: &str, sha: &str) -> PathBuf {
        self.store_dir
            .join(format!("{}@{}.integrity", name.replace('/', "+"), sha))
    }

    /// Download and extract a GitHub tarball to the global store.
    /// Returns `(extracted_path, integrity)` — integrity is the SHA-512 of the tarball bytes.
    /// Integrity is persisted in a sidecar file so it survives cache hits.
    pub async fn fetch_and_extract_github(
        &self,
        name: &str,
        sha: &str,
        tarball_url: &str,
    ) -> Result<(PathBuf, String), Box<dyn std::error::Error + Send + Sync>> {
        let final_path = self.store_path(name, sha);

        // Skip if already extracted — read integrity from sidecar file
        if final_path.exists() {
            let integrity =
                std::fs::read_to_string(self.integrity_path(name, sha)).unwrap_or_default();
            return Ok((final_path, integrity));
        }

        let _permit = self.semaphore.acquire().await?;

        // Double-check after acquiring permit
        if final_path.exists() {
            let integrity =
                std::fs::read_to_string(self.integrity_path(name, sha)).unwrap_or_default();
            return Ok((final_path, integrity));
        }

        // Download tarball
        let response = self.client.get(tarball_url).send().await?;
        if !response.status().is_success() {
            return Err(format!(
                "Failed to download GitHub tarball for {}: HTTP {}",
                name,
                response.status()
            )
            .into());
        }

        let bytes = response.bytes().await?;

        // Extract to staging directory, then atomic rename
        let staging_dir = self.store_dir.join(format!(
            ".staging/{}@{}-{}",
            name.replace('/', "+"),
            sha,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&staging_dir)?;

        let staging_clone = staging_dir.clone();
        let bytes_clone = bytes.to_vec();
        let integrity = tokio::task::spawn_blocking(move || {
            extract_github_tarball(&bytes_clone, &staging_clone)
        })
        .await??;

        // Write integrity sidecar before moving into final path
        std::fs::write(self.integrity_path(name, sha), &integrity).ok();

        // Atomic rename to final path
        match std::fs::rename(&staging_dir, &final_path) {
            Ok(()) => Ok((final_path, integrity)),
            Err(_) if final_path.exists() => {
                std::fs::remove_dir_all(&staging_dir).ok();
                Ok((final_path, integrity))
            }
            Err(e) => {
                std::fs::remove_dir_all(&staging_dir).ok();
                Err(format!("Failed to install {}: {}", name, e).into())
            }
        }
    }
}

/// Verify the integrity hash of downloaded bytes.
/// Public alias for use by `pm::create`.
pub fn verify_integrity_public(
    bytes: &[u8],
    expected: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    verify_integrity(bytes, expected)
}

/// Verify the integrity hash of downloaded bytes
fn verify_integrity(
    bytes: &[u8],
    expected: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Parse integrity string: "sha512-<base64>"
    let (algo, expected_hash) = expected
        .split_once('-')
        .ok_or_else(|| format!("Invalid integrity format: {}", expected))?;

    let computed_b64 = match algo {
        "sha512" => {
            let mut hasher = Sha512::new();
            hasher.update(bytes);
            base64_encode(&hasher.finalize())
        }
        "sha256" => {
            let mut hasher = Sha256::new();
            hasher.update(bytes);
            base64_encode(&hasher.finalize())
        }
        _ => {
            return Err(format!("Unsupported integrity algorithm: {}", algo).into());
        }
    };

    if computed_b64 != expected_hash {
        return Err(format!(
            "Integrity check failed: expected {}-{}, got {}-{}",
            algo, expected_hash, algo, computed_b64
        )
        .into());
    }
    Ok(())
}

pub fn base64_encode(bytes: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARS[((n >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((n >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((n >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(n & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

/// Extract a gzipped tarball to a destination directory with security mitigations
pub fn extract_tarball(
    bytes: &[u8],
    dest: &Path,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let gz = GzDecoder::new(bytes);
    let mut archive = Archive::new(gz);
    let mut total_size: u64 = 0;

    for entry_result in archive.entries()? {
        let entry = entry_result?;
        let path = entry.path()?.to_path_buf();

        // Security: reject entries with null bytes or control characters
        let path_str = path.to_string_lossy();
        if path_str
            .bytes()
            .any(|b| b == 0 || (b < 32 && b != b'\n' && b != b'\r' && b != b'\t'))
        {
            return Err(format!(
                "Tarball contains entry with invalid characters: {}",
                path_str
            )
            .into());
        }

        // Security: reject absolute paths
        if path.is_absolute() {
            return Err(format!("Tarball contains absolute path: {}", path.display()).into());
        }

        // Security: reject path traversal
        for component in path.components() {
            if let std::path::Component::ParentDir = component {
                return Err(format!("Tarball contains path traversal: {}", path.display()).into());
            }
        }

        // Security: skip symlinks and hardlinks
        let entry_type = entry.header().entry_type();
        if entry_type.is_symlink() || entry_type.is_hard_link() {
            continue;
        }

        // Security: enforce per-file size limit
        let file_size = entry.header().size()?;
        if file_size > MAX_FILE_SIZE {
            return Err(format!(
                "File {} exceeds max size ({} > {} bytes)",
                path.display(),
                file_size,
                MAX_FILE_SIZE
            )
            .into());
        }

        // Security: enforce total archive size limit
        total_size += file_size;
        if total_size > MAX_ARCHIVE_SIZE {
            return Err("Archive exceeds maximum total size (1 GB)".into());
        }

        // Strip the leading "package/" prefix (npm tarball convention)
        let stripped = strip_package_prefix(&path);

        // Compute the final target path
        let target = dest.join(&stripped);

        // Security: verify target is still under dest after path normalization
        let canonical_dest = dest.canonicalize().unwrap_or_else(|_| dest.to_path_buf());
        // For directories that don't exist yet, check the prefix
        if !target.starts_with(&canonical_dest) && !target.starts_with(dest) {
            return Err(format!(
                "Tarball entry resolves outside target: {}",
                target.display()
            )
            .into());
        }

        if entry.header().entry_type().is_dir() {
            std::fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut output = std::fs::File::create(&target)?;
            // Read with size limit enforcement
            let mut limited = entry.take(MAX_FILE_SIZE);
            std::io::copy(&mut limited, &mut output)?;
        }
    }

    Ok(())
}

/// Extract a GitHub tarball to a destination directory.
/// Unlike npm tarballs, GitHub archives use a variable first-directory prefix
/// (`{repo}-{sha}/`, `{repo}-{tag}/`, `{repo}-{branch}/`).
/// This function unconditionally strips the first path component.
/// Returns the SHA-512 integrity string of the tarball bytes.
pub fn extract_github_tarball(
    bytes: &[u8],
    dest: &Path,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // Compute integrity before extraction
    let mut hasher = Sha512::new();
    hasher.update(bytes);
    let integrity = format!("sha512-{}", base64_encode(&hasher.finalize()));

    let gz = GzDecoder::new(bytes);
    let mut archive = Archive::new(gz);
    let mut total_size: u64 = 0;

    for entry_result in archive.entries()? {
        let entry = entry_result?;
        let path = entry.path()?.to_path_buf();

        // Security: reject entries with null bytes or control characters
        let path_str = path.to_string_lossy();
        if path_str
            .bytes()
            .any(|b| b == 0 || (b < 32 && b != b'\n' && b != b'\r' && b != b'\t'))
        {
            return Err(format!(
                "Tarball contains entry with invalid characters: {}",
                path_str
            )
            .into());
        }

        // Security: reject absolute paths
        if path.is_absolute() {
            return Err(format!("Tarball contains absolute path: {}", path.display()).into());
        }

        // Security: reject path traversal
        for component in path.components() {
            if let std::path::Component::ParentDir = component {
                return Err(format!("Tarball contains path traversal: {}", path.display()).into());
            }
        }

        // Security: skip symlinks and hardlinks
        let entry_type = entry.header().entry_type();
        if entry_type.is_symlink() || entry_type.is_hard_link() {
            continue;
        }

        // Security: enforce per-file size limit
        let file_size = entry.header().size()?;
        if file_size > MAX_FILE_SIZE {
            return Err(format!(
                "File {} exceeds max size ({} > {} bytes)",
                path.display(),
                file_size,
                MAX_FILE_SIZE
            )
            .into());
        }

        // Security: enforce total archive size limit
        total_size += file_size;
        if total_size > MAX_ARCHIVE_SIZE {
            return Err("Archive exceeds maximum total size (1 GB)".into());
        }

        // Strip first path component unconditionally (GitHub's variable prefix)
        let stripped = strip_first_component(&path);

        let target = dest.join(&stripped);

        // Security: verify target is still under dest
        let canonical_dest = dest.canonicalize().unwrap_or_else(|_| dest.to_path_buf());
        if !target.starts_with(&canonical_dest) && !target.starts_with(dest) {
            return Err(format!(
                "Tarball entry resolves outside target: {}",
                target.display()
            )
            .into());
        }

        if entry.header().entry_type().is_dir() {
            std::fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut output = std::fs::File::create(&target)?;
            let mut limited = entry.take(MAX_FILE_SIZE);
            std::io::copy(&mut limited, &mut output)?;
        }
    }

    Ok(integrity)
}

/// Strip the first path component unconditionally.
/// Used for GitHub tarballs where the prefix is variable.
fn strip_first_component(path: &Path) -> PathBuf {
    let components: Vec<_> = path.components().collect();
    if components.len() > 1 {
        components[1..].iter().collect()
    } else {
        path.to_path_buf()
    }
}

/// Strip the "package/" prefix from npm tarball entry paths
fn strip_package_prefix(path: &Path) -> PathBuf {
    let components: Vec<_> = path.components().collect();
    if components.len() > 1 {
        if let std::path::Component::Normal(first) = &components[0] {
            if first.to_string_lossy() == "package" {
                return components[1..].iter().collect();
            }
        }
    }
    path.to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_first_component() {
        // GitHub SHA prefix
        assert_eq!(
            strip_first_component(Path::new("my-lib-abc123/index.js")),
            PathBuf::from("index.js")
        );
        // GitHub tag prefix
        assert_eq!(
            strip_first_component(Path::new("my-lib-2.1.0/lib/utils.js")),
            PathBuf::from("lib/utils.js")
        );
        // GitHub branch prefix
        assert_eq!(
            strip_first_component(Path::new("my-lib-develop/package.json")),
            PathBuf::from("package.json")
        );
        // Single component left alone
        assert_eq!(
            strip_first_component(Path::new("index.js")),
            PathBuf::from("index.js")
        );
    }

    #[test]
    fn test_extract_github_tarball_basic() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("extract");
        std::fs::create_dir_all(&dest).unwrap();

        // Create a tar with GitHub-style prefix
        let mut builder = tar::Builder::new(Vec::new());
        let content = b"{\"name\": \"my-lib\", \"version\": \"1.0.0\"}";
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, "my-lib-a1b2c3d/package.json", &content[..])
            .unwrap();

        let js_content = b"module.exports = {};";
        let mut js_header = tar::Header::new_gnu();
        js_header.set_size(js_content.len() as u64);
        js_header.set_mode(0o644);
        js_header.set_cksum();
        builder
            .append_data(&mut js_header, "my-lib-a1b2c3d/index.js", &js_content[..])
            .unwrap();

        let tar_bytes = builder.into_inner().unwrap();

        use flate2::write::GzEncoder;
        use std::io::Write;
        let mut encoder = GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&tar_bytes).unwrap();
        let gz_bytes = encoder.finish().unwrap();

        let integrity = extract_github_tarball(&gz_bytes, &dest).unwrap();

        // Files extracted at root (prefix stripped)
        let pkg = std::fs::read_to_string(dest.join("package.json")).unwrap();
        assert!(pkg.contains("my-lib"));
        let js = std::fs::read_to_string(dest.join("index.js")).unwrap();
        assert_eq!(js, "module.exports = {};");

        // Integrity is computed
        assert!(integrity.starts_with("sha512-"));
        assert!(integrity.len() > 10);
    }

    #[test]
    fn test_extract_github_tarball_returns_consistent_integrity() {
        let dir = tempfile::tempdir().unwrap();
        let dest1 = dir.path().join("extract1");
        let dest2 = dir.path().join("extract2");
        std::fs::create_dir_all(&dest1).unwrap();
        std::fs::create_dir_all(&dest2).unwrap();

        let mut builder = tar::Builder::new(Vec::new());
        let content = b"hello";
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, "repo-main/file.txt", &content[..])
            .unwrap();
        let tar_bytes = builder.into_inner().unwrap();

        use flate2::write::GzEncoder;
        use std::io::Write;
        let mut encoder = GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&tar_bytes).unwrap();
        let gz_bytes = encoder.finish().unwrap();

        let integrity1 = extract_github_tarball(&gz_bytes, &dest1).unwrap();
        let integrity2 = extract_github_tarball(&gz_bytes, &dest2).unwrap();
        assert_eq!(integrity1, integrity2);
    }

    #[test]
    fn test_strip_package_prefix() {
        assert_eq!(
            strip_package_prefix(Path::new("package/index.js")),
            PathBuf::from("index.js")
        );
        assert_eq!(
            strip_package_prefix(Path::new("package/lib/utils.js")),
            PathBuf::from("lib/utils.js")
        );
        // Non-package prefix left alone
        assert_eq!(
            strip_package_prefix(Path::new("other/index.js")),
            PathBuf::from("other/index.js")
        );
        // Single component left alone
        assert_eq!(
            strip_package_prefix(Path::new("index.js")),
            PathBuf::from("index.js")
        );
    }

    #[test]
    fn test_base64_encode() {
        assert_eq!(base64_encode(b"hello"), "aGVsbG8=");
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"abc"), "YWJj");
    }

    #[test]
    fn test_verify_integrity_valid() {
        let data = b"test data";
        let mut hasher = Sha512::new();
        hasher.update(data);
        let hash = hasher.finalize();
        let integrity = format!("sha512-{}", base64_encode(&hash));
        assert!(verify_integrity(data, &integrity).is_ok());
    }

    #[test]
    fn test_verify_integrity_invalid() {
        let result = verify_integrity(b"test data", "sha512-invalidhash");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Integrity check failed"));
    }

    #[test]
    fn test_verify_integrity_sha256_valid() {
        use sha2::{Digest, Sha256};
        let data = b"test data for sha256";
        let mut hasher = Sha256::new();
        hasher.update(data);
        let hash = hasher.finalize();
        let integrity = format!("sha256-{}", base64_encode(&hash));
        assert!(verify_integrity(data, &integrity).is_ok());
    }

    #[test]
    fn test_verify_integrity_sha256_invalid() {
        let result = verify_integrity(b"test data", "sha256-invalidhash");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Integrity check failed"));
    }

    #[test]
    fn test_verify_integrity_unknown_algo_errors() {
        let result = verify_integrity(b"test", "sha1-whatever");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Unsupported integrity algorithm"));
    }

    #[test]
    fn test_extract_tarball_basic() {
        // Create a minimal tar.gz in memory
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("extract");
        std::fs::create_dir_all(&dest).unwrap();

        let mut builder = tar::Builder::new(Vec::new());
        let content = b"console.log('hello');";
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, "package/index.js", &content[..])
            .unwrap();
        let tar_bytes = builder.into_inner().unwrap();

        // Gzip the tar
        use flate2::write::GzEncoder;
        use std::io::Write;
        let mut encoder = GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&tar_bytes).unwrap();
        let gz_bytes = encoder.finish().unwrap();

        // Extract
        extract_tarball(&gz_bytes, &dest).unwrap();

        // Verify
        let extracted = std::fs::read_to_string(dest.join("index.js")).unwrap();
        assert_eq!(extracted, "console.log('hello');");
    }

    #[test]
    fn test_extract_tarball_rejects_path_traversal() {
        // The tar crate's builder itself rejects ".." paths, so we construct
        // malicious tar bytes manually using raw header manipulation
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("extract");
        std::fs::create_dir_all(&dest).unwrap();

        // Build a valid tar, then patch the filename in the raw bytes
        let mut builder = tar::Builder::new(Vec::new());
        let content = b"malicious";
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_path("package/safe_name.txt").unwrap();
        header.set_cksum();
        builder
            .append_data(&mut header, "package/safe_name.txt", &content[..])
            .unwrap();
        let mut tar_bytes = builder.into_inner().unwrap();

        // Patch the path in the tar header (first 100 bytes) to include ".."
        let malicious_path = b"package/../../etc/passwd\0";
        tar_bytes[..malicious_path.len()].copy_from_slice(malicious_path);
        // Recalculate checksum (bytes 148..156)
        let mut cksum: u32 = 0;
        for (i, &b) in tar_bytes[..512].iter().enumerate() {
            if (148..156).contains(&i) {
                cksum += 32; // space char for checksum field
            } else {
                cksum += b as u32;
            }
        }
        let cksum_str = format!("{:06o}\0 ", cksum);
        tar_bytes[148..156].copy_from_slice(cksum_str.as_bytes());

        use flate2::write::GzEncoder;
        use std::io::Write;
        let mut encoder = GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&tar_bytes).unwrap();
        let gz_bytes = encoder.finish().unwrap();

        let result = extract_tarball(&gz_bytes, &dest);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("path traversal"));
    }

    #[test]
    fn test_extract_tarball_rejects_absolute_path() {
        // Build a valid tar, then patch the filename to an absolute path
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("extract");
        std::fs::create_dir_all(&dest).unwrap();

        let mut builder = tar::Builder::new(Vec::new());
        let content = b"malicious";
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_path("package/safe.txt").unwrap();
        header.set_cksum();
        builder
            .append_data(&mut header, "package/safe.txt", &content[..])
            .unwrap();
        let mut tar_bytes = builder.into_inner().unwrap();

        // Patch path to absolute
        let malicious_path = b"/etc/passwd\0";
        tar_bytes[..malicious_path.len()].copy_from_slice(malicious_path);
        // Zero out the rest of the name field
        for byte in &mut tar_bytes[malicious_path.len()..100] {
            *byte = 0;
        }
        // Recalculate checksum
        let mut cksum: u32 = 0;
        for (i, &b) in tar_bytes[..512].iter().enumerate() {
            if (148..156).contains(&i) {
                cksum += 32;
            } else {
                cksum += b as u32;
            }
        }
        let cksum_str = format!("{:06o}\0 ", cksum);
        tar_bytes[148..156].copy_from_slice(cksum_str.as_bytes());

        use flate2::write::GzEncoder;
        use std::io::Write;
        let mut encoder = GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&tar_bytes).unwrap();
        let gz_bytes = encoder.finish().unwrap();

        let result = extract_tarball(&gz_bytes, &dest);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("absolute path"));
    }

    #[test]
    fn test_store_path() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = TarballManager::new(dir.path());
        let path = mgr.store_path("zod", "3.24.4");
        assert!(path.to_str().unwrap().contains("zod@3.24.4"));
    }

    #[test]
    fn test_store_path_scoped() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = TarballManager::new(dir.path());
        let path = mgr.store_path("@vertz/ui", "0.1.42");
        assert!(path.to_str().unwrap().contains("@vertz+ui@0.1.42"));
    }

    #[test]
    fn test_is_cached_false() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = TarballManager::new(dir.path());
        assert!(!mgr.is_cached("zod", "3.24.4"));
    }

    #[test]
    fn test_is_cached_true() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = TarballManager::new(dir.path());
        std::fs::create_dir_all(mgr.store_path("zod", "3.24.4")).unwrap();
        assert!(mgr.is_cached("zod", "3.24.4"));
    }
}
