pub mod cache;
pub mod changes;
pub mod config;
pub mod graph;
pub mod logs;
pub mod scheduler;
pub mod types;
pub mod workspace;

use config::{collect_secret_values, validate_secrets};
use logs::{LogEntry, LogWriter};
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use types::TaskDef;

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
        base: Option<String>,
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

/// Options for running a task or workflow.
struct RunOptions {
    name: String,
    all: bool,
    scope: Option<String>,
    base: Option<String>,
    dry_run: bool,
    quiet: bool,
    concurrency: Option<usize>,
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
            base,
        } => {
            if verbose {
                eprintln!("[pipe] warning: --verbose flag is not yet implemented, ignored");
            }
            if json {
                eprintln!("[pipe] warning: --json flag is not yet implemented, ignored");
            }
            run_task_or_workflow(
                root_dir,
                RunOptions {
                    name,
                    all,
                    scope,
                    base,
                    dry_run,
                    quiet,
                    concurrency,
                },
            )
            .await
        }
        CiAction::Affected { base, json } => run_affected(root_dir, &base, json).await,
        CiAction::CacheStatus => {
            let backend = cache::create_cache_backend(root_dir, None);
            // Downcast to LocalCache for status info
            let cache_dir = root_dir.join(".pipe").join("cache");
            let local = cache::LocalCache::new(cache_dir.clone(), None);
            let (total_bytes, count) = local.status();
            let total_mb = total_bytes as f64 / (1024.0 * 1024.0);
            let max_mb = 2048.0;
            eprintln!("Cache directory: {}", cache_dir.display());
            eprintln!("Total size: {total_mb:.0} MB / {max_mb:.0} MB");
            eprintln!("Entries: {count}");
            let _ = backend; // ensure trait object is used
            Ok(())
        }
        CiAction::CacheClean => {
            let cache_dir = root_dir.join(".pipe").join("cache");
            let local = cache::LocalCache::new(cache_dir, None);
            match local.clean() {
                Ok((count, bytes)) => {
                    let mb = bytes as f64 / (1024.0 * 1024.0);
                    eprintln!("Cleared {count} entries ({mb:.0} MB)");
                }
                Err(e) => return Err(e),
            }
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
async fn run_task_or_workflow(root_dir: &Path, opts: RunOptions) -> Result<(), String> {
    let RunOptions {
        name,
        all,
        scope,
        base,
        dry_run,
        quiet,
        concurrency,
    } = opts;
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

    // 5. Build workflow config (from named workflow or synthetic for single task)
    let workflow = if let Some(wf) = pipe_config.workflows.get(&name) {
        wf.clone()
    } else if pipe_config.tasks.contains_key(&name) {
        types::WorkflowConfig {
            run: vec![name],
            filter: types::WorkflowFilter::All,
            env: std::collections::BTreeMap::new(),
        }
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

    // 6. Resolve package filter
    //    --all overrides to All, --scope overrides to specific packages,
    //    otherwise use the workflow's declared filter.
    let filter_packages = if all {
        None // All packages
    } else if let Some(ref scope_pkg) = scope {
        Some(std::collections::BTreeSet::from([scope_pkg.clone()]))
    } else {
        match &workflow.filter {
            types::WorkflowFilter::All => None,
            types::WorkflowFilter::Packages(pkgs) => Some(
                pkgs.iter()
                    .cloned()
                    .collect::<std::collections::BTreeSet<String>>(),
            ),
            types::WorkflowFilter::Affected => {
                // Run change detection to determine affected packages
                let base_ref = changes::ChangeDetector::resolve_base_ref(base.as_deref());
                let detector =
                    changes::ChangeDetector::new(root_dir.to_path_buf(), base_ref.clone());
                let change_set = detector.detect().await?;
                let affected = detector.map_to_packages(&change_set, &resolved);

                if !quiet {
                    eprintln!(
                        "[pipe] Affected: {} packages ({} direct, {} transitive)",
                        affected.all_affected.len(),
                        affected.directly_changed.len(),
                        affected.transitively_affected.len(),
                    );
                }

                if affected.all_affected.is_empty() {
                    if affected.root_changed {
                        if !quiet {
                            eprintln!(
                                "[pipe] Root files changed but no packages affected — \
                                 only root-scoped tasks will run"
                            );
                        }
                    } else {
                        if !quiet {
                            eprintln!("[pipe] No affected packages — nothing to run");
                        }
                        let _ = bridge.shutdown().await;
                        return Ok(());
                    }
                }

                Some(affected.all_affected)
            }
        }
    };

    // 7. Build task graph (DAG)
    let task_graph = graph::TaskGraph::build(
        &workflow,
        &pipe_config.tasks,
        &resolved,
        filter_packages.as_ref(),
    )?;

    if dry_run {
        eprintln!("[pipe] Dry run — no commands will be executed\n");
        print_dry_run_graph(&task_graph, &pipe_config.tasks);
        let _ = bridge.shutdown().await;
        return Ok(());
    }

    // 8. Execute via parallel scheduler
    let concurrency = concurrency.unwrap_or_else(|| {
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
    });

    if !quiet {
        eprintln!("[pipe] Running with concurrency={concurrency}");
    }

    // 8a. Create cache backend
    let max_cache_size = pipe_config.cache.as_ref().and_then(|c| c.max_size);
    let cache_backend: Arc<dyn cache::CacheBackend> =
        Arc::from(cache::create_cache_backend(root_dir, max_cache_size));

    let sched = scheduler::Scheduler::new(
        &task_graph,
        concurrency,
        &pipe_config.tasks,
        root_dir,
        &resolved,
        &secret_values,
        quiet,
        cache_backend,
    );

    // Log initial (zero-in-degree) nodes
    sched.log_initial_starts(&mut logger, &run_id);

    let bridge = Arc::new(Mutex::new(bridge));
    let result = sched.execute(bridge.clone(), &mut logger, &run_id).await?;

    let total_ms = run_start.elapsed().as_millis() as u64;

    logger.write(&LogEntry::run_end(
        &run_id,
        total_ms,
        result.executed_count,
        result.cached_count,
        result.skipped_count,
        result.failed_count,
    ));

    if !quiet {
        eprintln!(
            "\n[pipe] Done in {:.1}s ({} executed, {} cached, {} skipped, {} failed)",
            total_ms as f64 / 1000.0,
            result.executed_count,
            result.cached_count,
            result.skipped_count,
            result.failed_count,
        );
        eprintln!("       Run ID: {run_id}");
    }

    // Shutdown the config bridge
    match Arc::try_unwrap(bridge) {
        Ok(mutex) => {
            let _ = mutex.into_inner().shutdown().await;
        }
        Err(_) => {
            // Workers already dropped — bridge is gone
        }
    }

    if result.failed_count > 0 {
        Err(format!("{} task(s) failed", result.failed_count))
    } else {
        Ok(())
    }
}

/// Run the `vtz ci affected` command: list affected packages.
async fn run_affected(root_dir: &Path, base: &str, json: bool) -> Result<(), String> {
    // 1. Resolve workspace (lightweight — no config bridge needed)
    let resolved = workspace::resolve(root_dir, None)?;

    // 2. Detect changes
    let detector = changes::ChangeDetector::new(root_dir.to_path_buf(), base.to_string());
    let change_set = detector.detect().await?;
    let affected = detector.map_to_packages(&change_set, &resolved);

    if json {
        // Structured JSON output
        let output = serde_json::json!({
            "directly_changed": affected.directly_changed.iter().collect::<Vec<_>>(),
            "transitively_affected": affected.transitively_affected.iter().collect::<Vec<_>>(),
            "files_changed": change_set.files.len(),
            "root_changed": affected.root_changed,
            "base_ref": change_set.base_ref,
            "is_shallow": change_set.is_shallow,
        });
        println!(
            "{}",
            serde_json::to_string_pretty(&output).unwrap_or_default()
        );
    } else {
        if affected.all_affected.is_empty() && !affected.root_changed {
            eprintln!("[pipe] No affected packages");
            return Ok(());
        }

        for pkg in &affected.directly_changed {
            println!("{pkg}");
        }
        for pkg in &affected.transitively_affected {
            println!("{pkg} (transitive)");
        }
        if affected.root_changed {
            println!("(root files changed)");
        }
    }

    Ok(())
}

/// Print a dry-run plan using the task graph's topological order.
fn print_dry_run_graph(
    task_graph: &graph::TaskGraph,
    tasks: &std::collections::BTreeMap<String, TaskDef>,
) {
    let order = match task_graph.topological_order() {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[pipe] Error computing execution order: {e}");
            return;
        }
    };

    for idx in order {
        let node = &task_graph.nodes[idx];
        let cmd = tasks
            .get(&node.task_name)
            .map(|t| match t {
                TaskDef::Command(c) => c.command.clone(),
                TaskDef::Steps(s) => s.steps.join(" && "),
            })
            .unwrap_or_default();

        eprintln!(" \u{2192} {:<35} {cmd}", node.label());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use types::TaskScope;

    #[test]
    fn dry_run_graph_display() {
        // Verify the dry-run graph display helper doesn't panic on a simple graph
        let tasks = {
            let mut m = std::collections::BTreeMap::new();
            m.insert(
                "build".to_string(),
                TaskDef::Command(types::CommandTask {
                    command: "bun run build".to_string(),
                    base: types::TaskBase {
                        scope: TaskScope::Root,
                        ..Default::default()
                    },
                }),
            );
            m
        };

        let workspace = types::ResolvedWorkspace::default();
        let wf = types::WorkflowConfig {
            run: vec!["build".to_string()],
            filter: types::WorkflowFilter::All,
            env: std::collections::BTreeMap::new(),
        };

        let graph = graph::TaskGraph::build(&wf, &tasks, &workspace, None).unwrap();
        // Just verify it doesn't panic
        print_dry_run_graph(&graph, &tasks);
    }
}
