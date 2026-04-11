//! App metadata IPC handlers.

use std::path::Path;

use crate::webview::ipc_dispatcher::IpcError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Platform {
    MacOs,
    Windows,
    Linux,
}

fn current_platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::MacOs
    } else if cfg!(target_os = "windows") {
        Platform::Windows
    } else {
        // Treat all Unix-like OSes (Linux, FreeBSD, etc.) as Linux/XDG.
        Platform::Linux
    }
}

/// Resolve the data directory for the given platform using the provided env lookup.
fn resolve_data_dir(
    platform: Platform,
    env: impl Fn(&str) -> Option<String>,
) -> Result<String, &'static str> {
    match platform {
        Platform::MacOs => env("HOME")
            .map(|h| format!("{}/Library/Application Support", h))
            .ok_or("HOME environment variable is not set"),
        Platform::Windows => env("APPDATA").ok_or("APPDATA environment variable is not set"),
        Platform::Linux => env("XDG_DATA_HOME")
            .or_else(|| env("HOME").map(|h| format!("{}/.local/share", h)))
            .ok_or("HOME environment variable is not set"),
    }
}

/// Resolve the cache directory for the given platform using the provided env lookup.
fn resolve_cache_dir(
    platform: Platform,
    env: impl Fn(&str) -> Option<String>,
) -> Result<String, &'static str> {
    match platform {
        Platform::MacOs => env("HOME")
            .map(|h| format!("{}/Library/Caches", h))
            .ok_or("HOME environment variable is not set"),
        Platform::Windows => {
            env("LOCALAPPDATA").ok_or("LOCALAPPDATA environment variable is not set")
        }
        Platform::Linux => env("XDG_CACHE_HOME")
            .or_else(|| env("HOME").map(|h| format!("{}/.cache", h)))
            .ok_or("HOME environment variable is not set"),
    }
}

fn env_var(name: &str) -> Option<String> {
    std::env::var(name).ok()
}

/// Return the platform-appropriate application data directory.
///
/// - macOS: `~/Library/Application Support`
/// - Windows: `%APPDATA%`
/// - Linux: `$XDG_DATA_HOME` or `~/.local/share`
pub async fn data_dir() -> Result<serde_json::Value, IpcError> {
    match resolve_data_dir(current_platform(), env_var) {
        Ok(d) => Ok(serde_json::Value::String(d)),
        Err(hint) => Err(IpcError::io_error(format!(
            "Could not determine application data directory: {}",
            hint
        ))),
    }
}

/// Return the platform-appropriate application cache directory.
///
/// - macOS: `~/Library/Caches`
/// - Windows: `%LOCALAPPDATA%`
/// - Linux: `$XDG_CACHE_HOME` or `~/.cache`
pub async fn cache_dir() -> Result<serde_json::Value, IpcError> {
    match resolve_cache_dir(current_platform(), env_var) {
        Ok(d) => Ok(serde_json::Value::String(d)),
        Err(hint) => Err(IpcError::io_error(format!(
            "Could not determine application cache directory: {}",
            hint
        ))),
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

    fn mock_env<'a>(vars: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |name: &str| {
            vars.iter()
                .find(|(k, _)| *k == name)
                .map(|(_, v)| v.to_string())
        }
    }

    // --- data_dir integration tests (current platform) ---

    #[tokio::test]
    async fn data_dir_returns_string() {
        let result = data_dir().await.unwrap();
        assert!(result.is_string());
        let path = result.as_str().unwrap();
        assert!(!path.is_empty());
    }

    // --- cache_dir integration tests (current platform) ---

    #[tokio::test]
    async fn cache_dir_returns_string() {
        let result = cache_dir().await.unwrap();
        assert!(result.is_string());
        let path = result.as_str().unwrap();
        assert!(!path.is_empty());
    }

    // --- resolve_data_dir unit tests ---

    #[test]
    fn resolve_data_dir_macos_uses_home() {
        let env = mock_env(&[("HOME", "/Users/alice")]);
        let result = resolve_data_dir(Platform::MacOs, env).unwrap();
        assert_eq!(result, "/Users/alice/Library/Application Support");
    }

    #[test]
    fn resolve_data_dir_macos_missing_home_returns_error() {
        let env = mock_env(&[]);
        let err = resolve_data_dir(Platform::MacOs, env).unwrap_err();
        assert!(err.contains("HOME"));
    }

    #[test]
    fn resolve_data_dir_windows_uses_appdata() {
        let env = mock_env(&[("APPDATA", r"C:\Users\alice\AppData\Roaming")]);
        let result = resolve_data_dir(Platform::Windows, env).unwrap();
        assert_eq!(result, r"C:\Users\alice\AppData\Roaming");
    }

    #[test]
    fn resolve_data_dir_windows_missing_appdata_returns_error() {
        let env = mock_env(&[]);
        let err = resolve_data_dir(Platform::Windows, env).unwrap_err();
        assert!(err.contains("APPDATA"));
    }

    #[test]
    fn resolve_data_dir_linux_prefers_xdg() {
        let env = mock_env(&[("XDG_DATA_HOME", "/custom/data"), ("HOME", "/home/alice")]);
        let result = resolve_data_dir(Platform::Linux, env).unwrap();
        assert_eq!(result, "/custom/data");
    }

    #[test]
    fn resolve_data_dir_linux_falls_back_to_home() {
        let env = mock_env(&[("HOME", "/home/alice")]);
        let result = resolve_data_dir(Platform::Linux, env).unwrap();
        assert_eq!(result, "/home/alice/.local/share");
    }

    #[test]
    fn resolve_data_dir_linux_missing_home_returns_error() {
        let env = mock_env(&[]);
        let err = resolve_data_dir(Platform::Linux, env).unwrap_err();
        assert!(err.contains("HOME"));
    }

    // --- resolve_cache_dir unit tests ---

    #[test]
    fn resolve_cache_dir_macos_uses_home() {
        let env = mock_env(&[("HOME", "/Users/alice")]);
        let result = resolve_cache_dir(Platform::MacOs, env).unwrap();
        assert_eq!(result, "/Users/alice/Library/Caches");
    }

    #[test]
    fn resolve_cache_dir_macos_missing_home_returns_error() {
        let env = mock_env(&[]);
        let err = resolve_cache_dir(Platform::MacOs, env).unwrap_err();
        assert!(err.contains("HOME"));
    }

    #[test]
    fn resolve_cache_dir_windows_uses_localappdata() {
        let env = mock_env(&[("LOCALAPPDATA", r"C:\Users\alice\AppData\Local")]);
        let result = resolve_cache_dir(Platform::Windows, env).unwrap();
        assert_eq!(result, r"C:\Users\alice\AppData\Local");
    }

    #[test]
    fn resolve_cache_dir_windows_missing_localappdata_returns_error() {
        let env = mock_env(&[]);
        let err = resolve_cache_dir(Platform::Windows, env).unwrap_err();
        assert!(err.contains("LOCALAPPDATA"));
    }

    #[test]
    fn resolve_cache_dir_linux_prefers_xdg() {
        let env = mock_env(&[("XDG_CACHE_HOME", "/custom/cache"), ("HOME", "/home/alice")]);
        let result = resolve_cache_dir(Platform::Linux, env).unwrap();
        assert_eq!(result, "/custom/cache");
    }

    #[test]
    fn resolve_cache_dir_linux_falls_back_to_home() {
        let env = mock_env(&[("HOME", "/home/alice")]);
        let result = resolve_cache_dir(Platform::Linux, env).unwrap();
        assert_eq!(result, "/home/alice/.cache");
    }

    #[test]
    fn resolve_cache_dir_linux_missing_home_returns_error() {
        let env = mock_env(&[]);
        let err = resolve_cache_dir(Platform::Linux, env).unwrap_err();
        assert!(err.contains("HOME"));
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
