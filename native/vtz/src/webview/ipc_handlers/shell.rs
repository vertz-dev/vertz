//! Shell IPC handlers.

use std::sync::Arc;
use std::time::Duration;

use tokio::io::AsyncBufReadExt;
use tokio::process::Command;

use crate::webview::event_channel::EventChannel;
use crate::webview::ipc_dispatcher::{IpcError, IpcErrorCode};
use crate::webview::ipc_handlers::fs::expand_tilde;
use crate::webview::ipc_method::{
    ProcessKillParams, ShellExecuteParams, ShellOutputResponse, ShellSpawnParams,
    ShellSpawnResponse,
};
use crate::webview::process_map::ProcessMap;

/// Default Rust-side timeout for `shell.execute()` — prevents zombie processes when
/// the JS-side timeout (120s) fires but the Rust child process keeps running.
const EXECUTE_TIMEOUT: Duration = Duration::from_secs(300);

/// Safety margin added to the JS-side timeout before using it as the Rust-side timeout.
/// This ensures the JS timeout fires first (giving a clean error to the user), while
/// the Rust timeout acts as a safety net to kill the actual child process.
const TIMEOUT_SAFETY_MARGIN: Duration = Duration::from_secs(5);

/// Execute a command and wait for it to finish, returning stdout, stderr, and exit code.
///
/// The command is executed directly (not through a shell) to avoid injection risks.
/// Use `args` for all arguments — do NOT concatenate them into the command string.
///
/// When `params.timeout` is set (JS-side timeout in ms), the Rust-side timeout is
/// `timeout + SAFETY_MARGIN`. Otherwise falls back to the default 300s timeout.
pub async fn execute(params: ShellExecuteParams) -> Result<serde_json::Value, IpcError> {
    let timeout_duration = match params.timeout {
        Some(ms) => Duration::from_millis(ms) + TIMEOUT_SAFETY_MARGIN,
        None => EXECUTE_TIMEOUT,
    };
    execute_with_timeout(params, timeout_duration).await
}

/// Inner implementation with a configurable timeout — exposed for testing.
async fn execute_with_timeout(
    params: ShellExecuteParams,
    timeout_duration: Duration,
) -> Result<serde_json::Value, IpcError> {
    let mut cmd = tokio::process::Command::new(&params.command);

    if let Some(ref args) = params.args {
        cmd.args(args);
    }

    if let Some(ref cwd) = params.cwd {
        cmd.current_dir(expand_tilde(cwd));
    }

    if let Some(ref env) = params.env {
        cmd.envs(env);
    }

    // Pipe stdout/stderr so wait_with_output() can capture them.
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // Ensure the child process is killed when the future is dropped (e.g., on timeout).
    cmd.kill_on_drop(true);

    // Put the child in its own process group so we can kill the entire tree on timeout.
    #[cfg(unix)]
    cmd.process_group(0);

    let child = cmd.spawn().map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => IpcError {
            code: IpcErrorCode::ExecutionFailed,
            message: format!("Command not found: {}", params.command),
        },
        std::io::ErrorKind::PermissionDenied => IpcError {
            code: IpcErrorCode::ExecutionFailed,
            message: format!("Permission denied: {}", params.command),
        },
        _ => IpcError {
            code: IpcErrorCode::ExecutionFailed,
            message: format!("Failed to execute '{}': {}", params.command, e),
        },
    })?;

    // Save the child PID before moving it into wait_with_output().
    // With process_group(0), the PID is also the PGID.
    let child_pid = child.id().unwrap_or(0);

    let result = tokio::time::timeout(timeout_duration, child.wait_with_output()).await;

    match result {
        Ok(Ok(output)) => {
            let response = ShellOutputResponse {
                code: output.status.code().unwrap_or(-1),
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            };
            serde_json::to_value(response)
                .map_err(|e| IpcError::io_error(format!("Serialization error: {}", e)))
        }
        Ok(Err(e)) => Err(IpcError {
            code: IpcErrorCode::ExecutionFailed,
            message: format!("Failed to execute '{}': {}", params.command, e),
        }),
        Err(_) => {
            // Timeout — kill the entire process group, not just the direct child.
            // kill_on_drop handles the direct child; this handles subprocesses.
            #[cfg(unix)]
            if child_pid > 0 {
                // SAFETY: child_pid is a valid PID obtained from the spawned child.
                // Negating it targets the process group (PGID == PID with process_group(0)).
                unsafe {
                    libc::kill(-(child_pid as libc::pid_t), libc::SIGKILL);
                }
            }
            Err(IpcError {
                code: IpcErrorCode::Timeout,
                message: format!(
                    "Command '{}' timed out after {}s",
                    params.command,
                    timeout_duration.as_secs()
                ),
            })
        }
    }
}

/// Spawn a long-running process with streaming stdout/stderr via the event channel.
///
/// Returns the PID immediately. Output is pushed to JS via `EventChannel::emit()`.
/// The exit watcher guarantees all output is delivered before the exit event.
pub async fn spawn(
    params: ShellSpawnParams,
    event_channel: EventChannel,
    process_map: Arc<ProcessMap>,
) -> Result<serde_json::Value, IpcError> {
    let mut cmd = Command::new(&params.command);

    if let Some(ref args) = params.args {
        cmd.args(args);
    }

    if let Some(ref cwd) = params.cwd {
        cmd.current_dir(expand_tilde(cwd));
    }

    if let Some(ref env) = params.env {
        cmd.envs(env);
    }

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // Put the child in its own process group so kill() can terminate the entire tree.
    #[cfg(unix)]
    cmd.process_group(0);

    let mut child = cmd.spawn().map_err(|e| IpcError {
        code: IpcErrorCode::ExecutionFailed,
        message: format!("Failed to spawn '{}': {}", params.command, e),
    })?;

    let pid = child.id().ok_or_else(|| IpcError {
        code: IpcErrorCode::ExecutionFailed,
        message: format!("Failed to get PID for '{}'", params.command),
    })?;

    let sub_id = params.sub_id;
    process_map.insert(sub_id, pid);

    // Take ownership of stdout/stderr pipes
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Spawn stdout reader task
    let stdout_channel = event_channel.clone();
    let stdout_handle = tokio::spawn(async move {
        if let Some(stdout) = stdout {
            let reader = tokio::io::BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                stdout_channel.emit(sub_id, "stdout", &serde_json::Value::String(line));
            }
        }
    });

    // Spawn stderr reader task
    let stderr_channel = event_channel.clone();
    let stderr_handle = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let reader = tokio::io::BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                stderr_channel.emit(sub_id, "stderr", &serde_json::Value::String(line));
            }
        }
    });

    // Spawn exit watcher — awaits readers before emitting exit event
    let exit_channel = event_channel;
    let exit_process_map = process_map;
    tokio::spawn(async move {
        let status = child.wait().await;

        // Wait for both readers to finish — guarantees all output is delivered before exit
        let _ = stdout_handle.await;
        let _ = stderr_handle.await;

        // Remove from process map (idempotent — may already be removed by kill())
        exit_process_map.remove(sub_id);

        let exit_code = match status {
            Ok(s) => s.code().map(serde_json::Value::from),
            Err(_) => None,
        };

        exit_channel.emit(
            sub_id,
            "exit",
            &exit_code.unwrap_or(serde_json::Value::Null),
        );
    });

    let response = ShellSpawnResponse { pid };
    serde_json::to_value(response).map_err(|e| IpcError::io_error(format!("Serialization: {}", e)))
}

/// Kill a spawned process by subscription ID.
///
/// Idempotent — killing an already-exited process is not an error.
pub async fn kill(
    params: ProcessKillParams,
    process_map: Arc<ProcessMap>,
) -> Result<serde_json::Value, IpcError> {
    process_map.kill(params.sub_id).map_err(|e| IpcError {
        code: IpcErrorCode::ExecutionFailed,
        message: format!(
            "Failed to kill process for subscription {}: {}",
            params.sub_id, e
        ),
    })?;

    Ok(serde_json::Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn execute_echo_returns_stdout() {
        let params = ShellExecuteParams {
            command: "echo".to_string(),
            args: Some(vec!["hello".to_string()]),
            cwd: None,
            env: None,
            timeout: None,
        };
        let result = execute(params).await.unwrap();
        assert_eq!(result["code"], 0);
        assert_eq!(result["stdout"].as_str().unwrap().trim(), "hello");
        assert_eq!(result["stderr"], "");
    }

    #[tokio::test]
    async fn execute_nonexistent_command_returns_error() {
        let params = ShellExecuteParams {
            command: "this-command-does-not-exist-9999".to_string(),
            args: None,
            cwd: None,
            env: None,
            timeout: None,
        };
        let result = execute(params).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err.code, IpcErrorCode::ExecutionFailed));
        assert!(err.message.contains("this-command-does-not-exist-9999"));
    }

    #[tokio::test]
    async fn execute_with_cwd() {
        let params = ShellExecuteParams {
            command: "pwd".to_string(),
            args: None,
            cwd: Some("/tmp".to_string()),
            env: None,
            timeout: None,
        };
        let result = execute(params).await.unwrap();
        assert_eq!(result["code"], 0);
        // /tmp may resolve to /private/tmp on macOS
        let stdout = result["stdout"].as_str().unwrap().trim();
        assert!(
            stdout == "/tmp" || stdout == "/private/tmp",
            "unexpected cwd: {}",
            stdout
        );
    }

    #[tokio::test]
    async fn execute_with_env() {
        let params = ShellExecuteParams {
            command: "sh".to_string(),
            args: Some(vec!["-c".to_string(), "echo $VTZ_TEST_VAR".to_string()]),
            cwd: None,
            env: Some(
                [("VTZ_TEST_VAR".to_string(), "test_value".to_string())]
                    .into_iter()
                    .collect(),
            ),
            timeout: None,
        };
        let result = execute(params).await.unwrap();
        assert_eq!(result["code"], 0);
        assert_eq!(result["stdout"].as_str().unwrap().trim(), "test_value");
    }

    #[tokio::test]
    async fn execute_failing_command_returns_nonzero_code() {
        let params = ShellExecuteParams {
            command: "sh".to_string(),
            args: Some(vec!["-c".to_string(), "exit 42".to_string()]),
            cwd: None,
            env: None,
            timeout: None,
        };
        let result = execute(params).await.unwrap();
        assert_eq!(result["code"], 42);
    }

    #[tokio::test]
    async fn execute_captures_stderr() {
        let params = ShellExecuteParams {
            command: "sh".to_string(),
            args: Some(vec!["-c".to_string(), "echo error_output >&2".to_string()]),
            cwd: None,
            env: None,
            timeout: None,
        };
        let result = execute(params).await.unwrap();
        assert_eq!(result["code"], 0);
        assert!(result["stderr"].as_str().unwrap().contains("error_output"));
    }

    #[tokio::test]
    async fn execute_with_tilde_cwd() {
        let params = ShellExecuteParams {
            command: "pwd".to_string(),
            args: None,
            cwd: Some("~".to_string()),
            env: None,
            timeout: None,
        };
        let result = execute(params).await.unwrap();
        assert_eq!(result["code"], 0);
        // Should resolve to home directory, not literal "~"
        let stdout = result["stdout"].as_str().unwrap().trim();
        assert!(!stdout.contains('~'), "tilde was not expanded: {}", stdout);
    }

    #[tokio::test]
    async fn execute_response_uses_camel_case() {
        let params = ShellExecuteParams {
            command: "true".to_string(),
            args: None,
            cwd: None,
            env: None,
            timeout: None,
        };
        let result = execute(params).await.unwrap();
        // Verify the response keys are present (camelCase from serde)
        assert!(result.get("code").is_some());
        assert!(result.get("stdout").is_some());
        assert!(result.get("stderr").is_some());
    }

    #[tokio::test]
    async fn execute_with_multiple_args() {
        let params = ShellExecuteParams {
            command: "printf".to_string(),
            args: Some(vec![
                "%s %s".to_string(),
                "hello".to_string(),
                "world".to_string(),
            ]),
            cwd: None,
            env: None,
            timeout: None,
        };
        let result = execute(params).await.unwrap();
        let stdout = result["stdout"].as_str().unwrap();
        assert!(stdout.contains("hello world"));
    }

    // ── kill tests ──
    // (spawn tests that need EventLoop/EventChannel are tested in E2E tests,
    // since tao::EventLoop requires the main thread on macOS)

    #[tokio::test]
    async fn kill_nonexistent_process_succeeds() {
        let process_map = Arc::new(ProcessMap::new());
        let params = ProcessKillParams { sub_id: 999 };
        let result = kill(params, process_map).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), serde_json::Value::Null);
    }

    #[tokio::test]
    async fn kill_is_idempotent() {
        let process_map = Arc::new(ProcessMap::new());
        // Insert a fake PID that doesn't exist (ESRCH → success)
        process_map.insert(1, 999_999_999);

        let params = ProcessKillParams { sub_id: 1 };
        let result = kill(params, process_map.clone()).await;
        assert!(result.is_ok());

        // Second kill on same sub_id should also succeed
        let params2 = ProcessKillParams { sub_id: 1 };
        let result2 = kill(params2, process_map).await;
        assert!(result2.is_ok());
    }

    #[tokio::test]
    async fn kill_removes_from_process_map() {
        let process_map = Arc::new(ProcessMap::new());
        process_map.insert(5, 999_999_999);
        assert_eq!(process_map.len(), 1);

        let params = ProcessKillParams { sub_id: 5 };
        let _ = kill(params, process_map.clone()).await;
        assert!(process_map.is_empty());
    }

    // ── spawn unit tests (no EventLoop needed) ──
    // These test the command building and error handling logic

    #[tokio::test]
    async fn spawn_builds_command_with_args() {
        // Test that ShellSpawnParams correctly deserializes
        let params_json = serde_json::json!({
            "command": "echo",
            "args": ["hello", "world"],
            "subId": 1
        });
        let params: ShellSpawnParams = serde_json::from_value(params_json).unwrap();
        assert_eq!(params.command, "echo");
        assert_eq!(
            params.args,
            Some(vec!["hello".to_string(), "world".to_string()])
        );
        assert_eq!(params.sub_id, 1);
    }

    #[tokio::test]
    async fn spawn_params_with_cwd_and_env() {
        let params_json = serde_json::json!({
            "command": "ls",
            "cwd": "/tmp",
            "env": {"FOO": "bar"},
            "subId": 42
        });
        let params: ShellSpawnParams = serde_json::from_value(params_json).unwrap();
        assert_eq!(params.cwd, Some("/tmp".to_string()));
        assert_eq!(params.env.unwrap().get("FOO"), Some(&"bar".to_string()));
    }

    #[tokio::test]
    async fn shell_spawn_response_serialization() {
        let response = ShellSpawnResponse { pid: 12345 };
        let value = serde_json::to_value(response).unwrap();
        assert_eq!(value["pid"], 12345);
    }

    // ── timeout tests ──

    #[tokio::test]
    async fn execute_timeout_returns_error_and_kills_child() {
        let params = ShellExecuteParams {
            command: "sleep".to_string(),
            args: Some(vec!["30".to_string()]),
            cwd: None,
            env: None,
            timeout: None,
        };
        let start = std::time::Instant::now();
        let result = execute_with_timeout(params, Duration::from_secs(1)).await;
        let elapsed = start.elapsed();

        assert!(result.is_err(), "expected timeout error");
        let err = result.unwrap_err();
        assert!(matches!(err.code, IpcErrorCode::Timeout));
        assert!(
            err.message.contains("timed out"),
            "message: {}",
            err.message
        );
        assert!(err.message.contains("sleep"), "message: {}", err.message);
        // Should complete in ~1s, not 30s
        assert!(elapsed.as_secs() < 5, "took too long: {:?}", elapsed);
    }

    #[tokio::test]
    async fn execute_within_timeout_succeeds() {
        let params = ShellExecuteParams {
            command: "echo".to_string(),
            args: Some(vec!["fast".to_string()]),
            cwd: None,
            env: None,
            timeout: None,
        };
        let result = execute_with_timeout(params, Duration::from_secs(10)).await;
        assert!(result.is_ok(), "expected success: {:?}", result);
        let value = result.unwrap();
        assert_eq!(value["code"], 0);
        assert_eq!(value["stdout"].as_str().unwrap().trim(), "fast");
    }

    // ── #2509: Process group kill ──

    #[tokio::test]
    async fn execute_timeout_kills_entire_process_group() {
        let marker = std::env::temp_dir().join(format!("vtz_test_pgkill_{}", std::process::id()));
        // Clean up from any previous failed run
        let _ = std::fs::remove_file(&marker);

        let marker_path = marker.display().to_string();

        let params = ShellExecuteParams {
            command: "sh".to_string(),
            args: Some(vec![
                "-c".to_string(),
                // Start a background subprocess that writes a marker file after 2s.
                // If process group kill works, the subprocess dies and never writes the file.
                format!("(sleep 2 && echo alive > {}) & wait", marker_path),
            ]),
            cwd: None,
            env: None,
            timeout: None,
        };

        let result = execute_with_timeout(params, Duration::from_secs(1)).await;
        assert!(result.is_err(), "expected timeout error");

        // Wait long enough for the subprocess to write the marker (if it survived)
        tokio::time::sleep(Duration::from_secs(4)).await;

        assert!(
            !marker.exists(),
            "marker file exists — subprocess was NOT killed (process group kill failed)"
        );

        // Cleanup
        let _ = std::fs::remove_file(&marker);
    }

    // ── #2508: Custom timeout sync ──

    #[tokio::test]
    async fn execute_respects_custom_timeout_from_params() {
        let params = ShellExecuteParams {
            command: "sleep".to_string(),
            args: Some(vec!["60".to_string()]),
            cwd: None,
            env: None,
            timeout: Some(1000), // 1 second JS timeout
        };

        let start = std::time::Instant::now();
        let result = execute(params).await;
        let elapsed = start.elapsed();

        assert!(result.is_err(), "expected timeout error");
        assert!(
            matches!(result.unwrap_err().code, IpcErrorCode::Timeout),
            "expected Timeout error code"
        );
        // Should complete in ~6s (1s + 5s margin), NOT 300s default
        assert!(
            elapsed.as_secs() < 15,
            "Rust used default 300s timeout instead of custom: {:?}",
            elapsed
        );
    }

    #[tokio::test]
    async fn execute_timeout_zero_uses_safety_margin() {
        // timeout=0 means "immediate" from JS, but Rust adds the safety margin (5s)
        let params = ShellExecuteParams {
            command: "sleep".to_string(),
            args: Some(vec!["60".to_string()]),
            cwd: None,
            env: None,
            timeout: Some(0),
        };

        let start = std::time::Instant::now();
        let result = execute(params).await;
        let elapsed = start.elapsed();

        assert!(result.is_err(), "expected timeout error");
        // Should complete in ~5s (0ms + 5s margin), not 300s
        assert!(
            elapsed.as_secs() < 15,
            "timeout=0 should use safety margin, not default 300s: {:?}",
            elapsed
        );
    }

    #[tokio::test]
    async fn execute_default_timeout_when_no_custom() {
        // When no timeout is provided, should still work (backward compat)
        let params = ShellExecuteParams {
            command: "echo".to_string(),
            args: Some(vec!["hello".to_string()]),
            cwd: None,
            env: None,
            timeout: None,
        };
        let result = execute(params).await;
        assert!(result.is_ok(), "expected success: {:?}", result);
    }
}
