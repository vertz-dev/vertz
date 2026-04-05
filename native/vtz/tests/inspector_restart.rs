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
async fn wait_initialized(isolate: &PersistentIsolate) {
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            if isolate.is_initialized() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .expect("Isolate should initialize within 10 seconds");
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
    tokio::time::timeout(Duration::from_secs(5), async {
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
    let new_sender_received = tokio::time::timeout(Duration::from_secs(5), async {
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

#[tokio::test]
async fn test_restart_with_inspect_brk_does_not_block_new_isolate() {
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
        inspect_brk: true, // Initial creation blocks for debugger
        inspector_session_tx: None,
    };

    // Create isolate with --inspect-brk (it will block)
    let isolate = PersistentIsolate::new(opts).unwrap();

    // Connect a debugger to unblock it (same flow as inspector_brk test)
    let rx = isolate
        .inspector_session_rx()
        .expect("inspector should be enabled");
    let mut rx_clone = rx.clone();
    let sender = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            {
                let val = rx_clone.borrow_and_update();
                if let Some(ref s) = *val {
                    return s.clone();
                }
            }
            rx_clone.changed().await.unwrap();
        }
    })
    .await
    .expect("Session sender should be published");

    let (outbound_tx, _outbound_rx) =
        futures::channel::mpsc::unbounded::<deno_core::InspectorMsg>();
    let (inbound_tx, inbound_rx) = futures::channel::mpsc::unbounded::<String>();
    inbound_tx
        .unbounded_send(r#"{"id":1,"method":"Runtime.runIfWaitingForDebugger"}"#.to_string())
        .unwrap();
    let proxy = deno_core::InspectorSessionProxy {
        tx: outbound_tx,
        rx: inbound_rx,
    };
    sender.unbounded_send(proxy).unwrap();
    let _keep = inbound_tx;

    wait_initialized(&isolate).await;

    // Now simulate restart — clone options and create a new isolate.
    // The cloned options should have inspect_brk cleared (one-shot).
    let opts_for_restart = isolate.options().clone();
    assert!(
        !opts_for_restart.inspect_brk,
        "inspect_brk should be cleared after first creation (one-shot)"
    );

    drop(isolate);
    tokio::time::sleep(Duration::from_millis(200)).await;

    // New isolate should NOT block for a debugger
    let new_isolate = PersistentIsolate::new(opts_for_restart).unwrap();
    wait_initialized(&new_isolate).await;

    // Verify the new isolate is initialized (not stuck waiting for debugger)
    assert!(
        new_isolate.is_initialized(),
        "Restarted isolate should initialize without blocking for debugger"
    );
}
