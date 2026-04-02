use crate::pm::types::{AbbreviatedMetadata, PackageMetadata};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tokio::sync::Semaphore;

const REGISTRY_URL: &str = "https://registry.npmjs.org";
const MAX_CONCURRENT_REQUESTS: usize = 50;
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
                .user_agent("vtz/0.1.0")
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

    /// Fetch package metadata using the abbreviated npm install format.
    /// Uses `Accept: application/vnd.npm.install-v1+json` for 10-100x smaller payloads
    /// while still returning full `PackageMetadata` (deps, dist, bin are all included).
    /// This is the preferred method for dependency resolution.
    pub async fn fetch_metadata_for_install(
        &self,
        package_name: &str,
    ) -> Result<PackageMetadata, Box<dyn std::error::Error + Send + Sync>> {
        let _permit = self.semaphore.acquire().await?;

        let encoded_name = if package_name.starts_with('@') {
            package_name.replacen('/', "%2f", 1)
        } else {
            package_name.to_string()
        };
        let url = format!("{}/{}", REGISTRY_URL, encoded_name);
        let cache_file = self.cache_path(&format!("{}__install", package_name));
        let etag_file = self.etag_path(&format!("{}__install", package_name));

        let mut last_error = None;

        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(100 * 2u64.pow(attempt))).await;
            }

            match self
                .fetch_install_with_etag(&url, &cache_file, &etag_file)
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

    async fn fetch_install_with_etag(
        &self,
        url: &str,
        cache_file: &Path,
        etag_file: &Path,
    ) -> Result<PackageMetadata, Box<dyn std::error::Error + Send + Sync>> {
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
                let metadata: PackageMetadata = serde_json::from_str(&cached)?;
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

    /// Fetch bulk advisories from the npm advisory API.
    /// Sends a POST request with a map of package names to version lists.
    /// Does NOT acquire the semaphore — concurrency is controlled at the call site
    /// via `buffer_unordered(4)`.
    /// Retries up to MAX_RETRIES times with exponential backoff (safe: idempotent read-only POST).
    pub async fn fetch_advisories_bulk(
        &self,
        packages: &std::collections::BTreeMap<String, Vec<String>>,
    ) -> Result<
        std::collections::BTreeMap<String, Vec<crate::pm::types::Advisory>>,
        Box<dyn std::error::Error + Send + Sync>,
    > {
        let url = format!("{}/-/npm/v1/security/advisories/bulk", REGISTRY_URL);
        let mut last_error = None;

        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(100 * 2u64.pow(attempt))).await;
            }

            match self
                .client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(packages)
                .send()
                .await
            {
                Ok(response) => {
                    if response.status().is_success() {
                        let body = response.text().await?;
                        let advisories: std::collections::BTreeMap<
                            String,
                            Vec<crate::pm::types::Advisory>,
                        > = serde_json::from_str(&body)?;
                        return Ok(advisories);
                    } else {
                        last_error = Some(
                            format!("advisory API returned HTTP {}", response.status()).into(),
                        );
                    }
                }
                Err(e) => {
                    last_error = Some(Box::new(e) as Box<dyn std::error::Error + Send + Sync>);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| "Unknown error fetching advisories".into()))
    }

    /// Sanitize a package name into a safe filename component.
    /// Replaces `/` with `__` and removes `..` to prevent path traversal.
    fn sanitize_cache_name(name: &str) -> String {
        name.replace('/', "__").replace("..", "")
    }

    fn cache_path(&self, package_name: &str) -> PathBuf {
        self.cache_dir
            .join(Self::sanitize_cache_name(package_name))
            .with_extension("json")
    }

    fn etag_path(&self, package_name: &str) -> PathBuf {
        self.cache_dir
            .join(Self::sanitize_cache_name(package_name))
            .with_extension("etag")
    }

    /// Publish a package to the npm registry.
    ///
    /// Sends a PUT request with the publish document containing the
    /// package metadata and base64-encoded tarball attachment.
    pub async fn publish_package(
        &self,
        registry_url: &str,
        auth_header: &str,
        document: &PublishDocument,
    ) -> Result<(), PublishError> {
        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|e| PublishError::Other(format!("semaphore error: {}", e)))?;

        let encoded_name = if document.name.starts_with('@') {
            document.name.replacen('/', "%2f", 1)
        } else {
            document.name.clone()
        };

        let url = format!("{}/{}", registry_url.trim_end_matches('/'), encoded_name);

        let body = serde_json::to_string(document).map_err(|e| {
            PublishError::Other(format!("failed to serialize publish document: {}", e))
        })?;

        let response = self
            .client
            .put(&url)
            .header("Authorization", auth_header)
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .await
            .map_err(|e| PublishError::Other(format!("HTTP request failed: {}", e)))?;

        match response.status() {
            status if status.is_success() => Ok(()),
            reqwest::StatusCode::UNAUTHORIZED => {
                let registry_host = url::Url::parse(registry_url)
                    .map(|u| u.host_str().unwrap_or(registry_url).to_string())
                    .unwrap_or_else(|_| registry_url.to_string());
                Err(PublishError::Auth(format!(
                    "Authentication failed. Check your .npmrc for a valid auth token for {}",
                    registry_host
                )))
            }
            reqwest::StatusCode::FORBIDDEN => {
                let body = response.text().await.unwrap_or_default();
                Err(PublishError::Forbidden(format!(
                    "Permission denied: {}",
                    extract_npm_error(&body)
                )))
            }
            reqwest::StatusCode::CONFLICT => Err(PublishError::VersionExists(format!(
                "Cannot publish {}@{}: version already exists on registry",
                document.name,
                document.dist_tags.values().next().unwrap_or(&String::new())
            ))),
            status => {
                let body = response.text().await.unwrap_or_default();
                Err(PublishError::Other(format!(
                    "Registry returned HTTP {}: {}",
                    status,
                    extract_npm_error(&body)
                )))
            }
        }
    }
}

/// Errors that can occur during publish
#[derive(Debug)]
pub enum PublishError {
    /// 401 Unauthorized — missing or invalid auth token
    Auth(String),
    /// 403 Forbidden — no permission to publish
    Forbidden(String),
    /// 409 Conflict — version already published
    VersionExists(String),
    /// Any other error
    Other(String),
}

impl std::fmt::Display for PublishError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PublishError::Auth(msg) => write!(f, "{}", msg),
            PublishError::Forbidden(msg) => write!(f, "{}", msg),
            PublishError::VersionExists(msg) => write!(f, "{}", msg),
            PublishError::Other(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for PublishError {}

/// The full publish document sent as a PUT body to the npm registry
#[derive(Debug, Serialize)]
pub struct PublishDocument {
    pub _id: String,
    pub name: String,
    pub versions: BTreeMap<String, serde_json::Value>,
    #[serde(rename = "dist-tags")]
    pub dist_tags: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access: Option<String>,
    pub _attachments: BTreeMap<String, PublishAttachment>,
}

/// A tarball attachment in the publish document
#[derive(Debug, Serialize)]
pub struct PublishAttachment {
    pub content_type: String,
    pub data: String,
    pub length: u64,
}

/// Parameters for building a publish document
pub struct PublishParams<'a> {
    pub name: &'a str,
    pub version: &'a str,
    pub tag: &'a str,
    pub access: Option<&'a str>,
    pub tarball_base64: &'a str,
    pub tarball_length: u64,
    pub integrity: &'a str,
    pub shasum: &'a str,
    pub normalized_pkg: &'a serde_json::Value,
    pub registry_url: &'a str,
}

/// Build a PublishDocument from pack result and package metadata.
pub fn build_publish_document(params: &PublishParams<'_>) -> PublishDocument {
    let name = params.name;
    let version = params.version;
    let tarball_name = format!("{}-{}.tgz", name, version);

    // Build version metadata: the normalized package.json + dist info
    let mut version_meta = params.normalized_pkg.clone();
    if let Some(obj) = version_meta.as_object_mut() {
        obj.insert(
            "_id".to_string(),
            serde_json::json!(format!("{}@{}", name, version)),
        );
        obj.insert("_nodeVersion".to_string(), serde_json::json!("22.0.0"));

        // Encode tarball URL for scoped packages
        let encoded_name = if name.starts_with('@') {
            name.replacen('/', "%2f", 1)
        } else {
            name.to_string()
        };
        let registry_base = params.registry_url.trim_end_matches('/');
        let tarball_url = format!(
            "{}/{}/-/{}-{}.tgz",
            registry_base,
            encoded_name,
            name.rsplit('/').next().unwrap_or(name),
            version
        );
        obj.insert(
            "dist".to_string(),
            serde_json::json!({
                "integrity": params.integrity,
                "shasum": params.shasum,
                "tarball": tarball_url
            }),
        );
    }

    let mut versions = BTreeMap::new();
    versions.insert(version.to_string(), version_meta);

    let mut dist_tags = BTreeMap::new();
    dist_tags.insert(params.tag.to_string(), version.to_string());

    let mut attachments = BTreeMap::new();
    attachments.insert(
        tarball_name,
        PublishAttachment {
            content_type: "application/octet-stream".to_string(),
            data: params.tarball_base64.to_string(),
            length: params.tarball_length,
        },
    );

    PublishDocument {
        _id: name.to_string(),
        name: name.to_string(),
        versions,
        dist_tags,
        access: params.access.map(|a| a.to_string()),
        _attachments: attachments,
    }
}

/// Extract an error message from npm registry JSON response body
fn extract_npm_error(body: &str) -> String {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(error) = value.get("error").and_then(|e| e.as_str()) {
            return error.to_string();
        }
    }
    if body.is_empty() {
        "unknown error".to_string()
    } else {
        body.chars().take(200).collect()
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
    fn test_cache_path_install_format() {
        let dir = tempfile::tempdir().unwrap();
        let client = RegistryClient::new(dir.path());
        // Install metadata uses __install suffix to avoid colliding with full metadata cache
        let path = client.cache_path("zod__install");
        assert!(path.to_str().unwrap().ends_with("zod__install.json"));
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

    #[test]
    fn test_cache_path_sanitizes_path_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let client = RegistryClient::new(dir.path());
        let path = client.cache_path("../../../etc/passwd");
        let path_str = path.to_str().unwrap();
        // Should not contain ".." — path traversal is sanitized
        assert!(
            !path_str.contains(".."),
            "cache path should not contain '..': {}",
            path_str
        );
    }

    #[test]
    fn test_sanitize_cache_name() {
        assert_eq!(RegistryClient::sanitize_cache_name("react"), "react");
        assert_eq!(
            RegistryClient::sanitize_cache_name("@vertz/ui"),
            "@vertz__ui"
        );
        assert_eq!(
            RegistryClient::sanitize_cache_name("../../../etc/passwd"),
            "______etc__passwd"
        );
        assert_eq!(RegistryClient::sanitize_cache_name("..foo..bar"), "foobar");
    }

    // ─── publish document building ───

    fn test_params<'a>(
        name: &'a str,
        version: &'a str,
        tag: &'a str,
        access: Option<&'a str>,
        pkg_json: &'a serde_json::Value,
    ) -> PublishParams<'a> {
        PublishParams {
            name,
            version,
            tag,
            access,
            tarball_base64: "dGVzdA==",
            tarball_length: 4,
            integrity: "sha512-abc123",
            shasum: "deadbeef",
            normalized_pkg: pkg_json,
            registry_url: "https://registry.npmjs.org",
        }
    }

    #[test]
    fn test_build_publish_document_structure() {
        let pkg_json = serde_json::json!({
            "name": "test-pkg",
            "version": "1.0.0"
        });

        let doc =
            build_publish_document(&test_params("test-pkg", "1.0.0", "latest", None, &pkg_json));

        assert_eq!(doc._id, "test-pkg");
        assert_eq!(doc.name, "test-pkg");
        assert!(doc.access.is_none());
    }

    #[test]
    fn test_build_publish_document_dist_tags() {
        let pkg_json = serde_json::json!({"name": "test-pkg", "version": "1.0.0"});
        let doc =
            build_publish_document(&test_params("test-pkg", "1.0.0", "beta", None, &pkg_json));

        assert_eq!(doc.dist_tags["beta"], "1.0.0");
    }

    #[test]
    fn test_build_publish_document_includes_base64_tarball_in_attachments() {
        let pkg_json = serde_json::json!({"name": "test-pkg", "version": "1.0.0"});
        let doc =
            build_publish_document(&test_params("test-pkg", "1.0.0", "latest", None, &pkg_json));

        let attachment = &doc._attachments["test-pkg-1.0.0.tgz"];
        assert_eq!(attachment.data, "dGVzdA==");
        assert_eq!(attachment.length, 4);
        assert_eq!(attachment.content_type, "application/octet-stream");
    }

    #[test]
    fn test_build_publish_document_includes_authorization_header() {
        let pkg_json = serde_json::json!({"name": "test-pkg", "version": "1.0.0"});
        let doc = build_publish_document(&test_params(
            "test-pkg",
            "1.0.0",
            "latest",
            Some("public"),
            &pkg_json,
        ));

        assert_eq!(doc.access, Some("public".to_string()));
    }

    #[test]
    fn test_build_publish_document_version_metadata_has_dist() {
        let pkg_json = serde_json::json!({"name": "test-pkg", "version": "1.0.0"});
        let doc =
            build_publish_document(&test_params("test-pkg", "1.0.0", "latest", None, &pkg_json));

        let version_meta = &doc.versions["1.0.0"];
        let dist = version_meta.get("dist").unwrap();
        assert_eq!(dist["integrity"], "sha512-abc123");
        assert_eq!(dist["shasum"], "deadbeef");
        assert!(dist["tarball"].as_str().unwrap().contains("test-pkg"));
    }

    #[test]
    fn test_build_publish_document_scoped_package() {
        let pkg_json = serde_json::json!({"name": "@myorg/test-pkg", "version": "2.0.0"});
        let doc = build_publish_document(&test_params(
            "@myorg/test-pkg",
            "2.0.0",
            "latest",
            Some("public"),
            &pkg_json,
        ));

        assert_eq!(doc.name, "@myorg/test-pkg");
        assert_eq!(doc._id, "@myorg/test-pkg");
        let attachment_key = "@myorg/test-pkg-2.0.0.tgz";
        assert!(doc._attachments.contains_key(attachment_key));
    }

    #[test]
    fn test_publish_document_serializes_to_json() {
        let pkg_json = serde_json::json!({"name": "test-pkg", "version": "1.0.0"});
        let doc =
            build_publish_document(&test_params("test-pkg", "1.0.0", "latest", None, &pkg_json));

        let json = serde_json::to_string(&doc).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert!(parsed.get("_id").is_some());
        assert!(parsed.get("name").is_some());
        assert!(parsed.get("versions").is_some());
        assert!(parsed.get("dist-tags").is_some());
        assert!(parsed.get("_attachments").is_some());
    }

    // ─── extract_npm_error ───

    #[test]
    fn test_extract_npm_error_json() {
        let body = r#"{"error": "version already exists"}"#;
        assert_eq!(extract_npm_error(body), "version already exists");
    }

    #[test]
    fn test_extract_npm_error_plain_text() {
        assert_eq!(extract_npm_error("forbidden"), "forbidden");
    }

    #[test]
    fn test_extract_npm_error_empty() {
        assert_eq!(extract_npm_error(""), "unknown error");
    }

    // ─── PublishError ───

    #[test]
    fn test_publish_error_auth_display() {
        let err = PublishError::Auth("token expired".to_string());
        assert_eq!(err.to_string(), "token expired");
    }

    #[test]
    fn test_publish_error_version_exists_display() {
        let err = PublishError::VersionExists("already published".to_string());
        assert_eq!(err.to_string(), "already published");
    }

    #[test]
    fn test_publish_error_forbidden_display() {
        let err = PublishError::Forbidden("no access".to_string());
        assert_eq!(err.to_string(), "no access");
    }
}
