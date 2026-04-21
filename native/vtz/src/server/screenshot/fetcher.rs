//! Chrome binary resolution.
//!
//! Responsibilities (per `plans/2865-phase-1-headless-screenshot.md` Task 3):
//! - `$VERTZ_CHROME_PATH` env override
//! - System Chrome detection on macOS + Linux
//! - Chrome for Testing download URL resolution + SHA-256 verify
//! - Zip unpack + macOS quarantine removal
//! - Cache manifest at `~/.vertz/chromium/current.json`
//!   with `$XDG_CACHE_HOME` → `$TMPDIR` fallback
//!
//! Task 3a shipped the local-probe path. Task 3b (this file) adds the
//! download path so Task 4 (pool) has a complete Chrome resolver.

use std::path::{Path, PathBuf};

/// Default system paths probed when no env override is set.
/// macOS first (development primary), then Linux (CI).
pub const SYSTEM_CHROME_PATHS: &[&str] = &[
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
];

/// Resolve a local Chrome binary without network access.
///
/// Order:
/// 1. If `env_path` is `Some(p)` AND `p` is an executable file, return it.
/// 2. Otherwise, probe each path in `probe_paths`; return the first executable one.
/// 3. Otherwise, `None` — caller falls back to the downloader (Task 3b).
///
/// The function takes its env and probe paths as parameters (not globals)
/// to keep it deterministic under test. Production call site:
///
/// ```ignore
/// resolve_local_chrome(
///     std::env::var("VERTZ_CHROME_PATH").ok().as_deref(),
///     SYSTEM_CHROME_PATHS,
/// )
/// ```
pub fn resolve_local_chrome(env_path: Option<&str>, probe_paths: &[&str]) -> Option<PathBuf> {
    if let Some(path) = env_path {
        let p = Path::new(path);
        if is_executable_file(p) {
            return Some(p.to_path_buf());
        }
    }
    for candidate in probe_paths {
        let p = Path::new(candidate);
        if is_executable_file(p) {
            return Some(p.to_path_buf());
        }
    }
    None
}

/// Chrome for Testing target platforms supported in Phase 1.
///
/// Strings match the `platform` field in the public Chrome for Testing
/// `last-known-good-versions-with-downloads.json` index.
/// Windows is out of scope per design doc non-goals.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Linux64,
    MacArm64,
    MacX64,
}

impl Platform {
    /// Map `(OS, arch)` tuple (as produced by `std::env::consts::{OS, ARCH}`)
    /// to a Chrome for Testing platform string.
    ///
    /// Returns `Err(PlatformError::Unsupported)` for anything outside
    /// { linux/x86_64, macos/aarch64, macos/x86_64 }.
    pub fn detect(os: &str, arch: &str) -> Result<Self, PlatformError> {
        match (os, arch) {
            ("linux", "x86_64") => Ok(Platform::Linux64),
            ("macos", "aarch64") => Ok(Platform::MacArm64),
            ("macos", "x86_64") => Ok(Platform::MacX64),
            _ => Err(PlatformError::Unsupported {
                os: os.to_string(),
                arch: arch.to_string(),
            }),
        }
    }

    /// Platform identifier used by the Chrome for Testing JSON index's
    /// `platform` field. MUST match the strings the public index produces.
    pub fn cft_id(self) -> &'static str {
        match self {
            Platform::Linux64 => "linux64",
            Platform::MacArm64 => "mac-arm64",
            Platform::MacX64 => "mac-x64",
        }
    }
}

/// Error for unsupported `(OS, arch)` combinations.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PlatformError {
    #[error("unsupported platform: os={os}, arch={arch}")]
    Unsupported { os: String, arch: String },
}

/// Parsed Chrome for Testing "Stable" channel data.
///
/// Mirrors the subset of
/// `https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json`
/// that the fetcher needs: the Stable channel's version + revision and the
/// chrome-headless-shell download URL per platform.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ChromeVersions {
    pub(crate) version: String,
    pub(crate) revision: String,
    pub(crate) downloads: Vec<PlatformDownload>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PlatformDownload {
    pub(crate) platform: String,
    pub(crate) url: String,
}

/// Errors while parsing or querying the Chrome for Testing JSON index.
#[derive(Debug, thiserror::Error)]
pub enum VersionsError {
    #[error("failed to parse chrome-for-testing index: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("index is missing the Stable channel")]
    MissingStable,
    #[error("Stable channel is missing chrome-headless-shell downloads")]
    MissingHeadlessShell,
    #[error("no download entry for platform {0}")]
    PlatformNotFound(String),
}

/// Parse the public CfT index and return the Stable channel's metadata.
pub(crate) fn parse_versions(json: &str) -> Result<ChromeVersions, VersionsError> {
    #[derive(serde::Deserialize)]
    struct Root {
        channels: Channels,
    }
    #[derive(serde::Deserialize)]
    struct Channels {
        #[serde(rename = "Stable")]
        stable: Option<Channel>,
    }
    #[derive(serde::Deserialize)]
    struct Channel {
        version: String,
        revision: String,
        downloads: Downloads,
    }
    #[derive(serde::Deserialize)]
    struct Downloads {
        #[serde(rename = "chrome-headless-shell")]
        headless_shell: Option<Vec<PlatformDownloadRaw>>,
    }
    #[derive(serde::Deserialize)]
    struct PlatformDownloadRaw {
        platform: String,
        url: String,
    }

    let root: Root = serde_json::from_str(json)?;
    let stable = root.channels.stable.ok_or(VersionsError::MissingStable)?;
    let headless = stable
        .downloads
        .headless_shell
        .ok_or(VersionsError::MissingHeadlessShell)?;
    Ok(ChromeVersions {
        version: stable.version,
        revision: stable.revision,
        downloads: headless
            .into_iter()
            .map(|d| PlatformDownload {
                platform: d.platform,
                url: d.url,
            })
            .collect(),
    })
}

impl ChromeVersions {
    /// Return the download URL for the given platform, or
    /// `Err(VersionsError::PlatformNotFound)` if the index lacks one.
    pub(crate) fn url_for(&self, platform: Platform) -> Result<&str, VersionsError> {
        self.downloads
            .iter()
            .find(|d| d.platform == platform.cft_id())
            .map(|d| d.url.as_str())
            .ok_or_else(|| VersionsError::PlatformNotFound(platform.cft_id().to_string()))
    }
}

/// Errors while picking a writable cache directory.
#[derive(Debug, thiserror::Error)]
pub enum CacheDirError {
    #[error("no writable cache location found (tried HOME, XDG_CACHE_HOME, TMPDIR)")]
    NoWritableLocation,
}

/// Resolve the Chrome cache directory with HOME → XDG_CACHE_HOME → TMPDIR
/// fallback.
///
/// Order of candidates:
/// 1. `<home>/.vertz/chromium/`
/// 2. `<xdg_cache>/vertz/chromium/`  (only if `xdg_cache` is `Some`)
/// 3. `<tmp>/vertz/chromium/`
///
/// For each candidate the function tries to create the directory and write a
/// `.vertz-writable-probe` file. The first candidate that succeeds wins.
/// Returns [`CacheDirError::NoWritableLocation`] if all three fail.
///
/// Takes its environment as parameters (not globals) to keep the function
/// deterministic under test. Production call site reads `$HOME`,
/// `$XDG_CACHE_HOME`, `$TMPDIR` inline.
pub fn resolve_cache_dir(
    home: Option<&Path>,
    xdg_cache: Option<&Path>,
    tmp: &Path,
) -> Result<PathBuf, CacheDirError> {
    let mut candidates: Vec<PathBuf> = Vec::with_capacity(3);
    if let Some(h) = home {
        candidates.push(h.join(".vertz").join("chromium"));
    }
    if let Some(x) = xdg_cache {
        candidates.push(x.join("vertz").join("chromium"));
    }
    candidates.push(tmp.join("vertz").join("chromium"));

    for candidate in candidates {
        if try_prepare_dir(&candidate).is_ok() {
            return Ok(candidate);
        }
    }
    Err(CacheDirError::NoWritableLocation)
}

/// Create `dir` if missing and verify we can write to it via a probe file.
/// The probe is removed on success; on failure the function propagates the
/// underlying io error.
fn try_prepare_dir(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let probe = dir.join(".vertz-writable-probe");
    std::fs::write(&probe, b"ok")?;
    let _ = std::fs::remove_file(&probe);
    Ok(())
}

/// SHA-256 verification errors.
#[derive(Debug, thiserror::Error)]
pub enum VerifyError {
    #[error("io error while hashing: {0}")]
    Io(#[from] std::io::Error),
    #[error("sha-256 mismatch: expected {expected}, got {actual}")]
    Mismatch { expected: String, actual: String },
}

/// Download errors.
#[derive(Debug, thiserror::Error)]
pub enum DownloadError {
    #[error("request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("io error during download: {0}")]
    Io(#[from] std::io::Error),
    #[error("server returned HTTP {status} for {url}")]
    HttpStatus { status: u16, url: String },
    #[error("download exceeded size cap of {max_bytes} bytes")]
    SizeCap { max_bytes: u64 },
}

/// Upper bound for any single Chrome download. Sized generously above the
/// current headless-shell payload (~100 MB) but low enough to stop a hostile
/// or misconfigured server from exhausting memory.
pub(crate) const MAX_DOWNLOAD_BYTES: u64 = 500 * 1024 * 1024;

/// Options for [`ensure_chrome`]. All fields are borrowed from the caller; this
/// struct stores no state of its own and is cheap to construct per call.
pub struct EnsureOptions<'a> {
    /// Value of `$VERTZ_CHROME_PATH`, if set by the user.
    pub env_chrome_path: Option<&'a str>,
    /// System paths to probe for an already-installed Chrome / Chromium.
    /// Production uses [`SYSTEM_CHROME_PATHS`].
    pub probe_paths: &'a [&'a str],
    /// Root cache directory — typically the output of [`resolve_cache_dir`].
    pub cache_dir: &'a Path,
    /// Chrome for Testing versions JSON URL. Pinned in production; overridden
    /// by a wiremock URL in tests.
    pub versions_url: &'a str,
    /// Pinned revision string (from the CfT JSON). Used both to verify the
    /// index hasn't drifted and to decide when a cached manifest is stale.
    pub expected_revision: &'a str,
    /// SHA-256 hex digest of the zip for `platform`. Pinned in production.
    pub expected_sha256: &'a str,
    /// Target platform — usually [`Platform::detect`] of the current host.
    pub platform: Platform,
}

/// Errors surfaced by [`ensure_chrome`]. Thin wrapper over the underlying
/// component errors so callers can pattern-match the failure mode.
#[derive(Debug, thiserror::Error)]
pub enum EnsureError {
    #[error("versions index fetch failed: {0}")]
    VersionsFetch(#[from] reqwest::Error),
    #[error("versions index returned HTTP {status} for {url}")]
    VersionsHttpStatus { status: u16, url: String },
    #[error("versions index parse failed: {0}")]
    VersionsParse(#[from] VersionsError),
    #[error("download failed: {0}")]
    Download(#[from] DownloadError),
    #[error("verify failed: {0}")]
    Verify(#[from] VerifyError),
    #[error("unpack failed: {0}")]
    Unpack(#[from] UnpackError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("expected_sha256 must be 64 lowercase hex chars, got {got:?}")]
    InvalidExpectedSha { got: String },
    #[error("another vtz process is currently downloading Chrome; try again")]
    CacheBusy,
}

/// Resolve a Chrome binary, downloading from Chrome for Testing if nothing
/// usable is available locally or in the cache.
///
/// Resolution order:
/// 1. Local probe ([`resolve_local_chrome`] — env override + system paths)
/// 2. Cache manifest, iff it names a binary that still exists AND its
///    revision matches `opts.expected_revision`
/// 3. Fresh download: fetch the CfT versions JSON, locate the zip URL for
///    `opts.platform`, download + SHA-256 verify + unpack into
///    `<cache_dir>/<rev>/`, strip macOS quarantine, and persist a new
///    `current.json` manifest
///
/// The zip artifact is removed after successful unpack — the cache holds the
/// extracted binary only.
pub async fn ensure_chrome(opts: &EnsureOptions<'_>) -> Result<PathBuf, EnsureError> {
    if !is_valid_sha256_hex(opts.expected_sha256) {
        return Err(EnsureError::InvalidExpectedSha {
            got: opts.expected_sha256.to_string(),
        });
    }

    if let Some(local) = resolve_local_chrome(opts.env_chrome_path, opts.probe_paths) {
        return Ok(local);
    }

    if let Some(manifest) = read_manifest(opts.cache_dir) {
        if manifest.revision == opts.expected_revision && is_executable_file(&manifest.binary_path)
        {
            return Ok(manifest.binary_path);
        }
    }

    // Coordinate with any other vtz process trying to populate the same cache
    // directory. `fs2::try_lock_exclusive` returns immediately so we can map
    // contention to a clear error instead of blocking forever.
    //
    // Kill/panic safety: flock is released by the kernel when the fd is
    // closed, which happens on `std::fs::File`'s Drop (including during
    // panic unwinding) and on process exit. The explicit `FileExt::unlock`
    // calls below just release the lock slightly earlier than Drop would.
    std::fs::create_dir_all(opts.cache_dir)?;
    let lock_path = opts.cache_dir.join(".lock");
    let lock_file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&lock_path)?;
    use fs2::FileExt as _;
    match lock_file.try_lock_exclusive() {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
            return Err(EnsureError::CacheBusy);
        }
        Err(e) => return Err(EnsureError::Io(e)),
    }
    // Re-check the manifest now that we hold the lock: a sibling process may
    // have populated it while we were waiting.
    if let Some(manifest) = read_manifest(opts.cache_dir) {
        if manifest.revision == opts.expected_revision && is_executable_file(&manifest.binary_path)
        {
            let _ = fs2::FileExt::unlock(&lock_file);
            return Ok(manifest.binary_path);
        }
    }

    let versions_response = reqwest::get(opts.versions_url).await?;
    if !versions_response.status().is_success() {
        let _ = fs2::FileExt::unlock(&lock_file);
        return Err(EnsureError::VersionsHttpStatus {
            status: versions_response.status().as_u16(),
            url: opts.versions_url.to_string(),
        });
    }
    let versions_body = versions_response.text().await?;
    let versions = parse_versions(&versions_body)?;
    let url = versions.url_for(opts.platform)?;

    let rev_dir = opts.cache_dir.join(&versions.revision);
    std::fs::create_dir_all(&rev_dir)?;
    let zip_path = rev_dir.join("chrome-headless-shell.zip");

    // Scope guard: if any of download/verify/unpack errors, tear the
    // half-populated rev_dir down so the next run starts clean.
    let cleanup_guard = CleanupOnDrop { path: &rev_dir };

    download_to_file(url, &zip_path, MAX_DOWNLOAD_BYTES).await?;
    verify_sha256(&zip_path, opts.expected_sha256)?;
    let binary = unpack_chrome_zip(&zip_path, &rev_dir)?;
    remove_quarantine(&binary);

    write_manifest(
        opts.cache_dir,
        &CacheManifest {
            revision: versions.revision.clone(),
            binary_path: binary.clone(),
            downloaded_at_epoch_secs: now_epoch_secs(),
        },
    )?;

    let _ = std::fs::remove_file(&zip_path);
    cleanup_guard.disarm();
    let _ = fs2::FileExt::unlock(&lock_file);
    Ok(binary)
}

/// `true` iff `s` is exactly 64 hex digits (either case). Bans the empty
/// string and nonsense like `"deadbeef"` from accidentally disabling
/// integrity enforcement.
fn is_valid_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit())
}

/// RAII guard that removes `path` on drop unless [`disarm`](Self::disarm)
/// is called first. Used to clean up half-populated revision directories
/// when `ensure_chrome` fails partway through.
struct CleanupOnDrop<'a> {
    path: &'a Path,
}

impl CleanupOnDrop<'_> {
    fn disarm(self) {
        std::mem::forget(self);
    }
}

impl Drop for CleanupOnDrop<'_> {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(self.path);
    }
}

/// Persisted metadata about a cached Chrome download.
///
/// Stored at `<cache_dir>/current.json` so subsequent `vtz` invocations can
/// skip re-resolution and use the existing binary directly.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct CacheManifest {
    /// Chrome for Testing revision (from the public index).
    pub(crate) revision: String,
    /// Absolute path to the extracted `chrome-headless-shell` binary.
    pub(crate) binary_path: PathBuf,
    /// Wall-clock time of the successful download, in seconds since
    /// Unix epoch. Chosen over RFC3339 to avoid a chrono dep; still
    /// human-inspectable and trivially sortable.
    pub(crate) downloaded_at_epoch_secs: u64,
}

/// Filename convention for the cache manifest.
pub(crate) fn manifest_path(cache_dir: &Path) -> PathBuf {
    cache_dir.join("current.json")
}

/// Atomically write `manifest` as JSON at `<cache_dir>/current.json`.
/// Creates the directory if it doesn't exist.
pub(crate) fn write_manifest(cache_dir: &Path, manifest: &CacheManifest) -> std::io::Result<()> {
    std::fs::create_dir_all(cache_dir)?;
    let final_path = manifest_path(cache_dir);
    let tmp = cache_dir.join("current.json.tmp");
    let json = serde_json::to_vec_pretty(manifest)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(&tmp, &json)?;
    std::fs::rename(&tmp, &final_path)?;
    Ok(())
}

/// Read the cache manifest. Returns `None` if the file is missing, unreadable,
/// or contains invalid JSON — the caller is expected to fall back to a fresh
/// download in that case.
pub(crate) fn read_manifest(cache_dir: &Path) -> Option<CacheManifest> {
    let bytes = std::fs::read(manifest_path(cache_dir)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Return the current wall-clock time in seconds since the Unix epoch,
/// or `0` if the system clock is before the epoch.
pub(crate) fn now_epoch_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Best-effort removal of the macOS `com.apple.quarantine` extended attribute
/// from a freshly extracted Chrome binary so Gatekeeper doesn't prompt on
/// first launch.
///
/// No-op on non-macOS. Silently logs (never fails) on macOS if `xattr` is
/// missing or the attribute doesn't exist — per the design doc:
/// "failure to invoke xattr is non-fatal, logged".
pub(crate) fn remove_quarantine(path: &Path) {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Absolute path defeats PATH-injection — xattr ships with macOS base.
        let output = Command::new("/usr/bin/xattr")
            .args(["-d", "com.apple.quarantine"])
            .arg(path)
            .output();
        match output {
            Ok(out) if out.status.success() => {}
            Ok(_) => {
                // attribute didn't exist (xattr exits 1 in that case) — harmless
            }
            Err(e) => {
                eprintln!(
                    "[screenshot] xattr invocation failed for {}: {}",
                    path.display(),
                    e
                );
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
    }
}

/// Stream the body at `url` into `dest` in bytes_stream chunks, creating
/// parent directories as needed. Aborts when the running total exceeds
/// `max_bytes`, or when the server's `Content-Length` already exceeds
/// `max_bytes` before any bytes arrive. Fails on any non-2xx response with
/// [`DownloadError::HttpStatus`].
pub(crate) async fn download_to_file(
    url: &str,
    dest: &Path,
    max_bytes: u64,
) -> Result<(), DownloadError> {
    use futures_util::StreamExt;
    use std::io::Write as _;

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let response = reqwest::get(url).await?;
    if !response.status().is_success() {
        return Err(DownloadError::HttpStatus {
            status: response.status().as_u16(),
            url: url.to_string(),
        });
    }
    if let Some(declared) = response.content_length() {
        if declared > max_bytes {
            return Err(DownloadError::SizeCap { max_bytes });
        }
    }

    let mut file = std::fs::File::create(dest)?;
    let mut written: u64 = 0;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        written = written.saturating_add(chunk.len() as u64);
        if written > max_bytes {
            drop(file);
            let _ = std::fs::remove_file(dest);
            return Err(DownloadError::SizeCap { max_bytes });
        }
        file.write_all(&chunk)?;
    }
    Ok(())
}

/// Zip unpacking errors.
#[derive(Debug, thiserror::Error)]
pub enum UnpackError {
    #[error("io error during unpack: {0}")]
    Io(#[from] std::io::Error),
    #[error("zip format error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("zip entry escapes destination: {0}")]
    UnsafePath(String),
    #[error("zip did not contain chrome-headless-shell binary")]
    BinaryNotFound,
}

/// Extract a Chrome for Testing `chrome-headless-shell-<platform>.zip` into
/// `dest_dir`. Returns the path to the `chrome-headless-shell` binary inside.
///
/// Safety:
/// - Each entry's path is sanitized against `../` traversal and absolute
///   paths; any such entry returns [`UnpackError::UnsafePath`].
/// - Unix permissions are preserved when present so the extracted binary
///   stays executable.
pub(crate) fn unpack_chrome_zip(zip_path: &Path, dest_dir: &Path) -> Result<PathBuf, UnpackError> {
    use std::io::copy;

    let file = std::fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    std::fs::create_dir_all(dest_dir)?;

    let mut binary_path: Option<PathBuf> = None;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| UnpackError::UnsafePath(entry.name().to_string()))?;
        let out_path = dest_dir.join(&relative);

        // Reject symlink entries outright. CfT zips don't contain them, and
        // extracting one would either let an attacker redirect subsequent
        // writes outside `dest_dir` or break us into executing a file that
        // points somewhere else on disk.
        if let Some(mode) = entry.unix_mode() {
            const S_IFMT: u32 = 0o170000;
            const S_IFLNK: u32 = 0o120000;
            if mode & S_IFMT == S_IFLNK {
                return Err(UnpackError::UnsafePath(entry.name().to_string()));
            }
        }

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = std::fs::File::create(&out_path)?;
        copy(&mut entry, &mut out)?;

        #[cfg(unix)]
        if let Some(mode) = entry.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            // Mask off the file-type bits — we've already rejected symlinks;
            // keep only the permission bits.
            let perm_bits = mode & 0o7777;
            std::fs::set_permissions(&out_path, std::fs::Permissions::from_mode(perm_bits))?;
        }

        if out_path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n == "chrome-headless-shell")
        {
            binary_path = Some(out_path);
        }
    }

    binary_path.ok_or(UnpackError::BinaryNotFound)
}

/// Read `path` in chunks and compare its SHA-256 hex digest against
/// `expected_hex` (case-insensitive).
pub(crate) fn verify_sha256(path: &Path, expected_hex: &str) -> Result<(), VerifyError> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let actual = format!("{:x}", hasher.finalize());
    if actual.eq_ignore_ascii_case(expected_hex) {
        Ok(())
    } else {
        Err(VerifyError::Mismatch {
            expected: expected_hex.to_string(),
            actual,
        })
    }
}

/// True if `path` exists, is a file (or symlink resolving to one), and the
/// user has execute permission on Unix. On non-Unix, any existing file passes.
fn is_executable_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    #[cfg(unix)]
    fn make_executable(path: &Path) {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(path, perms).unwrap();
    }

    fn touch_file(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut f = fs::File::create(path).unwrap();
        f.write_all(b"#!/bin/sh\necho stub\n").unwrap();
    }

    fn touch_executable(path: &Path) {
        touch_file(path);
        #[cfg(unix)]
        make_executable(path);
    }

    #[test]
    fn env_override_used_when_executable() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("my-chrome");
        touch_executable(&exe);

        let result = resolve_local_chrome(Some(exe.to_str().unwrap()), &[]);
        assert_eq!(result, Some(exe));
    }

    #[test]
    fn env_override_skipped_when_missing() {
        let result = resolve_local_chrome(Some("/definitely/not/a/real/path/chrome"), &[]);
        assert_eq!(result, None);
    }

    #[cfg(unix)]
    #[test]
    fn env_override_skipped_when_not_executable() {
        let dir = tempfile::tempdir().unwrap();
        let non_exec = dir.path().join("data.txt");
        touch_file(&non_exec);
        // Deliberately NOT setting executable bit.

        let result = resolve_local_chrome(Some(non_exec.to_str().unwrap()), &[]);
        assert_eq!(result, None);
    }

    #[test]
    fn env_override_skipped_when_directory() {
        let dir = tempfile::tempdir().unwrap();
        let result = resolve_local_chrome(Some(dir.path().to_str().unwrap()), &[]);
        assert_eq!(result, None);
    }

    #[test]
    fn system_probe_returns_first_hit() {
        let dir = tempfile::tempdir().unwrap();
        let not_present = dir.path().join("missing").join("chrome");
        let present = dir.path().join("found").join("chrome");
        touch_executable(&present);

        let probes: Vec<String> = vec![
            not_present.to_string_lossy().into_owned(),
            present.to_string_lossy().into_owned(),
        ];
        let probe_refs: Vec<&str> = probes.iter().map(|s| s.as_str()).collect();

        let result = resolve_local_chrome(None, &probe_refs);
        assert_eq!(result, Some(present));
    }

    #[test]
    fn system_probe_prefers_env_override() {
        let dir = tempfile::tempdir().unwrap();
        let env = dir.path().join("from-env");
        let system = dir.path().join("from-system");
        touch_executable(&env);
        touch_executable(&system);

        let system_str = system.to_string_lossy().into_owned();
        let result = resolve_local_chrome(Some(env.to_str().unwrap()), &[system_str.as_str()]);
        assert_eq!(result, Some(env));
    }

    #[test]
    fn returns_none_when_nothing_found() {
        let result = resolve_local_chrome(None, &["/nope/never", "/still/nope"]);
        assert_eq!(result, None);
    }

    #[test]
    fn system_chrome_paths_include_macos_and_linux() {
        assert!(SYSTEM_CHROME_PATHS
            .iter()
            .any(|p| p.contains("Google Chrome.app")));
        assert!(SYSTEM_CHROME_PATHS.contains(&"/usr/bin/google-chrome"));
        assert!(SYSTEM_CHROME_PATHS.contains(&"/usr/bin/chromium"));
    }

    // ----- Platform detection -----

    #[test]
    fn platform_detect_linux_x86_64() {
        assert_eq!(Platform::detect("linux", "x86_64"), Ok(Platform::Linux64));
    }

    #[test]
    fn platform_detect_macos_arm64() {
        assert_eq!(Platform::detect("macos", "aarch64"), Ok(Platform::MacArm64));
    }

    #[test]
    fn platform_detect_macos_x86_64() {
        assert_eq!(Platform::detect("macos", "x86_64"), Ok(Platform::MacX64));
    }

    #[test]
    fn platform_detect_windows_rejected() {
        let err = Platform::detect("windows", "x86_64").unwrap_err();
        assert!(matches!(err, PlatformError::Unsupported { .. }));
    }

    #[test]
    fn platform_detect_linux_aarch64_rejected() {
        let err = Platform::detect("linux", "aarch64").unwrap_err();
        assert!(matches!(err, PlatformError::Unsupported { .. }));
    }

    #[test]
    fn platform_cft_id_matches_public_index() {
        assert_eq!(Platform::Linux64.cft_id(), "linux64");
        assert_eq!(Platform::MacArm64.cft_id(), "mac-arm64");
        assert_eq!(Platform::MacX64.cft_id(), "mac-x64");
    }

    // ----- JSON index parsing -----

    const FIXTURE_JSON: &str = include_str!("testdata/chrome-versions.json");

    #[test]
    fn parse_versions_extracts_stable_revision_and_version() {
        let parsed = parse_versions(FIXTURE_JSON).unwrap();
        assert_eq!(parsed.version, "125.0.6422.141");
        assert_eq!(parsed.revision, "1287751");
    }

    #[test]
    fn parse_versions_url_for_linux64() {
        let parsed = parse_versions(FIXTURE_JSON).unwrap();
        let url = parsed.url_for(Platform::Linux64).unwrap();
        assert!(url.contains("linux64/chrome-headless-shell-linux64.zip"));
    }

    #[test]
    fn parse_versions_url_for_mac_arm64() {
        let parsed = parse_versions(FIXTURE_JSON).unwrap();
        let url = parsed.url_for(Platform::MacArm64).unwrap();
        assert!(url.contains("mac-arm64/chrome-headless-shell-mac-arm64.zip"));
    }

    #[test]
    fn parse_versions_url_for_mac_x64() {
        let parsed = parse_versions(FIXTURE_JSON).unwrap();
        let url = parsed.url_for(Platform::MacX64).unwrap();
        assert!(url.contains("mac-x64/chrome-headless-shell-mac-x64.zip"));
    }

    #[test]
    fn parse_versions_rejects_invalid_json() {
        let err = parse_versions("{ not json").unwrap_err();
        assert!(matches!(err, VersionsError::Parse(_)));
    }

    #[test]
    fn parse_versions_requires_stable_channel() {
        let err = parse_versions(r#"{"channels": {}}"#).unwrap_err();
        assert!(matches!(err, VersionsError::MissingStable));
    }

    #[test]
    fn parse_versions_requires_headless_shell_downloads() {
        let json = r#"{
            "channels": {
                "Stable": {
                    "channel": "Stable",
                    "version": "1.0.0",
                    "revision": "1",
                    "downloads": {}
                }
            }
        }"#;
        let err = parse_versions(json).unwrap_err();
        assert!(matches!(err, VersionsError::MissingHeadlessShell));
    }

    // ----- Cache dir resolution -----

    #[test]
    fn cache_dir_uses_home_when_writable() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let resolved =
            resolve_cache_dir(Some(home), None, Path::new("/should/never/be/used")).unwrap();
        assert_eq!(resolved, home.join(".vertz").join("chromium"));
        assert!(resolved.is_dir());
    }

    #[test]
    fn cache_dir_falls_back_to_xdg_when_home_readonly() {
        // Simulate read-only HOME by using a non-existent parent that can't be created.
        let xdg_root = tempfile::tempdir().unwrap();
        let resolved = resolve_cache_dir(
            Some(Path::new("/definitely/not/writable")),
            Some(xdg_root.path()),
            Path::new("/should/never/be/used"),
        )
        .unwrap();
        assert_eq!(resolved, xdg_root.path().join("vertz").join("chromium"));
        assert!(resolved.is_dir());
    }

    #[test]
    fn cache_dir_falls_back_to_tmp_when_home_and_xdg_fail() {
        let tmp_root = tempfile::tempdir().unwrap();
        let resolved = resolve_cache_dir(
            Some(Path::new("/definitely/not/writable")),
            Some(Path::new("/also/not/writable")),
            tmp_root.path(),
        )
        .unwrap();
        assert_eq!(resolved, tmp_root.path().join("vertz").join("chromium"));
    }

    #[test]
    fn cache_dir_uses_home_without_xdg() {
        let dir = tempfile::tempdir().unwrap();
        let resolved = resolve_cache_dir(Some(dir.path()), None, Path::new("/unused")).unwrap();
        assert!(resolved.starts_with(dir.path()));
    }

    #[test]
    fn cache_dir_all_paths_unwritable_errors() {
        let err = resolve_cache_dir(
            Some(Path::new("/nope/home")),
            Some(Path::new("/nope/xdg")),
            Path::new("/nope/tmp"),
        )
        .unwrap_err();
        assert!(matches!(err, CacheDirError::NoWritableLocation));
    }

    // ----- SHA-256 verification -----

    #[test]
    fn verify_sha256_accepts_matching_hash() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("blob.bin");
        fs::write(&path, b"hello vertz").unwrap();
        // sha256("hello vertz") computed externally
        let expected = "f42176e97a57a79901a4ed88bf6a954f63663fb301d64630464131a03a79c027";
        verify_sha256(&path, expected).unwrap();
    }

    #[test]
    fn verify_sha256_rejects_mismatch() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("blob.bin");
        fs::write(&path, b"hello vertz").unwrap();
        let err = verify_sha256(
            &path,
            "0000000000000000000000000000000000000000000000000000000000000000",
        )
        .unwrap_err();
        assert!(matches!(err, VerifyError::Mismatch { .. }));
    }

    #[test]
    fn verify_sha256_case_insensitive() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("blob.bin");
        fs::write(&path, b"hello vertz").unwrap();
        let expected_upper = "F42176E97A57A79901A4ED88BF6A954F63663FB301D64630464131A03A79C027";
        verify_sha256(&path, expected_upper).unwrap();
    }

    #[test]
    fn verify_sha256_missing_file_errors() {
        let err = verify_sha256(Path::new("/no/such/file"), "deadbeef").unwrap_err();
        assert!(matches!(err, VerifyError::Io(_)));
    }

    // ----- Zip unpack -----

    /// Build an in-memory Chrome for Testing-style zip:
    /// `chrome-headless-shell-<platform>/chrome-headless-shell` with the given bytes.
    fn build_test_zip(platform_dir: &str, binary_bytes: &[u8]) -> Vec<u8> {
        use std::io::Write as _;
        use zip::write::SimpleFileOptions;
        use zip::CompressionMethod;

        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut w = zip::ZipWriter::new(&mut buf);
            let opts = SimpleFileOptions::default()
                .compression_method(CompressionMethod::Deflated)
                .unix_permissions(0o755);
            w.start_file(format!("{}/chrome-headless-shell", platform_dir), opts)
                .unwrap();
            w.write_all(binary_bytes).unwrap();
            w.finish().unwrap();
        }
        buf.into_inner()
    }

    #[test]
    fn unpack_chrome_zip_extracts_binary_and_returns_path() {
        let dir = tempfile::tempdir().unwrap();
        let zip_path = dir.path().join("chrome.zip");
        fs::write(
            &zip_path,
            build_test_zip(
                "chrome-headless-shell-linux64",
                b"#!/bin/sh\necho fake chrome\n",
            ),
        )
        .unwrap();

        let dest = dir.path().join("extracted");
        let binary = unpack_chrome_zip(&zip_path, &dest).unwrap();

        assert!(binary.exists());
        assert!(binary.ends_with("chrome-headless-shell"));
        let contents = fs::read(&binary).unwrap();
        assert_eq!(contents, b"#!/bin/sh\necho fake chrome\n");
    }

    #[cfg(unix)]
    #[test]
    fn unpack_chrome_zip_preserves_executable_bit() {
        let dir = tempfile::tempdir().unwrap();
        let zip_path = dir.path().join("chrome.zip");
        fs::write(
            &zip_path,
            build_test_zip("chrome-headless-shell-mac-arm64", b"binary"),
        )
        .unwrap();

        let dest = dir.path().join("out");
        let binary = unpack_chrome_zip(&zip_path, &dest).unwrap();

        use std::os::unix::fs::PermissionsExt;
        let mode = fs::metadata(&binary).unwrap().permissions().mode();
        assert!(mode & 0o111 != 0, "binary must be executable, got {mode:o}");
    }

    #[test]
    fn unpack_chrome_zip_errors_when_binary_missing() {
        use std::io::Write as _;
        use zip::write::SimpleFileOptions;
        use zip::CompressionMethod;

        let dir = tempfile::tempdir().unwrap();
        let zip_path = dir.path().join("empty.zip");
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut w = zip::ZipWriter::new(&mut buf);
            let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            w.start_file("not-the-binary.txt", opts).unwrap();
            w.write_all(b"nope").unwrap();
            w.finish().unwrap();
        }
        fs::write(&zip_path, buf.into_inner()).unwrap();

        let err = unpack_chrome_zip(&zip_path, &dir.path().join("out")).unwrap_err();
        assert!(matches!(err, UnpackError::BinaryNotFound));
    }

    #[test]
    fn unpack_chrome_zip_errors_on_invalid_zip() {
        let dir = tempfile::tempdir().unwrap();
        let bogus = dir.path().join("not-a-zip.zip");
        fs::write(&bogus, b"this is not zip data").unwrap();
        let err = unpack_chrome_zip(&bogus, &dir.path().join("out")).unwrap_err();
        assert!(matches!(err, UnpackError::Zip(_) | UnpackError::Io(_)));
    }

    // ----- HTTP download -----

    #[tokio::test]
    async fn download_to_file_streams_body_to_disk() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/chrome.zip"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(b"zipbytes"))
            .mount(&server)
            .await;

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("downloaded.zip");
        let url = format!("{}/chrome.zip", server.uri());
        download_to_file(&url, &dest, MAX_DOWNLOAD_BYTES)
            .await
            .unwrap();

        assert_eq!(fs::read(&dest).unwrap(), b"zipbytes");
    }

    #[tokio::test]
    async fn download_to_file_errors_on_non_2xx() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("x.zip");
        let url = format!("{}/missing.zip", server.uri());
        let err = download_to_file(&url, &dest, MAX_DOWNLOAD_BYTES)
            .await
            .unwrap_err();
        assert!(matches!(err, DownloadError::HttpStatus { status: 404, .. }));
    }

    #[tokio::test]
    async fn download_to_file_rejects_content_length_over_cap() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        // Set a Content-Length header that exceeds our cap.
        Mock::given(method("GET"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-length", "1000")
                    .set_body_bytes(vec![0u8; 1000]),
            )
            .mount(&server)
            .await;

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("big.zip");
        let url = format!("{}/big.zip", server.uri());
        let err = download_to_file(&url, &dest, 500).await.unwrap_err();
        assert!(matches!(err, DownloadError::SizeCap { max_bytes: 500 }));
        // No partial file left behind.
        assert!(!dest.exists());
    }

    #[tokio::test]
    async fn download_to_file_aborts_when_stream_exceeds_cap() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        // Chunked response (no Content-Length known up-front) that exceeds the
        // cap. wiremock sends the whole body in one go, but we still assert
        // the byte-counting path fires.
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![7u8; 200]))
            .mount(&server)
            .await;

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("big.zip");
        let url = format!("{}/big.zip", server.uri());
        let err = download_to_file(&url, &dest, 50).await.unwrap_err();
        assert!(matches!(err, DownloadError::SizeCap { max_bytes: 50 }));
        // Partial download removed on abort.
        assert!(!dest.exists());
    }

    #[tokio::test]
    async fn download_to_file_errors_on_connection_refused() {
        // Bind to port 0 to find a free port, then drop — the port is free but
        // nothing is listening.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("x.zip");
        let url = format!("http://127.0.0.1:{port}/x.zip");
        let err = download_to_file(&url, &dest, MAX_DOWNLOAD_BYTES)
            .await
            .unwrap_err();
        assert!(matches!(err, DownloadError::Request(_)));
    }

    // ----- Quarantine removal -----

    #[test]
    fn remove_quarantine_does_not_panic_on_missing_path() {
        remove_quarantine(Path::new("/no/such/file/for/test"));
    }

    // ----- Cache manifest -----

    #[test]
    fn manifest_path_is_current_json_in_cache_dir() {
        let dir = Path::new("/a/b/c");
        assert_eq!(manifest_path(dir), dir.join("current.json"));
    }

    #[test]
    fn manifest_roundtrips_through_disk() {
        let dir = tempfile::tempdir().unwrap();
        let m = CacheManifest {
            revision: "1287751".into(),
            binary_path: dir.path().join("chrome"),
            downloaded_at_epoch_secs: 1_700_000_000,
        };
        write_manifest(dir.path(), &m).unwrap();
        let read = read_manifest(dir.path()).unwrap();
        assert_eq!(read, m);
    }

    #[test]
    fn read_manifest_returns_none_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_manifest(dir.path()).is_none());
    }

    #[test]
    fn read_manifest_returns_none_when_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("current.json"), b"{ not json").unwrap();
        assert!(read_manifest(dir.path()).is_none());
    }

    #[test]
    fn write_manifest_leaves_no_tmp_files() {
        let dir = tempfile::tempdir().unwrap();
        let m = CacheManifest {
            revision: "1".into(),
            binary_path: dir.path().join("x"),
            downloaded_at_epoch_secs: 0,
        };
        write_manifest(dir.path(), &m).unwrap();
        let entries: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name())
            .collect();
        assert_eq!(entries.len(), 1, "unexpected files: {entries:?}");
        assert_eq!(entries[0], "current.json");
    }

    #[test]
    fn write_manifest_creates_dir_if_missing() {
        let root = tempfile::tempdir().unwrap();
        let nested = root.path().join("new").join("sub");
        let m = CacheManifest {
            revision: "1".into(),
            binary_path: nested.join("bin"),
            downloaded_at_epoch_secs: 0,
        };
        write_manifest(&nested, &m).unwrap();
        assert!(read_manifest(&nested).is_some());
    }

    // ----- ensure_chrome orchestrator -----

    /// A syntactically valid-but-fake 64-char hex SHA-256 that never matches
    /// any real payload. Use when a test is meant to exercise a short-circuit
    /// path that MUST return before `verify_sha256` runs — if the short-circuit
    /// regresses, the test fails on verification instead of hiding the bug.
    const DUMMY_SHA256: &str = "0000000000000000000000000000000000000000000000000000000000000000";

    /// Minimal JSON index matching the fixture's Stable-channel entry but
    /// pointing at a given `base_url`, so tests can stand up a wiremock
    /// server and have the parser route to it.
    fn build_versions_json(base_url: &str, revision: &str) -> String {
        format!(
            r#"{{
              "channels": {{
                "Stable": {{
                  "channel": "Stable",
                  "version": "125.0.6422.141",
                  "revision": "{rev}",
                  "downloads": {{
                    "chrome-headless-shell": [
                      {{ "platform": "linux64", "url": "{base}/linux64/chrome.zip" }},
                      {{ "platform": "mac-arm64", "url": "{base}/mac-arm64/chrome.zip" }},
                      {{ "platform": "mac-x64", "url": "{base}/mac-x64/chrome.zip" }}
                    ]
                  }}
                }}
              }}
            }}"#,
            rev = revision,
            base = base_url,
        )
    }

    #[tokio::test]
    async fn ensure_chrome_returns_local_probe_when_present() {
        let dir = tempfile::tempdir().unwrap();
        let local_exe = dir.path().join("system-chrome");
        touch_executable(&local_exe);

        let cache = dir.path().join("cache");
        let probes = [local_exe.to_str().unwrap()];
        let opts = EnsureOptions {
            env_chrome_path: None,
            probe_paths: &probes,
            cache_dir: &cache,
            versions_url: "http://127.0.0.1:1/should-never-be-called",
            expected_revision: "1",
            expected_sha256: DUMMY_SHA256,
            platform: Platform::Linux64,
        };
        let resolved = ensure_chrome(&opts).await.unwrap();
        assert_eq!(resolved, local_exe);
    }

    #[tokio::test]
    async fn ensure_chrome_returns_cached_when_manifest_matches() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("cache");
        std::fs::create_dir_all(&cache).unwrap();
        let cached = cache.join("cached-bin");
        touch_executable(&cached);
        write_manifest(
            &cache,
            &CacheManifest {
                revision: "1287751".into(),
                binary_path: cached.clone(),
                downloaded_at_epoch_secs: 1000,
            },
        )
        .unwrap();

        let opts = EnsureOptions {
            env_chrome_path: None,
            probe_paths: &[],
            cache_dir: &cache,
            versions_url: "http://127.0.0.1:1/should-never-be-called",
            expected_revision: "1287751",
            expected_sha256: DUMMY_SHA256,
            platform: Platform::Linux64,
        };
        let resolved = ensure_chrome(&opts).await.unwrap();
        assert_eq!(resolved, cached);
    }

    #[tokio::test]
    async fn ensure_chrome_downloads_and_caches_when_nothing_local() {
        use wiremock::matchers::{method, path as wpath};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;

        // 1) Mock the versions JSON
        let revision = "1287751";
        let versions_body = build_versions_json(&server.uri(), revision);
        Mock::given(method("GET"))
            .and(wpath("/versions.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string(versions_body))
            .mount(&server)
            .await;

        // 2) Mock the zip download. Content = a small real zip with our
        // expected binary inside.
        let zip_bytes = build_test_zip("chrome-headless-shell-linux64", b"chrome-bin");
        let zip_sha = {
            use sha2::{Digest, Sha256};
            let mut h = Sha256::new();
            h.update(&zip_bytes);
            format!("{:x}", h.finalize())
        };
        Mock::given(method("GET"))
            .and(wpath("/linux64/chrome.zip"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(zip_bytes))
            .mount(&server)
            .await;

        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("cache");
        let versions_url = format!("{}/versions.json", server.uri());
        let opts = EnsureOptions {
            env_chrome_path: None,
            probe_paths: &[],
            cache_dir: &cache,
            versions_url: &versions_url,
            expected_revision: revision,
            expected_sha256: &zip_sha,
            platform: Platform::Linux64,
        };
        let binary = ensure_chrome(&opts).await.unwrap();
        assert!(binary.exists());
        assert!(binary.ends_with("chrome-headless-shell"));
        // Manifest written
        let m = read_manifest(&cache).unwrap();
        assert_eq!(m.revision, revision);
        assert_eq!(m.binary_path, binary);
    }

    #[tokio::test]
    async fn ensure_chrome_errors_on_sha_mismatch() {
        use wiremock::matchers::{method, path as wpath};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        let versions_body = build_versions_json(&server.uri(), "1287751");
        Mock::given(method("GET"))
            .and(wpath("/versions.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string(versions_body))
            .mount(&server)
            .await;
        let zip_bytes = build_test_zip("chrome-headless-shell-linux64", b"chrome-bin");
        Mock::given(method("GET"))
            .and(wpath("/linux64/chrome.zip"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(zip_bytes))
            .mount(&server)
            .await;

        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("cache");
        let versions_url = format!("{}/versions.json", server.uri());
        let opts = EnsureOptions {
            env_chrome_path: None,
            probe_paths: &[],
            cache_dir: &cache,
            versions_url: &versions_url,
            expected_revision: "1287751",
            expected_sha256: "0000000000000000000000000000000000000000000000000000000000000000",
            platform: Platform::Linux64,
        };
        let err = ensure_chrome(&opts).await.unwrap_err();
        assert!(matches!(err, EnsureError::Verify(_)));
    }

    #[tokio::test]
    async fn ensure_chrome_rejects_invalid_sha_format() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("cache");
        for bad in [
            "",
            "deadbeef",
            &"g".repeat(64),
            &"a".repeat(63),
            &"a".repeat(65),
        ] {
            let opts = EnsureOptions {
                env_chrome_path: None,
                probe_paths: &[],
                cache_dir: &cache,
                versions_url: "http://127.0.0.1:1",
                expected_revision: "1",
                expected_sha256: bad,
                platform: Platform::Linux64,
            };
            let err = ensure_chrome(&opts).await.unwrap_err();
            assert!(
                matches!(err, EnsureError::InvalidExpectedSha { .. }),
                "bad={bad:?} produced {err:?}"
            );
        }
    }

    #[tokio::test]
    async fn ensure_chrome_errors_on_versions_http_error() {
        use wiremock::matchers::{method, path as wpath};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(wpath("/versions.json"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("cache");
        let versions_url = format!("{}/versions.json", server.uri());
        let opts = EnsureOptions {
            env_chrome_path: None,
            probe_paths: &[],
            cache_dir: &cache,
            versions_url: &versions_url,
            expected_revision: "1",
            expected_sha256: DUMMY_SHA256,
            platform: Platform::Linux64,
        };
        let err = ensure_chrome(&opts).await.unwrap_err();
        assert!(matches!(
            err,
            EnsureError::VersionsHttpStatus { status: 500, .. }
        ));
    }

    #[tokio::test]
    async fn ensure_chrome_cleans_up_rev_dir_on_failure() {
        use wiremock::matchers::{method, path as wpath};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        let revision = "1287751";
        let versions_body = build_versions_json(&server.uri(), revision);
        Mock::given(method("GET"))
            .and(wpath("/versions.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string(versions_body))
            .mount(&server)
            .await;
        // Serve bytes whose SHA won't match the (valid-format) expected_sha256.
        Mock::given(method("GET"))
            .and(wpath("/linux64/chrome.zip"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(b"wrong-content"))
            .mount(&server)
            .await;

        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("cache");
        let versions_url = format!("{}/versions.json", server.uri());
        let opts = EnsureOptions {
            env_chrome_path: None,
            probe_paths: &[],
            cache_dir: &cache,
            versions_url: &versions_url,
            expected_revision: revision,
            expected_sha256: DUMMY_SHA256,
            platform: Platform::Linux64,
        };
        let err = ensure_chrome(&opts).await.unwrap_err();
        assert!(matches!(err, EnsureError::Verify(_)));
        // Scope guard should have removed the rev directory.
        assert!(!cache.join(revision).exists(), "rev dir leaked on failure");
    }

    #[tokio::test]
    async fn ensure_chrome_returns_cache_busy_when_lock_held() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("cache");
        std::fs::create_dir_all(&cache).unwrap();
        // Pre-create + lock the lock file from outside the function so our
        // try_lock_exclusive call definitely fails.
        let lock_path = cache.join(".lock");
        let held = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(&lock_path)
            .unwrap();
        use fs2::FileExt as _;
        held.try_lock_exclusive().unwrap();

        let opts = EnsureOptions {
            env_chrome_path: None,
            probe_paths: &[],
            cache_dir: &cache,
            versions_url: "http://127.0.0.1:1/should-never-be-called",
            expected_revision: "1287751",
            expected_sha256: DUMMY_SHA256,
            platform: Platform::Linux64,
        };
        let err = ensure_chrome(&opts).await.unwrap_err();
        assert!(matches!(err, EnsureError::CacheBusy));

        let _ = fs2::FileExt::unlock(&held);
    }

    #[tokio::test]
    async fn ensure_chrome_redownloads_when_revision_mismatches_manifest() {
        use wiremock::matchers::{method, path as wpath};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        let new_revision = "1287752";
        let versions_body = build_versions_json(&server.uri(), new_revision);
        Mock::given(method("GET"))
            .and(wpath("/versions.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string(versions_body))
            .mount(&server)
            .await;
        let zip_bytes = build_test_zip("chrome-headless-shell-linux64", b"new-chrome");
        let zip_sha = {
            use sha2::{Digest, Sha256};
            let mut h = Sha256::new();
            h.update(&zip_bytes);
            format!("{:x}", h.finalize())
        };
        Mock::given(method("GET"))
            .and(wpath("/linux64/chrome.zip"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(zip_bytes))
            .mount(&server)
            .await;

        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("cache");
        std::fs::create_dir_all(&cache).unwrap();
        // Pre-existing manifest points to a stale rev + missing binary
        write_manifest(
            &cache,
            &CacheManifest {
                revision: "1287751".into(),
                binary_path: cache.join("missing-bin"),
                downloaded_at_epoch_secs: 0,
            },
        )
        .unwrap();

        let versions_url = format!("{}/versions.json", server.uri());
        let opts = EnsureOptions {
            env_chrome_path: None,
            probe_paths: &[],
            cache_dir: &cache,
            versions_url: &versions_url,
            expected_revision: new_revision,
            expected_sha256: &zip_sha,
            platform: Platform::Linux64,
        };
        let binary = ensure_chrome(&opts).await.unwrap();
        assert!(binary.exists());
        let m = read_manifest(&cache).unwrap();
        assert_eq!(m.revision, new_revision);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn remove_quarantine_does_not_panic_on_real_file() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("x");
        fs::write(&f, b"x").unwrap();
        remove_quarantine(&f);
    }

    #[tokio::test]
    async fn download_to_file_creates_parent_dirs() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(b"ok"))
            .mount(&server)
            .await;

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("nested").join("sub").join("out.zip");
        let url = format!("{}/x.zip", server.uri());
        download_to_file(&url, &dest, MAX_DOWNLOAD_BYTES)
            .await
            .unwrap();
        assert_eq!(fs::read(&dest).unwrap(), b"ok");
    }

    #[test]
    fn unpack_chrome_zip_rejects_symlink_entries() {
        use zip::write::SimpleFileOptions;

        let dir = tempfile::tempdir().unwrap();
        let zip_path = dir.path().join("evil.zip");
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut w = zip::ZipWriter::new(&mut buf);
            // `add_symlink` marks the entry with the S_IFLNK mode bits on
            // read-back, which is what our unpacker must refuse.
            w.add_symlink(
                "chrome-headless-shell-linux64/link",
                "/etc/passwd",
                SimpleFileOptions::default(),
            )
            .unwrap();
            w.finish().unwrap();
        }
        std::fs::write(&zip_path, buf.into_inner()).unwrap();
        let err = unpack_chrome_zip(&zip_path, &dir.path().join("out")).unwrap_err();
        assert!(matches!(err, UnpackError::UnsafePath(_)));
    }

    #[test]
    fn unpack_chrome_zip_rejects_path_traversal() {
        use std::io::Write as _;
        use zip::write::SimpleFileOptions;
        use zip::CompressionMethod;

        let dir = tempfile::tempdir().unwrap();
        let zip_path = dir.path().join("evil.zip");
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut w = zip::ZipWriter::new(&mut buf);
            let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            w.start_file("../../../etc/escape", opts).unwrap();
            w.write_all(b"evil").unwrap();
            w.finish().unwrap();
        }
        fs::write(&zip_path, buf.into_inner()).unwrap();
        let err = unpack_chrome_zip(&zip_path, &dir.path().join("out")).unwrap_err();
        assert!(matches!(err, UnpackError::UnsafePath(_)));
    }

    #[test]
    fn url_for_unknown_platform_errors() {
        let parsed = ChromeVersions {
            version: "1".into(),
            revision: "1".into(),
            downloads: vec![PlatformDownload {
                platform: "mac-arm64".into(),
                url: "u".into(),
            }],
        };
        let err = parsed.url_for(Platform::Linux64).unwrap_err();
        assert!(matches!(err, VersionsError::PlatformNotFound(_)));
    }
}
