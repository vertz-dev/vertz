use crate::errors::broadcaster::ErrorBroadcaster;
use crate::errors::categories::{DevError, ErrorCategory};
use crate::typecheck::parser::{parse_tsc_line, DiagnosticBuffer};
use std::path::{Path, PathBuf};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::task::JoinHandle;

/// Result of type checker binary detection.
#[derive(Debug, Clone, PartialEq)]
pub struct CheckerBinary {
    /// Path to the binary.
    pub path: PathBuf,
    /// Display name (e.g., "tsgo" or "tsc").
    pub name: String,
}

/// Detect the best available type checker binary.
///
/// Priority order:
/// 1. Explicit binary path (from --typecheck-binary)
/// 2. Local tsgo (node_modules/.bin/tsgo)
/// 3. Global tsgo (in PATH)
/// 4. Local tsc (node_modules/.bin/tsc)
/// 5. Global tsc (in PATH)
///
/// Returns None if no type checker is found.
pub fn detect_checker(root_dir: &Path, explicit_binary: Option<&Path>) -> Option<CheckerBinary> {
    // 1. Explicit binary override
    if let Some(binary) = explicit_binary {
        if binary.exists() {
            let name = binary
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("custom")
                .to_string();
            return Some(CheckerBinary {
                path: binary.to_path_buf(),
                name,
            });
        }
        return None;
    }

    let node_modules_bin = root_dir.join("node_modules").join(".bin");

    // 2. Local tsgo
    let local_tsgo = node_modules_bin.join("tsgo");
    if local_tsgo.exists() {
        return Some(CheckerBinary {
            path: local_tsgo,
            name: "tsgo".to_string(),
        });
    }

    // 3. Global tsgo
    if let Ok(path) = which::which("tsgo") {
        return Some(CheckerBinary {
            path,
            name: "tsgo".to_string(),
        });
    }

    // 4. Local tsc
    let local_tsc = node_modules_bin.join("tsc");
    if local_tsc.exists() {
        return Some(CheckerBinary {
            path: local_tsc,
            name: "tsc".to_string(),
        });
    }

    // 5. Global tsc
    if let Ok(path) = which::which("tsc") {
        return Some(CheckerBinary {
            path,
            name: "tsc".to_string(),
        });
    }

    None
}

/// Handle to a running type checker process.
///
/// Implements `Drop` to kill the child process on server shutdown or panic,
/// preventing zombie tsc/tsgo processes from accumulating.
pub struct TypeCheckHandle {
    /// The child process (None after stop/drop).
    child: Option<Child>,
    /// Stdout reader task.
    stdout_task: Option<JoinHandle<()>>,
    /// Stderr reader task.
    stderr_task: Option<JoinHandle<()>>,
    /// Name of the checker binary (for logging).
    pub checker_name: String,
}

impl TypeCheckHandle {
    /// Stop the type checker process gracefully.
    pub async fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
        }
        if let Some(task) = self.stdout_task.take() {
            task.abort();
        }
        if let Some(task) = self.stderr_task.take() {
            task.abort();
        }
    }
}

impl Drop for TypeCheckHandle {
    fn drop(&mut self) {
        // Kill the child process synchronously to prevent zombie processes.
        // We can't use async in Drop, so we use start_kill() which sends SIGKILL.
        if let Some(ref mut child) = self.child {
            let _ = child.start_kill();
        }
        if let Some(task) = self.stdout_task.take() {
            task.abort();
        }
        if let Some(task) = self.stderr_task.take() {
            task.abort();
        }
    }
}

/// Start the type checker process.
///
/// Spawns the checker with `--noEmit --watch --pretty false --preserveWatchOutput`
/// and wires stdout/stderr readers to the ErrorBroadcaster.
///
/// Returns None if the checker binary is not found.
pub async fn start_typecheck(
    checker: &CheckerBinary,
    tsconfig_path: Option<&Path>,
    broadcaster: ErrorBroadcaster,
    root_dir: Option<std::path::PathBuf>,
) -> std::io::Result<TypeCheckHandle> {
    let mut cmd = Command::new(&checker.path);
    cmd.arg("--noEmit")
        .arg("--watch")
        .arg("--pretty")
        .arg("false")
        .arg("--preserveWatchOutput");

    if let Some(tsconfig) = tsconfig_path {
        cmd.arg("--project").arg(tsconfig);
    }

    cmd.stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn()?;

    let checker_name = checker.name.clone();

    // Spawn stdout reader
    let stdout = child.stdout.take().expect("stdout was piped");
    let stdout_broadcaster = broadcaster.clone();
    let stdout_checker_name = checker_name.clone();
    let stdout_root_dir = root_dir;
    let stdout_task = tokio::spawn(async move {
        read_stdout(
            stdout,
            stdout_broadcaster,
            &stdout_checker_name,
            stdout_root_dir,
        )
        .await;
    });

    // Spawn stderr reader
    let stderr = child.stderr.take().expect("stderr was piped");
    let stderr_broadcaster = broadcaster;
    let stderr_task = tokio::spawn(async move {
        read_stderr(stderr, stderr_broadcaster).await;
    });

    eprintln!("[Server] TypeScript checking started ({})...", checker_name);

    Ok(TypeCheckHandle {
        child: Some(child),
        stdout_task: Some(stdout_task),
        stderr_task: Some(stderr_task),
        checker_name,
    })
}

/// Read stdout lines from the type checker and pipe to the error broadcaster.
async fn read_stdout(
    stdout: tokio::process::ChildStdout,
    broadcaster: ErrorBroadcaster,
    checker_name: &str,
    root_dir: Option<std::path::PathBuf>,
) {
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    let mut buffer = DiagnosticBuffer::new();
    let mut first_sentinel = true;
    let start_time = std::time::Instant::now();

    while let Ok(Some(line)) = lines.next_line().await {
        let parsed = parse_tsc_line(&line);

        if let Some(errors) = buffer.feed(parsed) {
            // Sentinel line received — enrich with snippets and flush to broadcaster
            let enriched: Vec<DevError> = if let Some(ref dir) = root_dir {
                let mut result = Vec::with_capacity(errors.len());
                for e in errors {
                    result.push(enrich_with_snippet(e, dir).await);
                }
                result
            } else {
                errors
            };

            let error_count = enriched.len();
            broadcaster
                .replace_category(ErrorCategory::TypeCheck, enriched)
                .await;

            if first_sentinel {
                let elapsed = start_time.elapsed();
                eprintln!(
                    "[Server] TypeScript checking complete ({} error{}, {:.1}s)",
                    error_count,
                    if error_count == 1 { "" } else { "s" },
                    elapsed.as_secs_f64()
                );
                first_sentinel = false;
            }
        }
    }

    // EOF — tsc process exited
    eprintln!(
        "[Server] Type checker ({}) exited — type checking disabled",
        checker_name
    );
    broadcaster.clear_category(ErrorCategory::TypeCheck).await;
}

/// Enrich a DevError with a code snippet from the source file.
///
/// Uses async file I/O to avoid blocking the tokio runtime thread.
async fn enrich_with_snippet(error: DevError, root_dir: &std::path::Path) -> DevError {
    if error.code_snippet.is_some() {
        return error;
    }
    if let (Some(ref file), Some(line)) = (&error.file, error.line) {
        let file_path = root_dir.join(file);
        // Validate path is within root_dir to prevent path traversal
        if let Ok(canonical) = file_path.canonicalize() {
            if let Ok(canonical_root) = root_dir.canonicalize() {
                if !canonical.starts_with(&canonical_root) {
                    return error;
                }
            }
        }
        if let Ok(source) = tokio::fs::read_to_string(&file_path).await {
            let snippet = crate::errors::categories::extract_snippet(&source, line, 2);
            if !snippet.is_empty() {
                return error.with_snippet(snippet);
            }
        }
    }
    error
}

/// Read stderr lines and report fatal errors.
async fn read_stderr(stderr: tokio::process::ChildStderr, broadcaster: ErrorBroadcaster) {
    let reader = BufReader::new(stderr);
    let mut lines = reader.lines();
    let mut stderr_buffer = String::new();

    while let Ok(Some(line)) = lines.next_line().await {
        if !line.trim().is_empty() {
            if !stderr_buffer.is_empty() {
                stderr_buffer.push('\n');
            }
            stderr_buffer.push_str(&line);
        }
    }

    // If stderr had content, report as a typecheck error
    if !stderr_buffer.is_empty() {
        let error = DevError::typecheck(stderr_buffer);
        broadcaster.report_error(error).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── detect_checker tests ──

    #[test]
    fn test_detect_checker_explicit_binary_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let binary = tmp.path().join("my-checker");
        std::fs::write(&binary, "").unwrap();

        let result = detect_checker(tmp.path(), Some(&binary));
        assert!(result.is_some());
        let checker = result.unwrap();
        assert_eq!(checker.path, binary);
        assert_eq!(checker.name, "my-checker");
    }

    #[test]
    fn test_detect_checker_explicit_binary_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let binary = tmp.path().join("nonexistent");

        let result = detect_checker(tmp.path(), Some(&binary));
        assert!(result.is_none());
    }

    #[test]
    fn test_detect_checker_local_tsgo_preferred() {
        let tmp = tempfile::tempdir().unwrap();
        let bin_dir = tmp.path().join("node_modules").join(".bin");
        std::fs::create_dir_all(&bin_dir).unwrap();

        // Create both tsgo and tsc locally
        std::fs::write(bin_dir.join("tsgo"), "").unwrap();
        std::fs::write(bin_dir.join("tsc"), "").unwrap();

        let result = detect_checker(tmp.path(), None);
        assert!(result.is_some());
        let checker = result.unwrap();
        assert_eq!(checker.name, "tsgo");
    }

    #[test]
    fn test_detect_checker_local_tsc_when_no_tsgo() {
        let tmp = tempfile::tempdir().unwrap();
        let bin_dir = tmp.path().join("node_modules").join(".bin");
        std::fs::create_dir_all(&bin_dir).unwrap();

        // Only tsc locally
        std::fs::write(bin_dir.join("tsc"), "").unwrap();

        let result = detect_checker(tmp.path(), None);
        assert!(result.is_some());
        let checker = result.unwrap();
        assert_eq!(checker.name, "tsc");
    }

    #[test]
    fn test_detect_checker_none_found() {
        let tmp = tempfile::tempdir().unwrap();
        // No node_modules, no PATH entries for tsc/tsgo
        // Note: this test may find a global tsc if one is installed.
        // We only verify the function doesn't panic.
        let _result = detect_checker(tmp.path(), None);
    }

    // ── TypeCheckHandle Drop tests ──

    #[test]
    fn test_typecheck_handle_drop_does_not_panic() {
        // Verify that dropping a TypeCheckHandle with no child doesn't panic
        let handle = TypeCheckHandle {
            child: None,
            stdout_task: None,
            stderr_task: None,
            checker_name: "tsc".to_string(),
        };
        drop(handle);
    }

    // ── CheckerBinary tests ──

    #[test]
    fn test_checker_binary_equality() {
        let a = CheckerBinary {
            path: PathBuf::from("/usr/bin/tsc"),
            name: "tsc".to_string(),
        };
        let b = CheckerBinary {
            path: PathBuf::from("/usr/bin/tsc"),
            name: "tsc".to_string(),
        };
        assert_eq!(a, b);
    }

    #[test]
    fn test_checker_binary_debug() {
        let checker = CheckerBinary {
            path: PathBuf::from("/usr/bin/tsc"),
            name: "tsc".to_string(),
        };
        let debug = format!("{:?}", checker);
        assert!(debug.contains("tsc"));
    }

    // ── enrich_with_snippet tests ──

    #[tokio::test]
    async fn test_enrich_with_snippet_happy_path() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(
            src_dir.join("app.tsx"),
            "const a = 1;\nconst b: number = 'hello';\nconst c = 3;\n",
        )
        .unwrap();

        let error = DevError::typecheck("Type mismatch")
            .with_file("src/app.tsx")
            .with_location(2, 7);

        let enriched = enrich_with_snippet(error, tmp.path()).await;
        assert!(enriched.code_snippet.is_some());
        let snippet = enriched.code_snippet.unwrap();
        assert!(snippet.contains("const b: number = 'hello'"));
    }

    #[tokio::test]
    async fn test_enrich_with_snippet_missing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let error = DevError::typecheck("Type mismatch")
            .with_file("src/nonexistent.tsx")
            .with_location(1, 1);

        let enriched = enrich_with_snippet(error, tmp.path()).await;
        assert!(enriched.code_snippet.is_none());
    }

    #[tokio::test]
    async fn test_enrich_with_snippet_already_has_snippet() {
        let tmp = tempfile::tempdir().unwrap();
        let error = DevError::typecheck("Type mismatch")
            .with_file("src/app.tsx")
            .with_location(1, 1)
            .with_snippet("existing snippet");

        let enriched = enrich_with_snippet(error, tmp.path()).await;
        assert_eq!(enriched.code_snippet.as_deref(), Some("existing snippet"));
    }

    #[tokio::test]
    async fn test_enrich_with_snippet_no_file_field() {
        let tmp = tempfile::tempdir().unwrap();
        let error = DevError::typecheck("Type mismatch");

        let enriched = enrich_with_snippet(error, tmp.path()).await;
        assert!(enriched.code_snippet.is_none());
    }

    #[tokio::test]
    async fn test_enrich_with_snippet_line_out_of_bounds() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("app.tsx"), "line1\nline2\n").unwrap();

        let error = DevError::typecheck("Type mismatch")
            .with_file("src/app.tsx")
            .with_location(100, 1);

        let enriched = enrich_with_snippet(error, tmp.path()).await;
        // Should not panic, and should not add snippet for out-of-bounds line
        assert!(enriched.code_snippet.is_none());
    }
}
