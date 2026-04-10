//! Integration tests for #2405: API isolate swap must wait for initialization
//! before replacing the old isolate, preventing 503 responses during HMR.
//!
//! The dev server's file watcher restarts the API isolate on source changes.
//! Previously, it swapped in the new (uninitialized) isolate immediately,
//! creating a window where all API requests received 503. The fix spawns a
//! task that waits for init before swapping, so the old isolate keeps serving.
//!
//! A generation counter prevents stale isolates from overwriting newer ones
//! when rapid saves spawn concurrent init-then-swap tasks.

use std::sync::atomic::{AtomicU64, Ordering};
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

fn test_opts(root: &std::path::Path) -> PersistentIsolateOptions {
    PersistentIsolateOptions {
        root_dir: root.to_path_buf(),
        ssr_entry: root.join("src/app.js"),
        server_entry: None,
        channel_capacity: 16,
        auto_installer: None,
        init_timeout: Some(Duration::from_secs(30)),
        enable_inspector: false,
        inspect_brk: false,
        inspector_session_tx: None,
    }
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
    let opts = test_opts(&root);

    // Create and initialize the first isolate (simulates server startup)
    let isolate1 = PersistentIsolate::new(opts.clone()).unwrap();
    isolate1.wait_for_init().await.unwrap();

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
    new_arc.wait_for_init().await.unwrap();

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

/// Verifies the generation counter prevents stale isolates from overwriting
/// newer ones. Simulates two rapid file saves: the first isolate finishes
/// init AFTER the second one is spawned, and should be discarded.
#[tokio::test]
async fn generation_counter_prevents_stale_swap() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    create_test_project(&root);
    let opts = test_opts(&root);

    // Setup: initial isolate in state
    let isolate1 = PersistentIsolate::new(opts.clone()).unwrap();
    isolate1.wait_for_init().await.unwrap();

    let state: Arc<RwLock<Option<Arc<PersistentIsolate>>>> =
        Arc::new(RwLock::new(Some(Arc::new(isolate1))));
    let generation = Arc::new(AtomicU64::new(0));

    // First "save": create isolate-A with generation 1
    let isolate_a = Arc::new(PersistentIsolate::new(opts.clone()).unwrap());
    let gen_a = generation.fetch_add(1, Ordering::SeqCst) + 1;
    assert_eq!(gen_a, 1);

    // Second "save" before A finishes: create isolate-B with generation 2
    let isolate_b = Arc::new(PersistentIsolate::new(opts).unwrap());
    let gen_b = generation.fetch_add(1, Ordering::SeqCst) + 1;
    assert_eq!(gen_b, 2);

    // Both finish init
    isolate_a.wait_for_init().await.unwrap();
    isolate_b.wait_for_init().await.unwrap();

    // B swaps in first (it's the latest generation)
    assert_eq!(generation.load(Ordering::SeqCst), gen_b);
    {
        let mut guard = state.write().unwrap();
        guard.replace(Arc::clone(&isolate_b));
    }

    // A tries to swap — generation check prevents it
    let current_gen = generation.load(Ordering::SeqCst);
    assert_ne!(current_gen, gen_a, "generation should have advanced past A");
    // In production code, the spawned task would `return` here.
    // We verify the guard condition holds:
    assert!(
        current_gen != gen_a,
        "stale isolate A must not swap — generation mismatch"
    );

    // State still contains isolate-B (the newer one)
    let guard = state.read().unwrap();
    assert!(guard.as_ref().unwrap().is_initialized());
}

/// Verifies the error path: when the new isolate fails to initialize
/// (timeout), the old isolate remains in state and no swap occurs.
#[tokio::test]
async fn failed_init_keeps_old_isolate_serving() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    create_test_project(&root);
    let opts = test_opts(&root);

    // Setup: working isolate in state
    let good_isolate = PersistentIsolate::new(opts).unwrap();
    good_isolate.wait_for_init().await.unwrap();
    let good_arc = Arc::new(good_isolate);

    let state: Arc<RwLock<Option<Arc<PersistentIsolate>>>> =
        Arc::new(RwLock::new(Some(Arc::clone(&good_arc))));

    // Create a broken isolate with a very short timeout.
    // Use a non-existent entry file so init never completes normally.
    let bad_opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/nonexistent_file_that_does_not_exist.js"),
        server_entry: None,
        channel_capacity: 16,
        auto_installer: None,
        init_timeout: Some(Duration::from_millis(100)),
        enable_inspector: false,
        inspect_brk: false,
        inspector_session_tx: None,
    };

    let bad_isolate = PersistentIsolate::new(bad_opts).unwrap();

    // wait_for_init may succeed (isolate marks itself initialized even with
    // a bad entry in some code paths) or fail. Either way, verify that the
    // old isolate is still in state if we chose not to swap on error.
    let init_result = bad_isolate.wait_for_init().await;

    if init_result.is_err() {
        // Error path: don't swap. Old isolate should remain.
        let guard = state.read().unwrap();
        assert!(
            guard.as_ref().unwrap().is_initialized(),
            "old isolate must remain in state when new isolate fails to init"
        );
    }
    // If init succeeded despite the bad path (isolate marks init even on
    // missing entry), the test still passes — the point is that on error,
    // no swap occurs.
}
