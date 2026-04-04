pub mod config;
pub mod logs;
pub mod types;
pub mod workspace;

use config::{collect_secret_values, redact, validate_secrets};
use logs::{LogEntry, LogWriter};
use std::path::Path;
use std::time::Instant;
use types::{TaskDef, TaskScope, TaskStatus};

/// What the CI module should execute. Built from CLI args in main.rs.
#[derive(Debug)]
pub enum CiAction {
    /// Run a task or workflow by name
    Run {
        name: String,
        all: bool,
        scope: Option<String>,
        dry_run: bool,
        concurrency: Option<usize>,
        verbose: bool,
        quiet: bool,
        json: bool,
    },
    /// List affected packages
    Affected {
        base: String,
        json: bool,
    },
    /// Cache management
    CacheStatus,
    CacheClean,
    CachePush,
    /// Print task execution graph
    Graph {
        name: Option<String>,
        dot: bool,
    },
}

/// Entry point for `vtz ci` commands.
pub async fn execute(action: CiAction, root_dir: &Path) -> Result<(), String> {
    match action {
        CiAction::Run {
            name,
            all,
            scope,
            dry_run,
            concurrency,
            verbose,
            quiet,
            json,
        } => {
            // Warn about flags not yet implemented
            if all {
                eprintln!("[pipe] warning: --all flag is not yet implemented, ignored");
            }
            if scope.is_some() {
                eprintln!("[pipe] warning: --scope flag is not yet implemented, ignored");
            }
            if concurrency.is_some() {
                eprintln!("[pipe] warning: --concurrency flag is not yet implemented, ignored");
            }
            if verbose {
                eprintln!("[pipe] warning: --verbose flag is not yet implemented, ignored");
            }
            if json {
                eprintln!("[pipe] warning: --json flag is not yet implemented, ignored");
            }
            run_task_or_workflow(root_dir, &name, dry_run, quiet).await
        }
        CiAction::Affected { base, json } => {
            eprintln!("[pipe] affected: base={base}, json={json}");
            // Phase 3 will implement this
            Ok(())
        }
        CiAction::CacheStatus => {
            eprintln!("[pipe] cache status — not yet implemented");
            Ok(())
        }
        CiAction::CacheClean => {
            eprintln!("[pipe] cache clean — not yet implemented");
            Ok(())
        }
        CiAction::CachePush => {
            eprintln!("[pipe] cache push — not yet implemented");
            Ok(())
        }
        CiAction::Graph { dot, .. } => {
            eprintln!("[pipe] graph (dot={dot}) — not yet implemented");
            Ok(())
        }
    }
}

/// Run a task or workflow by name.
async fn run_task_or_workflow(
    root_dir: &Path,
    name: &str,
    dry_run: bool,
    quiet: bool,
) -> Result<(), String> {
    let run_start = Instant::now();

    if !quiet {
        eprintln!("[pipe] Loading ci.config.ts...");
    }

    // 1. Load config
    let (pipe_config, bridge) = config::load_config(root_dir).await?;

    // 2. Validate secrets
    validate_secrets(&pipe_config.secrets)?;
    let secret_values = collect_secret_values(&pipe_config.secrets);

    // 3. Resolve workspace
    let resolved = workspace::resolve(root_dir, pipe_config.workspace.as_ref())?;

    if !quiet {
        eprintln!(
            "[pipe] Workspace: {} packages, {} native crates",
            resolved.packages.len(),
            resolved.native_crates.len()
        );
    }

    // Validate workspace graph (no circular deps)
    workspace::validate_no_cycles(&resolved.packages)?;

    // 4. Initialize NDJSON logger
    let mut logger = LogWriter::new(root_dir, secret_values.clone());
    let run_id = logger.run_id().to_string();

    logger.write(&LogEntry::run_start(
        &run_id,
        "ci.config.ts",
        resolved.packages.len(),
        resolved.native_crates.len(),
    ));

    // 5. Find the task or workflow
    let task_names = if let Some(workflow) = pipe_config.workflows.get(name) {
        workflow.run.clone()
    } else if pipe_config.tasks.contains_key(name) {
        vec![name.to_string()]
    } else {
        let available: Vec<&str> = pipe_config
            .tasks
            .keys()
            .chain(pipe_config.workflows.keys())
            .map(|s| s.as_str())
            .collect();
        return Err(format!(
            "unknown task or workflow \"{name}\"\navailable: {}",
            available.join(", ")
        ));
    };

    if dry_run {
        eprintln!("[pipe] Dry run — no commands will be executed\n");
        print_dry_run(&task_names, &pipe_config.tasks, &resolved);
        let _ = bridge.shutdown().await;
        return Ok(());
    }

    // 6. Execute tasks sequentially (Phase 2 adds parallelism)
    let mut executed = 0usize;
    let mut failed = 0usize;
    let mut skipped = 0usize;
    let mut any_failed = false;

    let mut ctx = RunContext {
        secret_values: &secret_values,
        logger: &mut logger,
        run_id: &run_id,
        quiet,
    };

    for task_name in &task_names {
        let task_def = pipe_config.tasks.get(task_name.as_str()).ok_or_else(|| {
            format!(
                "workflow references unknown task \"{task_name}\"\navailable tasks: {}",
                pipe_config
                    .tasks
                    .keys()
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })?;

        match task_def.base().scope {
            TaskScope::Root => {
                let result = run_single_task(root_dir, task_name, None, task_def, &mut ctx).await;
                match result {
                    TaskStatus::Success => executed += 1,
                    TaskStatus::Failed => {
                        failed += 1;
                        any_failed = true;
                    }
                    TaskStatus::Skipped => skipped += 1,
                }
            }
            TaskScope::Package => {
                for pkg in resolved.packages.values() {
                    let result = run_single_task(
                        &root_dir.join(&pkg.path),
                        task_name,
                        Some(&pkg.name),
                        task_def,
                        &mut ctx,
                    )
                    .await;
                    match result {
                        TaskStatus::Success => executed += 1,
                        TaskStatus::Failed => {
                            failed += 1;
                            any_failed = true;
                        }
                        TaskStatus::Skipped => skipped += 1,
                    }
                }
            }
        }
    }

    let total_ms = run_start.elapsed().as_millis() as u64;

    ctx.logger.write(&LogEntry::run_end(
        &run_id, total_ms, executed, 0, skipped, failed,
    ));

    if !quiet {
        eprintln!(
            "\n[pipe] Done in {:.1}s ({executed} executed, {skipped} skipped, {failed} failed)",
            total_ms as f64 / 1000.0
        );
        eprintln!("       Run ID: {run_id}");
    }

    let _ = bridge.shutdown().await;

    if any_failed {
        Err(format!("{failed} task(s) failed"))
    } else {
        Ok(())
    }
}

/// Shared context passed to task execution helpers.
struct RunContext<'a> {
    secret_values: &'a [String],
    logger: &'a mut LogWriter,
    run_id: &'a str,
    quiet: bool,
}

/// Execute a single task (command or steps) and return its status.
async fn run_single_task(
    working_dir: &Path,
    task_name: &str,
    package: Option<&str>,
    task_def: &TaskDef,
    ctx: &mut RunContext<'_>,
) -> TaskStatus {
    let command_display = match task_def {
        TaskDef::Command(t) => t.command.clone(),
        TaskDef::Steps(t) => t.steps.join(" && "),
    };

    let label = match package {
        Some(pkg) => format!("{task_name}  {pkg}"),
        None => task_name.to_string(),
    };

    ctx.logger.write(&LogEntry::task_start(
        ctx.run_id,
        task_name,
        package,
        &command_display,
    ));

    let start = Instant::now();

    let (status, exit_code) = match task_def {
        TaskDef::Command(t) => {
            run_command(
                &t.command,
                working_dir,
                &t.base.env,
                task_def.base().timeout,
                ctx.secret_values,
                &label,
                ctx.quiet,
            )
            .await
        }
        TaskDef::Steps(t) => {
            let mut last_status = TaskStatus::Success;
            let mut last_code = Some(0);
            for step in &t.steps {
                let (s, c) = run_command(
                    step,
                    working_dir,
                    &t.base.env,
                    task_def.base().timeout,
                    ctx.secret_values,
                    &label,
                    ctx.quiet,
                )
                .await;
                last_status = s;
                last_code = c;
                if last_status == TaskStatus::Failed {
                    break;
                }
            }
            (last_status, last_code)
        }
    };

    let duration_ms = start.elapsed().as_millis() as u64;

    if !ctx.quiet {
        match &status {
            TaskStatus::Success => {
                eprintln!(
                    " \u{2713} {:<35} {:.1}s",
                    label,
                    duration_ms as f64 / 1000.0
                );
            }
            TaskStatus::Failed => {
                eprintln!(
                    " \u{2717} {:<35} FAILED (exit {})",
                    label,
                    exit_code.unwrap_or(-1)
                );
            }
            TaskStatus::Skipped => {
                eprintln!(" \u{2298} {:<35} skipped", label);
            }
        }
    }

    ctx.logger.write(&LogEntry::task_end(
        ctx.run_id,
        task_name,
        package,
        status.clone(),
        exit_code,
        duration_ms,
        false,
    ));

    status
}

/// Execute a single shell command and return (status, exit_code).
async fn run_command(
    command: &str,
    working_dir: &Path,
    env: &std::collections::BTreeMap<String, String>,
    timeout: Option<u64>,
    secret_values: &[String],
    label: &str,
    quiet: bool,
) -> (TaskStatus, Option<i32>) {
    let mut cmd = tokio::process::Command::new("sh");
    cmd.args(["-c", command]);
    cmd.current_dir(working_dir);

    // Set task-level env vars
    for (k, v) in env {
        cmd.env(k, v);
    }

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            if !quiet {
                eprintln!("   [{label}] failed to spawn: {e}");
            }
            return (TaskStatus::Failed, None);
        }
    };

    // Take stdout/stderr handles before waiting so we can kill on timeout
    let stdout_handle = child.stdout.take();
    let stderr_handle = child.stderr.take();

    // Apply timeout if configured
    let result = if let Some(timeout_ms) = timeout {
        let duration = std::time::Duration::from_millis(timeout_ms);
        match tokio::time::timeout(duration, child.wait()).await {
            Ok(Ok(status)) => Ok(status),
            Ok(Err(e)) => Err(e.to_string()),
            Err(_) => {
                // Kill the child process on timeout to avoid orphan processes
                let _ = child.kill().await;
                let _ = child.wait().await; // reap zombie
                Err(format!("timeout after {timeout_ms}ms"))
            }
        }
    } else {
        child.wait().await.map_err(|e| e.to_string())
    };

    match result {
        Ok(exit_status) => {
            let code = exit_status.code();
            let success = exit_status.success();

            // Read and print buffered output (redacted)
            if let Some(mut stdout) = stdout_handle {
                use tokio::io::AsyncReadExt;
                let mut buf = Vec::new();
                let _ = stdout.read_to_end(&mut buf).await;
                if !buf.is_empty() {
                    let text = String::from_utf8_lossy(&buf);
                    let redacted = redact(&text, secret_values);
                    if !quiet {
                        eprint!("{redacted}");
                    }
                }
            }
            if let Some(mut stderr) = stderr_handle {
                use tokio::io::AsyncReadExt;
                let mut buf = Vec::new();
                let _ = stderr.read_to_end(&mut buf).await;
                if !buf.is_empty() {
                    let text = String::from_utf8_lossy(&buf);
                    let redacted = redact(&text, secret_values);
                    if !quiet {
                        eprint!("{redacted}");
                    }
                }
            }

            if success {
                (TaskStatus::Success, code)
            } else {
                (TaskStatus::Failed, code)
            }
        }
        Err(e) => {
            if !quiet {
                eprintln!("   [{label}] error: {e}");
            }
            (TaskStatus::Failed, None)
        }
    }
}

/// Print a dry-run plan.
fn print_dry_run(
    task_names: &[String],
    tasks: &std::collections::BTreeMap<String, TaskDef>,
    resolved: &types::ResolvedWorkspace,
) {
    for task_name in task_names {
        if let Some(task_def) = tasks.get(task_name.as_str()) {
            let cmd = match task_def {
                TaskDef::Command(t) => t.command.clone(),
                TaskDef::Steps(t) => t.steps.join(" && "),
            };

            match task_def.base().scope {
                TaskScope::Root => {
                    eprintln!(" \u{2192} {:<35} {cmd}", task_name);
                }
                TaskScope::Package => {
                    for pkg_name in resolved.packages.keys() {
                        eprintln!(" \u{2192} {:<20} {:<15} {cmd}", task_name, pkg_name);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[tokio::test]
    async fn run_command_success() {
        let (status, code) = run_command(
            "echo hello",
            Path::new("."),
            &BTreeMap::new(),
            None,
            &[],
            "test",
            true,
        )
        .await;
        assert_eq!(status, TaskStatus::Success);
        assert_eq!(code, Some(0));
    }

    #[tokio::test]
    async fn run_command_failure() {
        let (status, code) = run_command(
            "exit 42",
            Path::new("."),
            &BTreeMap::new(),
            None,
            &[],
            "test",
            true,
        )
        .await;
        assert_eq!(status, TaskStatus::Failed);
        assert_eq!(code, Some(42));
    }

    #[tokio::test]
    async fn run_command_with_env() {
        let mut env = BTreeMap::new();
        env.insert("__VTZ_CI_TEST_VAR".to_string(), "hello_world".to_string());
        let (status, _) = run_command(
            "test \"$__VTZ_CI_TEST_VAR\" = \"hello_world\"",
            Path::new("."),
            &env,
            None,
            &[],
            "test",
            true,
        )
        .await;
        assert_eq!(status, TaskStatus::Success);
    }

    #[tokio::test]
    async fn run_command_timeout_kills_process() {
        let (status, code) = run_command(
            "sleep 60",
            Path::new("."),
            &BTreeMap::new(),
            Some(100), // 100ms timeout
            &[],
            "test",
            true,
        )
        .await;
        assert_eq!(status, TaskStatus::Failed);
        assert!(code.is_none()); // timeout returns None for exit code
    }

    #[tokio::test]
    async fn run_command_completes_before_timeout() {
        let (status, code) = run_command(
            "echo fast",
            Path::new("."),
            &BTreeMap::new(),
            Some(5000), // generous timeout
            &[],
            "test",
            true,
        )
        .await;
        assert_eq!(status, TaskStatus::Success);
        assert_eq!(code, Some(0));
    }

    #[tokio::test]
    async fn run_single_task_steps_stops_on_failure() {
        let task_def = TaskDef::Steps(types::StepsTask {
            base: types::TaskBase::default(),
            steps: vec![
                "echo step1".to_string(),
                "exit 1".to_string(),
                "echo step3_should_not_run".to_string(),
            ],
        });

        let secret_values = vec![];
        let dir = tempfile::tempdir().unwrap();
        let mut logger = LogWriter::new(dir.path(), vec![]);
        let run_id = logger.run_id().to_string();

        let mut ctx = RunContext {
            secret_values: &secret_values,
            logger: &mut logger,
            run_id: &run_id,
            quiet: true,
        };

        let status = run_single_task(Path::new("."), "test_steps", None, &task_def, &mut ctx).await;
        assert_eq!(status, TaskStatus::Failed);
    }

    #[tokio::test]
    async fn run_single_task_command_success() {
        let task_def = TaskDef::Command(types::CommandTask {
            base: types::TaskBase::default(),
            command: "echo ok".to_string(),
        });

        let secret_values = vec![];
        let dir = tempfile::tempdir().unwrap();
        let mut logger = LogWriter::new(dir.path(), vec![]);
        let run_id = logger.run_id().to_string();

        let mut ctx = RunContext {
            secret_values: &secret_values,
            logger: &mut logger,
            run_id: &run_id,
            quiet: true,
        };

        let status = run_single_task(Path::new("."), "test_cmd", None, &task_def, &mut ctx).await;
        assert_eq!(status, TaskStatus::Success);
    }
}
