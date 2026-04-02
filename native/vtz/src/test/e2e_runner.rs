//! E2E test runner — orchestrates webview + dev server for e2e test execution.
//!
//! This module is only compiled with the `desktop` feature.

use std::path::Path;
use std::time::Instant;

use deno_core::ModuleSpecifier;
use tao::event_loop::EventLoopProxy;

use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};
use crate::runtime::ops::e2e;
use crate::server::http::{start_server_with_lifecycle, ServerConfig, ServerLifecycle};
use crate::webview::bridge::WebviewBridge;
use crate::webview::UserEvent;

use super::collector::{discover_test_files, DiscoveryMode};
use super::executor::{parse_test_results, TestFileResult, TestResult};
use super::reporter::terminal::format_results;
use super::runner::{ReporterFormat, TestRunConfig, TestRunResult};

/// Run the full e2e test suite. Async entry point for the background thread.
///
/// Starts the dev server, navigates the webview, discovers `.e2e.ts` files,
/// runs them sequentially with the page API available, and returns results.
pub async fn run_e2e_tests(
    config: TestRunConfig,
    server_config: ServerConfig,
    proxy: EventLoopProxy<UserEvent>,
) -> (TestRunResult, String) {
    let bridge = WebviewBridge::new(proxy);

    // Start the dev server with lifecycle control
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();

    let lifecycle = ServerLifecycle {
        ready_tx,
        shutdown_rx,
    };

    let server_cfg = server_config;
    tokio::spawn(async move {
        if let Err(e) = start_server_with_lifecycle(server_cfg, Some(lifecycle)).await {
            eprintln!("[e2e] server error: {}", e);
        }
    });

    // Wait for the server to be ready
    let port = match ready_rx.await {
        Ok(port) => port,
        Err(_) => {
            eprintln!("[e2e] server failed to start");
            let _ = shutdown_tx.send(());
            return (empty_result(), String::new());
        }
    };

    let app_url = format!("http://localhost:{}", port);

    // Navigate the webview to the app
    if let Err(e) = bridge
        .eval(
            &format!(
                "(() => {{ window.location.href = '{}'; return 'ok'; }})()",
                app_url
            ),
            10_000,
        )
        .await
    {
        eprintln!("[e2e] failed to navigate to app: {}", e);
        let _ = shutdown_tx.send(());
        return (empty_result(), String::new());
    }

    // Give the page time to load
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Discover e2e test files
    let files = discover_test_files(
        &config.root_dir,
        &config.paths,
        &config.include,
        &config.exclude,
        DiscoveryMode::E2e,
    );

    if files.is_empty() {
        let _ = shutdown_tx.send(());
        let result = empty_result();
        let output = format_output(&config.reporter, &result);
        return (result, output);
    }

    // Run test files sequentially
    let mut results = Vec::new();
    let mut bail_triggered = false;

    for file in &files {
        // Reset webview state between files
        let _ = bridge
            .eval("localStorage.clear(); sessionStorage.clear()", 5_000)
            .await;
        let _ = bridge
            .eval(
                &format!(
                    "(() => {{ window.location.href = '{}'; return 'ok'; }})()",
                    app_url
                ),
                10_000,
            )
            .await;
        // Wait for page to be ready after navigation
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;

        let result = execute_e2e_test_file(file, &config, &bridge).await;
        let has_failure = result.failed() > 0 || result.file_error.is_some();
        results.push(result);

        if config.bail && has_failure {
            bail_triggered = true;
            break;
        }
    }

    // Shut down the server
    let _ = shutdown_tx.send(());

    // Build the run result
    let total_files = results.len();
    let total_passed: usize = results.iter().map(|r| r.passed()).sum();
    let total_failed: usize = results.iter().map(|r| r.failed()).sum();
    let total_skipped: usize = results.iter().map(|r| r.skipped()).sum();
    let total_todo: usize = results.iter().map(|r| r.todo()).sum();
    let file_errors = results.iter().filter(|r| r.file_error.is_some()).count();

    let run_result = TestRunResult {
        results,
        total_passed,
        total_failed,
        total_skipped,
        total_todo,
        total_files,
        file_errors,
        coverage_failed: false,
        coverage_report: None,
    };

    let output = if bail_triggered {
        format!(
            "{}\n[e2e] Bail: stopping after first failure.\n",
            format_output(&config.reporter, &run_result)
        )
    } else {
        format_output(&config.reporter, &run_result)
    };

    (run_result, output)
}

/// Execute a single e2e test file with the webview bridge injected.
async fn execute_e2e_test_file(
    file_path: &Path,
    config: &TestRunConfig,
    bridge: &WebviewBridge,
) -> TestFileResult {
    let file_str = file_path.to_string_lossy().to_string();
    let start = Instant::now();
    let root_dir = config.root_dir.to_string_lossy().to_string();

    match execute_e2e_inner(file_path, &root_dir, config, bridge).await {
        Ok(tests) => TestFileResult {
            file: file_str,
            tests,
            duration_ms: start.elapsed().as_secs_f64() * 1000.0,
            file_error: None,
            coverage_data: None,
        },
        Err(err) => TestFileResult {
            file: file_str,
            tests: vec![],
            duration_ms: start.elapsed().as_secs_f64() * 1000.0,
            file_error: Some(err.to_string()),
            coverage_data: None,
        },
    }
}

async fn execute_e2e_inner(
    file_path: &Path,
    root_dir: &str,
    config: &TestRunConfig,
    bridge: &WebviewBridge,
) -> Result<Vec<TestResult>, deno_core::error::AnyError> {
    let mut runtime = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
        root_dir: Some(root_dir.to_string()),
        capture_output: true,
        enable_inspector: false,
        compile_cache: !config.no_cache,
    })?;

    // Put WebviewBridge in OpState so e2e ops can access it
    {
        let op_state = runtime.inner_mut().op_state();
        let mut state = op_state.borrow_mut();
        state.put(bridge.clone());
    }

    // Execute e2e bootstrap JS (sets up globalThis.__vtz_e2e_page)
    runtime.execute_script_void("[vertz:e2e-bootstrap]", e2e::E2E_BOOTSTRAP_JS)?;

    // Expose page as a top-level global for convenience
    runtime.execute_script_void(
        "[vertz:e2e-page]",
        "globalThis.page = globalThis.__vtz_e2e_page;",
    )?;

    // Set test name filter if provided
    if let Some(ref filter) = config.filter {
        let escaped = filter.replace('\\', "\\\\").replace('\'', "\\'");
        runtime.execute_script_void(
            "[vertz:set-filter]",
            &format!("globalThis.__vertz_test_filter = '{}'", escaped),
        )?;
    }

    // Load the test file as an ES module
    let specifier = ModuleSpecifier::from_file_path(file_path)
        .map_err(|_| deno_core::anyhow::anyhow!("Invalid file path: {}", file_path.display()))?;

    runtime.load_main_module(&specifier).await?;

    // Run all registered tests (with timeout)
    let timeout_ms = config.timeout_ms;
    let timeout_duration = if timeout_ms > 0 {
        Some(std::time::Duration::from_millis(timeout_ms))
    } else {
        None
    };

    runtime.execute_script_void(
        "[vertz:run-tests]",
        "globalThis.__vertz_run_tests().then(r => globalThis.__test_results = r)",
    )?;

    if let Some(timeout) = timeout_duration {
        match tokio::time::timeout(timeout, runtime.run_event_loop()).await {
            Ok(result) => result?,
            Err(_) => {
                return Err(deno_core::anyhow::anyhow!(
                    "E2E test execution timed out after {}ms",
                    timeout_ms
                ));
            }
        }
    } else {
        runtime.run_event_loop().await?;
    }

    let results_json = runtime.execute_script("[vertz:collect]", "globalThis.__test_results")?;
    parse_test_results(&results_json)
}

fn format_output(reporter: &ReporterFormat, result: &TestRunResult) -> String {
    match reporter {
        ReporterFormat::Terminal => format_results(&result.results),
        ReporterFormat::Json => super::reporter::json::format_json(&result.results),
        ReporterFormat::Junit => super::reporter::junit::format_junit(&result.results),
    }
}

fn empty_result() -> TestRunResult {
    TestRunResult {
        results: vec![],
        total_passed: 0,
        total_failed: 0,
        total_skipped: 0,
        total_todo: 0,
        total_files: 0,
        file_errors: 0,
        coverage_failed: false,
        coverage_report: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_result_reports_success() {
        let result = empty_result();
        assert!(result.success());
        assert_eq!(result.total_files, 0);
    }
}
