use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

use walkdir::WalkDir;

use crate::typecheck::parser::{parse_tsc_line, TscParsed};
use crate::typecheck::process::detect_checker;

use super::executor::{TestError, TestFileResult, TestResult, TestStatus};

/// Directories to skip entirely during type test file discovery.
const EXCLUDE_DIRS: &[&str] = &["node_modules", "dist", ".vertz", ".git"];

/// Discover `.test-d.ts` and `.test-d.tsx` files in the project.
///
/// Uses walkdir with directory pruning so we never descend into
/// node_modules, .git, dist, etc. — making discovery fast in large repos.
pub fn discover_type_test_files(root_dir: &Path, exclude: &[String]) -> Vec<PathBuf> {
    let mut files = Vec::new();

    let walker = WalkDir::new(root_dir).follow_links(true).into_iter();
    for entry in walker.filter_entry(|e| !is_pruned_dir(e, exclude)) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_str().unwrap_or("");
        if name.ends_with(".test-d.ts") || name.ends_with(".test-d.tsx") {
            files.push(entry.into_path());
        }
    }
    files.sort();
    files.dedup();
    files
}

/// Check if a walkdir entry is a directory that should be pruned.
fn is_pruned_dir(entry: &walkdir::DirEntry, custom_exclude: &[String]) -> bool {
    if !entry.file_type().is_dir() {
        return false;
    }
    let name = entry.file_name().to_str().unwrap_or("");
    if EXCLUDE_DIRS.contains(&name) {
        return true;
    }
    for pat in custom_exclude {
        if name == pat {
            return true;
        }
    }
    false
}

#[allow(dead_code)]
fn is_excluded(path: &Path, default_dirs: &[&str], custom: &[String]) -> bool {
    let s = path.to_string_lossy();
    for dir in default_dirs {
        if s.contains(&format!("/{}/", dir)) || s.contains(&format!("\\{}\\", dir)) {
            return true;
        }
    }
    for pat in custom {
        if let Ok(g) = glob::Pattern::new(pat) {
            if g.matches_path(path) {
                return true;
            }
        }
        let component = format!("/{}/", pat);
        let component_win = format!("\\{}\\", pat);
        if s.contains(&component) || s.contains(&component_win) {
            return true;
        }
    }
    false
}

/// Run type checking on `.test-d.ts` files and return results.
///
/// Uses `tsc --noEmit --pretty false` (or tsgo if available). Parses
/// diagnostics and maps them to `TestFileResult` entries.
///
/// Each `.test-d.ts` file becomes one TestFileResult:
/// - If zero diagnostics for that file → 1 passing test ("type checks")
/// - If diagnostics exist → 1 failing test per diagnostic
pub fn run_type_tests(
    root_dir: &Path,
    files: &[PathBuf],
    tsconfig: Option<&Path>,
) -> Vec<TestFileResult> {
    if files.is_empty() {
        return vec![];
    }

    let checker = match detect_checker(root_dir, None) {
        Some(c) => c,
        None => {
            // No type checker found — report as file errors
            return files
                .iter()
                .map(|f| TestFileResult {
                    file: f.to_string_lossy().to_string(),
                    tests: vec![],
                    duration_ms: 0.0,
                    file_error: Some(
                        "No TypeScript checker found (tsc/tsgo). Install typescript.".to_string(),
                    ),
                    coverage_data: None,
                })
                .collect();
        }
    };

    let start = std::time::Instant::now();

    // Build command: tsc --noEmit --pretty false [--project tsconfig.json | files...]
    let mut cmd = Command::new(&checker.path);
    cmd.arg("--noEmit").arg("--pretty").arg("false");

    if let Some(tsconfig) = tsconfig {
        cmd.arg("--project").arg(tsconfig);
    } else {
        // Pass files directly
        for file in files {
            cmd.arg(file);
        }
    }

    cmd.current_dir(root_dir);

    let output = match cmd.output() {
        Ok(o) => o,
        Err(e) => {
            return files
                .iter()
                .map(|f| TestFileResult {
                    file: f.to_string_lossy().to_string(),
                    tests: vec![],
                    duration_ms: 0.0,
                    file_error: Some(format!("Failed to run {}: {}", checker.name, e)),
                    coverage_data: None,
                })
                .collect();
        }
    };

    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse tsc output into diagnostics grouped by file
    let diagnostics_by_file = parse_type_check_output(&stdout, root_dir);

    // Convert to TestFileResult per file
    let mut results: Vec<TestFileResult> = Vec::new();

    for file in files {
        let normalized = normalize_path(file, root_dir);
        let file_str = file.to_string_lossy().to_string();
        let per_file_duration = duration_ms / files.len() as f64;

        if let Some(diags) = diagnostics_by_file.get(&normalized) {
            // Has diagnostics → failing tests
            let tests: Vec<TestResult> = diags
                .iter()
                .map(|d| TestResult {
                    name: format!("TS{}: {}", d.code, truncate(&d.message, 80)),
                    path: "type-check".to_string(),
                    status: TestStatus::Fail,
                    duration_ms: 0.0,
                    error: Some(TestError {
                        message: format!("TS{}: {}", d.code, d.message),
                        stack: format!("{}({}:{})", d.file, d.line, d.col),
                    }),
                })
                .collect();
            results.push(TestFileResult {
                file: file_str,
                tests,
                duration_ms: per_file_duration,
                file_error: None,
                coverage_data: None,
            });
        } else {
            // No diagnostics → passing
            results.push(TestFileResult {
                file: file_str,
                tests: vec![TestResult {
                    name: "type checks".to_string(),
                    path: "type-check".to_string(),
                    status: TestStatus::Pass,
                    duration_ms: per_file_duration,
                    error: None,
                }],
                duration_ms: per_file_duration,
                file_error: None,
                coverage_data: None,
            });
        }
    }

    // Also include diagnostics from non-test-d files if using tsconfig
    // (tsconfig includes all project files, but we only report test-d files)
    // This is handled by filtering above.

    results
}

/// Diagnostic info extracted from tsc output.
#[derive(Debug, Clone)]
struct TypeDiagnostic {
    file: String,
    line: u32,
    col: u32,
    code: u32,
    message: String,
}

/// Parse tsc --pretty false output into diagnostics grouped by file.
fn parse_type_check_output(stdout: &str, root_dir: &Path) -> HashMap<String, Vec<TypeDiagnostic>> {
    let mut by_file: HashMap<String, Vec<TypeDiagnostic>> = HashMap::new();
    let mut last_file_key: Option<String> = None;

    for line in stdout.lines() {
        match parse_tsc_line(line) {
            TscParsed::Diagnostic(d) => {
                let normalized = normalize_tsc_path(&d.file, root_dir);
                last_file_key = Some(normalized.clone());
                by_file
                    .entry(normalized.clone())
                    .or_default()
                    .push(TypeDiagnostic {
                        file: d.file,
                        line: d.line,
                        col: d.col,
                        code: d.code,
                        message: d.message,
                    });
            }
            TscParsed::Continuation(text) => {
                // Append to the last diagnostic of the most recently seen file
                if let Some(ref key) = last_file_key {
                    if let Some(diags) = by_file.get_mut(key) {
                        if let Some(last) = diags.last_mut() {
                            last.message.push('\n');
                            last.message.push_str(&text);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    by_file
}

/// Normalize a file path relative to root_dir for consistent matching.
fn normalize_path(path: &Path, root_dir: &Path) -> String {
    path.strip_prefix(root_dir)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
}

/// Normalize a tsc-reported path for matching against our file list.
fn normalize_tsc_path(tsc_path: &str, root_dir: &Path) -> String {
    let p = Path::new(tsc_path);
    if p.is_absolute() {
        p.strip_prefix(root_dir)
            .unwrap_or(p)
            .to_string_lossy()
            .to_string()
    } else {
        tsc_path.to_string()
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let end = s.char_indices().nth(max).map(|(i, _)| i).unwrap_or(s.len());
        format!("{}...", &s[..end])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discover_type_test_files() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("types.test-d.ts"), "// type test").unwrap();
        std::fs::write(src.join("math.test.ts"), "// runtime test").unwrap();
        std::fs::write(src.join("component.test-d.tsx"), "// tsx type test").unwrap();

        let files = discover_type_test_files(tmp.path(), &[]);

        assert_eq!(files.len(), 2);
        let names: Vec<&str> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();
        assert!(names.contains(&"types.test-d.ts"));
        assert!(names.contains(&"component.test-d.tsx"));
    }

    #[test]
    fn test_discover_excludes_node_modules() {
        let tmp = tempfile::tempdir().unwrap();
        let nm = tmp.path().join("node_modules").join("pkg");
        std::fs::create_dir_all(&nm).unwrap();
        std::fs::write(nm.join("internal.test-d.ts"), "// excluded").unwrap();

        let files = discover_type_test_files(tmp.path(), &[]);
        assert!(files.is_empty());
    }

    #[test]
    fn test_discover_type_test_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let files = discover_type_test_files(tmp.path(), &[]);
        assert!(files.is_empty());
    }

    #[test]
    fn test_parse_type_check_output_single_error() {
        let stdout =
            "src/types.test-d.ts(5,1): error TS2578: Unused '@ts-expect-error' directive.\n";
        let root = Path::new("/project");
        let result = parse_type_check_output(stdout, root);

        assert_eq!(result.len(), 1);
        let diags = result.get("src/types.test-d.ts").unwrap();
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, 2578);
        assert_eq!(diags[0].line, 5);
    }

    #[test]
    fn test_parse_type_check_output_multiple_files() {
        let stdout = "\
src/a.test-d.ts(3,1): error TS2322: Type 'string' is not assignable to type 'number'.
src/b.test-d.ts(7,5): error TS2578: Unused '@ts-expect-error' directive.
";
        let root = Path::new("/project");
        let result = parse_type_check_output(stdout, root);

        assert_eq!(result.len(), 2);
        assert!(result.contains_key("src/a.test-d.ts"));
        assert!(result.contains_key("src/b.test-d.ts"));
    }

    #[test]
    fn test_parse_type_check_output_no_errors() {
        let stdout = "";
        let root = Path::new("/project");
        let result = parse_type_check_output(stdout, root);
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_type_check_output_with_continuation() {
        let stdout = "\
src/types.test-d.ts(10,1): error TS2345: Argument of type '{ name: string; }' is not assignable.
  Property 'id' is missing in type '{ name: string; }'.
";
        let root = Path::new("/project");
        let result = parse_type_check_output(stdout, root);

        let diags = result.get("src/types.test-d.ts").unwrap();
        assert_eq!(diags.len(), 1);
        assert!(diags[0].message.contains("Property 'id' is missing"));
    }

    #[test]
    fn test_normalize_path_relative() {
        let root = Path::new("/project");
        let path = Path::new("/project/src/types.test-d.ts");
        assert_eq!(normalize_path(path, root), "src/types.test-d.ts");
    }

    #[test]
    fn test_normalize_path_already_relative() {
        let root = Path::new("/project");
        let path = Path::new("src/types.test-d.ts");
        assert_eq!(normalize_path(path, root), "src/types.test-d.ts");
    }

    #[test]
    fn test_normalize_tsc_path_absolute() {
        let root = Path::new("/project");
        assert_eq!(
            normalize_tsc_path("/project/src/types.test-d.ts", root),
            "src/types.test-d.ts"
        );
    }

    #[test]
    fn test_normalize_tsc_path_relative() {
        let root = Path::new("/project");
        assert_eq!(
            normalize_tsc_path("src/types.test-d.ts", root),
            "src/types.test-d.ts"
        );
    }

    #[test]
    fn test_truncate_short() {
        assert_eq!(truncate("hello", 10), "hello");
    }

    #[test]
    fn test_truncate_long() {
        let s = "a".repeat(100);
        let result = truncate(&s, 10);
        assert_eq!(result.len(), 13); // 10 + "..."
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_truncate_multibyte_utf8() {
        // Each emoji is 4 bytes. "🔥🔥🔥" = 12 bytes, 3 chars.
        let s = "🔥🔥🔥abc";
        let result = truncate(s, 4);
        // Should truncate at 4 chars (3 emoji + 'a'), not panic on byte boundary
        assert_eq!(result, "🔥🔥🔥a...");
    }

    #[test]
    fn test_continuation_only_appends_to_last_file() {
        let stdout = "\
src/a.test-d.ts(1,1): error TS2322: Type error in a.
src/b.test-d.ts(5,1): error TS2345: Type error in b.
  Extra detail for b only.
";
        let root = Path::new("/project");
        let result = parse_type_check_output(stdout, root);

        // Continuation should only append to b (the last file), not a
        let a_diags = result.get("src/a.test-d.ts").unwrap();
        assert_eq!(a_diags.len(), 1);
        assert!(!a_diags[0].message.contains("Extra detail"));

        let b_diags = result.get("src/b.test-d.ts").unwrap();
        assert_eq!(b_diags.len(), 1);
        assert!(b_diags[0].message.contains("Extra detail for b only"));
    }

    #[test]
    fn test_is_excluded_node_modules() {
        assert!(is_excluded(
            Path::new("/project/node_modules/pkg/test.test-d.ts"),
            &["node_modules"],
            &[]
        ));
    }

    #[test]
    fn test_is_excluded_custom() {
        assert!(is_excluded(
            Path::new("/project/vendor/test.test-d.ts"),
            &[],
            &["vendor".to_string()]
        ));
    }

    #[test]
    fn test_is_not_excluded() {
        assert!(!is_excluded(
            Path::new("/project/src/types.test-d.ts"),
            &["node_modules"],
            &[]
        ));
    }
}
