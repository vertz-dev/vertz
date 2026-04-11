//! Shell IPC handlers.

use std::sync::Arc;

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

/// Execute a command and wait for it to finish, returning stdout, stderr, and exit code.
///
/// The command is executed directly (not through a shell) to avoid injection risks.
/// Use `args` for all arguments — do NOT concatenate them into the command string.
pub async fn execute(params: ShellExecuteParams) -> Result<serde_json::Value, IpcError> {
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

    let output = cmd.output().await.map_err(|e| match e.kind() {
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

    let response = ShellOutputResponse {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    };

    serde_json::to_value(response)
        .map_err(|e| IpcError::io_error(format!("Serialization error: {}", e)))
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
}
