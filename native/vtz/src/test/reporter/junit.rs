use crate::test::executor::TestStatus;
use crate::test::runner::TestRunResult;

/// Format test results as JUnit XML.
pub fn format_junit(result: &TestRunResult) -> String {
    let total_tests: usize =
        result.total_passed + result.total_failed + result.total_skipped + result.total_todo;
    let total_time_s: f64 = result.results.iter().map(|r| r.duration_ms).sum::<f64>() / 1000.0;

    let mut xml = String::new();
    xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str(&format!(
        "<testsuites tests=\"{}\" failures=\"{}\" errors=\"{}\" time=\"{:.3}\">\n",
        total_tests, result.total_failed, result.file_errors, total_time_s
    ));

    for file_result in &result.results {
        let suite_tests = file_result.tests.len();
        let suite_failures = file_result.failed();
        let suite_errors = if file_result.file_error.is_some() {
            1
        } else {
            0
        };
        let suite_skipped = file_result.skipped() + file_result.todo();
        let suite_time = file_result.duration_ms / 1000.0;

        xml.push_str(&format!(
            "  <testsuite name=\"{}\" tests=\"{}\" failures=\"{}\" errors=\"{}\" skipped=\"{}\" time=\"{:.3}\">\n",
            escape_xml(&file_result.file),
            suite_tests,
            suite_failures,
            suite_errors,
            suite_skipped,
            suite_time
        ));

        if let Some(ref err) = file_result.file_error {
            xml.push_str(&format!(
                "    <testcase name=\"(load error)\" classname=\"{}\" time=\"0\">\n",
                escape_xml(&file_result.file)
            ));
            xml.push_str(&format!("      <error message=\"{}\"/>\n", escape_xml(err)));
            xml.push_str("    </testcase>\n");
        }

        for test in &file_result.tests {
            let classname = if test.path.is_empty() {
                file_result.file.clone()
            } else {
                format!("{} > {}", file_result.file, test.path)
            };
            let time = test.duration_ms / 1000.0;

            xml.push_str(&format!(
                "    <testcase name=\"{}\" classname=\"{}\" time=\"{:.3}\"",
                escape_xml(&test.name),
                escape_xml(&classname),
                time
            ));

            match test.status {
                TestStatus::Fail => {
                    xml.push_str(">\n");
                    if let Some(ref error) = test.error {
                        xml.push_str(&format!(
                            "      <failure message=\"{}\">{}</failure>\n",
                            escape_xml(&error.message),
                            escape_xml(&error.stack)
                        ));
                    }
                    xml.push_str("    </testcase>\n");
                }
                TestStatus::Skip | TestStatus::Todo => {
                    xml.push_str(">\n");
                    xml.push_str("      <skipped/>\n");
                    xml.push_str("    </testcase>\n");
                }
                TestStatus::Pass => {
                    xml.push_str("/>\n");
                }
            }
        }

        xml.push_str("  </testsuite>\n");
    }

    xml.push_str("</testsuites>\n");
    xml
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test::executor::{TestError, TestFileResult, TestResult, TestStatus};

    fn make_pass(name: &str, path: &str) -> TestResult {
        TestResult {
            name: name.to_string(),
            path: path.to_string(),
            status: TestStatus::Pass,
            duration_ms: 1.0,
            error: None,
        }
    }

    fn make_fail(name: &str, path: &str, msg: &str) -> TestResult {
        TestResult {
            name: name.to_string(),
            path: path.to_string(),
            status: TestStatus::Fail,
            duration_ms: 1.0,
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

    #[test]
    fn test_junit_xml_structure() {
        let run = TestRunResult {
            results: vec![TestFileResult {
                file: "math.test.ts".to_string(),
                tests: vec![make_pass("adds", "math")],
                duration_ms: 5.0,
                file_error: None,
                coverage_data: None,
            }],
            total_passed: 1,
            total_failed: 0,
            total_skipped: 0,
            total_todo: 0,
            total_files: 1,
            file_errors: 0,
            coverage_failed: false,
            coverage_report: None,
        };

        let xml = format_junit(&run);

        assert!(xml.contains("<?xml version=\"1.0\""));
        assert!(xml.contains("<testsuites"));
        assert!(xml.contains("<testsuite name=\"math.test.ts\""));
        assert!(xml.contains("<testcase name=\"adds\""));
        assert!(xml.contains("</testsuites>"));
    }

    #[test]
    fn test_junit_failure_element() {
        let run = TestRunResult {
            results: vec![TestFileResult {
                file: "fail.test.ts".to_string(),
                tests: vec![make_fail("broken", "suite", "Expected 1 to be 2")],
                duration_ms: 1.0,
                file_error: None,
                coverage_data: None,
            }],
            total_passed: 0,
            total_failed: 1,
            total_skipped: 0,
            total_todo: 0,
            total_files: 1,
            file_errors: 0,
            coverage_failed: false,
            coverage_report: None,
        };

        let xml = format_junit(&run);

        assert!(xml.contains("<failure message=\"Expected 1 to be 2\""));
        assert!(xml.contains("failures=\"1\""));
    }

    #[test]
    fn test_junit_skipped_element() {
        let run = TestRunResult {
            results: vec![TestFileResult {
                file: "skip.test.ts".to_string(),
                tests: vec![make_skip("later", "suite")],
                duration_ms: 0.0,
                file_error: None,
                coverage_data: None,
            }],
            total_passed: 0,
            total_failed: 0,
            total_skipped: 1,
            total_todo: 0,
            total_files: 1,
            file_errors: 0,
            coverage_failed: false,
            coverage_report: None,
        };

        let xml = format_junit(&run);

        assert!(xml.contains("<skipped/>"));
        assert!(xml.contains("skipped=\"1\""));
    }

    #[test]
    fn test_junit_escapes_xml_chars() {
        let run = TestRunResult {
            results: vec![TestFileResult {
                file: "test.test.ts".to_string(),
                tests: vec![make_fail(
                    "a < b & c > d",
                    "suite",
                    "Expected \"a\" to be 'b'",
                )],
                duration_ms: 1.0,
                file_error: None,
                coverage_data: None,
            }],
            total_passed: 0,
            total_failed: 1,
            total_skipped: 0,
            total_todo: 0,
            total_files: 1,
            file_errors: 0,
            coverage_failed: false,
            coverage_report: None,
        };

        let xml = format_junit(&run);

        assert!(xml.contains("a &lt; b &amp; c &gt; d"));
        assert!(xml.contains("Expected &quot;a&quot; to be &apos;b&apos;"));
    }

    #[test]
    fn test_junit_file_load_error() {
        let run = TestRunResult {
            results: vec![TestFileResult {
                file: "bad.test.ts".to_string(),
                tests: vec![],
                duration_ms: 0.0,
                file_error: Some("Cannot resolve module".to_string()),
                coverage_data: None,
            }],
            total_passed: 0,
            total_failed: 0,
            total_skipped: 0,
            total_todo: 0,
            total_files: 1,
            file_errors: 1,
            coverage_failed: false,
            coverage_report: None,
        };

        let xml = format_junit(&run);

        assert!(xml.contains("<error message=\"Cannot resolve module\""));
        assert!(xml.contains("errors=\"1\""));
    }
}
