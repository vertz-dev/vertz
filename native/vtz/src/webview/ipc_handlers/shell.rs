//! Shell IPC handlers.

use crate::webview::ipc_dispatcher::{IpcError, IpcErrorCode};
use crate::webview::ipc_handlers::fs::expand_tilde;
use crate::webview::ipc_method::{ShellExecuteParams, ShellOutputResponse};

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
}
