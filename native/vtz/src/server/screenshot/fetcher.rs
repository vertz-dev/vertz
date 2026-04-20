//! Chrome binary resolution.
//!
//! Responsibilities (per `plans/2865-phase-1-headless-screenshot.md` Task 3):
//! - `$VERTZ_CHROME_PATH` env override
//! - System Chrome detection on macOS + Linux
//! - (Follow-up PR) Chrome for Testing download + SHA verify
//! - (Follow-up PR) Cache manifest at `~/.vertz/chromium/current.json`
//!   with `$XDG_CACHE_HOME` → `$TMPDIR` fallback
//! - (Follow-up PR) macOS quarantine removal
//!
//! This PR (3a) ships only the local-probe path so Task 4 (pool) can
//! start depending on the resolver. The download path is 3b.

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
}
