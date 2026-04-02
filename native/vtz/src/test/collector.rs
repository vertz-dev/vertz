use std::path::{Path, PathBuf};

use walkdir::WalkDir;

/// Default test file patterns.
const DEFAULT_INCLUDE: &[&str] = &["**/*.test.ts", "**/*.test.tsx"];
/// Default e2e test file patterns.
const DEFAULT_E2E_INCLUDE: &[&str] = &["**/*.e2e.ts", "**/*.e2e.tsx"];
const DEFAULT_EXCLUDE_DIRS: &[&str] = &["node_modules", "dist", ".vertz", ".git"];

/// Controls which file patterns the test collector uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DiscoveryMode {
    /// Standard unit/integration tests: `*.test.{ts,tsx}`
    #[default]
    Unit,
    /// E2E tests: `*.e2e.{ts,tsx}`
    E2e,
}

/// Discover test files matching the given patterns.
///
/// If `paths` is non-empty, each entry is treated as either:
/// - A file: included directly if it matches the include patterns
/// - A directory: searched recursively with the include patterns
///
/// If `paths` is empty, searches `root_dir` recursively.
pub fn discover_test_files(
    root_dir: &Path,
    paths: &[PathBuf],
    include: &[String],
    exclude: &[String],
    mode: DiscoveryMode,
) -> Vec<PathBuf> {
    let default_patterns = match mode {
        DiscoveryMode::Unit => DEFAULT_INCLUDE,
        DiscoveryMode::E2e => DEFAULT_E2E_INCLUDE,
    };
    let include_patterns: Vec<&str> = if include.is_empty() {
        default_patterns.to_vec()
    } else {
        include.iter().map(|s| s.as_str()).collect()
    };

    let search_dirs: Vec<&Path> = if paths.is_empty() {
        vec![root_dir]
    } else {
        // For file paths, we'll handle them separately
        vec![]
    };

    let mut files = Vec::new();

    if !paths.is_empty() {
        for path in paths {
            let abs_path = if path.is_absolute() {
                path.clone()
            } else {
                root_dir.join(path)
            };

            if abs_path.is_file() {
                // Direct file path — include if it matches patterns
                if matches_any_pattern(&abs_path, &include_patterns) {
                    files.push(abs_path);
                }
            } else if abs_path.is_dir() {
                // Directory — search recursively
                collect_from_dir(&abs_path, &include_patterns, exclude, &mut files);
            }
        }
    } else {
        for dir in search_dirs {
            collect_from_dir(dir, &include_patterns, exclude, &mut files);
        }
    }

    // Sort by path for deterministic ordering
    files.sort();
    // Deduplicate (in case overlapping patterns match the same file)
    files.dedup();
    files
}

/// Collect test files from a directory using walkdir with directory pruning.
///
/// Unlike `glob::glob("**/*.test.ts")`, walkdir prunes excluded directories
/// (node_modules, .git, dist) at entry time — never descending into them.
/// This makes discovery fast even in large monorepos.
fn collect_from_dir(
    dir: &Path,
    include_patterns: &[&str],
    exclude: &[String],
    files: &mut Vec<PathBuf>,
) {
    // Build glob patterns for file matching
    let file_patterns: Vec<glob::Pattern> = include_patterns
        .iter()
        .filter_map(|p| {
            let file_part = p.rsplit('/').next().unwrap_or(p);
            glob::Pattern::new(file_part).ok()
        })
        .collect();

    let walker = WalkDir::new(dir).follow_links(true).into_iter();
    for entry in walker.filter_entry(|e| !is_pruned_dir(e, exclude)) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.into_path();
        let filename = path.file_name().and_then(|f| f.to_str()).unwrap_or("");
        if file_patterns.iter().any(|p| p.matches(filename)) {
            files.push(path);
        }
    }
}

/// Check if a walkdir entry is a directory that should be pruned (skipped entirely).
fn is_pruned_dir(entry: &walkdir::DirEntry, custom_exclude: &[String]) -> bool {
    if !entry.file_type().is_dir() {
        return false;
    }
    let name = entry.file_name().to_str().unwrap_or("");
    if DEFAULT_EXCLUDE_DIRS.contains(&name) {
        return true;
    }
    for pat in custom_exclude {
        if name == pat {
            return true;
        }
    }
    false
}

/// Check if a file path matches any of the include patterns.
fn matches_any_pattern(path: &Path, patterns: &[&str]) -> bool {
    let filename = path.file_name().and_then(|f| f.to_str()).unwrap_or("");
    for pattern in patterns {
        // Extract just the file-level pattern (e.g., "*.test.ts" from "**/*.test.ts")
        let file_pattern = pattern.rsplit('/').next().unwrap_or(pattern);
        if glob::Pattern::new(file_pattern)
            .map(|p| p.matches(filename))
            .unwrap_or(false)
        {
            return true;
        }
    }
    false
}

/// Check if a path should be excluded (used for direct file path filtering).
#[allow(dead_code)]
fn is_excluded(path: &Path, custom_exclude: &[String]) -> bool {
    let path_str = path.to_string_lossy();

    // Check default exclude dirs
    for dir in DEFAULT_EXCLUDE_DIRS {
        if path_str.contains(&format!("/{}/", dir)) || path_str.contains(&format!("\\{}\\", dir)) {
            return true;
        }
    }

    // Check custom exclude patterns
    for pattern in custom_exclude {
        if let Ok(glob_pattern) = glob::Pattern::new(pattern) {
            if glob_pattern.matches_path(path) {
                return true;
            }
        }
        // Check as a directory component (path-component match, not substring)
        let as_component = format!("/{}/", pattern);
        let as_component_win = format!("\\{}\\", pattern);
        if path_str.contains(&as_component) || path_str.contains(&as_component_win) {
            return true;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn create_test_project(dir: &Path) {
        // Create directory structure
        fs::create_dir_all(dir.join("src/__tests__")).unwrap();
        fs::create_dir_all(dir.join("src/entities")).unwrap();
        fs::create_dir_all(dir.join("src/components")).unwrap();
        fs::create_dir_all(dir.join("node_modules/pkg")).unwrap();
        fs::create_dir_all(dir.join("dist")).unwrap();

        // Create test files
        fs::write(dir.join("src/__tests__/math.test.ts"), "// test").unwrap();
        fs::write(dir.join("src/__tests__/string.test.ts"), "// test").unwrap();
        fs::write(dir.join("src/entities/task.test.ts"), "// test").unwrap();
        fs::write(dir.join("src/components/card.test.tsx"), "// test").unwrap();
        fs::write(dir.join("src/entities/task.ts"), "// source").unwrap();

        // Files that should NOT be collected
        fs::write(dir.join("node_modules/pkg/index.test.ts"), "// excluded").unwrap();
        fs::write(dir.join("dist/bundle.test.ts"), "// excluded").unwrap();
    }

    #[test]
    fn test_discover_all_test_files_in_project() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());

        let files = discover_test_files(tmp.path(), &[], &[], &[], DiscoveryMode::Unit);

        assert_eq!(files.len(), 4);
        // Should be sorted
        let names: Vec<&str> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();
        assert!(names.contains(&"math.test.ts"));
        assert!(names.contains(&"string.test.ts"));
        assert!(names.contains(&"task.test.ts"));
        assert!(names.contains(&"card.test.tsx"));
    }

    #[test]
    fn test_excludes_node_modules_and_dist() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());

        let files = discover_test_files(tmp.path(), &[], &[], &[], DiscoveryMode::Unit);

        let paths_str: Vec<String> = files
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        for p in &paths_str {
            assert!(
                !p.contains("node_modules"),
                "Should exclude node_modules: {}",
                p
            );
            assert!(!p.contains("/dist/"), "Should exclude dist: {}", p);
        }
    }

    #[test]
    fn test_discover_with_specific_directory_path() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());

        let files = discover_test_files(
            tmp.path(),
            &[PathBuf::from("src/entities")],
            &[],
            &[],
            DiscoveryMode::Unit,
        );

        assert_eq!(files.len(), 1);
        assert!(files[0].file_name().unwrap().to_str().unwrap() == "task.test.ts");
    }

    #[test]
    fn test_discover_with_specific_file_path() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());

        let files = discover_test_files(
            tmp.path(),
            &[PathBuf::from("src/__tests__/math.test.ts")],
            &[],
            &[],
            DiscoveryMode::Unit,
        );

        assert_eq!(files.len(), 1);
        assert!(files[0].file_name().unwrap().to_str().unwrap() == "math.test.ts");
    }

    #[test]
    fn test_discover_with_custom_include_pattern() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());

        let files = discover_test_files(
            tmp.path(),
            &[],
            &["**/*.test.tsx".to_string()],
            &[],
            DiscoveryMode::Unit,
        );

        assert_eq!(files.len(), 1);
        assert!(files[0].file_name().unwrap().to_str().unwrap() == "card.test.tsx");
    }

    #[test]
    fn test_discover_with_custom_exclude() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());

        let files = discover_test_files(
            tmp.path(),
            &[],
            &[],
            &["__tests__".to_string()],
            DiscoveryMode::Unit,
        );

        // Should exclude files in __tests__ directory
        let names: Vec<&str> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();
        assert!(!names.contains(&"math.test.ts"));
        assert!(!names.contains(&"string.test.ts"));
        assert!(names.contains(&"task.test.ts"));
        assert!(names.contains(&"card.test.tsx"));
    }

    #[test]
    fn test_discover_returns_sorted_results() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());

        let files = discover_test_files(tmp.path(), &[], &[], &[], DiscoveryMode::Unit);

        // Files should be sorted by full path
        let is_sorted = files.windows(2).all(|w| w[0] <= w[1]);
        assert!(is_sorted, "Files should be sorted");
    }

    #[test]
    fn test_discover_empty_directory() {
        let tmp = tempfile::tempdir().unwrap();

        let files = discover_test_files(tmp.path(), &[], &[], &[], DiscoveryMode::Unit);

        assert!(files.is_empty());
    }

    #[test]
    fn test_nonexistent_specific_file_ignored() {
        let tmp = tempfile::tempdir().unwrap();

        let files = discover_test_files(
            tmp.path(),
            &[PathBuf::from("nonexistent.test.ts")],
            &[],
            &[],
            DiscoveryMode::Unit,
        );

        assert!(files.is_empty());
    }

    #[test]
    fn test_non_test_file_excluded_when_specified_directly() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("source.ts"), "// source").unwrap();

        let files = discover_test_files(
            tmp.path(),
            &[PathBuf::from("source.ts")],
            &[],
            &[],
            DiscoveryMode::Unit,
        );

        assert!(
            files.is_empty(),
            "Non-test files should not match include patterns"
        );
    }

    fn create_e2e_test_project(dir: &Path) {
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::create_dir_all(dir.join("tests")).unwrap();
        fs::create_dir_all(dir.join("node_modules/pkg")).unwrap();

        // E2E test files
        fs::write(dir.join("src/login.e2e.ts"), "// e2e").unwrap();
        fs::write(dir.join("src/signup.e2e.tsx"), "// e2e").unwrap();
        fs::write(dir.join("tests/checkout.e2e.ts"), "// e2e").unwrap();

        // Regular test files (should be ignored in e2e mode)
        fs::write(dir.join("src/math.test.ts"), "// unit test").unwrap();
        fs::write(dir.join("src/card.test.tsx"), "// unit test").unwrap();

        // Non-test files
        fs::write(dir.join("src/app.ts"), "// source").unwrap();

        // Excluded directory
        fs::write(dir.join("node_modules/pkg/index.e2e.ts"), "// excluded").unwrap();
    }

    #[test]
    fn test_e2e_mode_discovers_e2e_files() {
        let tmp = tempfile::tempdir().unwrap();
        create_e2e_test_project(tmp.path());

        let files = discover_test_files(tmp.path(), &[], &[], &[], DiscoveryMode::E2e);

        assert_eq!(files.len(), 3);
        let names: Vec<&str> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();
        assert!(names.contains(&"login.e2e.ts"));
        assert!(names.contains(&"signup.e2e.tsx"));
        assert!(names.contains(&"checkout.e2e.ts"));
    }

    #[test]
    fn test_e2e_mode_ignores_unit_test_files() {
        let tmp = tempfile::tempdir().unwrap();
        create_e2e_test_project(tmp.path());

        let files = discover_test_files(tmp.path(), &[], &[], &[], DiscoveryMode::E2e);

        let names: Vec<&str> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();
        assert!(!names.contains(&"math.test.ts"));
        assert!(!names.contains(&"card.test.tsx"));
    }

    #[test]
    fn test_unit_mode_ignores_e2e_files() {
        let tmp = tempfile::tempdir().unwrap();
        create_e2e_test_project(tmp.path());

        let files = discover_test_files(tmp.path(), &[], &[], &[], DiscoveryMode::Unit);

        let names: Vec<&str> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();
        assert!(!names.contains(&"login.e2e.ts"));
        assert!(!names.contains(&"signup.e2e.tsx"));
        assert!(names.contains(&"math.test.ts"));
        assert!(names.contains(&"card.test.tsx"));
    }

    #[test]
    fn test_e2e_mode_excludes_node_modules() {
        let tmp = tempfile::tempdir().unwrap();
        create_e2e_test_project(tmp.path());

        let files = discover_test_files(tmp.path(), &[], &[], &[], DiscoveryMode::E2e);

        for f in &files {
            assert!(
                !f.to_string_lossy().contains("node_modules"),
                "Should exclude node_modules: {:?}",
                f
            );
        }
    }

    #[test]
    fn test_e2e_mode_respects_custom_exclude() {
        let tmp = tempfile::tempdir().unwrap();
        create_e2e_test_project(tmp.path());

        let files = discover_test_files(
            tmp.path(),
            &[],
            &[],
            &["tests".to_string()],
            DiscoveryMode::E2e,
        );

        let names: Vec<&str> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();
        assert!(!names.contains(&"checkout.e2e.ts"));
        assert!(names.contains(&"login.e2e.ts"));
    }
}
