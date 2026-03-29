use crate::test::executor::{TestFileResult, TestStatus};

/// Format test results for terminal output.
pub fn format_results(results: &[TestFileResult]) -> String {
    let mut output = String::new();

    for file_result in results {
        // File header
        let short_path = shorten_path(&file_result.file);
        output.push_str(&format!("\n {} ", short_path));

        if let Some(ref err) = file_result.file_error {
            output.push_str("FAIL (load error)\n");
            output.push_str(&format!("  Error: {}\n", first_line(err)));
            continue;
        }

        // Summary badge for the file
        if file_result.failed() > 0 {
            output.push_str("FAIL\n");
        } else {
            output.push_str("PASS\n");
        }

        // Individual test results
        for test in &file_result.tests {
            let icon = match test.status {
                TestStatus::Pass => "✓",
                TestStatus::Fail => "✗",
                TestStatus::Skip => "○",
                TestStatus::Todo => "⊘",
            };

            let full_name = if test.path.is_empty() {
                test.name.clone()
            } else {
                format!("{} > {}", test.path, test.name)
            };

            match test.status {
                TestStatus::Pass => {
                    output.push_str(&format!(
                        "  {} {} ({:.0}ms)\n",
                        icon, full_name, test.duration_ms
                    ));
                }
                TestStatus::Fail => {
                    output.push_str(&format!("  {} {}\n", icon, full_name));
                    if let Some(ref error) = test.error {
                        output.push_str(&format!("    {}\n", error.message));
                    }
                }
                TestStatus::Skip => {
                    output.push_str(&format!("  {} {} (skipped)\n", icon, full_name));
                }
                TestStatus::Todo => {
                    output.push_str(&format!("  {} {} (todo)\n", icon, full_name));
                }
            }
        }
    }

    // Summary
    let total_passed: usize = results.iter().map(|r| r.passed()).sum();
    let total_failed: usize = results.iter().map(|r| r.failed()).sum();
    let total_skipped: usize = results.iter().map(|r| r.skipped()).sum();
    let total_todo: usize = results.iter().map(|r| r.todo()).sum();
    let total_files = results.len();
    let total_duration_ms: f64 = results.iter().map(|r| r.duration_ms).sum();
    let file_errors: usize = results.iter().filter(|r| r.file_error.is_some()).count();

    output.push('\n');
    output.push_str(&format!("Files:  {}", total_files));
    if file_errors > 0 {
        output.push_str(&format!(" ({} failed to load)", file_errors));
    }
    output.push('\n');

    let mut parts = Vec::new();
    if total_passed > 0 {
        parts.push(format!("{} passed", total_passed));
    }
    if total_failed > 0 {
        parts.push(format!("{} failed", total_failed));
    }
    if total_skipped > 0 {
        parts.push(format!("{} skipped", total_skipped));
    }
    if total_todo > 0 {
        parts.push(format!("{} todo", total_todo));
    }
    let total_tests = total_passed + total_failed + total_skipped + total_todo;
    output.push_str(&format!("Tests:  {} ({})\n", parts.join(", "), total_tests));
    output.push_str(&format!("Time:   {:.0}ms\n", total_duration_ms));

    output
}

/// Shorten a file path for display. If it contains common prefixes, strip them.
fn shorten_path(path: &str) -> &str {
    // Try to find the project-relative part (after src/, packages/, etc.)
    if let Some(idx) = path.rfind("/src/") {
        // Find the package name before src/
        let before_src = &path[..idx];
        if let Some(pkg_idx) = before_src.rfind('/') {
            return &path[pkg_idx + 1..];
        }
    }
    // Fallback: just the filename
    path.rsplit('/').next().unwrap_or(path)
}

fn first_line(s: &str) -> &str {
    s.lines().next().unwrap_or(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test::executor::{TestError, TestResult};

    fn make_pass(name: &str, path: &str, ms: f64) -> TestResult {
        TestResult {
            name: name.to_string(),
            path: path.to_string(),
            status: TestStatus::Pass,
            duration_ms: ms,
            error: None,
        }
    }

    fn make_fail(name: &str, path: &str, msg: &str) -> TestResult {
        TestResult {
            name: name.to_string(),
            path: path.to_string(),
            status: TestStatus::Fail,
            duration_ms: 0.0,
            error: Some(TestError {
                message: msg.to_string(),
                stack: String::new(),
            }),
        }
    }

    fn make_skip(name: &str, path: &str) -> TestResult {
        TestResult {
            name: name.to_string(),
            path: path.to_string(),
            status: TestStatus::Skip,
            duration_ms: 0.0,
            error: None,
        }
    }

    fn make_todo(name: &str, path: &str) -> TestResult {
        TestResult {
            name: name.to_string(),
            path: path.to_string(),
            status: TestStatus::Todo,
            duration_ms: 0.0,
            error: None,
        }
    }

    #[test]
    fn test_format_passing_file() {
        let results = vec![TestFileResult {
            file: "/project/src/__tests__/math.test.ts".to_string(),
            tests: vec![
                make_pass("adds", "math", 1.5),
                make_pass("subtracts", "math", 0.8),
            ],
            duration_ms: 5.0,
            file_error: None,
            coverage_data: None,
        }];

        let output = format_results(&results);

        assert!(output.contains("PASS"));
        assert!(output.contains("adds"));
        assert!(output.contains("subtracts"));
        assert!(output.contains("2 passed"));
        assert!(output.contains("Files:  1"));
    }

    #[test]
    fn test_format_failing_file() {
        let results = vec![TestFileResult {
            file: "/project/src/__tests__/fail.test.ts".to_string(),
            tests: vec![
                make_pass("works", "suite", 1.0),
                make_fail("broken", "suite", "Expected 1 to be 2"),
            ],
            duration_ms: 3.0,
            file_error: None,
            coverage_data: None,
        }];

        let output = format_results(&results);

        assert!(output.contains("FAIL"));
        assert!(output.contains("1 passed"));
        assert!(output.contains("1 failed"));
        assert!(output.contains("Expected 1 to be 2"));
    }

    #[test]
    fn test_format_with_skips_and_todos() {
        let results = vec![TestFileResult {
            file: "/project/src/test.test.ts".to_string(),
            tests: vec![
                make_pass("works", "suite", 1.0),
                make_skip("skipped", "suite"),
                make_todo("later", "suite"),
            ],
            duration_ms: 2.0,
            file_error: None,
            coverage_data: None,
        }];

        let output = format_results(&results);

        assert!(output.contains("1 passed"));
        assert!(output.contains("1 skipped"));
        assert!(output.contains("1 todo"));
        assert!(output.contains("(3)"));
    }

    #[test]
    fn test_format_file_load_error() {
        let results = vec![TestFileResult {
            file: "/project/src/bad.test.ts".to_string(),
            tests: vec![],
            duration_ms: 1.0,
            file_error: Some("Cannot resolve module './missing'".to_string()),
            coverage_data: None,
        }];

        let output = format_results(&results);

        assert!(output.contains("FAIL (load error)"));
        assert!(output.contains("Cannot resolve module"));
        assert!(output.contains("1 failed to load"));
    }

    #[test]
    fn test_format_multiple_files() {
        let results = vec![
            TestFileResult {
                file: "/project/src/a.test.ts".to_string(),
                tests: vec![make_pass("test a", "a", 1.0)],
                duration_ms: 2.0,
                file_error: None,
                coverage_data: None,
            },
            TestFileResult {
                file: "/project/src/b.test.ts".to_string(),
                tests: vec![make_pass("test b", "b", 1.0)],
                duration_ms: 2.0,
                file_error: None,
                coverage_data: None,
            },
        ];

        let output = format_results(&results);

        assert!(output.contains("Files:  2"));
        assert!(output.contains("2 passed"));
        assert!(output.contains("(2)"));
    }

    #[test]
    fn test_shorten_path() {
        assert_eq!(
            shorten_path("/home/user/project/packages/core/src/__tests__/math.test.ts"),
            "core/src/__tests__/math.test.ts"
        );
        assert_eq!(shorten_path("math.test.ts"), "math.test.ts");
    }
}
