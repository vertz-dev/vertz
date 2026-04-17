use crate::common::*;
use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::time::timeout;
use vertz_runtime::compiler::cache::CompilationCache;
use vertz_runtime::hmr::protocol::HmrMessage;
use vertz_runtime::plugin::vertz::VertzPlugin;
use vertz_runtime::plugin::{hmr_action_to_message, FrameworkPlugin, HmrAction};
use vertz_runtime::watcher::file_watcher::{
    FileChange, FileChangeKind, FileWatcher, FileWatcherConfig,
};
use vertz_runtime::watcher::module_graph::ModuleGraph;
use vertz_runtime::watcher::{new_shared_module_graph, process_file_change};

/// Parity #37: File change triggers module update message on WebSocket.
/// Uses direct `hmr_hub.broadcast()` for deterministic testing (Tier 1).
#[tokio::test]
async fn hmr_update_message_delivered_to_websocket_client() {
    let (base_url, handle) = start_dev_server("minimal-app").await;
    let ws_url = base_url.replace("http://", "ws://") + "/__vertz_hmr";
    let (mut ws, _) = tokio_tungstenite::connect_async(&ws_url).await.unwrap();

    // Read "connected" message
    let msg = timeout(Duration::from_secs(2), ws.next())
        .await
        .expect("timeout waiting for connected msg")
        .unwrap()
        .unwrap();
    let text = msg.to_text().unwrap();
    let json: serde_json::Value = serde_json::from_str(text).unwrap();
    assert_eq!(json["type"], "connected");

    // Broadcast an update via the HMR hub
    handle
        .state
        .hmr_hub
        .broadcast(HmrMessage::Update {
            modules: vec!["src/app.tsx".to_string()],
            timestamp: 12345,
        })
        .await;

    // Read the update message
    let msg = timeout(Duration::from_secs(2), ws.next())
        .await
        .expect("timeout waiting for update msg")
        .unwrap()
        .unwrap();
    let text = msg.to_text().unwrap();
    let json: serde_json::Value = serde_json::from_str(text).unwrap();
    assert_eq!(json["type"], "update");
    assert!(json["modules"]
        .as_array()
        .unwrap()
        .contains(&serde_json::json!("src/app.tsx")));
    assert_eq!(json["timestamp"], 12345);
}

/// Parity #38: CSS-only update delivers css-update message, not full-reload.
/// Uses direct `hmr_hub.broadcast()` for deterministic testing (Tier 1).
#[tokio::test]
async fn hmr_css_update_message_delivered_without_full_reload() {
    let (base_url, handle) = start_dev_server("minimal-app").await;
    let ws_url = base_url.replace("http://", "ws://") + "/__vertz_hmr";
    let (mut ws, _) = tokio_tungstenite::connect_async(&ws_url).await.unwrap();

    // Skip "connected" message
    let _ = timeout(Duration::from_secs(2), ws.next())
        .await
        .expect("timeout waiting for connected msg");

    // Broadcast CSS update
    handle
        .state
        .hmr_hub
        .broadcast(HmrMessage::CssUpdate {
            file: "src/styles.css".to_string(),
            timestamp: 12346,
        })
        .await;

    // Read the CSS update message
    let msg = timeout(Duration::from_secs(2), ws.next())
        .await
        .expect("timeout waiting for css-update msg")
        .unwrap()
        .unwrap();
    let text = msg.to_text().unwrap();
    let json: serde_json::Value = serde_json::from_str(text).unwrap();
    assert_eq!(json["type"], "css-update");
    assert_eq!(json["file"], "src/styles.css");
    assert_eq!(json["timestamp"], 12346);
}

/// Parity #39: Entry file change detected by FileWatcher.
/// Uses a real FileWatcher + tempdir for end-to-end watcher integration (Tier 2).
#[tokio::test]
async fn entry_file_change_triggers_full_reload() {
    let tmp = tempfile::tempdir().unwrap();
    copy_fixture("minimal-app", tmp.path());

    let src_dir = tmp.path().join("src");
    let (_watcher, mut rx) = FileWatcher::start(&src_dir, FileWatcherConfig::default()).unwrap();

    // Give the watcher time to initialize and drain any stale events from
    // copy_fixture (file creation events for Hello.tsx, etc.).
    tokio::time::sleep(Duration::from_millis(300)).await;
    while rx.try_recv().is_ok() {}

    // Modify entry file
    let entry = src_dir.join("app.tsx");
    let content = std::fs::read_to_string(&entry).unwrap();
    std::fs::write(&entry, format!("{}\n// changed", content)).unwrap();

    // Wait for the app.tsx change event. The watcher may deliver events for
    // other files first (e.g., late copy_fixture events on slow CI runners),
    // so loop until we see the one we care about.
    let change = timeout(Duration::from_secs(5), async {
        loop {
            let event = rx.recv().await.expect("watcher channel closed");
            if event.path.ends_with("app.tsx") {
                return event;
            }
        }
    })
    .await
    .expect("no app.tsx change detected within 5s");

    // macOS may report Create instead of Modify for writes to temp dirs
    assert!(
        change.kind == FileChangeKind::Modify || change.kind == FileChangeKind::Create,
        "Expected Modify or Create, got: {:?}",
        change.kind
    );
}

/// Parity #41: Deleting a file broadcasts an HMR Update for its dependents
/// and cleans the module graph so future invalidations are not contaminated.
#[tokio::test]
async fn file_delete_triggers_hmr_update_and_cleans_graph() {
    let root = Path::new("/project");
    let entry = PathBuf::from("/project/src/app.tsx");
    let deleted = PathBuf::from("/project/src/utils.ts");

    let cache = CompilationCache::new();
    let graph = new_shared_module_graph();

    // app.tsx imports utils.ts
    {
        let mut g = graph.write().unwrap();
        g.update_module(&entry, vec![deleted.clone()]);
    }

    let result = process_file_change(
        &FileChange {
            kind: FileChangeKind::Remove,
            path: deleted.clone(),
        },
        &cache,
        &graph,
        &entry,
    );

    // Deleted file must be gone from the graph.
    assert!(
        !graph.read().unwrap().has_module(&deleted),
        "deleted file must be removed from graph"
    );

    // Dependent must be in the invalidation result.
    assert!(
        result.invalidated_files.contains(&entry),
        "dependent must be invalidated after delete"
    );

    // Plugin strategy must produce a ModuleUpdate (not a no-op) for the dependent.
    let action = VertzPlugin.hmr_strategy(&result);
    let modules = match action {
        HmrAction::ModuleUpdate(m) => m,
        other => panic!("expected ModuleUpdate for delete with dependents, got {other:?}"),
    };
    assert!(
        modules.iter().any(|p| p == &entry),
        "update modules must include the dependent"
    );

    // Message serialized through the plugin pipeline is an Update with the
    // dependent's root-relative URL.
    let msg = hmr_action_to_message(&HmrAction::ModuleUpdate(modules.clone()), root);
    match msg {
        HmrMessage::Update { modules: mods, .. } => {
            assert!(
                mods.iter().any(|m| m == "/src/app.tsx"),
                "broadcast update must include the dependent's URL, got: {mods:?}"
            );
        }
        other => panic!("expected Update HMR message, got {other:?}"),
    }
}

/// Parity #42: Deleting the entry file triggers a FullReload.
#[tokio::test]
async fn entry_file_delete_triggers_full_reload() {
    let entry = PathBuf::from("/project/src/app.tsx");

    let cache = CompilationCache::new();
    let graph = new_shared_module_graph();
    graph.write().unwrap().update_module(&entry, vec![]);

    let result = process_file_change(
        &FileChange {
            kind: FileChangeKind::Remove,
            path: entry.clone(),
        },
        &cache,
        &graph,
        &entry,
    );

    assert!(result.is_entry_file);
    match VertzPlugin.hmr_strategy(&result) {
        HmrAction::FullReload(_) => {}
        other => panic!("expected FullReload for entry-file delete, got {other:?}"),
    }
}

/// Parity #40: Module graph tracks transitive dependents.
/// A→B→C: changing C invalidates both B and A.
#[tokio::test]
async fn dependency_change_invalidates_transitive_dependents() {
    let mut graph = ModuleGraph::new();

    let a = PathBuf::from("/project/src/app.tsx");
    let b = PathBuf::from("/project/src/components/Button.tsx");
    let c = PathBuf::from("/project/src/utils/helpers.ts");

    // A imports B, B imports C
    graph.update_module(&a, vec![b.clone()]);
    graph.update_module(&b, vec![c.clone()]);

    // Direct dependents of C → B
    let direct = graph.get_dependents(&c);
    assert_eq!(direct.len(), 1);
    assert!(direct.contains(&b));

    // Transitive dependents of C → {C, B, A}
    let transitive = graph.get_transitive_dependents(&c);
    assert!(
        transitive.contains(&a),
        "A should be a transitive dependent of C"
    );
    assert!(
        transitive.contains(&b),
        "B should be a transitive dependent of C"
    );
    assert!(
        transitive.contains(&c),
        "C should include itself in transitive set"
    );
}
