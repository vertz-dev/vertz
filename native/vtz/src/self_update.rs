use futures_util::StreamExt;
use indicatif::{ProgressBar, ProgressStyle};
use owo_colors::OwoColorize;
use serde::Deserialize;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// Base URL for the GitHub API. Exposed as a constant for testability.
pub const GITHUB_API_URL: &str = "https://api.github.com";

/// Base URL for GitHub release downloads.
const GITHUB_DOWNLOAD_URL: &str = "https://github.com/vertz-dev/vertz/releases/download";

/// Cache duration for version checks: 24 hours in seconds.
const CACHE_TTL_SECS: u64 = 86400;

/// Timeout for the non-blocking version hint check.
const HINT_TIMEOUT_SECS: u64 = 3;

/// Returns the current binary version, resolved at compile time via `build.rs`.
pub fn current_version() -> &'static str {
    env!("VERTZ_VERSION")
}

/// Returns the platform-specific binary name (e.g. `vtz-darwin-arm64`).
pub fn binary_name() -> Result<String, String> {
    let platform = match std::env::consts::OS {
        "macos" => "darwin",
        "linux" => "linux",
        os => return Err(format!("unsupported OS: {}", os)),
    };

    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        arch => return Err(format!("unsupported architecture: {}", arch)),
    };

    Ok(format!("vtz-{}-{}", platform, arch))
}

/// Response shape for the GitHub Releases "latest" endpoint.
#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
}

/// Cached version-check data stored at `~/.vertz/version-check.json`.
#[derive(Deserialize, serde::Serialize)]
struct VersionCache {
    latest_version: String,
    checked_at: u64,
}

/// Resolve the `~/.vertz` directory, matching `pm::registry::dirs_path()`.
fn vertz_home() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".vertz")
    } else {
        PathBuf::from(".vertz")
    }
}

/// Fetch the latest release version from GitHub.
async fn fetch_latest_version(
    client: &reqwest::Client,
) -> Result<String, Box<dyn std::error::Error>> {
    let url = format!("{}/repos/vertz-dev/vertz/releases/latest", GITHUB_API_URL);
    let resp = client
        .get(&url)
        .header("User-Agent", "vtz-self-update")
        .send()
        .await?
        .error_for_status()?;
    let release: GitHubRelease = resp.json().await?;
    let version = release
        .tag_name
        .strip_prefix('v')
        .unwrap_or(&release.tag_name);
    Ok(version.to_string())
}

/// Outcome of comparing the installed version against a target version.
#[derive(Debug, PartialEq, Eq)]
pub enum UpdateDecision {
    /// Versions are equal — nothing to do.
    UpToDate,
    /// Target is newer, or the user explicitly opted into a downgrade.
    Proceed,
    /// Target is older than what's installed and the user did not pass `--version`.
    /// The updater must refuse to silently downgrade.
    RefuseDowngrade,
}

/// Pure decision: should `self-update` replace the binary?
///
/// `explicit_target` is `true` when the user passed `--version <v>`. An explicit older
/// version proceeds (intentional downgrade); an implicit older version (i.e. the GitHub
/// "latest" endpoint returned something lower than what's installed) is refused.
pub fn decide_update(
    current: &str,
    target: &str,
    explicit_target: bool,
) -> Result<UpdateDecision, Box<dyn std::error::Error>> {
    let current_ver = node_semver::Version::parse(current)
        .map_err(|e| format!("invalid installed version {:?}: {}", current, e))?;
    let target_ver = node_semver::Version::parse(target)
        .map_err(|e| format!("invalid target version {:?}: {}", target, e))?;

    if target_ver == current_ver {
        return Ok(UpdateDecision::UpToDate);
    }
    if target_ver < current_ver && !explicit_target {
        return Ok(UpdateDecision::RefuseDowngrade);
    }
    Ok(UpdateDecision::Proceed)
}

/// Download and replace the current binary from GitHub Releases.
///
/// If `target_version` is `None`, the latest release is fetched from the GitHub API.
/// Refuses to downgrade unless the user passed `--version` explicitly.
pub async fn self_update(target_version: Option<&str>) -> Result<(), Box<dyn std::error::Error>> {
    let old_version = current_version();
    let client = reqwest::Client::new();

    let explicit_target = target_version.is_some();
    let new_version = match target_version {
        Some(v) => v.strip_prefix('v').unwrap_or(v).to_string(),
        None => fetch_latest_version(&client).await?,
    };

    match decide_update(old_version, &new_version, explicit_target)? {
        UpdateDecision::UpToDate => {
            println!("Already up to date.");
            return Ok(());
        }
        UpdateDecision::RefuseDowngrade => {
            eprintln!(
                "Latest release ({}) is older than the installed version ({}). \
                 Refusing to downgrade. Pass `--version {}` to force.",
                new_version, old_version, new_version,
            );
            return Ok(());
        }
        UpdateDecision::Proceed => {}
    }

    let bin = binary_name().map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
    let download_url = format!("{}/v{}/{}", GITHUB_DOWNLOAD_URL, new_version, bin);

    // Start download
    let resp = client
        .get(&download_url)
        .header("User-Agent", "vtz-self-update")
        .send()
        .await?
        .error_for_status()?;

    let total_size = resp.content_length().unwrap_or(0);

    // Set up progress bar
    let pb = if total_size > 0 {
        let bar = ProgressBar::new(total_size);
        bar.set_style(
            ProgressStyle::default_bar()
                .template("{spinner:.green} [{bar:40.cyan/blue}] {bytes}/{total_bytes} ({eta})")
                .unwrap()
                .progress_chars("#>-"),
        );
        bar
    } else {
        let bar = ProgressBar::new_spinner();
        bar.set_style(
            ProgressStyle::default_spinner()
                .template("{spinner} Downloading... {bytes}")
                .unwrap(),
        );
        bar.enable_steady_tick(std::time::Duration::from_millis(80));
        bar
    };

    // Stream download into a Vec
    let mut stream = resp.bytes_stream();
    let mut bytes = Vec::with_capacity(total_size as usize);
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        bytes.extend_from_slice(&chunk);
        pb.set_position(bytes.len() as u64);
    }
    pb.finish_and_clear();

    // Write to temp file next to the current binary, then atomically rename
    let current_exe = std::env::current_exe()?;
    let exe_dir = current_exe
        .parent()
        .ok_or("could not determine binary directory")?;
    let tmp_path = exe_dir.join(format!(".vtz-update-{}", std::process::id()));

    tokio::fs::write(&tmp_path, &bytes).await?;

    // Set executable permission on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        tokio::fs::set_permissions(&tmp_path, perms).await?;
    }

    // Atomic rename over the old binary
    tokio::fs::rename(&tmp_path, &current_exe).await?;

    println!("Updated vtz: {} \u{2192} {}", old_version, new_version);

    Ok(())
}

/// Non-blocking version check that prints a hint to stderr if an update is available.
///
/// Designed to be called at the end of `dev` and `install` commands. Silently swallows
/// all errors — this must never block or crash the user's workflow.
pub async fn check_for_update_hint() {
    // Respect VTZ_NO_UPDATE_CHECK for CI environments
    if std::env::var("VTZ_NO_UPDATE_CHECK").as_deref() == Ok("1") {
        return;
    }

    if let Err(_e) = check_for_update_hint_inner().await {
        // Silently swallow — hint checks must never fail visibly
    }
}

async fn check_for_update_hint_inner() -> Result<(), Box<dyn std::error::Error>> {
    let current = current_version();
    let cache_dir = vertz_home();
    let cache_path = cache_dir.join("version-check.json");

    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

    // Try to read cached version
    let latest_version = if let Ok(data) = tokio::fs::read_to_string(&cache_path).await {
        if let Ok(cache) = serde_json::from_str::<VersionCache>(&data) {
            if now.saturating_sub(cache.checked_at) < CACHE_TTL_SECS {
                // Cache is fresh — use it
                cache.latest_version
            } else {
                // Cache is stale — fetch and update
                fetch_and_cache_version(&cache_dir, &cache_path, now).await?
            }
        } else {
            // Corrupt cache — fetch and update
            fetch_and_cache_version(&cache_dir, &cache_path, now).await?
        }
    } else {
        // No cache file — fetch and create
        fetch_and_cache_version(&cache_dir, &cache_path, now).await?
    };

    // Compare versions using semver
    let current_ver = node_semver::Version::parse(current)?;
    let latest_ver = node_semver::Version::parse(&latest_version)?;

    if latest_ver > current_ver {
        eprintln!();
        eprintln!(
            "  Update available: {} \u{2192} {}",
            current.cyan(),
            latest_version.cyan(),
        );
        eprintln!("  Run {} to update", "`vtz self-update`".bold());
        eprintln!();
    }

    Ok(())
}

/// Fetch the latest version from GitHub with a timeout, then write the cache file.
async fn fetch_and_cache_version(
    cache_dir: &PathBuf,
    cache_path: &PathBuf,
    now: u64,
) -> Result<String, Box<dyn std::error::Error>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(HINT_TIMEOUT_SECS))
        .build()?;

    let version = fetch_latest_version(&client).await?;

    // Write cache (best-effort — don't fail if dir creation or write fails)
    let _ = tokio::fs::create_dir_all(cache_dir).await;
    let cache = VersionCache {
        latest_version: version.clone(),
        checked_at: now,
    };
    if let Ok(json) = serde_json::to_string(&cache) {
        let _ = tokio::fs::write(cache_path, json).await;
    }

    Ok(version)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_current_version_not_empty() {
        let version = current_version();
        assert!(!version.is_empty());
    }

    #[test]
    fn test_binary_name_format() {
        let name = binary_name();
        // Should succeed on macOS and Linux x64/arm64
        match name {
            Ok(n) => {
                assert!(n.starts_with("vtz-"));
                // Must be one of the supported combinations
                assert!(
                    n == "vtz-darwin-arm64"
                        || n == "vtz-darwin-x64"
                        || n == "vtz-linux-arm64"
                        || n == "vtz-linux-x64",
                    "unexpected binary name: {}",
                    n
                );
            }
            Err(e) => {
                // Only acceptable on unsupported platforms (e.g. Windows CI)
                assert!(e.contains("unsupported"), "unexpected error: {}", e);
            }
        }
    }

    #[test]
    fn test_vertz_home_uses_home_env() {
        // Save and restore HOME
        let original = std::env::var("HOME").ok();
        std::env::set_var("HOME", "/tmp/test-vertz-home");
        let path = vertz_home();
        assert_eq!(path, PathBuf::from("/tmp/test-vertz-home/.vertz"));
        // Restore
        match original {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
    }

    #[test]
    fn test_version_cache_serialization() {
        let cache = VersionCache {
            latest_version: "0.3.0".to_string(),
            checked_at: 1712345678,
        };
        let json = serde_json::to_string(&cache).unwrap();
        let parsed: VersionCache = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.latest_version, "0.3.0");
        assert_eq!(parsed.checked_at, 1712345678);
    }

    #[test]
    fn test_github_api_url_constant() {
        assert_eq!(GITHUB_API_URL, "https://api.github.com");
    }

    #[test]
    fn decide_update_same_version_is_up_to_date() {
        let decision = decide_update("0.2.74", "0.2.74", false).unwrap();
        assert!(matches!(decision, UpdateDecision::UpToDate));
    }

    #[test]
    fn decide_update_newer_target_proceeds() {
        let decision = decide_update("0.2.73", "0.2.74", false).unwrap();
        assert!(matches!(decision, UpdateDecision::Proceed));
    }

    #[test]
    fn decide_update_implicit_older_target_refuses_downgrade() {
        // Latest from GitHub is older than what's installed → must refuse.
        let decision = decide_update("0.2.74", "0.2.73", false).unwrap();
        assert!(
            matches!(decision, UpdateDecision::RefuseDowngrade),
            "implicit downgrade must be refused, got {:?}",
            decision
        );
    }

    #[test]
    fn decide_update_explicit_older_target_proceeds() {
        // User passed --version explicitly → allow downgrade.
        let decision = decide_update("0.2.74", "0.2.73", true).unwrap();
        assert!(matches!(decision, UpdateDecision::Proceed));
    }

    #[test]
    fn decide_update_rejects_invalid_target_tag() {
        // Per-package tags like `vertz@0.2.73` should not parse as semver.
        let result = decide_update("0.2.74", "vertz@0.2.73", false);
        assert!(result.is_err(), "non-semver target must be rejected");
    }

    #[test]
    fn decide_update_rejects_invalid_current_version() {
        let result = decide_update("not-a-version", "0.2.74", false);
        assert!(result.is_err(), "non-semver current must be rejected");
    }
}
