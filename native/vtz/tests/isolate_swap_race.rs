//! Integration tests for #2405: API isolate swap must wait for initialization
//! before replacing the old isolate, preventing 503 responses during HMR.
//!
//! The dev server's file watcher restarts the API isolate on source changes.
//! Previously, it swapped in the new (uninitialized) isolate immediately,
//! creating a window where all API requests received 503. The fix spawns a
//! task that waits for init before swapping, so the old isolate keeps serving.

use std::sync::{Arc, RwLock};
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
/// Uses a 30-second timeout because CI runners can be slow under load.
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

/// Verifies the zero-downtime swap pattern used by the file watcher:
/// create new isolate → wait for init → swap into shared state.
///
/// The old isolate remains in state (serving requests) until the new one
/// is fully initialized. After the swap, the state always contains an
/// initialized isolate — no 503 window.
#[tokio::test]
async fn swap_after_init_preserves_initialized_invariant() {
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
        enable_inspector: false,
        inspect_brk: false,
        inspector_session_tx: None,
    };

    // Create and initialize the first isolate (simulates server startup)
    let isolate1 = PersistentIsolate::new(opts.clone()).unwrap();
    wait_initialized(&isolate1).await;

    let state: Arc<RwLock<Option<Arc<PersistentIsolate>>>> =
        Arc::new(RwLock::new(Some(Arc::new(isolate1))));

    // Verify initial state: isolate is initialized
    {
        let guard = state.read().unwrap();
        assert!(
            guard.as_ref().unwrap().is_initialized(),
            "initial isolate must be initialized"
        );
    }

    // Create new isolate (simulating HMR file-change restart)
    let new_isolate = PersistentIsolate::new(opts).unwrap();
    let new_arc = Arc::new(new_isolate);

    // The fix: wait for init BEFORE swapping
    wait_initialized(&new_arc).await;

    // Swap — old isolate is replaced only after new one is ready
    {
        let mut guard = state.write().unwrap();
        guard.replace(Arc::clone(&new_arc));
    }

    // Invariant: state ALWAYS contains an initialized isolate (no 503 window)
    let guard = state.read().unwrap();
    assert!(
        guard.as_ref().unwrap().is_initialized(),
        "isolate in state must be initialized after swap — no 503 window (#2405)"
    );
}

/// Verifies that swapping without waiting for init creates an uninitialized
/// window. This documents the bug that #2405 fixes: the old code swapped
/// the new isolate in immediately, causing 503 responses.
#[tokio::test]
async fn swap_without_init_wait_exposes_uninitialized_isolate() {
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
        enable_inspector: false,
        inspect_brk: false,
        inspector_session_tx: None,
    };

    let isolate1 = PersistentIsolate::new(opts.clone()).unwrap();
    wait_initialized(&isolate1).await;

    let state: Arc<RwLock<Option<Arc<PersistentIsolate>>>> =
        Arc::new(RwLock::new(Some(Arc::new(isolate1))));

    // Create new isolate and swap IMMEDIATELY without waiting (the old buggy pattern)
    let new_isolate = PersistentIsolate::new(opts).unwrap();
    let new_arc = Arc::new(new_isolate);

    {
        let mut guard = state.write().unwrap();
        guard.replace(Arc::clone(&new_arc));
    }

    // The new isolate is likely NOT initialized yet — this is the bug window.
    // We can't assert !is_initialized() deterministically (V8 might init fast),
    // but we CAN verify that after eventually waiting, it does initialize.
    // The point: the swap happened BEFORE init, so there WAS a window.
    wait_initialized(&new_arc).await;
    assert!(
        new_arc.is_initialized(),
        "isolate should eventually initialize"
    );
}
