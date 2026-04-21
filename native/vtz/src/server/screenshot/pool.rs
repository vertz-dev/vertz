//! Lazy + TTL Chromium browser pool.
//!
//! Phase 1 lifecycle (per `plans/2865-phase-1-headless-screenshot.md`):
//!
//! ```text
//! Idle ──[first capture]──> Launching ──[browser ready]──> Warm
//!   ▲                          │                             │
//!   │                          ▼                             │
//!   │   concurrent capture calls await the same Shared       │
//!   │   future — exactly one Browser is spawned              │
//!   │                                                        │
//!   └──────────────[TTL expires]──── Warm (unused) ◄─────────┘
//! ```
//!
//! Guarantees:
//! - Zero cost when unused (no Chromium process, no RAM).
//! - Concurrent calls during `Launching` share the same in-flight future;
//!   a second Browser is never spawned.
//! - Warm captures don't serialize — `BrowserHandle::capture` takes `&self`,
//!   and `Arc<dyn BrowserHandle>` is cloned per call so the pool lock is
//!   released before hitting the browser.
//! - `Pool::shutdown()` tears the browser down cleanly; callers integrate
//!   it into the server's existing shutdown future (Task 5).

use async_trait::async_trait;
use futures::future::{FutureExt, Shared};
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Everything the pool needs to launch a fresh Browser. Viewport can be
/// changed per-capture without relaunching (chromiumoxide exposes
/// `page.set_viewport`), so this struct carries only the *default* viewport
/// and the resolved Chrome binary path.
#[derive(Debug, Clone)]
pub struct LaunchConfig {
    pub viewport: (u32, u32),
    pub chrome_path: Option<PathBuf>,
}

/// A single screenshot request against a warm browser.
#[derive(Debug, Clone)]
pub struct CaptureRequest {
    pub url: String,
    pub viewport: (u32, u32),
    pub full_page: bool,
    pub crop: Option<CropSpec>,
    pub wait_for: WaitCondition,
}

/// Parameters for `crop` — same locator dialect as `vertz_browser_click.target`
/// but element refs are intentionally absent (this tool does not share
/// browser sessions).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CropSpec {
    Css(String),
    Text(String),
    Name(String),
    Label(String),
}

/// When to take the screenshot relative to the navigation.
///
/// All variants currently collapse to the same "wait_for_navigation" in
/// [`ChromiumoxideHandle`](super::chromium::ChromiumoxideHandle). Task 5
/// will wire per-variant behavior via CDP events (DOMContentLoaded vs
/// Load vs a real network-idle detector). The variants are defined here
/// so the MCP tool schema is stable from Task 5 onward; until then the
/// enum is a preview of the public contract, not a behavioral switch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WaitCondition {
    DomContentLoaded,
    NetworkIdle,
    Load,
}

/// Metadata returned alongside the PNG bytes.
#[derive(Debug, Clone)]
pub struct PageMeta {
    pub final_url: String,
    pub dimensions: (u32, u32),
}

/// Errors shared by the spawner, the pool, and the capture path.
///
/// `NavigationTimeout` / `PageHttpError` / `SelectorAmbiguous` variants
/// belong on this enum in spirit (they're documented MCP response codes
/// in the design doc), but they're emitted in Task 5 when the MCP tool
/// plumbing is wired — keeping them here as a preview would be dead
/// code, so they'll land with their emitters.
#[derive(Debug, thiserror::Error)]
pub enum PoolError {
    #[error("chrome launch failed: {message}")]
    Launch {
        message: String,
        hint: Option<String>,
    },
    #[error("navigation failed for {url}: {message}")]
    NavigationFailed { message: String, url: String },
    #[error("crop selector invalid: {message}")]
    SelectorInvalid { message: String },
    #[error("crop selector matched no element: {message}")]
    SelectorNotFound { message: String },
    #[error("capture failed: {message}")]
    CaptureFailed { message: String },
    #[error("pool is shutting down")]
    ShuttingDown,
}

/// Launch a Chromium process.
#[async_trait]
pub trait BrowserSpawner: Send + Sync + 'static {
    async fn launch(&self, config: LaunchConfig) -> Result<Arc<dyn BrowserHandle>, PoolError>;
}

/// A running Browser + default Page we can screenshot against.
///
/// `&self` (not `&mut self`) is load-bearing: it lets the Pool drop its
/// internal lock before calling `capture`, so warm captures run
/// concurrently against the same Browser instead of serializing.
#[async_trait]
pub trait BrowserHandle: Send + Sync {
    async fn capture(&self, req: CaptureRequest) -> Result<(Vec<u8>, PageMeta), PoolError>;
    async fn close(&self) -> Result<(), PoolError>;
}

/// Default TTL — the time a warm browser sits idle before the pool tears
/// it down. 60s matches the design doc.
pub const DEFAULT_TTL: Duration = Duration::from_secs(60);

type LaunchFuture =
    Pin<Box<dyn Future<Output = Result<Arc<dyn BrowserHandle>, Arc<PoolError>>> + Send>>;
type SharedLaunch = Shared<LaunchFuture>;

/// Pool state. Held inside `tokio::sync::Mutex` so state transitions don't
/// race, but the mutex is never held across browser I/O.
enum State {
    Idle,
    /// Exactly one `launch` future is in flight; every concurrent caller
    /// clones this `Shared` and awaits the same outcome.
    Launching(SharedLaunch),
    Warm {
        handle: Arc<dyn BrowserHandle>,
        last_used: Instant,
    },
    ShuttingDown,
}

/// Lazy + TTL browser pool.
pub struct Pool {
    spawner: Arc<dyn BrowserSpawner>,
    config: LaunchConfig,
    ttl: Duration,
    state: tokio::sync::Mutex<State>,
}

impl Pool {
    /// Build a new pool. No browser is spawned until the first `capture`.
    pub fn new(spawner: Arc<dyn BrowserSpawner>, config: LaunchConfig, ttl: Duration) -> Self {
        Self {
            spawner,
            config,
            ttl,
            state: tokio::sync::Mutex::new(State::Idle),
        }
    }

    /// Acquire a warm browser and run `req` against it. Handles lazy
    /// launch, concurrent-launch coalescing, TTL expiry (lazy), and
    /// shutdown refusal.
    pub async fn capture(&self, req: CaptureRequest) -> Result<(Vec<u8>, PageMeta), PoolError> {
        let handle = self.acquire_warm().await?;
        handle.capture(req).await
    }

    async fn acquire_warm(&self) -> Result<Arc<dyn BrowserHandle>, PoolError> {
        loop {
            let mut state = self.state.lock().await;
            match &mut *state {
                State::ShuttingDown => return Err(PoolError::ShuttingDown),
                State::Warm { handle, last_used } => {
                    if last_used.elapsed() < self.ttl {
                        let handle = Arc::clone(handle);
                        *last_used = Instant::now();
                        return Ok(handle);
                    }
                    // TTL expired. Flip to Idle so the next iteration
                    // launches a fresh browser; defer the close to a
                    // background task. close() grabs the handle's write
                    // lock which waits for any in-flight captures to
                    // release their read locks, so a long-running capture
                    // that spans the TTL boundary is never interrupted.
                    // (Regression guard for B2 from the Task 4 review.)
                    let expired = Arc::clone(handle);
                    *state = State::Idle;
                    drop(state);
                    tokio::spawn(async move {
                        let _ = expired.close().await;
                    });
                    continue;
                }
                State::Launching(shared) => {
                    let shared = shared.clone();
                    drop(state);
                    let outcome = shared.await;
                    // Re-check shutdown before returning — a sibling
                    // shutdown may have flipped state while we were
                    // awaiting, in which case we must close and bail.
                    // (Regression guard for B1 from the Task 4 review.)
                    let state = self.state.lock().await;
                    if matches!(*state, State::ShuttingDown) {
                        drop(state);
                        if let Ok(handle) = outcome {
                            let _ = handle.close().await;
                        }
                        return Err(PoolError::ShuttingDown);
                    }
                    drop(state);
                    match outcome {
                        Ok(handle) => return Ok(handle),
                        Err(arc_err) => return Err(clone_pool_error(&arc_err)),
                    }
                }
                State::Idle => {
                    let spawner = Arc::clone(&self.spawner);
                    let cfg = self.config.clone();
                    let fut: LaunchFuture =
                        Box::pin(async move { spawner.launch(cfg).await.map_err(Arc::new) });
                    let shared: SharedLaunch = fut.shared();
                    *state = State::Launching(shared.clone());
                    drop(state);

                    let outcome = shared.await;
                    let mut state = self.state.lock().await;
                    // Another task may have already flipped us to
                    // ShuttingDown while we were awaiting — respect that.
                    if matches!(*state, State::ShuttingDown) {
                        if let Ok(handle) = outcome {
                            let _ = handle.close().await;
                        }
                        return Err(PoolError::ShuttingDown);
                    }
                    match outcome {
                        Ok(handle) => {
                            *state = State::Warm {
                                handle: Arc::clone(&handle),
                                last_used: Instant::now(),
                            };
                            return Ok(handle);
                        }
                        Err(arc_err) => {
                            *state = State::Idle;
                            return Err(clone_pool_error(&arc_err));
                        }
                    }
                }
            }
        }
    }

    /// Tear the pool down. Idempotent and safe to call from any task; the
    /// next `capture` returns `ShuttingDown`.
    pub async fn shutdown(&self) {
        let prev = std::mem::replace(&mut *self.state.lock().await, State::ShuttingDown);
        match prev {
            State::Warm { handle, .. } => {
                let _ = handle.close().await;
            }
            State::Launching(shared) => {
                // Let the launch complete (or fail) so its resources are
                // released; if it produced a Browser, close it.
                if let Ok(handle) = shared.await {
                    let _ = handle.close().await;
                }
            }
            State::Idle | State::ShuttingDown => {}
        }
    }

    /// Introspection for the `/__vertz_diagnostics` endpoint (Task 5).
    pub async fn status(&self) -> PoolStatus {
        match &*self.state.lock().await {
            State::Idle => PoolStatus::Idle,
            State::Launching(_) => PoolStatus::Launching,
            State::Warm { .. } => PoolStatus::Warm,
            State::ShuttingDown => PoolStatus::ShuttingDown,
        }
    }
}

/// Observable pool lifecycle state. Exposed through the diagnostics endpoint.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PoolStatus {
    Idle,
    Launching,
    Warm,
    ShuttingDown,
}

/// `PoolError` isn't `Clone`, so we re-create the variant manually when a
/// Shared launch future fails — every awaiter gets an independent error
/// value they can own. Rust's exhaustive-match check forces this function
/// to be updated when a new variant is added.
fn clone_pool_error(arc_err: &Arc<PoolError>) -> PoolError {
    match arc_err.as_ref() {
        PoolError::Launch { message, hint } => PoolError::Launch {
            message: message.clone(),
            hint: hint.clone(),
        },
        PoolError::NavigationFailed { message, url } => PoolError::NavigationFailed {
            message: message.clone(),
            url: url.clone(),
        },
        PoolError::SelectorInvalid { message } => PoolError::SelectorInvalid {
            message: message.clone(),
        },
        PoolError::SelectorNotFound { message } => PoolError::SelectorNotFound {
            message: message.clone(),
        },
        PoolError::CaptureFailed { message } => PoolError::CaptureFailed {
            message: message.clone(),
        },
        PoolError::ShuttingDown => PoolError::ShuttingDown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    /// Test spawner — counts launches, notifies when launch enters (so
    /// tests can synchronize without `sleep`), and can gate launch
    /// completion on a signal to exercise shutdown-during-launch and
    /// long-running-capture scenarios deterministically.
    struct FakeSpawner {
        launch_count: AtomicU32,
        capture_count: Arc<AtomicU32>,
        fail_launch: bool,
        launch_entered: Arc<tokio::sync::Notify>,
        /// Blocks every launch until this flag flips to true. Tests flip
        /// the flag via `release_launch`. Default is "don't block".
        launch_gate: Arc<(tokio::sync::Mutex<bool>, tokio::sync::Notify)>,
        capture_delay: Duration,
    }

    impl FakeSpawner {
        fn new() -> Self {
            let gate_mutex = tokio::sync::Mutex::new(true); // true = released
            Self {
                launch_count: AtomicU32::new(0),
                capture_count: Arc::new(AtomicU32::new(0)),
                fail_launch: false,
                launch_entered: Arc::new(tokio::sync::Notify::new()),
                launch_gate: Arc::new((gate_mutex, tokio::sync::Notify::new())),
                capture_delay: Duration::ZERO,
            }
        }

        fn failing() -> Self {
            Self {
                fail_launch: true,
                ..Self::new()
            }
        }

        fn with_gated_launch(self) -> Self {
            // Tests call `release_launch` when they want a launch to complete.
            Self {
                launch_gate: Arc::new((tokio::sync::Mutex::new(false), tokio::sync::Notify::new())),
                ..self
            }
        }

        fn with_capture_delay(mut self, d: Duration) -> Self {
            self.capture_delay = d;
            self
        }

        async fn release_launch(&self) {
            let (mutex, notify) = &*self.launch_gate;
            *mutex.lock().await = true;
            notify.notify_waiters();
        }
    }

    #[async_trait]
    impl BrowserSpawner for FakeSpawner {
        async fn launch(&self, _config: LaunchConfig) -> Result<Arc<dyn BrowserHandle>, PoolError> {
            self.launch_count.fetch_add(1, Ordering::SeqCst);
            self.launch_entered.notify_waiters();

            let (mutex, notify) = &*self.launch_gate;
            loop {
                if *mutex.lock().await {
                    break;
                }
                notify.notified().await;
            }

            if self.fail_launch {
                return Err(PoolError::Launch {
                    message: "fake failure".into(),
                    hint: None,
                });
            }
            Ok(Arc::new(FakeHandle {
                capture_count: Arc::clone(&self.capture_count),
                closed: Arc::new(AtomicU32::new(0)),
                capture_delay: self.capture_delay,
            }))
        }
    }

    struct FakeHandle {
        capture_count: Arc<AtomicU32>,
        closed: Arc<AtomicU32>,
        capture_delay: Duration,
    }

    #[async_trait]
    impl BrowserHandle for FakeHandle {
        async fn capture(&self, req: CaptureRequest) -> Result<(Vec<u8>, PageMeta), PoolError> {
            self.capture_count.fetch_add(1, Ordering::SeqCst);
            if self.capture_delay > Duration::ZERO {
                tokio::time::sleep(self.capture_delay).await;
            }
            Ok((
                vec![0x89, b'P', b'N', b'G'],
                PageMeta {
                    final_url: req.url,
                    dimensions: req.viewport,
                },
            ))
        }

        async fn close(&self) -> Result<(), PoolError> {
            self.closed.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
    }

    fn default_config() -> LaunchConfig {
        LaunchConfig {
            viewport: (1280, 720),
            chrome_path: None,
        }
    }

    fn default_request() -> CaptureRequest {
        CaptureRequest {
            url: "http://localhost/".into(),
            viewport: (1280, 720),
            full_page: false,
            crop: None,
            wait_for: WaitCondition::NetworkIdle,
        }
    }

    #[tokio::test]
    async fn first_capture_launches_and_returns_bytes() {
        let spawner = Arc::new(FakeSpawner::new());
        let pool = Pool::new(Arc::clone(&spawner) as _, default_config(), DEFAULT_TTL);

        assert_eq!(pool.status().await, PoolStatus::Idle);
        let (bytes, meta) = pool.capture(default_request()).await.unwrap();
        assert_eq!(&bytes[..4], &[0x89, b'P', b'N', b'G']);
        assert_eq!(meta.dimensions, (1280, 720));
        assert_eq!(pool.status().await, PoolStatus::Warm);
        assert_eq!(spawner.launch_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn concurrent_captures_during_launch_share_one_browser() {
        let spawner = Arc::new(FakeSpawner::new().with_gated_launch());
        let pool = Arc::new(Pool::new(
            Arc::clone(&spawner) as _,
            default_config(),
            DEFAULT_TTL,
        ));

        // Fan out captures, each parked inside `acquire_warm` awaiting the
        // same Shared launch future.
        let n = 16;
        let mut joins = Vec::with_capacity(n);
        let entered = Arc::clone(&spawner.launch_entered);
        for _ in 0..n {
            let pool = Arc::clone(&pool);
            joins.push(tokio::spawn(async move {
                pool.capture(default_request()).await
            }));
        }
        // Wait for the launch to actually enter, then release it. No sleep.
        entered.notified().await;
        spawner.release_launch().await;
        for h in joins {
            h.await.unwrap().unwrap();
        }

        assert_eq!(
            spawner.launch_count.load(Ordering::SeqCst),
            1,
            "pool must coalesce concurrent launches"
        );
    }

    #[tokio::test]
    async fn warm_captures_reuse_the_same_browser() {
        let spawner = Arc::new(FakeSpawner::new());
        let pool = Pool::new(Arc::clone(&spawner) as _, default_config(), DEFAULT_TTL);

        pool.capture(default_request()).await.unwrap();
        pool.capture(default_request()).await.unwrap();
        pool.capture(default_request()).await.unwrap();

        assert_eq!(spawner.launch_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn ttl_expiry_triggers_relaunch() {
        // TTL near zero: every post-capture check fires the expiry path.
        let spawner = Arc::new(FakeSpawner::new());
        let pool = Pool::new(
            Arc::clone(&spawner) as _,
            default_config(),
            Duration::from_nanos(1),
        );

        pool.capture(default_request()).await.unwrap();
        // tokio::time::sleep(0) still yields, which is enough for
        // last_used.elapsed() to have advanced a tick and exceed 1ns.
        tokio::task::yield_now().await;
        pool.capture(default_request()).await.unwrap();

        assert_eq!(spawner.launch_count.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn launch_failure_returns_error_and_leaves_pool_idle() {
        let spawner = Arc::new(FakeSpawner::failing());
        let pool = Pool::new(Arc::clone(&spawner) as _, default_config(), DEFAULT_TTL);

        let err = pool.capture(default_request()).await.unwrap_err();
        assert!(matches!(err, PoolError::Launch { .. }));
        assert_eq!(pool.status().await, PoolStatus::Idle);
        // A second call tries to launch again rather than being stuck.
        let _ = pool.capture(default_request()).await.unwrap_err();
        assert_eq!(spawner.launch_count.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn shutdown_closes_warm_browser_and_refuses_new_captures() {
        let spawner = Arc::new(FakeSpawner::new());
        let pool = Pool::new(Arc::clone(&spawner) as _, default_config(), DEFAULT_TTL);
        pool.capture(default_request()).await.unwrap();

        pool.shutdown().await;
        assert_eq!(pool.status().await, PoolStatus::ShuttingDown);

        let err = pool.capture(default_request()).await.unwrap_err();
        assert!(matches!(err, PoolError::ShuttingDown));
    }

    #[tokio::test]
    async fn shutdown_is_idempotent() {
        let spawner = Arc::new(FakeSpawner::new());
        let pool = Pool::new(Arc::clone(&spawner) as _, default_config(), DEFAULT_TTL);
        pool.shutdown().await;
        pool.shutdown().await;
        assert_eq!(pool.status().await, PoolStatus::ShuttingDown);
    }

    #[tokio::test]
    async fn shutdown_during_launch_closes_the_new_browser() {
        let spawner = Arc::new(FakeSpawner::new().with_gated_launch());
        let pool = Arc::new(Pool::new(
            Arc::clone(&spawner) as _,
            default_config(),
            DEFAULT_TTL,
        ));

        let capture_pool = Arc::clone(&pool);
        let capture_task =
            tokio::spawn(async move { capture_pool.capture(default_request()).await });

        // Deterministically wait for the launch to have entered before
        // calling shutdown — no race, no sleep-for-"long enough".
        spawner.launch_entered.notified().await;
        let shutdown_fut = tokio::spawn({
            let pool = Arc::clone(&pool);
            async move { pool.shutdown().await }
        });
        // Now let the launch complete so shutdown can proceed.
        spawner.release_launch().await;
        shutdown_fut.await.unwrap();

        let res = capture_task.await.unwrap();
        assert!(matches!(res, Err(PoolError::ShuttingDown)));
        assert_eq!(pool.status().await, PoolStatus::ShuttingDown);
    }

    /// B1 regression — concurrent awaiters of a Launching Shared future
    /// must respect a shutdown that fires mid-launch. Before the fix,
    /// non-initiator awaiters happily returned `Ok(handle)` to the caller
    /// while the pool flipped to ShuttingDown, leaking the handle.
    #[tokio::test]
    async fn b1_shutdown_mid_launch_rejects_all_awaiters() {
        let spawner = Arc::new(FakeSpawner::new().with_gated_launch());
        let pool = Arc::new(Pool::new(
            Arc::clone(&spawner) as _,
            default_config(),
            DEFAULT_TTL,
        ));

        let n = 4;
        let mut captures = Vec::new();
        for _ in 0..n {
            let pool = Arc::clone(&pool);
            captures.push(tokio::spawn(async move {
                pool.capture(default_request()).await
            }));
        }
        spawner.launch_entered.notified().await;

        // Fire shutdown while the launch is gated. All awaiters should
        // bail with ShuttingDown once the launch completes.
        let shutdown_pool = Arc::clone(&pool);
        let shutdown_task = tokio::spawn(async move { shutdown_pool.shutdown().await });
        spawner.release_launch().await;
        shutdown_task.await.unwrap();

        let mut shutting_down_count = 0;
        for c in captures {
            match c.await.unwrap() {
                Err(PoolError::ShuttingDown) => shutting_down_count += 1,
                other => panic!("expected ShuttingDown, got {other:?}"),
            }
        }
        assert_eq!(shutting_down_count, n);
        assert_eq!(spawner.launch_count.load(Ordering::SeqCst), 1);
    }

    /// B2 regression — a long-running capture must not be interrupted by
    /// a TTL-triggered close. Before the fix, the pool synchronously
    /// called `close()` on the shared handle while another task was
    /// still mid-capture, which in chromiumoxide would have torn down
    /// the browser underneath it.
    #[tokio::test]
    async fn b2_long_capture_survives_ttl_expiry() {
        let spawner = Arc::new(FakeSpawner::new().with_capture_delay(Duration::from_millis(30)));
        let pool = Arc::new(Pool::new(
            Arc::clone(&spawner) as _,
            default_config(),
            Duration::from_nanos(1),
        ));

        // Kick off a long capture.
        let long_pool = Arc::clone(&pool);
        let long_capture = tokio::spawn(async move { long_pool.capture(default_request()).await });
        // Wait until it's started (launch has entered).
        spawner.launch_entered.notified().await;
        // Trigger a second capture that observes TTL expired and
        // schedules a background close of the existing handle.
        let trigger_pool = Arc::clone(&pool);
        let _trigger = tokio::spawn(async move { trigger_pool.capture(default_request()).await });

        // Original capture must succeed — no spurious ShuttingDown from
        // the handle being closed under it.
        let (bytes, _) = long_capture.await.unwrap().unwrap();
        assert_eq!(&bytes[..4], &[0x89, b'P', b'N', b'G']);
    }

    #[tokio::test]
    async fn pool_status_reports_lifecycle() {
        let spawner = Arc::new(FakeSpawner::new().with_gated_launch());
        let pool = Arc::new(Pool::new(
            Arc::clone(&spawner) as _,
            default_config(),
            DEFAULT_TTL,
        ));
        assert_eq!(pool.status().await, PoolStatus::Idle);

        let pool_clone = Arc::clone(&pool);
        let join = tokio::spawn(async move { pool_clone.capture(default_request()).await });
        spawner.launch_entered.notified().await;
        assert_eq!(pool.status().await, PoolStatus::Launching);

        spawner.release_launch().await;
        join.await.unwrap().unwrap();
        assert_eq!(pool.status().await, PoolStatus::Warm);
    }
}
