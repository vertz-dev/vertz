//! Per-event handling inside the dev server's file-watcher loop.
//!
//! Extracted from `server::http` so the change pipeline — MCP event emission,
//! error clearing, optional recompilation, module-graph maintenance, and the
//! downstream HMR broadcast — is reachable from tests without spinning up the
//! full `start_server_with_lifecycle` stack.

use std::path::Path;
use std::sync::Arc;

use crate::deps::scanner::scan_local_dependencies;
use crate::errors::categories::{build_compile_error, ErrorCategory};
use crate::hmr::protocol::HmrMessage;
use crate::hmr::recovery::RestartTriggers;
use crate::plugin::{hmr_action_to_message, HmrAction};
use crate::server::audit_log::AuditEvent;
use crate::server::mcp_events::{self, McpEvent};
use crate::server::module_server::DevServerState;
use crate::watcher::file_watcher::{FileChange, FileChangeKind};
use crate::watcher::process_file_change;

/// Handle a single debounced file change. This runs once per unique path in a
/// batch; the outer loop already handles per-batch work (isolate restart, SSR
/// pool reload).
///
/// On compile errors for `Modify`/`Create`: the structured diagnostic is
/// broadcast, the module-graph update is skipped (don't commit edges scanned
/// from broken source), but `process_file_change` still runs so transitive
/// dependents are invalidated. Without that, dependents of a file that failed
/// to compile would keep serving stale compiled output until individually
/// re-touched (#2766).
pub async fn handle_file_change(
    change: &FileChange,
    state: &Arc<DevServerState>,
    entry_file: &Path,
    root_dir: &Path,
    restart_triggers: &RestartTriggers,
) {
    eprintln!("[Server] File changed: {}", change.path.display());

    // Emit file_change event to MCP LLM clients. Never leak absolute paths —
    // use file_name() as last resort.
    let relative_path = change
        .path
        .strip_prefix(root_dir)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| {
            change
                .path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "<unknown>".to_string())
        });
    let kind_str = match change.kind {
        FileChangeKind::Create => "create",
        FileChangeKind::Modify => "modify",
        FileChangeKind::Remove => "delete",
    };
    state
        .audit_log
        .record(AuditEvent::file_change(&relative_path, kind_str));
    state.mcp_event_hub.broadcast(McpEvent::FileChange {
        timestamp: mcp_events::iso_timestamp(),
        data: mcp_events::FileChangeData {
            path: relative_path,
            kind: kind_str.to_string(),
        },
    });

    // Config/dependency file → full reload, clear cache, skip the rest.
    if restart_triggers.is_restart_trigger(&change.path) {
        eprintln!(
            "[Server] Config/dependency change detected: {}",
            change.path.display()
        );
        state
            .hmr_hub
            .broadcast(HmrMessage::FullReload {
                reason: format!(
                    "Config file changed: {}",
                    change
                        .path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                ),
            })
            .await;
        state.pipeline.cache().clear();
        return;
    }

    // Record the file change timestamp so the client error handler can reject
    // stale reports.
    if let Ok(mut ts) = state.last_file_change.lock() {
        *ts = Some(std::time::Instant::now());
    }

    // Clear any previous errors for this file.
    let file_str = change.path.to_string_lossy().to_string();
    state
        .error_broadcaster
        .clear_file(ErrorCategory::Build, &file_str)
        .await;
    // A changed import may now point to a valid module.
    state
        .error_broadcaster
        .clear_category(ErrorCategory::Resolve)
        .await;
    // A fixed source file means SSR will succeed on next render.
    state
        .error_broadcaster
        .clear_category(ErrorCategory::Ssr)
        .await;
    // Previous client-side errors may no longer apply after a code change.
    state
        .error_broadcaster
        .clear_category(ErrorCategory::Runtime)
        .await;

    // Delete events: skip compilation and import-graph rewriting — the file is
    // gone. `process_file_change` still cleans up the graph entry and
    // invalidates dependents.
    let is_remove = matches!(change.kind, FileChangeKind::Remove);

    let mut had_compile_error = false;
    if !is_remove {
        // Attempt recompilation for error recovery.
        let compile_result = state.pipeline.compile_for_browser(&change.path);

        if !compile_result.errors.is_empty() {
            had_compile_error = true;
            // Report structured compilation diagnostics. Fall through to
            // `process_file_change` below so the cache for this file and its
            // transitive dependents is invalidated — otherwise dependents keep
            // serving stale compiled output after the error is fixed (#2766).
            // Skip the graph update: we don't want to commit import edges
            // scanned from broken source. Side effect: the last-successful
            // graph edges for this module persist until the next successful
            // compile — that only ever causes over-invalidation of unrelated
            // edits (safe), never missed invalidation.
            let source = std::fs::read_to_string(&change.path).unwrap_or_default();
            if let Some(error) = build_compile_error(&compile_result.errors, &file_str, &source) {
                state.error_broadcaster.report_error(error).await;
            }
        } else {
            // Update module graph with this file's imports so transitive
            // dependents are invalidated correctly.
            let source = std::fs::read_to_string(&change.path).unwrap_or_default();
            if !source.is_empty() {
                let deps = scan_local_dependencies(&source, &change.path);
                if let Ok(mut graph) = state.module_graph.write() {
                    graph.update_module(&change.path, deps);
                }
            }
        }
    }

    // Process the change — invalidates cache, computes dependents, and for
    // Remove events also cleans the graph.
    let result = process_file_change(
        change,
        state.pipeline.cache(),
        &state.module_graph,
        entry_file,
    );

    // Use plugin's HMR strategy to decide what action to take. Skip the
    // broadcast when the file failed to compile: the error overlay is the
    // user-visible state, and firing Update/FullReload on every broken
    // keystroke either makes the client re-fetch a module that will error
    // out or (for entry-file edits) reloads the page mid-error and loses
    // in-memory state. Cache was invalidated above; the next successful
    // compile will drive the refetch.
    if !had_compile_error {
        let action = state.plugin.hmr_strategy(&result);
        if !matches!(action, HmrAction::Handled) {
            let message = hmr_action_to_message(&action, root_dir);
            state.hmr_hub.broadcast(message).await;
        }
    }
}
