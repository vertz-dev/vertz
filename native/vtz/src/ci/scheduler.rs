use crate::ci::config::{redact, ConfigBridge};
use crate::ci::graph::{DepDecision, TaskGraph, TaskNode};
use crate::ci::logs::{LogEntry, LogWriter};
use crate::ci::types::{TaskDef, TaskResult, TaskScope, TaskStatus};
use std::collections::{BTreeMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{mpsc, Mutex};

// ---------------------------------------------------------------------------
// Scheduler result
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub struct SchedulerResult {
    pub results: BTreeMap<String, TaskResult>,
    pub executed_count: usize,
    pub cached_count: usize,
    pub skipped_count: usize,
    pub failed_count: usize,
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

pub struct Scheduler<'a> {
    graph: &'a TaskGraph,
    concurrency: usize,
    tasks: &'a BTreeMap<String, TaskDef>,
    root_dir: &'a Path,
    workspace: &'a crate::ci::types::ResolvedWorkspace,
    secret_values: &'a [String],
    quiet: bool,
}

/// Message sent from workers back to the coordinator
struct WorkerResult {
    node_idx: usize,
    result: TaskResult,
}

/// Shared state for graceful shutdown on SIGINT.
///
/// Active child process IDs are tracked so we can send SIGTERM/SIGKILL.
/// The `cancelled` flag tells workers to stop picking up new work.
#[derive(Default)]
struct ShutdownState {
    cancelled: AtomicBool,
    active_pids: Mutex<HashSet<u32>>,
}

impl ShutdownState {
    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }

    async fn register_pid(&self, pid: u32) {
        self.active_pids.lock().await.insert(pid);
    }

    async fn unregister_pid(&self, pid: u32) {
        self.active_pids.lock().await.remove(&pid);
    }

    /// Send a signal to all active child processes.
    async fn signal_all(&self, signal: i32) {
        let pids = self.active_pids.lock().await;
        for &pid in pids.iter() {
            // SAFETY: sending a signal to a process ID is safe; the process
            // may already be dead (returns ESRCH), which we ignore.
            unsafe {
                libc::kill(pid as i32, signal);
            }
        }
    }
}

impl<'a> Scheduler<'a> {
    pub fn new(
        graph: &'a TaskGraph,
        concurrency: usize,
        tasks: &'a BTreeMap<String, TaskDef>,
        root_dir: &'a Path,
        workspace: &'a crate::ci::types::ResolvedWorkspace,
        secret_values: &'a [String],
        quiet: bool,
    ) -> Self {
        Self {
            graph,
            concurrency,
            tasks,
            root_dir,
            workspace,
            secret_values,
            quiet,
        }
    }

    /// Execute the task graph with the given concurrency.
    ///
    /// The `bridge` is behind a mutex because callback evaluation requires
    /// exclusive access (stdin/stdout protocol is sequential).
    ///
    /// Registers a SIGINT handler for graceful shutdown:
    /// - First SIGINT: SIGTERM to all running children, stop scheduling new tasks
    /// - After 5 seconds (or second SIGINT): SIGKILL all children
    pub async fn execute(
        &self,
        bridge: Arc<Mutex<ConfigBridge>>,
        logger: &mut LogWriter,
        run_id: &str,
    ) -> Result<SchedulerResult, String> {
        let n = self.graph.node_count();
        if n == 0 {
            return Ok(SchedulerResult {
                results: BTreeMap::new(),
                executed_count: 0,
                cached_count: 0,
                skipped_count: 0,
                failed_count: 0,
            });
        }

        // Shared shutdown state for signal handling
        let shutdown = Arc::new(ShutdownState::default());

        // Spawn SIGINT handler
        let shutdown_for_signal = Arc::clone(&shutdown);
        let quiet = self.quiet;
        let signal_handle = tokio::spawn(async move {
            // First SIGINT → SIGTERM
            if tokio::signal::ctrl_c().await.is_ok() {
                shutdown_for_signal.cancel();
                if !quiet {
                    eprintln!("\n[pipe] Shutting down... (press Ctrl+C again to force)");
                }
                shutdown_for_signal.signal_all(libc::SIGTERM).await;

                // Wait 5s or second SIGINT → SIGKILL
                tokio::select! {
                    _ = tokio::time::sleep(std::time::Duration::from_secs(5)) => {}
                    _ = tokio::signal::ctrl_c() => {}
                }
                if !quiet {
                    eprintln!("[pipe] Force killing remaining processes...");
                }
                shutdown_for_signal.signal_all(libc::SIGKILL).await;
            }
        });

        // Compute initial in-degrees
        let mut in_degree = vec![0usize; n];
        for edges in &self.graph.adjacency {
            for &(to, _) in edges {
                in_degree[to] += 1;
            }
        }

        // Track results for each node
        let mut node_results: Vec<Option<TaskResult>> = vec![None; n];
        let mut executed = 0usize;
        let cached = 0usize;
        let mut skipped = 0usize;
        let mut failed = 0usize;

        // Channel for ready nodes → workers
        let (ready_tx, ready_rx) = mpsc::channel::<usize>(n);
        let ready_rx = Arc::new(Mutex::new(ready_rx));

        // Channel for worker results → coordinator
        let (result_tx, mut result_rx) = mpsc::channel::<WorkerResult>(n);

        // Seed the ready queue with zero-in-degree nodes
        for (i, &deg) in in_degree.iter().enumerate() {
            if deg == 0 {
                let _ = ready_tx.send(i).await;
            }
        }

        // Track how many nodes are still pending
        let mut remaining = n;

        // Spawn worker tasks
        let max_workers = self.concurrency.min(n);
        for _ in 0..max_workers {
            let rx = Arc::clone(&ready_rx);
            let tx = result_tx.clone();
            let tasks = self.tasks.clone();
            let root_dir = self.root_dir.to_path_buf();
            let workspace = self.workspace.clone();
            let secret_values: Vec<String> = self.secret_values.to_vec();
            let graph_nodes: Vec<TaskNode> = self.graph.nodes.clone();
            let quiet = self.quiet;
            let shutdown_ref = Arc::clone(&shutdown);

            tokio::spawn(async move {
                loop {
                    // Check cancellation before picking up work
                    if shutdown_ref.is_cancelled() {
                        break;
                    }

                    let node_idx = {
                        let mut rx_guard = rx.lock().await;
                        match rx_guard.recv().await {
                            Some(idx) => idx,
                            None => break, // channel closed
                        }
                    };

                    // Re-check cancellation after receiving work
                    if shutdown_ref.is_cancelled() {
                        // Return as skipped due to interruption
                        let node = &graph_nodes[node_idx];
                        let _ = tx
                            .send(WorkerResult {
                                node_idx,
                                result: TaskResult {
                                    status: TaskStatus::Skipped,
                                    exit_code: None,
                                    duration_ms: 0,
                                    package: node.package.clone(),
                                    task: node.task_name.clone(),
                                    cached: false,
                                },
                            })
                            .await;
                        continue;
                    }

                    let node = &graph_nodes[node_idx];
                    let task_name = &node.task_name;

                    let task_def = match tasks.get(task_name.as_str()) {
                        Some(t) => t,
                        None => {
                            let _ = tx
                                .send(WorkerResult {
                                    node_idx,
                                    result: TaskResult {
                                        status: TaskStatus::Failed,
                                        exit_code: None,
                                        duration_ms: 0,
                                        package: node.package.clone(),
                                        task: task_name.clone(),
                                        cached: false,
                                    },
                                })
                                .await;
                            continue;
                        }
                    };

                    // Determine working directory
                    let working_dir = match (&task_def.base().scope, &node.package) {
                        (TaskScope::Package, Some(pkg_name)) => {
                            if let Some(pkg) = workspace.packages.get(pkg_name) {
                                root_dir.join(&pkg.path)
                            } else {
                                root_dir.clone()
                            }
                        }
                        _ => root_dir.clone(),
                    };

                    let start = Instant::now();

                    let (status, exit_code, stdout, stderr) = match task_def {
                        TaskDef::Command(t) => {
                            execute_command(
                                &t.command,
                                &working_dir,
                                &t.base.env,
                                task_def.base().timeout,
                                &secret_values,
                                &shutdown_ref,
                            )
                            .await
                        }
                        TaskDef::Steps(t) => {
                            let mut last_status = TaskStatus::Success;
                            let mut last_code = Some(0);
                            let mut all_stdout = String::new();
                            let mut all_stderr = String::new();

                            for step in &t.steps {
                                if shutdown_ref.is_cancelled() {
                                    last_status = TaskStatus::Skipped;
                                    last_code = None;
                                    break;
                                }
                                let (s, c, out, err) = execute_command(
                                    step,
                                    &working_dir,
                                    &t.base.env,
                                    task_def.base().timeout,
                                    &secret_values,
                                    &shutdown_ref,
                                )
                                .await;
                                all_stdout.push_str(&out);
                                all_stderr.push_str(&err);
                                last_status = s;
                                last_code = c;
                                if last_status == TaskStatus::Failed {
                                    break;
                                }
                            }
                            (last_status, last_code, all_stdout, all_stderr)
                        }
                    };

                    let duration_ms = start.elapsed().as_millis() as u64;

                    if !quiet {
                        let label = node.label();
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
                        // Replay buffered output
                        if !stdout.is_empty() {
                            eprint!("{}", redact(&stdout, &secret_values));
                        }
                        if !stderr.is_empty() {
                            eprint!("{}", redact(&stderr, &secret_values));
                        }
                    }

                    let _ = tx
                        .send(WorkerResult {
                            node_idx,
                            result: TaskResult {
                                status,
                                exit_code,
                                duration_ms,
                                package: node.package.clone(),
                                task: task_name.clone(),
                                cached: false,
                            },
                        })
                        .await;
                }
            });
        }

        // Drop our copy of result_tx so the channel closes when all workers are done
        drop(result_tx);

        // Coordinator loop: process completed tasks, update in-degrees, push ready nodes
        while remaining > 0 {
            let worker_result = match result_rx.recv().await {
                Some(r) => r,
                None => break, // all workers done
            };

            let node_idx = worker_result.node_idx;
            let result = worker_result.result;

            // Log task end
            let node = &self.graph.nodes[node_idx];
            logger.write(&LogEntry::task_end(
                run_id,
                &node.task_name,
                node.package.as_deref(),
                result.status.clone(),
                result.exit_code,
                result.duration_ms,
                result.cached,
            ));

            // Track stats
            match result.status {
                TaskStatus::Success => executed += 1,
                TaskStatus::Failed => {
                    executed += 1;
                    failed += 1;
                }
                TaskStatus::Skipped => skipped += 1,
            }

            node_results[node_idx] = Some(result);
            remaining -= 1;

            // If cancelled, skip all remaining unprocessed nodes
            if shutdown.is_cancelled() {
                for (i, slot) in node_results.iter_mut().enumerate() {
                    if slot.is_none() {
                        let skip_node = &self.graph.nodes[i];
                        logger.write(&LogEntry::task_end(
                            run_id,
                            &skip_node.task_name,
                            skip_node.package.as_deref(),
                            TaskStatus::Skipped,
                            None,
                            0,
                            false,
                        ));
                        *slot = Some(TaskResult {
                            status: TaskStatus::Skipped,
                            exit_code: None,
                            duration_ms: 0,
                            package: skip_node.package.clone(),
                            task: skip_node.task_name.clone(),
                            cached: false,
                        });
                        skipped += 1;
                    }
                }
                // Close the ready channel so workers exit
                drop(ready_tx);
                break;
            }

            // Check dependents: decrement in-degree, evaluate skip propagation
            for &(dep_idx, ref _edge_type) in &self.graph.adjacency[node_idx] {
                in_degree[dep_idx] -= 1;

                if in_degree[dep_idx] == 0 {
                    // All deps completed — check if this node should run or be skipped
                    let should_skip = self.should_skip_node(dep_idx, &node_results, &bridge).await;

                    if should_skip {
                        // Skip this node without executing
                        let skip_node = &self.graph.nodes[dep_idx];
                        if !self.quiet {
                            eprintln!(" \u{2298} {:<35} skipped (dep failed)", skip_node.label());
                        }

                        logger.write(&LogEntry::task_end(
                            run_id,
                            &skip_node.task_name,
                            skip_node.package.as_deref(),
                            TaskStatus::Skipped,
                            None,
                            0,
                            false,
                        ));

                        node_results[dep_idx] = Some(TaskResult {
                            status: TaskStatus::Skipped,
                            exit_code: None,
                            duration_ms: 0,
                            package: skip_node.package.clone(),
                            task: skip_node.task_name.clone(),
                            cached: false,
                        });
                        skipped += 1;
                        remaining -= 1;

                        // Propagate skip to this node's dependents
                        self.propagate_completed(dep_idx, &mut in_degree).await;
                    } else {
                        // Log task start and enqueue
                        let ready_node = &self.graph.nodes[dep_idx];
                        let cmd_display = self
                            .tasks
                            .get(&ready_node.task_name)
                            .map(|t| match t {
                                TaskDef::Command(c) => c.command.clone(),
                                TaskDef::Steps(s) => s.steps.join(" && "),
                            })
                            .unwrap_or_default();

                        logger.write(&LogEntry::task_start(
                            run_id,
                            &ready_node.task_name,
                            ready_node.package.as_deref(),
                            &cmd_display,
                        ));

                        let _ = ready_tx.send(dep_idx).await;
                    }
                }
            }
        }

        // Cancel the signal handler (no longer needed)
        signal_handle.abort();

        // Collect results
        let mut results = BTreeMap::new();
        for (idx, result) in node_results.into_iter().enumerate() {
            if let Some(r) = result {
                results.insert(self.graph.nodes[idx].label(), r);
            }
        }

        Ok(SchedulerResult {
            results,
            executed_count: executed,
            cached_count: cached,
            skipped_count: skipped,
            failed_count: failed,
        })
    }

    /// Check if a node should be skipped based on its incoming edges' results.
    async fn should_skip_node(
        &self,
        node_idx: usize,
        node_results: &[Option<TaskResult>],
        bridge: &Arc<Mutex<ConfigBridge>>,
    ) -> bool {
        for &(dep_idx, ref edge_type) in &self.graph.reverse_adj[node_idx] {
            if let Some(dep_result) = &node_results[dep_idx] {
                match TaskGraph::should_run_dependent(dep_result, edge_type) {
                    DepDecision::Run => continue,
                    DepDecision::Skip => return true,
                    DepDecision::EvalCallback(id) => {
                        let mut bridge_guard = bridge.lock().await;
                        match bridge_guard.eval_callback(id, dep_result).await {
                            Ok(true) => continue,
                            Ok(false) => return true,
                            Err(e) => {
                                eprintln!(
                                    "[pipe] warning: callback evaluation failed: {e}, skipping"
                                );
                                return true;
                            }
                        }
                    }
                }
            }
        }
        false
    }

    /// After a node completes (or is skipped), propagate to its dependents.
    async fn propagate_completed(&self, node_idx: usize, in_degree: &mut [usize]) {
        for &(dep_idx, _) in &self.graph.adjacency[node_idx] {
            if in_degree[dep_idx] > 0 {
                in_degree[dep_idx] -= 1;
            }
        }
    }

    /// Seed initial nodes that have zero in-degree with task_start log entries.
    pub fn log_initial_starts(&self, logger: &mut LogWriter, run_id: &str) {
        for (i, node) in self.graph.nodes.iter().enumerate() {
            let has_deps = self.graph.reverse_adj[i].iter().any(|_| true);
            if !has_deps {
                let cmd_display = self
                    .tasks
                    .get(&node.task_name)
                    .map(|t| match t {
                        TaskDef::Command(c) => c.command.clone(),
                        TaskDef::Steps(s) => s.steps.join(" && "),
                    })
                    .unwrap_or_default();

                logger.write(&LogEntry::task_start(
                    run_id,
                    &node.task_name,
                    node.package.as_deref(),
                    &cmd_display,
                ));
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Command execution (isolated for testing)
// ---------------------------------------------------------------------------

/// Execute a shell command, returning (status, exit_code, stdout, stderr).
/// Output is captured but NOT printed — the scheduler handles display.
///
/// The `shutdown` state is used to track active child PIDs for signal handling.
async fn execute_command(
    command: &str,
    working_dir: &Path,
    env: &BTreeMap<String, String>,
    timeout: Option<u64>,
    _secret_values: &[String],
    shutdown: &ShutdownState,
) -> (TaskStatus, Option<i32>, String, String) {
    let mut cmd = tokio::process::Command::new("sh");
    cmd.args(["-c", command]);
    cmd.current_dir(working_dir);

    for (k, v) in env {
        cmd.env(k, v);
    }

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return (
                TaskStatus::Failed,
                None,
                String::new(),
                format!("failed to spawn: {e}"),
            );
        }
    };

    // Register PID for signal handling
    if let Some(pid) = child.id() {
        shutdown.register_pid(pid).await;
    }

    let stdout_handle = child.stdout.take();
    let stderr_handle = child.stderr.take();

    let result = if let Some(timeout_ms) = timeout {
        let duration = std::time::Duration::from_millis(timeout_ms);
        match tokio::time::timeout(duration, child.wait()).await {
            Ok(Ok(status)) => Ok(status),
            Ok(Err(e)) => Err(e.to_string()),
            Err(_) => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                Err(format!("timeout after {timeout_ms}ms"))
            }
        }
    } else {
        child.wait().await.map_err(|e| e.to_string())
    };

    // Unregister PID after process exits
    if let Some(pid) = child.id() {
        shutdown.unregister_pid(pid).await;
    }

    match result {
        Ok(exit_status) => {
            let code = exit_status.code();
            let success = exit_status.success();

            let mut stdout_str = String::new();
            let mut stderr_str = String::new();

            if let Some(mut handle) = stdout_handle {
                use tokio::io::AsyncReadExt;
                let mut buf = Vec::new();
                let _ = handle.read_to_end(&mut buf).await;
                stdout_str = String::from_utf8_lossy(&buf).to_string();
            }
            if let Some(mut handle) = stderr_handle {
                use tokio::io::AsyncReadExt;
                let mut buf = Vec::new();
                let _ = handle.read_to_end(&mut buf).await;
                stderr_str = String::from_utf8_lossy(&buf).to_string();
            }

            if success {
                (TaskStatus::Success, code, stdout_str, stderr_str)
            } else {
                (TaskStatus::Failed, code, stdout_str, stderr_str)
            }
        }
        Err(e) => (TaskStatus::Failed, None, String::new(), e),
    }
}

/// Execute a shell command without signal handling (for testing).
/// Returns (status, exit_code, stdout, stderr).
#[cfg(test)]
async fn execute_command_no_signal(
    command: &str,
    working_dir: &Path,
    env: &BTreeMap<String, String>,
    timeout: Option<u64>,
    _secret_values: &[String],
) -> (TaskStatus, Option<i32>, String, String) {
    let shutdown = ShutdownState::default();
    execute_command(
        command,
        working_dir,
        env,
        timeout,
        _secret_values,
        &shutdown,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn execute_command_success() {
        let (status, code, stdout, _) =
            execute_command_no_signal("echo hello", Path::new("."), &BTreeMap::new(), None, &[])
                .await;
        assert_eq!(status, TaskStatus::Success);
        assert_eq!(code, Some(0));
        assert!(stdout.contains("hello"));
    }

    #[tokio::test]
    async fn execute_command_failure() {
        let (status, code, _, _) =
            execute_command_no_signal("exit 42", Path::new("."), &BTreeMap::new(), None, &[]).await;
        assert_eq!(status, TaskStatus::Failed);
        assert_eq!(code, Some(42));
    }

    #[tokio::test]
    async fn execute_command_timeout() {
        let (status, code, _, stderr) =
            execute_command_no_signal("sleep 60", Path::new("."), &BTreeMap::new(), Some(100), &[])
                .await;
        assert_eq!(status, TaskStatus::Failed);
        assert!(code.is_none());
        assert!(stderr.contains("timeout"));
    }

    #[tokio::test]
    async fn execute_command_with_env() {
        let mut env = BTreeMap::new();
        env.insert("__VTZ_SCHED_TEST".to_string(), "test_value".to_string());
        let (status, _, stdout, _) =
            execute_command_no_signal("echo $__VTZ_SCHED_TEST", Path::new("."), &env, None, &[])
                .await;
        assert_eq!(status, TaskStatus::Success);
        assert!(stdout.contains("test_value"));
    }

    #[tokio::test]
    async fn execute_command_captures_stderr() {
        let (status, _, _, stderr) = execute_command_no_signal(
            "echo error_msg >&2",
            Path::new("."),
            &BTreeMap::new(),
            None,
            &[],
        )
        .await;
        assert_eq!(status, TaskStatus::Success);
        assert!(stderr.contains("error_msg"));
    }

    #[tokio::test]
    async fn execute_steps_stops_on_failure() {
        // Simulate steps behavior
        let steps = vec!["echo step1", "exit 1", "echo step3_should_not_run"];
        let mut last_status = TaskStatus::Success;
        let mut all_stdout = String::new();

        for step in steps {
            let (s, _, out, _) =
                execute_command_no_signal(step, Path::new("."), &BTreeMap::new(), None, &[]).await;
            all_stdout.push_str(&out);
            last_status = s;
            if last_status == TaskStatus::Failed {
                break;
            }
        }

        assert_eq!(last_status, TaskStatus::Failed);
        assert!(all_stdout.contains("step1"));
        assert!(!all_stdout.contains("step3_should_not_run"));
    }

    #[tokio::test]
    async fn shutdown_state_cancellation() {
        let state = ShutdownState::default();
        assert!(!state.is_cancelled());
        state.cancel();
        assert!(state.is_cancelled());
    }

    #[tokio::test]
    async fn shutdown_state_pid_tracking() {
        let state = ShutdownState::default();
        state.register_pid(1234).await;
        state.register_pid(5678).await;
        assert_eq!(state.active_pids.lock().await.len(), 2);
        state.unregister_pid(1234).await;
        assert_eq!(state.active_pids.lock().await.len(), 1);
        assert!(state.active_pids.lock().await.contains(&5678));
    }
}
