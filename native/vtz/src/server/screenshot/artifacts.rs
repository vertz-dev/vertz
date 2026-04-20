//! Artifact persistence for screenshots.
//!
//! Responsibilities:
//! - Generate filenames in the form `<UTC-iso>-<slug>-<viewport>.png`
//! - Slugify URL paths (collapse `..`, `/`, NUL, non-ASCII → `-`)
//! - Atomic write (temp-file + rename)
//! - Resolve concurrent same-filename conflicts with a millisecond suffix

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

/// Viewport label appended to artifact filenames.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewportLabel {
    /// A fixed viewport, e.g. 1280x720.
    Sized { width: u32, height: u32 },
    /// Full-page capture (captureBeyondViewport).
    Full,
}

impl std::fmt::Display for ViewportLabel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ViewportLabel::Sized { width, height } => write!(f, "{width}x{height}"),
            ViewportLabel::Full => f.write_str("full"),
        }
    }
}

/// Build a lexicographically-sortable artifact filename.
///
/// Format: `<UTC-iso>-<slug>-<viewport>.png` (with `<slug>-` omitted when empty).
/// Example: `2026-04-19T14-23-05Z-tasks-123-1280x720.png`.
///
/// `slug` is assumed already sanitized (use [`slugify_url_path`]).
pub fn build_filename(ts: SystemTime, slug: &str, viewport: ViewportLabel) -> String {
    let iso = format_iso_compact(ts);
    if slug.is_empty() {
        format!("{iso}-{viewport}.png")
    } else {
        format!("{iso}-{slug}-{viewport}.png")
    }
}

/// Format a `SystemTime` as compact ISO 8601 UTC with `-` between H:M:S
/// (filename-safe; `:` is disallowed on some filesystems).
/// Example: `2026-04-19T14-23-05Z`.
fn format_iso_compact(ts: SystemTime) -> String {
    // humantime::format_rfc3339_seconds → "2026-04-19T14:23:05Z"
    let rfc = humantime::format_rfc3339_seconds(ts).to_string();
    rfc.replace(':', "-")
}

/// Monotonic counter to disambiguate in-process filename collisions
/// without relying on the system clock's sub-second resolution.
static COLLISION_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Write `bytes` to `dir/filename` atomically. Creates `dir` if missing.
///
/// If `filename` already exists on disk (or another process wins the race
/// during `persist_noclobber`), append a zero-padded monotonic counter
/// before the extension and retry. The returned path is the final location.
///
/// The suffix is chosen to sort AFTER the original filename so oldest
/// artifacts come first in a directory listing — `.` (0x2E) < `_` (0x5F)
/// in ASCII, so `a.png` < `a_000001.png`.
pub fn write_artifact(dir: &Path, filename: &str, bytes: &[u8]) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;

    // Write to a temp file in the same directory, then atomically rename.
    let mut tmp = tempfile::NamedTempFile::new_in(dir)?;
    tmp.write_all(bytes)?;
    tmp.flush()?;

    let primary = dir.join(filename);
    let mut candidate = primary.clone();
    let mut working = tmp;

    loop {
        match working.persist_noclobber(&candidate) {
            Ok(_) => return Ok(candidate),
            Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => {
                // Collision — recover the tempfile and try a new name.
                working = e.file;
                candidate = disambiguated_path(&primary);
            }
            Err(e) => return Err(e.error),
        }
    }
}

/// Build a unique sibling path by inserting a zero-padded counter before
/// the extension, preserving lexicographic order with the original name.
fn disambiguated_path(primary: &Path) -> PathBuf {
    let stem = primary
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("artifact");
    let ext = primary
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png");
    let parent = primary.parent().unwrap_or_else(|| Path::new("."));
    let seq = COLLISION_COUNTER.fetch_add(1, Ordering::Relaxed);
    parent.join(format!("{stem}_{seq:06}.{ext}"))
}

/// Convert a URL path into a lexicographically-safe filename slug.
///
/// Rules (applied in order):
/// 1. Strip query string and fragment (`?…`, `#…`).
/// 2. Split by `/`.
/// 3. Drop empty segments and dot-segments (`.`, `..`).
/// 4. In each remaining segment, keep only ASCII alphanumeric, `-`, `_`;
///    drop everything else (NUL, non-ASCII, whitespace, punctuation).
/// 5. Drop segments that became empty after cleaning.
/// 6. Join remaining segments with `-`.
///
/// Root path `/` returns `""`.
pub fn slugify_url_path(path: &str) -> String {
    // 1. Strip query/fragment.
    let path = path.split(['?', '#']).next().unwrap_or("");

    // 2-5. Tokenize + filter + clean.
    let parts: Vec<String> = path
        .split('/')
        .filter(|s| !s.is_empty() && *s != "." && *s != "..")
        .map(|segment| {
            segment
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
                .collect::<String>()
        })
        .filter(|s| !s.is_empty())
        .collect();

    // 6. Join.
    parts.join("-")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_from_root_path_is_empty() {
        assert_eq!(slugify_url_path("/"), "");
    }

    #[test]
    fn slug_from_single_segment() {
        assert_eq!(slugify_url_path("/tasks"), "tasks");
    }

    #[test]
    fn slug_from_nested_path_uses_dashes() {
        assert_eq!(slugify_url_path("/tasks/123/edit"), "tasks-123-edit");
    }

    #[test]
    fn slug_collapses_parent_traversal() {
        assert_eq!(slugify_url_path("/../escape"), "escape");
        assert_eq!(slugify_url_path("/tasks/../evil"), "tasks-evil");
    }

    #[test]
    fn slug_rejects_nul_bytes() {
        // NUL bytes collapse to '-', never leak into the filename.
        assert_eq!(slugify_url_path("/tasks\0/evil"), "tasks-evil");
    }

    #[test]
    fn slug_collapses_non_ascii() {
        assert_eq!(slugify_url_path("/café"), "caf");
        assert_eq!(slugify_url_path("/日本"), "");
    }

    #[test]
    fn slug_strips_query_and_fragment() {
        assert_eq!(slugify_url_path("/tasks?x=1"), "tasks");
        assert_eq!(slugify_url_path("/tasks#foo"), "tasks");
    }

    #[test]
    fn slug_collapses_multiple_dashes() {
        assert_eq!(slugify_url_path("/tasks//double"), "tasks-double");
        assert_eq!(slugify_url_path("/tasks///triple"), "tasks-triple");
    }

    use std::time::{Duration, UNIX_EPOCH};

    fn ts(secs: u64) -> std::time::SystemTime {
        UNIX_EPOCH + Duration::from_secs(secs)
    }

    // 2026-04-19T14:23:05Z = 1_776_608_585 seconds since UNIX_EPOCH.
    // (20562 days * 86400 s + 14h*3600 + 23m*60 + 5s)
    const TS_2026_04_19_14_23_05: u64 = 1_776_608_585;

    #[test]
    fn filename_includes_timestamp_slug_and_viewport() {
        assert_eq!(
            build_filename(
                ts(TS_2026_04_19_14_23_05),
                "tasks-123",
                ViewportLabel::Sized {
                    width: 1280,
                    height: 720
                },
            ),
            "2026-04-19T14-23-05Z-tasks-123-1280x720.png"
        );
    }

    #[test]
    fn filename_omits_empty_slug() {
        assert_eq!(
            build_filename(
                ts(TS_2026_04_19_14_23_05),
                "",
                ViewportLabel::Sized {
                    width: 1280,
                    height: 720
                },
            ),
            "2026-04-19T14-23-05Z-1280x720.png"
        );
    }

    #[test]
    fn filename_uses_full_for_fullpage() {
        assert_eq!(
            build_filename(ts(TS_2026_04_19_14_23_05), "home", ViewportLabel::Full),
            "2026-04-19T14-23-05Z-home-full.png"
        );
    }

    #[test]
    fn filenames_sort_lexicographically_by_timestamp() {
        let a = build_filename(ts(TS_2026_04_19_14_23_05), "x", ViewportLabel::Full);
        let b = build_filename(ts(TS_2026_04_19_14_23_05 + 1), "x", ViewportLabel::Full);
        assert!(a < b, "{a} should sort before {b}");
    }

    #[test]
    fn filename_pads_zero_for_single_digit_components() {
        // Sortability depends on zero-padded month/day/hour/minute/second.
        // 2026-01-05T03:04:05Z
        let early = std::time::UNIX_EPOCH + Duration::from_secs(1_767_582_245);
        assert_eq!(
            build_filename(early, "x", ViewportLabel::Full),
            "2026-01-05T03-04-05Z-x-full.png"
        );
    }

    // --- Disk persistence ---

    #[test]
    fn write_creates_file_with_expected_contents() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_artifact(dir.path(), "test.png", b"fake-png-bytes").unwrap();
        assert!(path.exists());
        assert_eq!(std::fs::read(&path).unwrap(), b"fake-png-bytes");
    }

    #[test]
    fn write_creates_parent_directories_if_missing() {
        let root = tempfile::tempdir().unwrap();
        let nested = root.path().join("does").join("not").join("exist");
        let path = write_artifact(&nested, "foo.png", b"x").unwrap();
        assert!(path.parent().unwrap().exists());
        assert!(path.exists());
    }

    #[test]
    fn write_leaves_no_partial_tmp_files() {
        let dir = tempfile::tempdir().unwrap();
        write_artifact(dir.path(), "foo.png", b"x").unwrap();
        let entries: Vec<_> = std::fs::read_dir(dir.path()).unwrap().collect();
        assert_eq!(entries.len(), 1, "only final file, no .tmp leftovers");
    }

    #[test]
    fn write_disambiguates_filename_collisions() {
        let dir = tempfile::tempdir().unwrap();
        let p1 = write_artifact(dir.path(), "same.png", b"1").unwrap();
        let p2 = write_artifact(dir.path(), "same.png", b"2").unwrap();
        let p3 = write_artifact(dir.path(), "same.png", b"3").unwrap();

        assert_ne!(p1, p2);
        assert_ne!(p2, p3);
        assert_ne!(p1, p3);
        assert_eq!(std::fs::read(&p1).unwrap(), b"1");
        assert_eq!(std::fs::read(&p2).unwrap(), b"2");
        assert_eq!(std::fs::read(&p3).unwrap(), b"3");
    }

    #[test]
    fn disambiguated_filenames_sort_with_original() {
        // Suffix must preserve lexicographic order with the original filename.
        let dir = tempfile::tempdir().unwrap();
        let p1 = write_artifact(dir.path(), "a.png", b"1").unwrap();
        let p2 = write_artifact(dir.path(), "a.png", b"2").unwrap();
        let n1 = p1.file_name().unwrap().to_str().unwrap();
        let n2 = p2.file_name().unwrap().to_str().unwrap();
        // p2 was written second — must sort after p1.
        assert!(n1 < n2, "{n1} should sort before {n2}");
    }
}
