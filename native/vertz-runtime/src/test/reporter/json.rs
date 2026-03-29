use serde::Serialize;

use crate::test::executor::TestFileResult;
use crate::test::runner::TestRunResult;

/// JSON-serializable test run output.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonReport {
    pub num_total_test_suites: usize,
    pub num_passed_test_suites: usize,
    pub num_failed_test_suites: usize,
    pub num_total_tests: usize,
    pub num_passed_tests: usize,
    pub num_failed_tests: usize,
    pub num_skipped_tests: usize,
    pub num_todo_tests: usize,
    pub success: bool,
    pub test_results: Vec<TestFileResult>,
}

/// Format test results as JSON string.
pub fn format_json(result: &TestRunResult) -> String {
    let num_passed_suites = result
        .results
        .iter()
        .filter(|r| r.failed() == 0 && r.file_error.is_none())
        .count();
    let num_failed_suites = result.total_files - num_passed_suites;

    let report = JsonReport {
        num_total_test_suites: result.total_files,
        num_passed_test_suites: num_passed_suites,
        num_failed_test_suites: num_failed_suites,
        num_total_tests: result.total_passed
            + result.total_failed
            + result.total_skipped
            + result.total_todo,
        num_passed_tests: result.total_passed,
        num_failed_tests: result.total_failed,
        num_skipped_tests: result.total_skipped,
        num_todo_tests: result.total_todo,
        success: result.success(),
        test_results: result.results.clone(),
    };

    serde_json::to_string_pretty(&report).unwrap_or_else(|_| "{}".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test::executor::{TestError, TestResult, TestStatus};

    fn make_result(file: &str, tests: Vec<TestResult>) -> TestFileResult {
        let duration_ms = tests.iter().map(|t| t.duration_ms).sum();
        TestFileResult {
            file: file.to_string(),
            tests,
            duration_ms,
            file_error: None,
            coverage_data: None,
        }
    }

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

    #[test]
    fn test_json_report_passing() {
        let run = TestRunResult {
            results: vec![make_result("a.test.ts", vec![make_pass("test1", "suite")])],
            total_passed: 1,
            total_failed: 0,
            total_skipped: 0,
            total_todo: 0,
            total_files: 1,
            file_errors: 0,
            coverage_failed: false,
            coverage_report: None,
        };

        let json = format_json(&run);
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["numTotalTestSuites"], 1);
        assert_eq!(parsed["numPassedTests"], 1);
        assert_eq!(parsed["numFailedTests"], 0);
        assert_eq!(parsed["success"], true);
        assert!(parsed["testResults"].is_array());
    }

    #[test]
    fn test_json_report_with_failures() {
        let run = TestRunResult {
            results: vec![make_result(
                "fail.test.ts",
                vec![make_pass("ok", "s"), make_fail("bad", "s", "boom")],
            )],
            total_passed: 1,
            total_failed: 1,
            total_skipped: 0,
            total_todo: 0,
            total_files: 1,
            file_errors: 0,
            coverage_failed: false,
            coverage_report: None,
        };

        let json = format_json(&run);
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["success"], false);
        assert_eq!(parsed["numFailedTests"], 1);
        assert_eq!(parsed["numFailedTestSuites"], 1);
    }

    #[test]
    fn test_json_is_valid_json() {
        let run = TestRunResult {
            results: vec![],
            total_passed: 0,
            total_failed: 0,
            total_skipped: 0,
            total_todo: 0,
            total_files: 0,
            file_errors: 0,
            coverage_failed: false,
            coverage_report: None,
        };

        let json = format_json(&run);
        assert!(serde_json::from_str::<serde_json::Value>(&json).is_ok());
    }
}
