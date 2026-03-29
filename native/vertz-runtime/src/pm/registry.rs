use crate::pm::types::{AbbreviatedMetadata, PackageMetadata};
use std::path::{Path, PathBuf};
use tokio::sync::Semaphore;

const REGISTRY_URL: &str = "https://registry.npmjs.org";
const MAX_CONCURRENT_REQUESTS: usize = 16;
const MAX_RETRIES: u32 = 3;

/// HTTP client for the npm registry with ETag caching
pub struct RegistryClient {
    client: reqwest::Client,
    cache_dir: PathBuf,
    semaphore: Semaphore,
}

impl RegistryClient {
    pub fn new(cache_dir: &Path) -> Self {
        let metadata_dir = cache_dir.join("registry-metadata");
        std::fs::create_dir_all(&metadata_dir).ok();

        Self {
            client: reqwest::Client::builder()
                .user_agent("vertz-runtime/0.1.0")
                .build()
                .expect("Failed to create HTTP client"),
            cache_dir: metadata_dir,
            semaphore: Semaphore::new(MAX_CONCURRENT_REQUESTS),
        }
    }

    /// Fetch package metadata from the registry with ETag caching
    pub async fn fetch_metadata(
        &self,
        package_name: &str,
    ) -> Result<PackageMetadata, Box<dyn std::error::Error + Send + Sync>> {
        let _permit = self.semaphore.acquire().await?;

        // URL-encode scoped package names: @scope/pkg → @scope%2fpkg
        let encoded_name = if package_name.starts_with('@') {
            package_name.replacen('/', "%2f", 1)
        } else {
            package_name.to_string()
        };
        let url = format!("{}/{}", REGISTRY_URL, encoded_name);
        let cache_file = self.cache_path(package_name);
        let etag_file = self.etag_path(package_name);

        let mut last_error = None;

        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(100 * 2u64.pow(attempt))).await;
            }

            match self.fetch_with_etag(&url, &cache_file, &etag_file).await {
                Ok(metadata) => return Ok(metadata),
                Err(e) => {
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| "Unknown error fetching metadata".into()))
    }

    /// Fetch abbreviated package metadata (dist-tags + version keys only).
    /// Uses `Accept: application/vnd.npm.install-v1+json` for 10-100x smaller payloads.
    pub async fn fetch_metadata_abbreviated(
        &self,
        package_name: &str,
    ) -> Result<AbbreviatedMetadata, Box<dyn std::error::Error + Send + Sync>> {
        let _permit = self.semaphore.acquire().await?;

        let encoded_name = if package_name.starts_with('@') {
            package_name.replacen('/', "%2f", 1)
        } else {
            package_name.to_string()
        };
        let url = format!("{}/{}", REGISTRY_URL, encoded_name);
        let cache_file = self.cache_path(&format!("{}.abbreviated", package_name));
        let etag_file = self.etag_path(&format!("{}.abbreviated", package_name));

        let mut last_error = None;

        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(100 * 2u64.pow(attempt))).await;
            }

            match self
                .fetch_abbreviated_with_etag(&url, &cache_file, &etag_file)
                .await
            {
                Ok(metadata) => return Ok(metadata),
                Err(e) => {
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| "Unknown error fetching metadata".into()))
    }

    async fn fetch_abbreviated_with_etag(
        &self,
        url: &str,
        cache_file: &Path,
        etag_file: &Path,
    ) -> Result<AbbreviatedMetadata, Box<dyn std::error::Error + Send + Sync>> {
        let mut request = self
            .client
            .get(url)
            .header("Accept", "application/vnd.npm.install-v1+json");

        if let Ok(etag) = std::fs::read_to_string(etag_file) {
            request = request.header("If-None-Match", etag);
        }

        let response = request.send().await?;

        match response.status() {
            status if status == reqwest::StatusCode::NOT_MODIFIED => {
                let cached = std::fs::read_to_string(cache_file)?;
                let metadata: AbbreviatedMetadata = serde_json::from_str(&cached)?;
                Ok(metadata)
            }
            status if status.is_success() => {
                if let Some(etag) = response.headers().get("etag") {
                    if let Ok(etag_str) = etag.to_str() {
                        if let Some(parent) = etag_file.parent() {
                            std::fs::create_dir_all(parent).ok();
                        }
                        std::fs::write(etag_file, etag_str).ok();
                    }
                }

                let body = response.text().await?;

                if let Some(parent) = cache_file.parent() {
                    std::fs::create_dir_all(parent).ok();
                }
                std::fs::write(cache_file, &body).ok();

                let metadata: AbbreviatedMetadata = serde_json::from_str(&body)?;
                Ok(metadata)
            }
            reqwest::StatusCode::NOT_FOUND => Err(format!(
                "package '{}' not found on registry",
                url.rsplit('/').next().unwrap_or(url)
            )
            .into()),
            status => Err(format!("registry returned HTTP {}", status).into()),
        }
    }

    async fn fetch_with_etag(
        &self,
        url: &str,
        cache_file: &Path,
        etag_file: &Path,
    ) -> Result<PackageMetadata, Box<dyn std::error::Error + Send + Sync>> {
        let mut request = self.client.get(url).header("Accept", "application/json");

        // Send If-None-Match if we have a cached ETag
        if let Ok(etag) = std::fs::read_to_string(etag_file) {
            request = request.header("If-None-Match", etag);
        }

        let response = request.send().await?;

        match response.status() {
            status if status == reqwest::StatusCode::NOT_MODIFIED => {
                // 304 — use cached metadata
                let cached = std::fs::read_to_string(cache_file)?;
                let metadata: PackageMetadata = serde_json::from_str(&cached)?;
                Ok(metadata)
            }
            status if status.is_success() => {
                // Save ETag for future requests
                if let Some(etag) = response.headers().get("etag") {
                    if let Ok(etag_str) = etag.to_str() {
                        if let Some(parent) = etag_file.parent() {
                            std::fs::create_dir_all(parent).ok();
                        }
                        std::fs::write(etag_file, etag_str).ok();
                    }
                }

                let body = response.text().await?;

                // Cache the response body
                if let Some(parent) = cache_file.parent() {
                    std::fs::create_dir_all(parent).ok();
                }
                std::fs::write(cache_file, &body).ok();

                let metadata: PackageMetadata = serde_json::from_str(&body)?;
                Ok(metadata)
            }
            reqwest::StatusCode::NOT_FOUND => Err(format!(
                "package '{}' not found on registry",
                url.rsplit('/').next().unwrap_or(url)
            )
            .into()),
            status => Err(format!("registry returned HTTP {}", status).into()),
        }
    }

    fn cache_path(&self, package_name: &str) -> PathBuf {
        self.cache_dir
            .join(package_name.replace('/', "__"))
            .with_extension("json")
    }

    fn etag_path(&self, package_name: &str) -> PathBuf {
        self.cache_dir
            .join(package_name.replace('/', "__"))
            .with_extension("etag")
    }
}

/// Get the default global cache directory
pub fn default_cache_dir() -> PathBuf {
    dirs_path().join("cache").join("npm")
}

fn dirs_path() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".vertz")
    } else {
        PathBuf::from(".vertz")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_cache_dir() {
        let dir = default_cache_dir();
        let dir_str = dir.to_str().unwrap();
        assert!(dir_str.contains(".vertz"));
        assert!(dir_str.contains("cache"));
    }

    #[test]
    fn test_cache_path_simple() {
        let dir = tempfile::tempdir().unwrap();
        let client = RegistryClient::new(dir.path());
        let path = client.cache_path("zod");
        assert!(path.to_str().unwrap().ends_with("zod.json"));
    }

    #[test]
    fn test_cache_path_scoped() {
        let dir = tempfile::tempdir().unwrap();
        let client = RegistryClient::new(dir.path());
        let path = client.cache_path("@vertz/ui");
        assert!(path.to_str().unwrap().contains("@vertz__ui"));
    }

    #[test]
    fn test_etag_path() {
        let dir = tempfile::tempdir().unwrap();
        let client = RegistryClient::new(dir.path());
        let path = client.etag_path("react");
        assert!(path.to_str().unwrap().ends_with("react.etag"));
    }

    #[test]
    fn test_registry_client_creation() {
        let dir = tempfile::tempdir().unwrap();
        let _client = RegistryClient::new(dir.path());
        assert!(dir.path().join("registry-metadata").exists());
    }
}
