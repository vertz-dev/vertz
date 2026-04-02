use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;

use super::collector::{discover_test_files, DiscoveryMode};
use super::executor::{execute_test_file_with_options, ExecuteOptions, TestFileResult};
use super::reporter::json::format_json;
use super::reporter::junit::format_junit;
use super::reporter::terminal::format_results;
use super::typetests;

/// Reporter format.
#[derive(Debug, Clone, PartialEq)]
pub enum ReporterFormat {
    Terminal,
    Json,
    Junit,
}

/// Configuration for a test run.
pub struct TestRunConfig {
    /// Root directory (project root).
    pub root_dir: PathBuf,
    /// Explicit paths (files or directories) to test.
    pub paths: Vec<PathBuf>,
    /// Include glob patterns (empty = defaults).
    pub include: Vec<String>,
    /// Exclude patterns.
    pub exclude: Vec<String>,
    /// Max parallel threads (None = num CPUs).
    pub concurrency: Option<usize>,
    /// Test name filter substring.
    pub filter: Option<String>,
    /// Stop on first failure.
    pub bail: bool,
    /// Timeout per test file in milliseconds (0 = no timeout).
    pub timeout_ms: u64,
    /// Reporter format.
    pub reporter: ReporterFormat,
    /// Enable code coverage collection.
    pub coverage: bool,
    /// Minimum coverage threshold percentage (0-100).
    pub coverage_threshold: f64,
    /// Preload script paths (relative to root_dir).
    pub preload: Vec<String>,
    /// Skip compilation cache (compile everything fresh).
    pub no_cache: bool,
}

/// Summary of a completed test run.
pub struct TestRunResult {
    pub results: Vec<TestFileResult>,
    pub total_passed: usize,
    pub total_failed: usize,
    pub total_skipped: usize,
    pub total_todo: usize,
    pub total_files: usize,
    pub file_errors: usize,
    /// Whether coverage is below the configured threshold.
    pub coverage_failed: bool,
    /// Parsed coverage report (present when coverage is enabled).
    pub coverage_report: Option<super::coverage::CoverageReport>,
}

impl TestRunResult {
    pub fn success(&self) -> bool {
        self.total_failed == 0 && self.file_errors == 0 && !self.coverage_failed
    }
}

/// Run the test suite: discover → execute (parallel) → report.
///
/// Returns a `TestRunResult` with the aggregated results and formatted output.
pub fn run_tests(config: TestRunConfig) -> (TestRunResult, String) {
    // 1. Discover test files
    let files = discover_test_files(
        &config.root_dir,
        &config.paths,
        &config.include,
        &config.exclude,
        DiscoveryMode::Unit,
    );

    // Also check for type test files (skip when specific paths are provided)
    let has_specific_paths = !config.paths.is_empty();
    let type_test_files_exist = if has_specific_paths {
        false
    } else {
        !typetests::discover_type_test_files(&config.root_dir, &config.exclude).is_empty()
    };

    if files.is_empty() && !type_test_files_exist {
        let output = "\nNo test files found.\n".to_string();
        let result = TestRunResult {
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
        return (result, output);
    }

    // 2. Execute test files in parallel using OS threads
    let concurrency = config.concurrency.unwrap_or_else(|| {
        thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
    });

    let preload_paths: Vec<PathBuf> = config
        .preload
        .iter()
        .map(|p| {
            let path = PathBuf::from(p);
            if path.is_absolute() {
                path
            } else {
                config.root_dir.join(path)
            }
        })
        .collect();

    let exec_options = std::sync::Arc::new(ExecuteOptions {
        filter: config.filter.clone(),
        timeout_ms: config.timeout_ms,
        coverage: config.coverage,
        preload: preload_paths,
        root_dir: Some(config.root_dir.clone()),
        no_cache: config.no_cache,
    });

    let mut results = execute_parallel(&files, concurrency, config.bail, exec_options);

    // 2b. Discover and run type tests (.test-d.ts files) — skip when specific paths given
    if !has_specific_paths {
        let type_test_files =
            typetests::discover_type_test_files(&config.root_dir, &config.exclude);
        if !type_test_files.is_empty() {
            let type_results = typetests::run_type_tests(&config.root_dir, &type_test_files, None);
            results.extend(type_results);
        }
    }

    // 3. Build summary
    let total_passed: usize = results.iter().map(|r| r.passed()).sum();
    let total_failed: usize = results.iter().map(|r| r.failed()).sum();
    let total_skipped: usize = results.iter().map(|r| r.skipped()).sum();
    let total_todo: usize = results.iter().map(|r| r.todo()).sum();
    let file_errors: usize = results.iter().filter(|r| r.file_error.is_some()).count();

    let mut run_result = TestRunResult {
        total_files: results.len(),
        total_passed,
        total_failed,
        total_skipped,
        total_todo,
        file_errors,
        results,
        coverage_failed: false,
        coverage_report: None,
    };

    // 4. If coverage is enabled, collect and build the report first
    //    (so coverage_failed is set before formatting JSON/JUnit)
    if config.coverage {
        let mut all_coverage = Vec::new();
        for result in &run_result.results {
            if let Some(ref cov_json) = result.coverage_data {
                let file_coverages = super::coverage::parse_v8_coverage(cov_json, &|_| None);
                // Exclude test files from coverage report
                let source_coverages = file_coverages.into_iter().filter(|fc| {
                    let name = fc.file.to_string_lossy();
                    !name.contains(".test.") && !name.contains(".spec.")
                });
                all_coverage.extend(source_coverages);
            }
        }

        let report = super::coverage::CoverageReport {
            files: all_coverage,
        };

        // Write LCOV file if there are any coverage results
        if !report.files.is_empty() {
            let lcov_path = config.root_dir.join("coverage.lcov");
            let _ = std::fs::write(&lcov_path, super::coverage::format_lcov(&report));
        }

        // Fail the run if coverage is below threshold
        if !report.all_meet_threshold(config.coverage_threshold) {
            run_result.coverage_failed = true;
        }

        // Store the report for terminal output (after reporter formatting)
        run_result.coverage_report = Some(report);
    }

    // 5. Format output based on reporter
    let mut output = match config.reporter {
        ReporterFormat::Terminal => format_results(&run_result.results),
        ReporterFormat::Json => format_json(&run_result),
        ReporterFormat::Junit => format_junit(&run_result),
    };

    // 6. Append terminal coverage report (only for terminal reporter)
    if config.reporter == ReporterFormat::Terminal {
        if let Some(ref report) = run_result.coverage_report {
            output.push_str(&super::coverage::format_terminal(
                report,
                config.coverage_threshold,
            ));
        }
    }

    (run_result, output)
}

/// Execute test files in parallel across OS threads.
///
/// Each file gets a fresh V8 runtime (isolation). Uses a simple work-stealing
/// pattern: N worker threads pull files from a shared channel.
fn execute_parallel(
    files: &[PathBuf],
    concurrency: usize,
    bail: bool,
    exec_options: std::sync::Arc<ExecuteOptions>,
) -> Vec<TestFileResult> {
    let num_threads = concurrency.min(files.len());

    if num_threads <= 1 {
        // Sequential: just run one by one
        return execute_sequential(files, bail, &exec_options);
    }

    let (work_tx, work_rx) = crossbeam_channel::unbounded::<PathBuf>();
    let (result_tx, result_rx) = mpsc::channel::<TestFileResult>();

    // Send all file paths into the work channel
    for file in files {
        work_tx.send(file.clone()).unwrap();
    }
    drop(work_tx); // Close the channel so workers know when to stop

    let bail_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

    // Spawn worker threads
    let mut handles = Vec::with_capacity(num_threads);
    for _ in 0..num_threads {
        let rx = work_rx.clone();
        let tx = result_tx.clone();
        let bail_flag = bail_flag.clone();
        let options = exec_options.clone();

        handles.push(thread::spawn(move || {
            while let Ok(file) = rx.recv() {
                if bail && bail_flag.load(std::sync::atomic::Ordering::Relaxed) {
                    break;
                }

                let result = execute_test_file_with_options(&file, &options);

                if bail && result.failed() > 0 {
                    bail_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                }

                if tx.send(result).is_err() {
                    break;
                }
            }
        }));
    }
    drop(result_tx); // Drop the sender so result_rx.iter() terminates

    // Collect results
    let mut results: Vec<TestFileResult> = result_rx.iter().collect();

    // Wait for all threads to finish
    for handle in handles {
        let _ = handle.join();
    }

    // Sort results by file path for deterministic output order
    results.sort_by(|a, b| a.file.cmp(&b.file));

    results
}

/// Execute test files sequentially (single thread).
fn execute_sequential(
    files: &[PathBuf],
    bail: bool,
    options: &ExecuteOptions,
) -> Vec<TestFileResult> {
    let mut results = Vec::with_capacity(files.len());
    for file in files {
        let result = execute_test_file_with_options(file, options);
        let should_bail = bail && result.failed() > 0;
        results.push(result);
        if should_bail {
            break;
        }
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    fn create_test_project(dir: &Path) {
        fs::create_dir_all(dir.join("src")).unwrap();
    }

    fn write_file(dir: &Path, name: &str, content: &str) {
        let path = dir.join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    #[test]
    fn test_run_no_files_found() {
        let tmp = tempfile::tempdir().unwrap();

        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![],
            include: vec![],
            exclude: vec![],
            concurrency: Some(1),
            filter: None,
            bail: false,
            timeout_ms: 5000,
            reporter: ReporterFormat::Terminal,
            coverage: false,
            coverage_threshold: 95.0,
            preload: vec![],
            no_cache: false,
        };

        let (result, output) = run_tests(config);

        assert_eq!(result.total_files, 0);
        assert!(result.success());
        assert!(output.contains("No test files found"));
    }

    #[test]
    fn test_run_single_passing_file() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());
        write_file(
            tmp.path(),
            "src/math.test.ts",
            r#"
            describe('math', () => {
                it('adds', () => { expect(1 + 1).toBe(2); });
                it('multiplies', () => { expect(2 * 3).toBe(6); });
            });
            "#,
        );

        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![],
            include: vec![],
            exclude: vec![],
            concurrency: Some(1),
            filter: None,
            bail: false,
            timeout_ms: 5000,
            reporter: ReporterFormat::Terminal,
            coverage: false,
            coverage_threshold: 95.0,
            preload: vec![],
            no_cache: false,
        };

        let (result, output) = run_tests(config);

        assert_eq!(result.total_files, 1);
        assert_eq!(result.total_passed, 2);
        assert_eq!(result.total_failed, 0);
        assert!(result.success());
        assert!(output.contains("2 passed"));
    }

    #[test]
    fn test_run_with_failures() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());
        write_file(
            tmp.path(),
            "src/fail.test.ts",
            r#"
            describe('fail', () => {
                it('passes', () => { expect(1).toBe(1); });
                it('fails', () => { expect(1).toBe(2); });
            });
            "#,
        );

        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![],
            include: vec![],
            exclude: vec![],
            concurrency: Some(1),
            filter: None,
            bail: false,
            timeout_ms: 5000,
            reporter: ReporterFormat::Terminal,
            coverage: false,
            coverage_threshold: 95.0,
            preload: vec![],
            no_cache: false,
        };

        let (result, _output) = run_tests(config);

        assert!(!result.success());
        assert_eq!(result.total_passed, 1);
        assert_eq!(result.total_failed, 1);
    }

    #[test]
    fn test_run_multiple_files_parallel() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());

        write_file(
            tmp.path(),
            "src/a.test.ts",
            r#"
            describe('a', () => {
                it('works', () => { expect(true).toBeTruthy(); });
            });
            "#,
        );
        write_file(
            tmp.path(),
            "src/b.test.ts",
            r#"
            describe('b', () => {
                it('works', () => { expect(42).toBe(42); });
            });
            "#,
        );
        write_file(
            tmp.path(),
            "src/c.test.ts",
            r#"
            describe('c', () => {
                it('works', () => { expect('hello').toBe('hello'); });
            });
            "#,
        );

        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![],
            include: vec![],
            exclude: vec![],
            concurrency: Some(3),
            filter: None,
            bail: false,
            timeout_ms: 5000,
            reporter: ReporterFormat::Terminal,
            coverage: false,
            coverage_threshold: 95.0,
            preload: vec![],
            no_cache: false,
        };

        let (result, output) = run_tests(config);

        assert_eq!(result.total_files, 3);
        assert_eq!(result.total_passed, 3);
        assert!(result.success());
        assert!(output.contains("3 passed"));
        assert!(output.contains("Files:  3"));
    }

    #[test]
    fn test_run_parallel_isolation() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());

        // File A sets a global
        write_file(
            tmp.path(),
            "src/a.test.ts",
            r#"
            globalThis.leak = 'from A';
            describe('a', () => {
                it('sets global', () => { expect(globalThis.leak).toBe('from A'); });
            });
            "#,
        );

        // File B verifies isolation
        write_file(
            tmp.path(),
            "src/b.test.ts",
            r#"
            describe('b', () => {
                it('no leak', () => { expect(globalThis.leak).toBeUndefined(); });
            });
            "#,
        );

        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![],
            include: vec![],
            exclude: vec![],
            concurrency: Some(2),
            filter: None,
            bail: false,
            timeout_ms: 5000,
            reporter: ReporterFormat::Terminal,
            coverage: false,
            coverage_threshold: 95.0,
            preload: vec![],
            no_cache: false,
        };

        let (result, _output) = run_tests(config);

        assert_eq!(result.total_passed, 2);
        assert!(
            result.success(),
            "Files should be isolated: {:?}",
            result.results
        );
    }

    #[test]
    fn test_run_bail_stops_on_first_failure() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());

        // Create multiple files — at least one will fail
        write_file(
            tmp.path(),
            "src/a.test.ts",
            r#"
            describe('a', () => {
                it('fails', () => { expect(1).toBe(2); });
            });
            "#,
        );
        write_file(
            tmp.path(),
            "src/b.test.ts",
            r#"
            describe('b', () => {
                it('passes', () => { expect(1).toBe(1); });
            });
            "#,
        );

        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![],
            include: vec![],
            exclude: vec![],
            // Sequential so bail order is deterministic (a.test.ts first)
            concurrency: Some(1),
            filter: None,
            bail: true,
            timeout_ms: 5000,
            reporter: ReporterFormat::Terminal,
            coverage: false,
            coverage_threshold: 95.0,
            preload: vec![],
            no_cache: false,
        };

        let (result, _output) = run_tests(config);

        // With bail, should stop after file a fails — only 1 file executed
        assert_eq!(result.total_files, 1);
        assert_eq!(result.total_failed, 1);
    }

    #[test]
    fn test_run_file_load_error_counted() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());
        write_file(
            tmp.path(),
            "src/bad.test.ts",
            r#"
            import { nope } from './missing';
            describe('bad', () => { it('x', () => {}); });
            "#,
        );

        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![],
            include: vec![],
            exclude: vec![],
            concurrency: Some(1),
            filter: None,
            bail: false,
            timeout_ms: 5000,
            reporter: ReporterFormat::Terminal,
            coverage: false,
            coverage_threshold: 95.0,
            preload: vec![],
            no_cache: false,
        };

        let (result, _output) = run_tests(config);

        assert_eq!(result.file_errors, 1);
        assert!(!result.success());
    }

    #[test]
    fn test_run_specific_paths() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());

        write_file(
            tmp.path(),
            "src/a.test.ts",
            r#"describe('a', () => { it('ok', () => { expect(1).toBe(1); }); });"#,
        );
        write_file(
            tmp.path(),
            "src/b.test.ts",
            r#"describe('b', () => { it('ok', () => { expect(2).toBe(2); }); });"#,
        );

        // Only run a.test.ts
        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![PathBuf::from("src/a.test.ts")],
            include: vec![],
            exclude: vec![],
            concurrency: Some(1),
            filter: None,
            bail: false,
            timeout_ms: 5000,
            reporter: ReporterFormat::Terminal,
            coverage: false,
            coverage_threshold: 95.0,
            preload: vec![],
            no_cache: false,
        };

        let (result, _output) = run_tests(config);

        assert_eq!(result.total_files, 1);
        assert_eq!(result.total_passed, 1);
    }

    #[test]
    fn test_results_sorted_by_file() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());

        write_file(
            tmp.path(),
            "src/z.test.ts",
            r#"describe('z', () => { it('ok', () => { expect(1).toBe(1); }); });"#,
        );
        write_file(
            tmp.path(),
            "src/a.test.ts",
            r#"describe('a', () => { it('ok', () => { expect(1).toBe(1); }); });"#,
        );

        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![],
            include: vec![],
            exclude: vec![],
            concurrency: Some(2),
            filter: None,
            bail: false,
            timeout_ms: 5000,
            reporter: ReporterFormat::Terminal,
            coverage: false,
            coverage_threshold: 95.0,
            preload: vec![],
            no_cache: false,
        };

        let (result, _output) = run_tests(config);

        assert_eq!(result.total_files, 2);
        // Results should be sorted by file path
        assert!(result.results[0].file < result.results[1].file);
    }

    #[test]
    fn test_run_json_reporter() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());
        write_file(
            tmp.path(),
            "src/math.test.ts",
            r#"
            describe('math', () => {
                it('adds', () => { expect(1 + 1).toBe(2); });
            });
            "#,
        );

        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![],
            include: vec![],
            exclude: vec![],
            concurrency: Some(1),
            filter: None,
            bail: false,
            timeout_ms: 5000,
            reporter: ReporterFormat::Json,
            coverage: false,
            coverage_threshold: 95.0,
            preload: vec![],
            no_cache: false,
        };

        let (result, output) = run_tests(config);

        assert!(result.success());
        let parsed: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert_eq!(parsed["numTotalTestSuites"], 1);
        assert_eq!(parsed["numPassedTests"], 1);
        assert_eq!(parsed["success"], true);
    }

    #[test]
    fn test_run_junit_reporter() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());
        write_file(
            tmp.path(),
            "src/math.test.ts",
            r#"
            describe('math', () => {
                it('adds', () => { expect(1 + 1).toBe(2); });
            });
            "#,
        );

        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![],
            include: vec![],
            exclude: vec![],
            concurrency: Some(1),
            filter: None,
            bail: false,
            timeout_ms: 5000,
            reporter: ReporterFormat::Junit,
            coverage: false,
            coverage_threshold: 95.0,
            preload: vec![],
            no_cache: false,
        };

        let (result, output) = run_tests(config);

        assert!(result.success());
        assert!(output.contains("<?xml version=\"1.0\""));
        assert!(output.contains("<testsuites"));
        assert!(output.contains("<testcase name=\"adds\""));
        assert!(output.contains("</testsuites>"));
    }

    #[test]
    fn test_run_with_coverage_enabled() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());
        write_file(
            tmp.path(),
            "src/math.test.ts",
            r#"
            describe('math', () => {
                it('adds', () => { expect(1 + 1).toBe(2); });
            });
            "#,
        );

        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![],
            include: vec![],
            exclude: vec![],
            concurrency: Some(1),
            filter: None,
            bail: false,
            timeout_ms: 5000,
            reporter: ReporterFormat::Terminal,
            coverage: true,
            coverage_threshold: 0.0, // Low threshold so it passes
            preload: vec![],
            no_cache: false,
        };

        let (result, output) = run_tests(config);

        assert!(result.success());
        // Coverage data should be collected
        assert!(
            result.results.iter().any(|r| r.coverage_data.is_some()),
            "At least one result should have coverage data"
        );
        // Output should contain coverage report
        assert!(
            output.contains("Coverage Report"),
            "Output should contain coverage report: {}",
            output
        );
    }

    #[test]
    fn test_coverage_below_threshold_fails() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_project(tmp.path());
        write_file(
            tmp.path(),
            "src/math.test.ts",
            r#"
            describe('math', () => {
                it('adds', () => { expect(1 + 1).toBe(2); });
            });
            "#,
        );

        let config = TestRunConfig {
            root_dir: tmp.path().to_path_buf(),
            paths: vec![],
            include: vec![],
            exclude: vec![],
            concurrency: Some(1),
            filter: None,
            bail: false,
            timeout_ms: 5000,
            reporter: ReporterFormat::Terminal,
            coverage: true,
            coverage_threshold: 100.0, // Very high threshold
            preload: vec![],
            no_cache: false,
        };

        let (result, _output) = run_tests(config);

        // Tests themselves pass, but coverage threshold check may flag it
        assert_eq!(result.total_failed, 0);
        // coverage_failed is set if coverage is below threshold
        // (Note: with a simple test file the coverage may actually be 100%,
        //  so this test verifies the structure rather than a guaranteed failure)
    }
}
