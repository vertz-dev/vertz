//! Shell IPC handlers.

use crate::webview::ipc_dispatcher::{IpcError, IpcErrorCode};
use crate::webview::ipc_method::{ShellExecuteParams, ShellOutputResponse};

/// Execute a command with arguments and return stdout/stderr/exit code.
///
/// The command is executed directly (not through a shell) to avoid injection risks.
pub async fn execute(params: ShellExecuteParams) -> Result<serde_json::Value, IpcError> {
    let output = tokio::process::Command::new(&params.command)
        .args(&params.args)
        .output()
        .await
        .map_err(|e| match e.kind() {
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
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
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
            args: vec!["hello".to_string()],
        };
        let result = execute(params).await.unwrap();
        let stdout = result["stdout"].as_str().unwrap();
        assert!(stdout.contains("hello"));
        assert_eq!(result["code"], 0);
    }

    #[tokio::test]
    async fn execute_returns_exit_code() {
        let params = ShellExecuteParams {
            command: "sh".to_string(),
            args: vec!["-c".to_string(), "exit 42".to_string()],
        };
        let result = execute(params).await.unwrap();
        assert_eq!(result["code"], 42);
    }

    #[tokio::test]
    async fn execute_captures_stderr() {
        let params = ShellExecuteParams {
            command: "sh".to_string(),
            args: vec!["-c".to_string(), "echo err >&2".to_string()],
        };
        let result = execute(params).await.unwrap();
        let stderr = result["stderr"].as_str().unwrap();
        assert!(stderr.contains("err"));
    }

    #[tokio::test]
    async fn execute_nonexistent_command_returns_error() {
        let params = ShellExecuteParams {
            command: "definitely-not-a-real-command-xyz".to_string(),
            args: vec![],
        };
        let err = execute(params).await.unwrap_err();
        assert!(matches!(err.code, IpcErrorCode::ExecutionFailed));
        assert!(err.message.contains("definitely-not-a-real-command-xyz"));
    }

    #[tokio::test]
    async fn execute_with_multiple_args() {
        let params = ShellExecuteParams {
            command: "printf".to_string(),
            args: vec![
                "%s %s".to_string(),
                "hello".to_string(),
                "world".to_string(),
            ],
        };
        let result = execute(params).await.unwrap();
        let stdout = result["stdout"].as_str().unwrap();
        assert!(stdout.contains("hello world"));
    }
}
