use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::task::Poll;
use std::time::Instant;

use deno_core::error::AnyError;
use deno_core::futures::task::noop_waker;
use deno_core::LocalInspectorSession;
use deno_core::ModuleSpecifier;
use deno_core::PollEventLoopOptions;
use serde::{Deserialize, Serialize};

use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

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
    /// Raw V8 coverage data (present when coverage is enabled).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coverage_data: Option<serde_json::Value>,
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
    /// Whether to collect V8 code coverage.
    pub coverage: bool,
    /// Preload script paths (absolute) to execute before the test file.
    pub preload: Vec<std::path::PathBuf>,
    /// Root directory for module resolution (workspace root).
    /// When set, overrides the default behavior of using the file's parent directory.
    pub root_dir: Option<std::path::PathBuf>,
    /// Whether to skip the compilation cache (compile everything fresh).
    pub no_cache: bool,
}

impl Default for ExecuteOptions {
    fn default() -> Self {
        Self {
            filter: None,
            timeout_ms: 5000,
            coverage: false,
            preload: vec![],
            root_dir: None,
            no_cache: false,
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

    // Use explicit root_dir from options (workspace root), falling back to file's parent
    let root_dir = options
        .root_dir
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            file_path
                .parent()
                .unwrap_or(Path::new("."))
                .to_string_lossy()
                .to_string()
        });

    let result = execute_test_file_inner(file_path, &root_dir, options);

    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;

    match result {
        Ok((tests, coverage_data)) => TestFileResult {
            file: file_str,
            tests,
            duration_ms,
            file_error: None,
            coverage_data,
        },
        Err(e) => TestFileResult {
            file: file_str,
            tests: vec![],
            duration_ms,
            file_error: Some(e.to_string()),
            coverage_data: None,
        },
    }
}

fn execute_test_file_inner(
    file_path: &Path,
    root_dir: &str,
    options: &ExecuteOptions,
) -> Result<(Vec<TestResult>, Option<serde_json::Value>), AnyError> {
    let mut runtime = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
        root_dir: Some(root_dir.to_string()),
        capture_output: true,
        enable_inspector: options.coverage,
        compile_cache: !options.no_cache,
    })?;

    // NOTE: async context + test harness are pre-baked in the V8 snapshot,
    // so we skip load_async_context() and TEST_HARNESS_JS injection.

    // 1. Set filter if provided
    if let Some(ref filter) = options.filter {
        let escaped = filter.replace('\\', "\\\\").replace('\'', "\\'");
        let set_filter = format!("globalThis.__vertz_test_filter = '{}'", escaped);
        runtime.execute_script_void("[vertz:set-filter]", &set_filter)?;
    }

    // 4. Execute preload scripts (run as classic scripts, not modules — no import support)
    for preload_path in &options.preload {
        let preload_source = std::fs::read_to_string(preload_path).map_err(|e| {
            deno_core::anyhow::anyhow!(
                "Cannot read preload script '{}': {}",
                preload_path.display(),
                e
            )
        })?;
        let filename = preload_path.to_string_lossy().to_string();
        let ext = preload_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        let code = if ext == "ts" || ext == "tsx" {
            let result = vertz_compiler_core::compile(
                &preload_source,
                vertz_compiler_core::CompileOptions {
                    filename: Some(filename.clone()),
                    target: Some("ssr".to_string()),
                    ..Default::default()
                },
            );
            result.code
        } else {
            preload_source
        };

        runtime.execute_script_void("[vertz:preload]", &code)?;
    }

    // 5. Load the test file as an ES module
    let specifier = ModuleSpecifier::from_file_path(file_path)
        .map_err(|_| deno_core::anyhow::anyhow!("Invalid file path: {}", file_path.display()))?;

    let tokio_rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    // 4. Create inspector session for coverage if enabled
    let mut session = if options.coverage {
        let inspector = runtime.inner_mut().inspector();
        let session = inspector.borrow().create_local_session();
        Some(session)
    } else {
        None
    };

    // 5. Start coverage collection (before module load)
    if let Some(ref mut session) = session {
        inspector_post_message_sync(session, &mut runtime, "Profiler.enable", None::<()>)?;
        inspector_post_message_sync(
            session,
            &mut runtime,
            "Profiler.startPreciseCoverage",
            Some(serde_json::json!({
                "callCount": true,
                "detailed": true,
            })),
        )?;
    }

    // 6. Load module
    tokio_rt.block_on(async { runtime.load_main_module(&specifier).await })?;

    // 7. Run all registered tests with timeout
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

    // 8. Collect coverage data if enabled
    let coverage_data = if let Some(ref mut session) = session {
        let result = inspector_post_message_sync(
            session,
            &mut runtime,
            "Profiler.takePreciseCoverage",
            None::<()>,
        )?;

        // Cleanup: stop and disable profiler
        let _ = inspector_post_message_sync(
            session,
            &mut runtime,
            "Profiler.stopPreciseCoverage",
            None::<()>,
        );
        let _ = inspector_post_message_sync(session, &mut runtime, "Profiler.disable", None::<()>);

        Some(result)
    } else {
        None
    };

    // 9. Parse results from JSON
    let tests = parse_test_results(&results_json)?;
    Ok((tests, coverage_data))
}

/// Send a CDP message to the inspector session, driving the event loop manually.
///
/// The V8 inspector only processes messages when the event loop is polled.
/// We manually poll both the message future and the event loop in a tight loop
/// so that the inspector processes the CDP message and returns the response.
///
/// Times out after 10 seconds to avoid spinning forever if the inspector is unresponsive.
fn inspector_post_message_sync<T: serde::Serialize>(
    session: &mut LocalInspectorSession,
    runtime: &mut VertzJsRuntime,
    method: &str,
    params: Option<T>,
) -> Result<serde_json::Value, AnyError> {
    let msg = session.post_message(method, params);
    tokio::pin!(msg);

    let waker = noop_waker();
    let mut cx = std::task::Context::from_waker(&waker);
    let deadline = Instant::now() + std::time::Duration::from_secs(10);

    loop {
        if Instant::now() > deadline {
            return Err(deno_core::anyhow::anyhow!(
                "Inspector CDP message '{}' timed out after 10s",
                method
            ));
        }

        // Poll the event loop to drive the inspector (process CDP messages)
        let _ = runtime
            .inner_mut()
            .poll_event_loop(&mut cx, PollEventLoopOptions::default());

        // Check if the inspector message got a response
        match Pin::new(&mut msg).poll(&mut cx) {
            Poll::Ready(result) => {
                return result.map_err(|e| deno_core::anyhow::anyhow!("{}", e));
            }
            Poll::Pending => {
                // Keep polling — inspector hasn't responded yet
                std::thread::yield_now();
            }
        }
    }
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

    #[test]
    fn test_execute_with_vertz_test_import() {
        let tmp = tempfile::tempdir().unwrap();
        let file = write_test_file(
            tmp.path(),
            "import.test.ts",
            r#"
            import { describe, it, expect } from '@vertz/test';
            describe('imported', () => {
                it('works with explicit import', () => {
                    expect(2 + 2).toBe(4);
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
        assert_eq!(result.passed(), 1);
    }

    #[test]
    fn test_execute_with_bun_test_import() {
        let tmp = tempfile::tempdir().unwrap();
        let file = write_test_file(
            tmp.path(),
            "bun-compat.test.ts",
            r#"
            import { describe, it, expect } from 'bun:test';
            describe('bun compat', () => {
                it('works with bun:test import', () => {
                    expect('hello').toBe('hello');
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
        assert_eq!(result.passed(), 1);
    }

    #[test]
    fn test_execute_with_preload_script() {
        let tmp = tempfile::tempdir().unwrap();

        // Create a preload script that sets a global
        let preload = write_test_file(
            tmp.path(),
            "test-setup.ts",
            r#"
            globalThis.TEST_HELPER = { greet: (name: string) => `Hello, ${name}!` };
            "#,
        );

        let file = write_test_file(
            tmp.path(),
            "greeting.test.ts",
            r#"
            describe('with preload', () => {
                it('can use preloaded helper', () => {
                    expect(globalThis.TEST_HELPER.greet('World')).toBe('Hello, World!');
                });
            });
            "#,
        );

        let result = execute_test_file_with_options(
            &file,
            &ExecuteOptions {
                preload: vec![preload],
                ..Default::default()
            },
        );

        assert!(
            result.file_error.is_none(),
            "File error: {:?}",
            result.file_error
        );
        assert_eq!(result.passed(), 1);
    }

    #[test]
    fn test_execute_with_missing_preload_script() {
        let tmp = tempfile::tempdir().unwrap();
        let file = write_test_file(
            tmp.path(),
            "simple.test.ts",
            r#"
            describe('simple', () => {
                it('passes', () => { expect(1).toBe(1); });
            });
            "#,
        );

        let result = execute_test_file_with_options(
            &file,
            &ExecuteOptions {
                preload: vec![tmp.path().join("nonexistent-setup.ts")],
                ..Default::default()
            },
        );

        assert!(result.file_error.is_some());
        assert!(result
            .file_error
            .as_ref()
            .unwrap()
            .contains("Cannot read preload script"));
    }

    #[test]
    fn test_root_dir_affects_bun_cache_resolution() {
        // The module loader's Bun cache fallback starts from `self.root_dir`.
        // When root_dir is the workspace root (not the test file's parent),
        // packages in `node_modules/.bun/node_modules/` are found correctly.
        //
        // This test places a package ONLY in the Bun cache at the workspace root
        // and puts the test file in a sibling directory. Walk-up from the test
        // file's parent never reaches the workspace, so root_dir is the only
        // way the module loader finds the Bun cache.
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();

        // Workspace root: package ONLY in Bun's internal cache
        let workspace = base.join("workspace");
        let bun_cache_lib = workspace
            .join("node_modules")
            .join(".bun")
            .join("node_modules")
            .join("my-lib");
        fs::create_dir_all(&bun_cache_lib).unwrap();
        fs::write(
            bun_cache_lib.join("package.json"),
            r#"{"name": "my-lib", "main": "index.js"}"#,
        )
        .unwrap();
        fs::write(bun_cache_lib.join("index.js"), "export const value = 42;").unwrap();

        // Test file in a sibling directory (NOT under workspace/)
        let test_dir = base.join("isolated");
        fs::create_dir_all(&test_dir).unwrap();
        let test_file = test_dir.join("core.test.ts");
        fs::write(
            &test_file,
            r#"
            import { value } from 'my-lib';
            describe('bun cache import', () => {
                it('resolves from workspace root bun cache', () => {
                    expect(value).toBe(42);
                });
            });
            "#,
        )
        .unwrap();

        // Without root_dir: defaults to file parent (isolated/), walk-up never
        // reaches workspace/, Bun cache walk-up also starts from isolated/.
        // Import fails because my-lib is only in workspace's bun cache.
        let result_no_root = execute_test_file_with_options(
            &test_file,
            &ExecuteOptions {
                root_dir: None,
                ..Default::default()
            },
        );
        assert!(
            result_no_root.file_error.is_some(),
            "Without root_dir, should fail to find package in bun cache"
        );

        // With root_dir pointing to workspace: Bun cache walk-up starts from
        // workspace/, finds node_modules/.bun/node_modules/my-lib/.
        let result_with_root = execute_test_file_with_options(
            &test_file,
            &ExecuteOptions {
                root_dir: Some(workspace),
                ..Default::default()
            },
        );
        assert!(
            result_with_root.file_error.is_none(),
            "With root_dir, should resolve from bun cache: {:?}",
            result_with_root.file_error
        );
        assert_eq!(result_with_root.tests.len(), 1);
        assert_eq!(result_with_root.tests[0].status, TestStatus::Pass);
    }
}
