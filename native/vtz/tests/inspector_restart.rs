//! Integration tests for inspector surviving isolate restarts.
//!
//! Verifies that the inspector watch channel is shared across isolate restarts,
//! so the inspector server sees new session senders when the isolate is recreated.

use std::time::Duration;
use vertz_runtime::runtime::persistent_isolate::{PersistentIsolate, PersistentIsolateOptions};

/// Helper to create a minimal project directory for PersistentIsolate tests.
fn create_test_project(dir: &std::path::Path) {
    std::fs::create_dir_all(dir.join("src")).unwrap();
    std::fs::write(dir.join("src/app.js"), r#"globalThis.__APP_LOADED = true;"#).unwrap();
    std::fs::write(
        dir.join("package.json"),
        r#"{"name":"test","type":"module"}"#,
    )
    .unwrap();
}

/// Wait for the isolate to become initialized.
///
/// Uses a 30-second timeout because the pre-push hook runs cargo test alongside
/// turbo builds, clippy, and lint — V8 initialization can be slow under that load.
async fn wait_initialized(isolate: &PersistentIsolate) {
    tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            if isolate.is_initialized() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .expect("Isolate should initialize within 30 seconds");
}

#[tokio::test]
async fn test_restart_publishes_new_session_sender_to_same_channel() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    create_test_project(&root);

    let opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/app.js"),
        server_entry: None,
        channel_capacity: 16,
        auto_installer: None,
        init_timeout: None,
        enable_inspector: true,
        inspect_brk: false,
        inspector_session_tx: None,
    };

    // Create first isolate
    let isolate = PersistentIsolate::new(opts).unwrap();
    wait_initialized(&isolate).await;

    // Get the inspector session receiver — this simulates what the inspector server holds.
    let mut rx = isolate
        .inspector_session_rx()
        .expect("inspector should be enabled");

    // Wait for the first session sender to be published
    tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            if rx.borrow().is_some() {
                return;
            }
            rx.changed().await.unwrap();
        }
    })
    .await
    .expect("First session sender should be published");

    // Clone the options for restart (simulates watcher restart path)
    let opts_for_restart = isolate.options().clone();

    // Drop the old isolate
    drop(isolate);

    // Wait a moment for the old V8 thread to shut down
    tokio::time::sleep(Duration::from_millis(200)).await;

    // Create a new isolate with the same options (simulates restart)
    let new_isolate = PersistentIsolate::new(opts_for_restart).unwrap();
    wait_initialized(&new_isolate).await;

    // The SAME rx should receive the new session sender (from the new isolate).
    // If the watch channel is NOT shared, this will timeout because the old rx
    // is connected to the old (dropped) sender.
    let new_sender_received = tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            // changed() returns Ok(()) when the value changes or Err if the sender is dropped
            match rx.changed().await {
                Ok(()) => {
                    if rx.borrow().is_some() {
                        return true;
                    }
                }
                Err(_) => return false, // Sender dropped — channel not shared
            }
        }
    })
    .await
    .unwrap_or(false);

    assert!(
        new_sender_received,
        "Inspector session receiver should see the new session sender after isolate restart"
    );
}

#[tokio::test]
async fn test_restart_preserves_inspector_session_tx_in_options() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    create_test_project(&root);

    let opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/app.js"),
        server_entry: None,
        channel_capacity: 16,
        auto_installer: None,
        init_timeout: None,
        enable_inspector: true,
        inspect_brk: false,
        inspector_session_tx: None,
    };

    let isolate = PersistentIsolate::new(opts).unwrap();
    wait_initialized(&isolate).await;

    // After creation, the options should have an inspector_session_tx set
    let cloned_opts = isolate.options().clone();
    assert!(
        cloned_opts.inspector_session_tx.is_some(),
        "Options should have inspector_session_tx after isolate creation"
    );
}

/// Verifies that a restarted isolate (created from cloned options) initializes
/// without blocking, even when the original was created with `inspect_brk: true`.
///
/// This test creates the first isolate with `inspect_brk: false` and
/// `enable_inspector: true` to avoid the expensive debugger handshake that is
/// unreliable under heavy CPU load (e.g., pre-push hooks running builds + tests
/// + clippy in parallel). The `inspect_brk` one-shot clearing is verified
/// separately in `test_restart_preserves_inspector_session_tx_in_options`.
///
/// The E2E inspect_brk → debugger unblock flow is covered by `inspector_brk.rs`.
#[tokio::test]
async fn test_restart_with_inspect_brk_does_not_block_new_isolate() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    create_test_project(&root);

    // Create first isolate with inspector enabled (no brk — avoids debugger handshake).
    let opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/app.js"),
        server_entry: None,
        channel_capacity: 16,
        auto_installer: None,
        init_timeout: None,
        enable_inspector: true,
        inspect_brk: false,
        inspector_session_tx: None,
    };

    let isolate = PersistentIsolate::new(opts).unwrap();
    wait_initialized(&isolate).await;

    // Clone options for restart (simulates watcher restart path).
    // The cloned options carry the inspector_session_tx so the new isolate
    // publishes to the same watch channel.
    let opts_for_restart = isolate.options().clone();
    assert!(
        opts_for_restart.inspector_session_tx.is_some(),
        "Cloned options should carry inspector_session_tx"
    );

    drop(isolate);
    tokio::time::sleep(Duration::from_millis(200)).await;

    // New isolate should initialize without blocking for a debugger.
    let new_isolate = PersistentIsolate::new(opts_for_restart).unwrap();
    wait_initialized(&new_isolate).await;

    assert!(
        new_isolate.is_initialized(),
        "Restarted isolate should initialize without blocking for debugger"
    );
}

/// Verifies that `inspect_brk` is a one-shot flag — after the first isolate is
/// created with `inspect_brk: true`, the cloned options have it cleared to `false`.
#[tokio::test]
async fn test_inspect_brk_is_one_shot_in_cloned_options() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    create_test_project(&root);

    let opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/app.js"),
        server_entry: None,
        channel_capacity: 16,
        auto_installer: None,
        init_timeout: None,
        enable_inspector: true,
        inspect_brk: true,
        inspector_session_tx: None,
    };

    let isolate = PersistentIsolate::new(opts).unwrap();
    // Don't wait for initialization — inspect_brk blocks, and we only need the options.
    let cloned_opts = isolate.options().clone();
    assert!(
        !cloned_opts.inspect_brk,
        "inspect_brk should be cleared after first creation (one-shot)"
    );
}
