use crate::ci::cache::{self, CacheBackend};
use crate::ci::changes::{evaluate_condition, ChangeSet};
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
    cache_backend: Arc<dyn CacheBackend>,
    platform: String,
    lockfile_hash: String,
    changes: Option<ChangeSet>,
    current_branch: String,
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
        self.cancelled.load(Ordering::Acquire)
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
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
            if let Ok(pid_i32) = i32::try_from(pid) {
                // SAFETY: sending a signal to a process ID is safe; the process
                // may already be dead (returns ESRCH), which we ignore.
                unsafe {
                    libc::kill(pid_i32, signal);
                }
            }
        }
    }
}

impl<'a> Scheduler<'a> {
    // Constructor mirrors struct fields 1:1 — an options struct would just
    // duplicate the struct definition for a single call site.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        graph: &'a TaskGraph,
        concurrency: usize,
        tasks: &'a BTreeMap<String, TaskDef>,
        root_dir: &'a Path,
        workspace: &'a crate::ci::types::ResolvedWorkspace,
        secret_values: &'a [String],
        quiet: bool,
        cache_backend: Arc<dyn CacheBackend>,
        changes: Option<ChangeSet>,
        current_branch: String,
    ) -> Self {
        let platform = cache::platform_string();
        let lockfile_hash = cache::lockfile_hash(root_dir);
        Self {
            graph,
            concurrency,
            tasks,
            root_dir,
            workspace,
            secret_values,
            quiet,
            cache_backend,
            platform,
            lockfile_hash,
            changes,
            current_branch,
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
        let mut cached = 0usize;
        let mut skipped = 0usize;
        let mut failed = 0usize;

        // Channel for ready nodes → workers
        let (ready_tx, ready_rx) = mpsc::channel::<usize>(n);
        let ready_rx = Arc::new(Mutex::new(ready_rx));

        // Channel for worker results → coordinator
        let (result_tx, mut result_rx) = mpsc::channel::<WorkerResult>(n);

        // Track how many nodes are still pending
        let mut remaining = n;

        // Seed the ready queue with zero-in-degree nodes, evaluating task-level
        // conditions before sending to workers.  Condition-skipped nodes
        // propagate immediately so their dependents can also be checked.
        {
            let mut seed_queue: std::collections::VecDeque<usize> =
                std::collections::VecDeque::new();
            for (i, &deg) in in_degree.iter().enumerate() {
                if deg == 0 {
                    seed_queue.push_back(i);
                }
            }

            while let Some(idx) = seed_queue.pop_front() {
                // Check both dependency-based skipping (for nodes freed by earlier
                // skips in this loop) and task-level condition skipping.
                let skip_dep = self.should_skip_node(idx, &node_results, &bridge).await;
                let skip_cond = !skip_dep && self.should_skip_for_condition(idx);

                if skip_dep || skip_cond {
                    let skip_node = &self.graph.nodes[idx];
                    let reason = if skip_dep {
                        "dep failed"
                    } else {
                        "condition not met"
                    };
                    if !self.quiet {
                        eprintln!(" \u{2298} {:<35} skipped ({reason})", skip_node.label());
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

                    node_results[idx] = Some(TaskResult {
                        status: TaskStatus::Skipped,
                        exit_code: None,
                        duration_ms: 0,
                        package: skip_node.package.clone(),
                        task: skip_node.task_name.clone(),
                        cached: false,
                    });
                    skipped += 1;
                    remaining -= 1;

                    // Propagate: dependents whose in-degree drops to 0 enter the
                    // seed queue so they can also be condition-checked / skip-propagated.
                    for &(dep_idx, _) in &self.graph.adjacency[idx] {
                        in_degree[dep_idx] -= 1;
                        if in_degree[dep_idx] == 0 {
                            seed_queue.push_back(dep_idx);
                        }
                    }
                } else {
                    let _ = ready_tx.send(idx).await;
                }
            }
        }

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
            let cache_ref = Arc::clone(&self.cache_backend);
            let platform = self.platform.clone();
            let lockfile_hash = self.lockfile_hash.clone();

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

                    // --- Cache lookup ---
                    let cache_config = task_def.base().cache.clone();
                    let pkg_obj = node
                        .package
                        .as_ref()
                        .and_then(|name| workspace.packages.get(name));

                    let cache_key_result = cache_config.as_ref().and_then(|cc| {
                        match cache::compute_cache_key(
                            task_def,
                            cc,
                            pkg_obj,
                            &root_dir,
                            &platform,
                            &lockfile_hash,
                            &secret_values,
                        ) {
                            Ok(hash) => {
                                let key = cache::cache_key(
                                    task_name,
                                    node.package.as_deref(),
                                    &platform,
                                    &hash,
                                );
                                let rkeys = cache::restore_keys(
                                    task_name,
                                    node.package.as_deref(),
                                    &platform,
                                );
                                Some((key, rkeys))
                            }
                            Err(e) => {
                                if !quiet {
                                    eprintln!(
                                        "[pipe] warning: cache key computation failed for {}: {e}",
                                        node.label()
                                    );
                                }
                                None
                            }
                        }
                    });

                    // Try cache get
                    let mut was_fallback_hit = false;

                    if let Some((ref full_key, ref restore_keys)) = cache_key_result {
                        match cache_ref.get(full_key, restore_keys).await {
                            Ok(Some((matched_key, data))) => {
                                if matched_key == *full_key {
                                    // Exact hit — sentinel means no outputs, archive means restore files
                                    if cache::is_sentinel(&data) {
                                        if !quiet {
                                            eprintln!(" \u{25cf} {:<35} cached", node.label());
                                        }
                                        let _ = tx
                                            .send(WorkerResult {
                                                node_idx,
                                                result: TaskResult {
                                                    status: TaskStatus::Success,
                                                    exit_code: Some(0),
                                                    duration_ms: 0,
                                                    package: node.package.clone(),
                                                    task: task_name.clone(),
                                                    cached: true,
                                                },
                                            })
                                            .await;
                                        continue;
                                    }

                                    match cache::restore_outputs(&data, &working_dir) {
                                        Ok(count) => {
                                            if !quiet {
                                                eprintln!(
                                                    " \u{25cf} {:<35} cached ({count} files)",
                                                    node.label()
                                                );
                                            }
                                            let _ = tx
                                                .send(WorkerResult {
                                                    node_idx,
                                                    result: TaskResult {
                                                        status: TaskStatus::Success,
                                                        exit_code: Some(0),
                                                        duration_ms: 0,
                                                        package: node.package.clone(),
                                                        task: task_name.clone(),
                                                        cached: true,
                                                    },
                                                })
                                                .await;
                                            continue;
                                        }
                                        Err(e) => {
                                            if !quiet {
                                                eprintln!(
                                                    "[pipe] warning: cache restore failed for {}: {e}",
                                                    node.label()
                                                );
                                            }
                                            // Fall through to execution
                                        }
                                    }
                                } else {
                                    // Fallback hit — restore warm cache, still execute
                                    // (sentinels are skipped for fallback — no files to warm)
                                    was_fallback_hit = true;
                                    if !cache::is_sentinel(&data) {
                                        if let Err(e) = cache::restore_outputs(&data, &working_dir)
                                        {
                                            if !quiet {
                                                eprintln!(
                                                    "[pipe] warning: warm cache restore failed for {}: {e}",
                                                    node.label()
                                                );
                                            }
                                        } else if !quiet {
                                            eprintln!(
                                                "[pipe] Cache hit (stale) for {} — re-executing with warm cache",
                                                node.label()
                                            );
                                        }
                                    }
                                }
                            }
                            Ok(None) => {} // Cache miss — proceed to execution
                            Err(e) => {
                                if !quiet {
                                    eprintln!(
                                        "[pipe] warning: cache lookup failed for {}: {e}",
                                        node.label()
                                    );
                                }
                            }
                        }
                    }

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

                    // --- Cache put on success ---
                    if status == TaskStatus::Success {
                        if let (Some((ref full_key, _)), Some(ref cc)) =
                            (&cache_key_result, &cache_config)
                        {
                            match cache::pack_outputs(&cc.outputs, &working_dir) {
                                Ok(data) if !data.is_empty() => {
                                    if let Err(e) = cache_ref.put(full_key, &data).await {
                                        if !quiet {
                                            eprintln!(
                                                "[pipe] warning: cache put failed for {}: {e}",
                                                node.label()
                                            );
                                        }
                                    }
                                }
                                Ok(_) => {
                                    // No output files — store a sentinel so the task
                                    // can be skipped on cache hit (typecheck, test, etc.).
                                    if let Err(e) =
                                        cache_ref.put(full_key, cache::SENTINEL_DATA).await
                                    {
                                        if !quiet {
                                            eprintln!(
                                                "[pipe] warning: cache put failed for {}: {e}",
                                                node.label()
                                            );
                                        }
                                    }
                                }
                                Err(e) => {
                                    if !quiet {
                                        eprintln!(
                                            "[pipe] warning: output packing failed for {}: {e}",
                                            node.label()
                                        );
                                    }
                                }
                            }
                        }
                    }

                    if !quiet {
                        let label = node.label();
                        let warm_suffix = if was_fallback_hit { " (warm)" } else { "" };
                        match &status {
                            TaskStatus::Success => {
                                eprintln!(
                                    " \u{2713} {:<35} {:.1}s{warm_suffix}",
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
            if result.cached {
                cached += 1;
            } else {
                match result.status {
                    TaskStatus::Success => executed += 1,
                    TaskStatus::Failed => {
                        executed += 1;
                        failed += 1;
                    }
                    TaskStatus::Skipped => skipped += 1,
                }
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
                // ready_tx will be dropped after the loop exits, causing workers to stop
                break;
            }

            // Process newly-ready dependents (using a queue to handle skip chains)
            let mut ready_queue: std::collections::VecDeque<usize> =
                std::collections::VecDeque::new();

            // Collect initial ready nodes from completed task
            for &(dep_idx, ref _edge_type) in &self.graph.adjacency[node_idx] {
                in_degree[dep_idx] -= 1;
                if in_degree[dep_idx] == 0 {
                    ready_queue.push_back(dep_idx);
                }
            }

            // Process all newly-ready nodes, including those freed by skips
            while let Some(ready_idx) = ready_queue.pop_front() {
                let skip_dep = self
                    .should_skip_node(ready_idx, &node_results, &bridge)
                    .await;
                let skip_cond = !skip_dep && self.should_skip_for_condition(ready_idx);

                if skip_dep || skip_cond {
                    let skip_node = &self.graph.nodes[ready_idx];
                    let reason = if skip_dep {
                        "dep failed"
                    } else {
                        "condition not met"
                    };
                    if !self.quiet {
                        eprintln!(" \u{2298} {:<35} skipped ({reason})", skip_node.label());
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

                    node_results[ready_idx] = Some(TaskResult {
                        status: TaskStatus::Skipped,
                        exit_code: None,
                        duration_ms: 0,
                        package: skip_node.package.clone(),
                        task: skip_node.task_name.clone(),
                        cached: false,
                    });
                    skipped += 1;
                    remaining -= 1;

                    // Propagate: decrement in-degrees of this node's dependents
                    for &(next_idx, _) in &self.graph.adjacency[ready_idx] {
                        in_degree[next_idx] -= 1;
                        if in_degree[next_idx] == 0 {
                            ready_queue.push_back(next_idx);
                        }
                    }
                } else {
                    // Log task start and enqueue for execution
                    let ready_node = &self.graph.nodes[ready_idx];
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

                    let _ = ready_tx.send(ready_idx).await;
                }
            }
        }

        // Close the ready channel so workers can exit cleanly
        drop(ready_tx);

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
    ///
    /// A node runs only if ALL incoming edges say "Run". If ANY edge says "Skip",
    /// the node is skipped. This means an `Always` edge won't override a `Default`
    /// edge that blocked — each edge is an independent gate.
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

    /// Check if a node should be skipped because its task-level `cond` evaluates
    /// to `false`.  Returns `true` when the task should be skipped.
    fn should_skip_for_condition(&self, node_idx: usize) -> bool {
        let node = &self.graph.nodes[node_idx];
        let task_def = match self.tasks.get(&node.task_name) {
            Some(t) => t,
            None => return false, // missing task will be caught by the worker
        };

        if let Some(cond) = &task_def.base().cond {
            if self.changes.is_none() && Self::needs_changeset(cond) && !self.quiet {
                eprintln!(
                    "[pipe] warning: change detection unavailable for task \"{}\"; \
                     treating `changed` condition as false",
                    node.task_name
                );
            }
            let empty = ChangeSet {
                files: vec![],
                base_ref: String::new(),
                is_shallow: false,
            };
            let changes = self.changes.as_ref().unwrap_or(&empty);
            !evaluate_condition(cond, changes, &self.current_branch)
        } else {
            false
        }
    }

    /// Returns `true` if the condition (or any nested sub-condition) uses
    /// `Condition::Changed`, meaning it requires a `ChangeSet` to evaluate.
    fn needs_changeset(cond: &crate::ci::types::Condition) -> bool {
        use crate::ci::types::Condition;
        match cond {
            Condition::Changed { .. } => true,
            Condition::All { conditions } | Condition::Any { conditions } => {
                conditions.iter().any(Self::needs_changeset)
            }
            _ => false,
        }
    }

    /// Seed initial nodes that have zero in-degree with task_start log entries.
    pub fn log_initial_starts(&self, logger: &mut LogWriter, run_id: &str) {
        for (i, node) in self.graph.nodes.iter().enumerate() {
            if self.graph.reverse_adj[i].is_empty() {
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

    // Capture PID before wait() — child.id() returns None after reap
    let child_pid = child.id();
    if let Some(pid) = child_pid {
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

    // Unregister PID using the value captured before wait()
    if let Some(pid) = child_pid {
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
    use crate::ci::types::TaskCacheConfig;

    /// A mock cache backend for testing scheduler cache integration.
    struct MockCache {
        entries: Mutex<BTreeMap<String, Vec<u8>>>,
        get_calls: Mutex<Vec<String>>,
        put_calls: Mutex<Vec<String>>,
    }

    impl MockCache {
        fn new() -> Self {
            Self {
                entries: Mutex::new(BTreeMap::new()),
                get_calls: Mutex::new(Vec::new()),
                put_calls: Mutex::new(Vec::new()),
            }
        }

        fn with_entry(key: &str, data: Vec<u8>) -> Self {
            let mut entries = BTreeMap::new();
            entries.insert(key.to_string(), data);
            Self {
                entries: Mutex::new(entries),
                get_calls: Mutex::new(Vec::new()),
                put_calls: Mutex::new(Vec::new()),
            }
        }
    }

    #[async_trait::async_trait]
    impl CacheBackend for MockCache {
        async fn get(
            &self,
            key: &str,
            restore_keys: &[String],
        ) -> Result<Option<(String, Vec<u8>)>, String> {
            self.get_calls.lock().await.push(key.to_string());
            let entries = self.entries.lock().await;
            // Exact match
            if let Some(data) = entries.get(key) {
                return Ok(Some((key.to_string(), data.clone())));
            }
            // Prefix match
            for rk in restore_keys {
                for (k, v) in entries.iter() {
                    if k.starts_with(rk) {
                        return Ok(Some((k.clone(), v.clone())));
                    }
                }
            }
            Ok(None)
        }

        async fn put(&self, key: &str, data: &[u8]) -> Result<(), String> {
            self.put_calls.lock().await.push(key.to_string());
            self.entries
                .lock()
                .await
                .insert(key.to_string(), data.to_vec());
            Ok(())
        }

        async fn exists(&self, key: &str) -> Result<bool, String> {
            Ok(self.entries.lock().await.contains_key(key))
        }
    }

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

    #[tokio::test]
    async fn mock_cache_exact_hit() {
        let cache = MockCache::with_entry("test-key", vec![1, 2, 3]);
        let result = cache.get("test-key", &[]).await.unwrap();
        assert_eq!(result, Some(("test-key".to_string(), vec![1, 2, 3])));
    }

    #[tokio::test]
    async fn mock_cache_prefix_fallback() {
        let cache = MockCache::with_entry("pipe-v1-linux-build-pkg-abc", vec![4, 5]);
        let result = cache
            .get(
                "pipe-v1-linux-build-pkg-xyz",
                &["pipe-v1-linux-build-pkg-".to_string()],
            )
            .await
            .unwrap();
        assert!(result.is_some());
        let (matched, data) = result.unwrap();
        assert_eq!(matched, "pipe-v1-linux-build-pkg-abc");
        assert_eq!(data, vec![4, 5]);
    }

    #[tokio::test]
    async fn mock_cache_miss() {
        let cache = MockCache::new();
        let result = cache.get("no-such-key", &[]).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn mock_cache_put_then_get() {
        let cache = MockCache::new();
        cache.put("new-key", &[10, 20]).await.unwrap();
        let result = cache.get("new-key", &[]).await.unwrap();
        assert_eq!(result, Some(("new-key".to_string(), vec![10, 20])));
    }

    #[tokio::test]
    async fn mock_cache_tracks_calls() {
        let cache = MockCache::new();
        cache.get("k1", &[]).await.unwrap();
        cache.put("k2", &[1]).await.unwrap();
        cache.get("k3", &[]).await.unwrap();

        let gets = cache.get_calls.lock().await;
        assert_eq!(*gets, vec!["k1", "k3"]);
        let puts = cache.put_calls.lock().await;
        assert_eq!(*puts, vec!["k2"]);
    }

    /// Helper: build a scheduler, execute, and return the result.
    async fn run_scheduler(
        tasks: BTreeMap<String, TaskDef>,
        workflow_run: Vec<String>,
        changes: Option<crate::ci::changes::ChangeSet>,
        current_branch: String,
    ) -> SchedulerResult {
        use crate::ci::config::ConfigBridge;
        use crate::ci::graph::TaskGraph;
        use crate::ci::logs::LogWriter;
        use crate::ci::types::{ResolvedWorkspace, WorkflowConfig, WorkflowFilter};

        let workspace = ResolvedWorkspace::default();
        let workflow = WorkflowConfig {
            run: workflow_run,
            filter: WorkflowFilter::All,
            env: BTreeMap::new(),
            root_affects_all: false,
        };
        let graph = TaskGraph::build(&workflow, &tasks, &workspace, None).unwrap();

        let tmp = std::env::temp_dir().join(format!("vtz-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();

        let cache_backend: Arc<dyn CacheBackend> = Arc::new(MockCache::new());
        let secret_values: Vec<String> = vec![];

        let sched = Scheduler::new(
            &graph,
            1,
            &tasks,
            &tmp,
            &workspace,
            &secret_values,
            true, // quiet
            cache_backend,
            changes,
            current_branch,
        );

        let bridge = Arc::new(Mutex::new(ConfigBridge::dummy()));
        let mut logger = LogWriter::new(&tmp, vec![]);
        let run_id = logger.run_id().to_string();

        sched.log_initial_starts(&mut logger, &run_id);
        let result = sched.execute(bridge, &mut logger, &run_id).await.unwrap();

        let _ = std::fs::remove_dir_all(&tmp);
        result
    }

    #[tokio::test]
    async fn task_with_false_condition_is_skipped() {
        use crate::ci::types::{CommandTask, Condition};

        let mut tasks = BTreeMap::new();
        tasks.insert(
            "cond-task".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo should-not-run".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    cond: Some(Condition::Env {
                        name: "__VTZ_COND_TEST_NONEXISTENT_VAR__".to_string(),
                        value: None,
                    }),
                    ..Default::default()
                },
            }),
        );

        let result = run_scheduler(
            tasks,
            vec!["cond-task".to_string()],
            None,
            "main".to_string(),
        )
        .await;

        assert_eq!(
            result.skipped_count, 1,
            "task with false condition should be skipped"
        );
        assert_eq!(result.executed_count, 0, "no tasks should execute");
        let task_result = result.results.get("cond-task").unwrap();
        assert_eq!(task_result.status, TaskStatus::Skipped);
    }

    #[tokio::test]
    async fn task_with_true_condition_runs_normally() {
        use crate::ci::types::{CommandTask, Condition};

        let mut tasks = BTreeMap::new();
        tasks.insert(
            "cond-task".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo hello".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    cond: Some(Condition::Env {
                        name: "HOME".to_string(),
                        value: None,
                    }),
                    ..Default::default()
                },
            }),
        );

        let result = run_scheduler(
            tasks,
            vec!["cond-task".to_string()],
            None,
            "main".to_string(),
        )
        .await;

        assert_eq!(
            result.executed_count, 1,
            "task with true condition should run"
        );
        assert_eq!(result.skipped_count, 0, "no tasks should be skipped");
        let task_result = result.results.get("cond-task").unwrap();
        assert_eq!(task_result.status, TaskStatus::Success);
    }

    #[tokio::test]
    async fn task_without_condition_runs_normally() {
        let mut tasks = BTreeMap::new();
        tasks.insert(
            "no-cond".to_string(),
            TaskDef::Command(crate::ci::types::CommandTask {
                command: "echo hello".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    ..Default::default()
                },
            }),
        );

        let result =
            run_scheduler(tasks, vec!["no-cond".to_string()], None, "main".to_string()).await;

        assert_eq!(result.executed_count, 1);
        assert_eq!(result.skipped_count, 0);
    }

    #[tokio::test]
    async fn condition_skip_propagates_via_success_edge() {
        use crate::ci::types::{CommandTask, Condition, Dep, DepCondition, DepEdge};

        let mut tasks = BTreeMap::new();

        // Task A: false condition → will be Skipped
        tasks.insert(
            "task-a".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo a".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    cond: Some(Condition::Env {
                        name: "__VTZ_COND_PROP_NONEXISTENT__".to_string(),
                        value: None,
                    }),
                    ..Default::default()
                },
            }),
        );

        // Task B: depends on A with Success edge → should also be Skipped
        tasks.insert(
            "task-b".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo b".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    deps: vec![Dep::Edge(DepEdge {
                        task: "task-a".to_string(),
                        on: DepCondition::Success,
                    })],
                    ..Default::default()
                },
            }),
        );

        let result = run_scheduler(
            tasks,
            vec!["task-a".to_string(), "task-b".to_string()],
            None,
            "main".to_string(),
        )
        .await;

        assert_eq!(result.skipped_count, 2, "both tasks should be skipped");
        assert_eq!(result.executed_count, 0);
        assert_eq!(
            result.results.get("task-a").unwrap().status,
            TaskStatus::Skipped
        );
        assert_eq!(
            result.results.get("task-b").unwrap().status,
            TaskStatus::Skipped
        );
    }

    #[tokio::test]
    async fn condition_skip_with_default_edge_continues() {
        use crate::ci::types::{CommandTask, Condition, Dep};

        let mut tasks = BTreeMap::new();

        // Task A: false condition → will be Skipped
        tasks.insert(
            "task-a".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo a".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    cond: Some(Condition::Env {
                        name: "__VTZ_COND_DEFAULT_NONEXISTENT__".to_string(),
                        value: None,
                    }),
                    ..Default::default()
                },
            }),
        );

        // Task B: depends on A with Default edge (simple string dep)
        // Default edge: Skipped → Run (skip=continue)
        tasks.insert(
            "task-b".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo b".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    deps: vec![Dep::Simple("task-a".to_string())],
                    ..Default::default()
                },
            }),
        );

        let result = run_scheduler(
            tasks,
            vec!["task-a".to_string(), "task-b".to_string()],
            None,
            "main".to_string(),
        )
        .await;

        // A is skipped (condition), B runs (default edge treats skip as continue)
        assert_eq!(result.skipped_count, 1, "only task-a should be skipped");
        assert_eq!(result.executed_count, 1, "task-b should execute");
        assert_eq!(
            result.results.get("task-a").unwrap().status,
            TaskStatus::Skipped
        );
        assert_eq!(
            result.results.get("task-b").unwrap().status,
            TaskStatus::Success
        );
    }

    #[tokio::test]
    async fn condition_skip_with_always_edge_continues() {
        use crate::ci::types::{CommandTask, Condition, Dep, DepCondition, DepEdge};

        let mut tasks = BTreeMap::new();

        // Task A: false condition → Skipped
        tasks.insert(
            "task-a".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo a".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    cond: Some(Condition::Env {
                        name: "__VTZ_COND_ALWAYS_NONEXISTENT__".to_string(),
                        value: None,
                    }),
                    ..Default::default()
                },
            }),
        );

        // Task B: depends on A with Always edge → should still run
        tasks.insert(
            "task-b".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo b".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    deps: vec![Dep::Edge(DepEdge {
                        task: "task-a".to_string(),
                        on: DepCondition::Always,
                    })],
                    ..Default::default()
                },
            }),
        );

        let result = run_scheduler(
            tasks,
            vec!["task-a".to_string(), "task-b".to_string()],
            None,
            "main".to_string(),
        )
        .await;

        assert_eq!(result.skipped_count, 1, "only task-a should be skipped");
        assert_eq!(result.executed_count, 1, "task-b should run (always edge)");
        assert_eq!(
            result.results.get("task-a").unwrap().status,
            TaskStatus::Skipped
        );
        assert_eq!(
            result.results.get("task-b").unwrap().status,
            TaskStatus::Success
        );
    }

    #[tokio::test]
    async fn condition_changed_with_matching_files_runs() {
        use crate::ci::types::{CommandTask, Condition};

        let mut tasks = BTreeMap::new();
        tasks.insert(
            "changed-task".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo built".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    cond: Some(Condition::Changed {
                        patterns: vec!["native/**".to_string()],
                    }),
                    ..Default::default()
                },
            }),
        );

        let change_set = Some(crate::ci::changes::ChangeSet {
            files: vec![std::path::PathBuf::from("native/vtz/src/main.rs")],
            base_ref: "origin/main".to_string(),
            is_shallow: false,
        });

        let result = run_scheduler(
            tasks,
            vec!["changed-task".to_string()],
            change_set,
            "main".to_string(),
        )
        .await;

        assert_eq!(
            result.executed_count, 1,
            "task should run — changed files match"
        );
        assert_eq!(result.skipped_count, 0);
    }

    #[tokio::test]
    async fn condition_changed_with_no_matching_files_skips() {
        use crate::ci::types::{CommandTask, Condition};

        let mut tasks = BTreeMap::new();
        tasks.insert(
            "changed-task".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo built".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    cond: Some(Condition::Changed {
                        patterns: vec!["native/**".to_string()],
                    }),
                    ..Default::default()
                },
            }),
        );

        let change_set = Some(crate::ci::changes::ChangeSet {
            files: vec![std::path::PathBuf::from("packages/ui/src/index.ts")],
            base_ref: "origin/main".to_string(),
            is_shallow: false,
        });

        let result = run_scheduler(
            tasks,
            vec!["changed-task".to_string()],
            change_set,
            "main".to_string(),
        )
        .await;

        assert_eq!(
            result.skipped_count, 1,
            "task should be skipped — no matching files"
        );
        assert_eq!(result.executed_count, 0);
    }

    #[tokio::test]
    async fn condition_branch_matching_runs() {
        use crate::ci::types::{CommandTask, Condition};

        let mut tasks = BTreeMap::new();
        tasks.insert(
            "branch-task".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo deploy".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    cond: Some(Condition::Branch {
                        names: vec!["main".to_string()],
                    }),
                    ..Default::default()
                },
            }),
        );

        let result = run_scheduler(
            tasks,
            vec!["branch-task".to_string()],
            None,
            "main".to_string(),
        )
        .await;

        assert_eq!(result.executed_count, 1, "task should run — branch matches");
        assert_eq!(result.skipped_count, 0);
    }

    #[tokio::test]
    async fn condition_branch_not_matching_skips() {
        use crate::ci::types::{CommandTask, Condition};

        let mut tasks = BTreeMap::new();
        tasks.insert(
            "branch-task".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo deploy".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    cond: Some(Condition::Branch {
                        names: vec!["main".to_string()],
                    }),
                    ..Default::default()
                },
            }),
        );

        let result = run_scheduler(
            tasks,
            vec!["branch-task".to_string()],
            None,
            "feat/something".to_string(),
        )
        .await;

        assert_eq!(
            result.skipped_count, 1,
            "task should be skipped — branch doesn't match"
        );
        assert_eq!(result.executed_count, 0);
    }

    #[tokio::test]
    async fn condition_changed_without_changeset_skips() {
        use crate::ci::types::{CommandTask, Condition};

        // When ChangeSet is None (git failure), Changed condition evaluates to false
        let mut tasks = BTreeMap::new();
        tasks.insert(
            "changed-task".to_string(),
            TaskDef::Command(CommandTask {
                command: "echo built".to_string(),
                base: crate::ci::types::TaskBase {
                    scope: TaskScope::Root,
                    cond: Some(Condition::Changed {
                        patterns: vec!["src/**".to_string()],
                    }),
                    ..Default::default()
                },
            }),
        );

        let result = run_scheduler(
            tasks,
            vec!["changed-task".to_string()],
            None, // No ChangeSet — simulates git failure
            "main".to_string(),
        )
        .await;

        assert_eq!(
            result.skipped_count, 1,
            "task should be skipped — no ChangeSet available"
        );
        assert_eq!(result.executed_count, 0);
    }

    #[test]
    fn task_cache_config_presence() {
        // Task with cache config
        let task_with = TaskDef::Command(crate::ci::types::CommandTask {
            command: "echo hello".to_string(),
            base: crate::ci::types::TaskBase {
                cache: Some(TaskCacheConfig {
                    inputs: vec!["src/**".to_string()],
                    outputs: vec!["dist/**".to_string()],
                }),
                ..Default::default()
            },
        });
        assert!(task_with.base().cache.is_some());

        // Task without cache config
        let task_without = TaskDef::Command(crate::ci::types::CommandTask {
            command: "echo hello".to_string(),
            base: crate::ci::types::TaskBase::default(),
        });
        assert!(task_without.base().cache.is_none());
    }
}
