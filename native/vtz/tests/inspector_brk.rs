//! Integration tests for --inspect-brk behavior.
//!
//! Tests that the V8 isolate blocks initialization until a debugger connects
//! when `inspect_brk: true` is set, and that it resumes after connection.

use std::path::PathBuf;
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

#[test]
fn test_inspect_brk_field_exists_in_options() {
    let opts = PersistentIsolateOptions {
        root_dir: PathBuf::from("."),
        ssr_entry: PathBuf::from("src/app.tsx"),
        server_entry: None,
        channel_capacity: 16,
        auto_installer: None,
        enable_inspector: true,
        inspect_brk: true,
        inspector_session_tx: None,
    };
    assert!(opts.inspect_brk);
    assert!(opts.enable_inspector);
}

#[test]
fn test_inspect_brk_defaults_to_false() {
    let opts = PersistentIsolateOptions::default();
    assert!(!opts.inspect_brk);
}

#[tokio::test]
async fn test_inspect_brk_blocks_initialization() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    create_test_project(&root);

    let opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/app.js"),
        server_entry: None,
        channel_capacity: 16,
        auto_installer: None,
        enable_inspector: true,
        inspect_brk: true,
        inspector_session_tx: None,
    };

    let isolate = PersistentIsolate::new(opts).unwrap();

    // The isolate should NOT be initialized — it's blocked waiting for debugger.
    tokio::time::sleep(Duration::from_millis(500)).await;
    assert!(
        !isolate.is_initialized(),
        "Isolate should NOT be initialized while waiting for debugger (--inspect-brk)"
    );
}

#[tokio::test]
async fn test_inspect_brk_unblocks_after_debugger_connects() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    create_test_project(&root);

    let opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/app.js"),
        server_entry: None,
        channel_capacity: 16,
        auto_installer: None,
        enable_inspector: true,
        inspect_brk: true,
        inspector_session_tx: None,
    };

    let isolate = PersistentIsolate::new(opts).unwrap();

    // Get the session sender from the watch channel
    let rx = isolate
        .inspector_session_rx()
        .expect("inspector should be enabled");

    // Wait for the session sender to be published by the V8 thread
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
    .expect("Session sender should be published within 5 seconds");

    // Create channels for the InspectorSessionProxy.
    // outbound: V8 → debugger (V8 sends events like Debugger.paused)
    // inbound: debugger → V8 (we send CDP commands)
    let (outbound_tx, _outbound_rx) =
        futures::channel::mpsc::unbounded::<deno_core::InspectorMsg>();
    let (inbound_tx, inbound_rx) = futures::channel::mpsc::unbounded::<String>();

    // Pre-send Runtime.runIfWaitingForDebugger in the inbound channel.
    // This is consumed during session establishment in poll_sessions, which
    // clears the waiting_for_session flag and allows poll_sessions to return.
    // Without this, poll_sessions parks the thread after establishing the session
    // because waiting_for_session is still true.
    inbound_tx
        .unbounded_send(r#"{"id":1,"method":"Runtime.runIfWaitingForDebugger"}"#.to_string())
        .unwrap();

    // Schedule Debugger.resume for after V8 hits the break_on_next_statement pause.
    // After wait_for_session returns, V8 continues and hits the scheduled pause.
    // V8 enters run_message_loop_on_pause, which parks the thread. The delayed
    // Debugger.resume wakes it and clears the pause.
    let resume_tx = inbound_tx.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let _ = resume_tx.unbounded_send(r#"{"id":2,"method":"Debugger.enable"}"#.to_string());
        tokio::time::sleep(Duration::from_millis(100)).await;
        let _ = resume_tx
            .unbounded_send(r#"{"id":3,"method":"Debugger.resume","params":{}}"#.to_string());
    });

    // Send the proxy (connects the debugger session).
    let proxy = deno_core::InspectorSessionProxy {
        tx: outbound_tx,
        rx: inbound_rx,
    };
    sender.unbounded_send(proxy).unwrap();

    // Keep inbound_tx alive so the session doesn't close prematurely
    let _keep_alive = inbound_tx;

    // The isolate should now become initialized (modules load after debugger resumes)
    let initialized = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if isolate.is_initialized() {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .unwrap_or(false);

    assert!(
        initialized,
        "Isolate should become initialized after debugger connects and resumes"
    );
}

#[tokio::test]
async fn test_inspect_brk_banner_shows_waiting() {
    let info = vertz_runtime::server::inspector::InspectorInfo {
        ws_url: "ws://127.0.0.1:9229/test-id".to_string(),
        inspect_brk: true,
    };
    let line = vertz_runtime::banner::format_inspector_line(&info);
    assert!(
        line.contains("waiting for debugger"),
        "Banner line should contain 'waiting for debugger', got: {}",
        line
    );
}

#[tokio::test]
async fn test_inspect_without_brk_does_not_block() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    create_test_project(&root);

    let opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/app.js"),
        server_entry: None,
        channel_capacity: 16,
        auto_installer: None,
        enable_inspector: true,
        inspect_brk: false,
        inspector_session_tx: None,
    };

    let isolate = PersistentIsolate::new(opts).unwrap();

    // Should become initialized within a reasonable time (no blocking)
    let initialized = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            if isolate.is_initialized() {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .unwrap_or(false);

    assert!(
        initialized,
        "Isolate with --inspect (no brk) should initialize without a debugger"
    );
}
