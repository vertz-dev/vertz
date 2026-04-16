use deno_core::op2;
use deno_core::OpDecl;
use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};

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

/// Check if a file descriptor refers to a TTY.
#[op2(fast)]
pub fn op_is_tty(#[smi] fd: u32) -> bool {
    // SAFETY: isatty is safe to call with any fd value — returns 0 for invalid fds.
    unsafe { libc::isatty(fd as libc::c_int) != 0 }
}

/// Write raw string to stdout (fd 1). No newline appended.
/// Always returns `true` — Node.js returns `false` for backpressure, but
/// this shim writes synchronously and does not implement drain events.
#[op2(fast)]
pub fn op_write_stdout(#[string] data: &str) -> Result<bool, deno_core::error::AnyError> {
    use std::io::Write;
    std::io::stdout().write_all(data.as_bytes())?;
    std::io::stdout().flush()?;
    Ok(true)
}

/// Write raw string to stderr (fd 2). No newline appended.
#[op2(fast)]
pub fn op_write_stderr(#[string] data: &str) -> Result<bool, deno_core::error::AnyError> {
    use std::io::Write;
    std::io::stderr().write_all(data.as_bytes())?;
    std::io::stderr().flush()?;
    Ok(true)
}

/// Global storage for spawned child process handles, keyed by PID.
/// Child handles are removed before calling `wait()` to avoid holding
/// the lock while blocking.
fn spawned_children() -> &'static Mutex<HashMap<u32, std::process::Child>> {
    static CHILDREN: OnceLock<Mutex<HashMap<u32, std::process::Child>>> = OnceLock::new();
    CHILDREN.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Set of PIDs that we spawned. Kept separate from the Child handles
/// so that `op_process_kill` can verify a PID without needing to hold
/// the children lock (which `op_process_wait` may be blocking on).
fn known_pids() -> &'static Mutex<std::collections::HashSet<u32>> {
    static PIDS: OnceLock<Mutex<std::collections::HashSet<u32>>> = OnceLock::new();
    PIDS.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

/// Spawn a child process asynchronously and return its PID.
///
/// The `stdio` parameter controls stdin/stdout/stderr:
/// - `"inherit"` — child inherits parent's file descriptors
/// - `"ignore"` — child's stdio is connected to /dev/null
/// - `"pipe"` or `null` — default piped (not yet exposed as streams)
#[op2]
#[serde]
pub fn op_process_spawn(
    #[string] file: String,
    #[serde] args: Vec<String>,
    #[string] cwd: Option<String>,
    #[serde] env: Option<HashMap<String, String>>,
    #[string] stdio: Option<String>,
) -> Result<serde_json::Value, deno_core::error::AnyError> {
    let mut cmd = Command::new(&file);
    cmd.args(&args);

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    if let Some(env_map) = env {
        cmd.env_clear();
        for (key, value) in env_map {
            cmd.env(key, value);
        }
    }

    match stdio.as_deref() {
        Some("inherit") => {
            cmd.stdin(Stdio::inherit());
            cmd.stdout(Stdio::inherit());
            cmd.stderr(Stdio::inherit());
        }
        Some("ignore") => {
            cmd.stdin(Stdio::null());
            cmd.stdout(Stdio::null());
            cmd.stderr(Stdio::null());
        }
        _ => {
            cmd.stdin(Stdio::piped());
            cmd.stdout(Stdio::piped());
            cmd.stderr(Stdio::piped());
        }
    }

    let child = cmd.spawn().map_err(|e| {
        deno_core::error::type_error(format!("Failed to spawn process '{file}': {e}"))
    })?;

    let pid = child.id();
    // Mutex poisoning can only happen if a thread panicked while holding the
    // lock. All lock holders run trivial insert/remove operations with no
    // user code, so poisoning is not expected. Propagate as an op error
    // rather than panicking the runtime.
    known_pids()
        .lock()
        .map_err(|e| deno_core::error::type_error(format!("Internal lock error: {e}")))?
        .insert(pid);
    spawned_children()
        .lock()
        .map_err(|e| deno_core::error::type_error(format!("Internal lock error: {e}")))?
        .insert(pid, child);

    Ok(serde_json::json!({ "pid": pid }))
}

/// Wait for a spawned child process to exit. Returns `{ code, signal }`.
///
/// The child handle is removed from the map before calling `wait()` so
/// that the lock is not held while blocking — otherwise `op_process_kill`
/// would deadlock trying to acquire the same lock.
#[op2(async)]
#[serde]
pub async fn op_process_wait(
    #[smi] pid: u32,
) -> Result<serde_json::Value, deno_core::error::AnyError> {
    let result = tokio::task::spawn_blocking(move || {
        // Take the child out of the map so we can wait without holding the lock.
        let mut child = {
            let mut children = spawned_children()
                .lock()
                .map_err(|e| deno_core::error::type_error(format!("Internal lock error: {e}")))?;
            children.remove(&pid).ok_or_else(|| {
                deno_core::error::type_error(format!("No child process with pid {pid}"))
            })?
        };

        let status = child.wait().map_err(|e| {
            deno_core::error::type_error(format!("Failed to wait for process {pid}: {e}"))
        })?;

        // Remove from known PIDs after process has exited.
        known_pids()
            .lock()
            .map_err(|e| deno_core::error::type_error(format!("Internal lock error: {e}")))?
            .remove(&pid);

        let code = status.code().unwrap_or(-1);

        #[cfg(unix)]
        let signal = {
            use std::os::unix::process::ExitStatusExt;
            status.signal()
        };
        #[cfg(not(unix))]
        let signal: Option<i32> = None;

        Ok(serde_json::json!({ "code": code, "signal": signal }))
    })
    .await
    .map_err(|e| deno_core::error::type_error(format!("Join error: {e}")))?;

    result
}

/// Send a signal to a spawned child process.
#[op2(fast)]
pub fn op_process_kill(
    #[smi] pid: u32,
    #[string] signal: String,
) -> Result<(), deno_core::error::AnyError> {
    // Verify the process is one we spawned (security: don't allow killing arbitrary PIDs).
    // Uses `known_pids` instead of `spawned_children` to avoid contention with
    // `op_process_wait` which may have removed the handle while waiting.
    //
    // Note on PID recycling: Between a child exiting and `op_process_wait`
    // cleaning up `known_pids`, the OS could theoretically recycle the PID.
    // The JS shim guards against this by checking `exited` before calling kill,
    // and the race window (child exit → wait() return) is effectively zero.
    {
        let pids = known_pids()
            .lock()
            .map_err(|e| deno_core::error::type_error(format!("Internal lock error: {e}")))?;
        if !pids.contains(&pid) {
            return Err(deno_core::error::type_error(format!(
                "No child process with pid {pid}"
            )));
        }
    }

    #[cfg(unix)]
    {
        // SAFETY: kill() is safe to call with any pid/signal combination —
        // it returns -1/ESRCH for invalid pids, -1/EINVAL for invalid signals.
        let sig = match signal.as_str() {
            "SIGTERM" | "15" => libc::SIGTERM,
            "SIGKILL" | "9" => libc::SIGKILL,
            "SIGINT" | "2" => libc::SIGINT,
            "SIGHUP" | "1" => libc::SIGHUP,
            _ => libc::SIGTERM,
        };
        let ret = unsafe { libc::kill(pid as libc::pid_t, sig) };
        if ret != 0 {
            let errno = std::io::Error::last_os_error();
            return Err(deno_core::error::type_error(format!(
                "Failed to send {signal} to process {pid}: {errno}"
            )));
        }
    }

    #[cfg(not(unix))]
    {
        // On non-Unix, try using the Child handle if still available.
        let mut children = spawned_children()
            .lock()
            .map_err(|e| deno_core::error::type_error(format!("Internal lock error: {e}")))?;
        if let Some(child) = children.get_mut(&pid) {
            child.kill().map_err(|e| {
                deno_core::error::type_error(format!("Failed to kill process {pid}: {e}"))
            })?;
        }
    }

    Ok(())
}

/// Get the op declarations for process ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![
        op_command_output_sync(),
        op_is_tty(),
        op_write_stdout(),
        op_write_stderr(),
        op_process_spawn(),
        op_process_wait(),
        op_process_kill(),
    ]
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

    #[test]
    fn test_op_is_tty_via_js() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                // fd 1 (stdout) — may or may not be TTY in test runner
                const isTty = Deno.core.ops.op_is_tty(1);
                typeof isTty === 'boolean'
                "#,
            )
            .unwrap();
        assert_eq!(result, true);
    }

    #[test]
    fn test_op_write_stdout_via_js() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const ok = Deno.core.ops.op_write_stdout("test_output");
                ok
                "#,
            )
            .unwrap();
        assert_eq!(result, true);
    }

    #[test]
    fn test_op_write_stderr_via_js() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const ok = Deno.core.ops.op_write_stderr("test_error");
                ok
                "#,
            )
            .unwrap();
        assert_eq!(result, true);
    }

    #[test]
    fn test_op_process_spawn_returns_pid() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const result = Deno.core.ops.op_process_spawn(
                    "sleep", ["0.1"], null, null, "ignore"
                );
                typeof result.pid === 'number' && result.pid > 0
                "#,
            )
            .unwrap();
        assert_eq!(result, true);
    }

    #[test]
    fn test_op_process_spawn_invalid_command() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                try {
                    Deno.core.ops.op_process_spawn(
                        "nonexistent_command_xyz_456", [], null, null, null
                    );
                    "no_error"
                } catch (e) {
                    "error"
                }
                "#,
            )
            .unwrap();
        assert_eq!(result, "error");
    }

    #[tokio::test]
    async fn test_op_process_spawn_and_wait() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        rt.execute_script_void(
            "<test>",
            r#"
            (async () => {
                const { pid } = Deno.core.ops.op_process_spawn(
                    "echo", ["hello"], null, null, "ignore"
                );
                const result = await Deno.core.ops.op_process_wait(pid);
                globalThis.__test_exit_code = result.code;
            })();
            "#,
        )
        .unwrap();
        rt.run_event_loop().await.unwrap();
        let result = rt
            .execute_script("<test>", "globalThis.__test_exit_code")
            .unwrap();
        assert_eq!(result, 0);
    }

    #[tokio::test]
    async fn test_op_process_spawn_nonzero_exit() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        rt.execute_script_void(
            "<test>",
            r#"
            (async () => {
                const { pid } = Deno.core.ops.op_process_spawn(
                    "false", [], null, null, "ignore"
                );
                const result = await Deno.core.ops.op_process_wait(pid);
                globalThis.__test_exit_code = result.code;
            })();
            "#,
        )
        .unwrap();
        rt.run_event_loop().await.unwrap();
        let result = rt
            .execute_script("<test>", "globalThis.__test_exit_code")
            .unwrap();
        assert_eq!(result, 1);
    }

    #[test]
    fn test_op_process_kill_unknown_pid() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                try {
                    Deno.core.ops.op_process_kill(99999999, "SIGTERM");
                    "no_error"
                } catch (e) {
                    "error"
                }
                "#,
            )
            .unwrap();
        assert_eq!(result, "error");
    }

    #[tokio::test]
    async fn test_op_process_spawn_kill_and_wait() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        rt.execute_script_void(
            "<test>",
            r#"
            (async () => {
                const { pid } = Deno.core.ops.op_process_spawn(
                    "sleep", ["60"], null, null, "ignore"
                );
                Deno.core.ops.op_process_kill(pid, "SIGTERM");
                const result = await Deno.core.ops.op_process_wait(pid);
                // Process was killed by signal, code is typically -1 or 143
                globalThis.__test_was_killed = result.code !== 0 || result.signal != null;
            })();
            "#,
        )
        .unwrap();
        rt.run_event_loop().await.unwrap();
        let result = rt
            .execute_script("<test>", "globalThis.__test_was_killed")
            .unwrap();
        assert_eq!(result, true);
    }

    #[tokio::test]
    async fn test_op_process_wait_double_wait_errors() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        rt.execute_script_void(
            "<test>",
            r#"
            (async () => {
                const { pid } = Deno.core.ops.op_process_spawn(
                    "true", [], null, null, "ignore"
                );
                // First wait should succeed
                await Deno.core.ops.op_process_wait(pid);
                // Second wait should fail — child handle was already consumed
                try {
                    await Deno.core.ops.op_process_wait(pid);
                    globalThis.__test_double_wait = "no_error";
                } catch (e) {
                    globalThis.__test_double_wait = "error";
                }
            })();
            "#,
        )
        .unwrap();
        rt.run_event_loop().await.unwrap();
        let result = rt
            .execute_script("<test>", "globalThis.__test_double_wait")
            .unwrap();
        assert_eq!(result, "error");
    }

    #[tokio::test]
    async fn test_op_process_spawn_with_env() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        rt.execute_script_void(
            "<test>",
            r#"
            (async () => {
                const { pid } = Deno.core.ops.op_process_spawn(
                    "/usr/bin/env", [], null, { "MY_TEST_VAR": "hello_spawn" }, "pipe"
                );
                const result = await Deno.core.ops.op_process_wait(pid);
                globalThis.__test_env_code = result.code;
            })();
            "#,
        )
        .unwrap();
        rt.run_event_loop().await.unwrap();
        let result = rt
            .execute_script("<test>", "globalThis.__test_env_code")
            .unwrap();
        // env with custom var should exit 0
        assert_eq!(result, 0);
    }
}
