use deno_core::op2;
use deno_core::OpDecl;
use std::collections::HashMap;
use std::process::Command;

/// Synchronously spawn a child process and capture its output.
///
/// Returns a tuple of (exit_code, stdout, stderr).
/// The `cwd` and `env` parameters are optional.
#[op2]
#[serde]
pub fn op_command_output_sync(
    #[string] file: String,
    #[serde] args: Vec<String>,
    #[string] cwd: Option<String>,
    #[serde] env: Option<HashMap<String, String>>,
) -> Result<(i32, String, String), deno_core::error::AnyError> {
    let mut cmd = Command::new(&file);
    cmd.args(&args);

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    if let Some(env_map) = env {
        // Node.js replaces the entire environment when opts.env is set.
        cmd.env_clear();
        for (key, value) in env_map {
            cmd.env(key, value);
        }
    }

    let output = cmd.output().map_err(|e| {
        deno_core::error::type_error(format!("Failed to execute command '{file}': {e}"))
    })?;

    let code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok((code, stdout, stderr))
}

/// Get the op declarations for process ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_command_output_sync()]
}

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    #[test]
    fn test_op_command_output_sync_echo() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const [code, stdout, stderr] = Deno.core.ops.op_command_output_sync(
                    "echo", ["hello"], null, null
                );
                ({ code, stdout: stdout.trim(), stderr })
                "#,
            )
            .unwrap();
        assert_eq!(result["code"], 0);
        assert_eq!(result["stdout"], "hello");
    }

    #[test]
    fn test_op_command_output_sync_nonzero_exit() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const [code, stdout, stderr] = Deno.core.ops.op_command_output_sync(
                    "false", [], null, null
                );
                code
                "#,
            )
            .unwrap();
        assert_eq!(result, 1);
    }

    #[test]
    fn test_op_command_output_sync_with_cwd() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const [code, stdout, stderr] = Deno.core.ops.op_command_output_sync(
                    "pwd", [], "/tmp", null
                );
                ({ code, stdout: stdout.trim() })
                "#,
            )
            .unwrap();
        // On macOS, /tmp is a symlink to /private/tmp
        let stdout = result["stdout"].as_str().unwrap();
        assert_eq!(result["code"], 0);
        assert!(stdout == "/tmp" || stdout == "/private/tmp");
    }

    #[test]
    fn test_op_command_output_sync_env_replaces_parent() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        // When env is provided, parent env should be cleared (Node.js semantics).
        // We set a custom var and verify HOME is not inherited.
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const [code, stdout, stderr] = Deno.core.ops.op_command_output_sync(
                    "/usr/bin/env", [], null, { "CUSTOM_VAR": "hello" }
                );
                // `env` should only list CUSTOM_VAR, not inherited vars
                const hasHome = stdout.includes('HOME=');
                const hasCustom = stdout.includes('CUSTOM_VAR=hello');
                ({ hasHome, hasCustom })
                "#,
            )
            .unwrap();
        assert_eq!(result["hasHome"], false);
        assert_eq!(result["hasCustom"], true);
    }

    #[test]
    fn test_op_command_output_sync_invalid_command() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script(
            "<test>",
            r#"
            try {
                Deno.core.ops.op_command_output_sync(
                    "nonexistent_command_xyz_123", [], null, null
                );
                "no_error"
            } catch (e) {
                "error"
            }
            "#,
        );
        assert_eq!(result.unwrap(), "error");
    }
}
