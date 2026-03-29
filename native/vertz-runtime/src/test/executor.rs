use std::path::Path;
use std::time::Instant;

use deno_core::error::AnyError;
use deno_core::ModuleSpecifier;
use serde::{Deserialize, Serialize};

use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

use super::globals::TEST_HARNESS_JS;

/// Result of executing a single test file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestFileResult {
    /// Path to the test file.
    pub file: String,
    /// Individual test results.
    pub tests: Vec<TestResult>,
    /// Total execution time for the file (ms).
    pub duration_ms: f64,
    /// Error if the file failed to load/compile.
    pub file_error: Option<String>,
}

/// Result of a single test case.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    /// Test name (from `it('name', ...)`)
    pub name: String,
    /// Full path (describe > ... > name)
    pub path: String,
    /// pass, fail, skip, or todo
    pub status: TestStatus,
    /// Duration in ms.
    pub duration_ms: f64,
    /// Error message and stack trace (only for failures).
    pub error: Option<TestError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TestStatus {
    Pass,
    Fail,
    Skip,
    Todo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestError {
    pub message: String,
    pub stack: String,
}

impl TestFileResult {
    pub fn passed(&self) -> usize {
        self.tests
            .iter()
            .filter(|t| t.status == TestStatus::Pass)
            .count()
    }
    pub fn failed(&self) -> usize {
        self.tests
            .iter()
            .filter(|t| t.status == TestStatus::Fail)
            .count()
    }
    pub fn skipped(&self) -> usize {
        self.tests
            .iter()
            .filter(|t| t.status == TestStatus::Skip)
            .count()
    }
    pub fn todo(&self) -> usize {
        self.tests
            .iter()
            .filter(|t| t.status == TestStatus::Todo)
            .count()
    }
}

/// Options for executing a test file.
pub struct ExecuteOptions {
    /// Optional filter — only tests whose full name includes this substring run.
    pub filter: Option<String>,
    /// Timeout in milliseconds (0 = no timeout).
    pub timeout_ms: u64,
}

impl Default for ExecuteOptions {
    fn default() -> Self {
        Self {
            filter: None,
            timeout_ms: 5000,
        }
    }
}

/// Execute a single test file and return results.
///
/// Creates a fresh V8 runtime, injects the test harness, loads the test file
/// as an ES module, runs all registered tests, and collects results.
pub fn execute_test_file(file_path: &Path) -> TestFileResult {
    execute_test_file_with_options(file_path, &ExecuteOptions::default())
}

/// Execute a single test file with options (filter, timeout).
pub fn execute_test_file_with_options(
    file_path: &Path,
    options: &ExecuteOptions,
) -> TestFileResult {
    let file_str = file_path.to_string_lossy().to_string();
    let start = Instant::now();

    // Determine root dir from file path (parent of the file)
    let root_dir = file_path
        .parent()
        .unwrap_or(Path::new("."))
        .to_string_lossy()
        .to_string();

    let result = execute_test_file_inner(file_path, &root_dir, options);

    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;

    match result {
        Ok(tests) => TestFileResult {
            file: file_str,
            tests,
            duration_ms,
            file_error: None,
        },
        Err(e) => TestFileResult {
            file: file_str,
            tests: vec![],
            duration_ms,
            file_error: Some(e.to_string()),
        },
    }
}

fn execute_test_file_inner(
    file_path: &Path,
    root_dir: &str,
    options: &ExecuteOptions,
) -> Result<Vec<TestResult>, AnyError> {
    let mut runtime = VertzJsRuntime::new(VertzRuntimeOptions {
        root_dir: Some(root_dir.to_string()),
        capture_output: true,
    })?;

    // 1. Inject test harness (describe, it, expect, etc.)
    runtime.execute_script_void("[vertz:test-harness]", TEST_HARNESS_JS)?;

    // 2. Set filter if provided
    if let Some(ref filter) = options.filter {
        let escaped = filter.replace('\\', "\\\\").replace('\'', "\\'");
        let set_filter = format!("globalThis.__vertz_test_filter = '{}'", escaped);
        runtime.execute_script_void("[vertz:set-filter]", &set_filter)?;
    }

    // 3. Load the test file as an ES module
    let specifier = ModuleSpecifier::from_file_path(file_path)
        .map_err(|_| deno_core::anyhow::anyhow!("Invalid file path: {}", file_path.display()))?;

    let tokio_rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    tokio_rt.block_on(async { runtime.load_main_module(&specifier).await })?;

    // 4. Run all registered tests with timeout
    let timeout_duration = if options.timeout_ms > 0 {
        Some(std::time::Duration::from_millis(options.timeout_ms))
    } else {
        None
    };

    let results_json = tokio_rt.block_on(async {
        runtime
            .execute_script_void(
                "[vertz:run-tests]",
                "globalThis.__vertz_run_tests().then(r => globalThis.__test_results = r)",
            )
            .map_err(|e| deno_core::anyhow::anyhow!("Failed to start test execution: {}", e))?;

        if let Some(timeout) = timeout_duration {
            match tokio::time::timeout(timeout, runtime.run_event_loop()).await {
                Ok(result) => result?,
                Err(_) => {
                    return Err(deno_core::anyhow::anyhow!(
                        "Test execution timed out after {}ms",
                        options.timeout_ms
                    ));
                }
            }
        } else {
            runtime.run_event_loop().await?;
        }

        runtime.execute_script("[vertz:collect]", "globalThis.__test_results")
    })?;

    // 5. Parse results from JSON
    parse_test_results(&results_json)
}

fn parse_test_results(value: &serde_json::Value) -> Result<Vec<TestResult>, AnyError> {
    let arr = value
        .as_array()
        .ok_or_else(|| deno_core::anyhow::anyhow!("Expected array of test results"))?;

    let mut results = Vec::with_capacity(arr.len());
    for item in arr {
        let status = match item["status"].as_str().unwrap_or("fail") {
            "pass" => TestStatus::Pass,
            "skip" => TestStatus::Skip,
            "todo" => TestStatus::Todo,
            _ => TestStatus::Fail,
        };

        let error = if status == TestStatus::Fail {
            Some(TestError {
                message: item["error"]["message"]
                    .as_str()
                    .unwrap_or("Unknown error")
                    .to_string(),
                stack: item["error"]["stack"].as_str().unwrap_or("").to_string(),
            })
        } else {
            None
        };

        results.push(TestResult {
            name: item["name"].as_str().unwrap_or("").to_string(),
            path: item["path"].as_str().unwrap_or("").to_string(),
            status,
            duration_ms: item["duration"].as_f64().unwrap_or(0.0),
            error,
        });
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write_test_file(dir: &Path, name: &str, content: &str) -> std::path::PathBuf {
        let file_path = dir.join(name);
        fs::write(&file_path, content).unwrap();
        file_path
    }

    #[test]
    fn test_execute_passing_test_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file = write_test_file(
            tmp.path(),
            "math.test.ts",
            r#"
            describe('math', () => {
                it('adds numbers', () => {
                    expect(1 + 1).toBe(2);
                });
                it('subtracts numbers', () => {
                    expect(5 - 3).toBe(2);
                });
            });
            "#,
        );

        let result = execute_test_file(&file);

        assert!(result.file_error.is_none());
        assert_eq!(result.tests.len(), 2);
        assert_eq!(result.passed(), 2);
        assert_eq!(result.failed(), 0);
    }

    #[test]
    fn test_execute_failing_test_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file = write_test_file(
            tmp.path(),
            "fail.test.ts",
            r#"
            describe('fail', () => {
                it('passes', () => { expect(1).toBe(1); });
                it('fails', () => { expect(1).toBe(2); });
            });
            "#,
        );

        let result = execute_test_file(&file);

        assert!(result.file_error.is_none());
        assert_eq!(result.passed(), 1);
        assert_eq!(result.failed(), 1);
        assert!(result.tests[1].error.is_some());
        assert!(result.tests[1]
            .error
            .as_ref()
            .unwrap()
            .message
            .contains("to be 2"));
    }

    #[test]
    fn test_execute_with_skip_and_todo() {
        let tmp = tempfile::tempdir().unwrap();
        let file = write_test_file(
            tmp.path(),
            "modifiers.test.ts",
            r#"
            describe('modifiers', () => {
                it('runs', () => { expect(true).toBeTruthy(); });
                it.skip('skipped', () => { throw new Error('should not run'); });
                it.todo('not yet');
            });
            "#,
        );

        let result = execute_test_file(&file);

        assert!(result.file_error.is_none());
        assert_eq!(result.passed(), 1);
        assert_eq!(result.skipped(), 1);
        assert_eq!(result.todo(), 1);
    }

    #[test]
    fn test_execute_records_duration() {
        let tmp = tempfile::tempdir().unwrap();
        let file = write_test_file(
            tmp.path(),
            "timing.test.ts",
            r#"
            describe('timing', () => {
                it('fast', () => { expect(1).toBe(1); });
            });
            "#,
        );

        let result = execute_test_file(&file);

        assert!(result.duration_ms >= 0.0);
        assert!(result.tests[0].duration_ms >= 0.0);
    }

    #[test]
    fn test_execute_compile_error_returns_file_error() {
        let tmp = tempfile::tempdir().unwrap();
        let file = write_test_file(
            tmp.path(),
            "bad.test.ts",
            r#"
            import { nonexistent } from './does-not-exist';
            describe('bad', () => {
                it('never runs', () => {});
            });
            "#,
        );

        let result = execute_test_file(&file);

        assert!(result.file_error.is_some());
        assert!(result.tests.is_empty());
    }

    #[test]
    fn test_execute_with_before_after_each() {
        let tmp = tempfile::tempdir().unwrap();
        let file = write_test_file(
            tmp.path(),
            "hooks.test.ts",
            r#"
            const log: string[] = [];
            describe('hooks', () => {
                beforeEach(() => { log.push('setup'); });
                afterEach(() => { log.push('teardown'); });
                it('test 1', () => {
                    expect(log).toEqual(['setup']);
                });
                it('test 2', () => {
                    expect(log).toEqual(['setup', 'teardown', 'setup']);
                });
            });
            "#,
        );

        let result = execute_test_file(&file);

        assert!(
            result.file_error.is_none(),
            "File error: {:?}",
            result.file_error
        );
        assert_eq!(result.passed(), 2, "Tests: {:?}", result.tests);
    }

    #[test]
    fn test_isolation_between_files() {
        let tmp = tempfile::tempdir().unwrap();

        // File A mutates a global
        let file_a = write_test_file(
            tmp.path(),
            "a.test.ts",
            r#"
            globalThis.shared = 42;
            describe('a', () => {
                it('sets global', () => { expect(globalThis.shared).toBe(42); });
            });
            "#,
        );

        // File B checks the global is not set (fresh runtime)
        let file_b = write_test_file(
            tmp.path(),
            "b.test.ts",
            r#"
            describe('b', () => {
                it('global is fresh', () => { expect(globalThis.shared).toBeUndefined(); });
            });
            "#,
        );

        let result_a = execute_test_file(&file_a);
        let result_b = execute_test_file(&file_b);

        assert_eq!(result_a.passed(), 1);
        assert_eq!(
            result_b.passed(),
            1,
            "Global leaked between files: {:?}",
            result_b.tests
        );
    }
}
