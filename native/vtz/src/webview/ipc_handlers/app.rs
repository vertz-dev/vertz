//! App metadata IPC handlers.

use std::path::Path;

use crate::webview::ipc_dispatcher::IpcError;

/// Return the platform-appropriate application data directory.
///
/// - macOS: `~/Library/Application Support`
/// - Linux: `$XDG_DATA_HOME` or `~/.local/share`
pub async fn data_dir() -> Result<serde_json::Value, IpcError> {
    let dir = if cfg!(target_os = "macos") {
        std::env::var("HOME")
            .map(|h| format!("{}/Library/Application Support", h))
            .ok()
    } else {
        std::env::var("XDG_DATA_HOME").ok().or_else(|| {
            std::env::var("HOME")
                .map(|h| format!("{}/.local/share", h))
                .ok()
        })
    };

    match dir {
        Some(d) => Ok(serde_json::Value::String(d)),
        None => Err(IpcError::io_error(
            "Could not determine application data directory",
        )),
    }
}

/// Return the platform-appropriate application cache directory.
///
/// - macOS: `~/Library/Caches`
/// - Linux: `$XDG_CACHE_HOME` or `~/.cache`
pub async fn cache_dir() -> Result<serde_json::Value, IpcError> {
    let dir = if cfg!(target_os = "macos") {
        std::env::var("HOME")
            .map(|h| format!("{}/Library/Caches", h))
            .ok()
    } else {
        std::env::var("XDG_CACHE_HOME")
            .ok()
            .or_else(|| std::env::var("HOME").map(|h| format!("{}/.cache", h)).ok())
    };

    match dir {
        Some(d) => Ok(serde_json::Value::String(d)),
        None => Err(IpcError::io_error(
            "Could not determine application cache directory",
        )),
    }
}

/// Read the `version` field from the nearest `package.json` in CWD ancestors.
pub async fn version() -> Result<serde_json::Value, IpcError> {
    let cwd = std::env::current_dir()
        .map_err(|e| IpcError::io_error(format!("Cannot determine CWD: {}", e)))?;
    version_from_dir(&cwd).await
}

/// Read the `version` field from the nearest `package.json` starting from `start_dir`.
async fn version_from_dir(start_dir: &Path) -> Result<serde_json::Value, IpcError> {
    let mut dir = start_dir;
    loop {
        let pkg_path = dir.join("package.json");
        if pkg_path.exists() {
            let content = tokio::fs::read_to_string(&pkg_path)
                .await
                .map_err(|e| IpcError::io_error(format!("Failed to read package.json: {}", e)))?;

            let parsed: serde_json::Value = serde_json::from_str(&content)
                .map_err(|e| IpcError::io_error(format!("Invalid package.json: {}", e)))?;

            return match parsed.get("version").and_then(|v| v.as_str()) {
                Some(v) => Ok(serde_json::Value::String(v.to_string())),
                None => Err(IpcError::io_error(
                    "package.json does not contain a \"version\" field",
                )),
            };
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => {
                return Err(IpcError::io_error(
                    "No package.json found in current directory or ancestors",
                ))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn data_dir_returns_string() {
        let result = data_dir().await.unwrap();
        assert!(result.is_string());
        let path = result.as_str().unwrap();
        assert!(!path.is_empty());
    }

    #[tokio::test]
    async fn cache_dir_returns_string() {
        let result = cache_dir().await.unwrap();
        assert!(result.is_string());
        let path = result.as_str().unwrap();
        assert!(!path.is_empty());
    }

    #[tokio::test]
    async fn version_from_dir_reads_package_json() {
        let tmp = tempfile::tempdir().unwrap();
        let pkg_path = tmp.path().join("package.json");
        tokio::fs::write(&pkg_path, r#"{"name": "test-app", "version": "1.2.3"}"#)
            .await
            .unwrap();

        let result = version_from_dir(tmp.path()).await.unwrap();
        assert_eq!(result, "1.2.3");
    }

    #[tokio::test]
    async fn version_from_dir_walks_ancestors() {
        let tmp = tempfile::tempdir().unwrap();
        let pkg_path = tmp.path().join("package.json");
        tokio::fs::write(&pkg_path, r#"{"name": "root", "version": "2.0.0"}"#)
            .await
            .unwrap();

        // Create a subdirectory without a package.json
        let sub = tmp.path().join("src");
        tokio::fs::create_dir(&sub).await.unwrap();

        let result = version_from_dir(&sub).await.unwrap();
        assert_eq!(result, "2.0.0");
    }

    #[tokio::test]
    async fn version_from_dir_missing_version_field_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        let pkg_path = tmp.path().join("package.json");
        tokio::fs::write(&pkg_path, r#"{"name": "no-version"}"#)
            .await
            .unwrap();

        let err = version_from_dir(tmp.path()).await.unwrap_err();
        assert!(err.message.contains("version"));
    }

    #[tokio::test]
    async fn version_from_dir_no_package_json_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        // Empty directory — no package.json anywhere in the temp dir
        // Since temp dir has no package.json and its ancestors may have one,
        // create a nested dir to isolate
        let isolated = tmp.path().join("a").join("b").join("c");
        tokio::fs::create_dir_all(&isolated).await.unwrap();

        // Write a "stop marker" package.json at tmp root to prevent walking to repo root
        let pkg_path = tmp.path().join("package.json");
        tokio::fs::write(&pkg_path, r#"{"name": "stop"}"#)
            .await
            .unwrap();

        // The version search will find the marker but it has no version field
        let err = version_from_dir(&isolated).await.unwrap_err();
        assert!(err.message.contains("version"));
    }
}
