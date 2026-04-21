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
/// The fetcher's `EnsureError` wraps into `PoolError::Launch` at the Pool
/// boundary so callers can pattern-match a single enum.
#[derive(Debug, thiserror::Error)]
pub enum PoolError {
    #[error("chrome launch failed: {message}")]
    Launch {
        message: String,
        hint: Option<String>,
    },
    #[error("navigation failed for {url}: {message}")]
    NavigationFailed { message: String, url: String },
    #[error("navigation timeout after {timeout_ms}ms for {url}")]
    NavigationTimeout {
        message: String,
        url: String,
        timeout_ms: u64,
    },
    #[error("page returned HTTP {status} for {url}")]
    PageHttpError {
        message: String,
        url: String,
        status: u16,
    },
    #[error("crop selector invalid: {message}")]
    SelectorInvalid { message: String },
    #[error("crop selector matched no element: {message}")]
    SelectorNotFound { message: String },
    #[error("crop selector matched {match_count} elements (ambiguous)")]
    SelectorAmbiguous { message: String, match_count: u32 },
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
                    // Expired — close and fall back to launching.
                    let handle = Arc::clone(handle);
                    *state = State::Idle;
                    drop(state);
                    let _ = handle.close().await;
                    continue;
                }
                State::Launching(shared) => {
                    let shared = shared.clone();
                    drop(state);
                    match shared.await {
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
/// value they can own.
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
        PoolError::NavigationTimeout {
            message,
            url,
            timeout_ms,
        } => PoolError::NavigationTimeout {
            message: message.clone(),
            url: url.clone(),
            timeout_ms: *timeout_ms,
        },
        PoolError::PageHttpError {
            message,
            url,
            status,
        } => PoolError::PageHttpError {
            message: message.clone(),
            url: url.clone(),
            status: *status,
        },
        PoolError::SelectorInvalid { message } => PoolError::SelectorInvalid {
            message: message.clone(),
        },
        PoolError::SelectorNotFound { message } => PoolError::SelectorNotFound {
            message: message.clone(),
        },
        PoolError::SelectorAmbiguous {
            message,
            match_count,
        } => PoolError::SelectorAmbiguous {
            message: message.clone(),
            match_count: *match_count,
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

    /// Test spawner — counts launches, lets each test configure a per-call
    /// delay so we can drive concurrent-launch-coalescing scenarios.
    struct FakeSpawner {
        launch_count: AtomicU32,
        launch_delay: Duration,
        capture_count: Arc<AtomicU32>,
        fail_launch: bool,
    }

    impl FakeSpawner {
        fn new() -> Self {
            Self {
                launch_count: AtomicU32::new(0),
                launch_delay: Duration::ZERO,
                capture_count: Arc::new(AtomicU32::new(0)),
                fail_launch: false,
            }
        }

        fn with_launch_delay(mut self, d: Duration) -> Self {
            self.launch_delay = d;
            self
        }

        fn failing() -> Self {
            Self {
                fail_launch: true,
                ..Self::new()
            }
        }
    }

    #[async_trait]
    impl BrowserSpawner for FakeSpawner {
        async fn launch(&self, _config: LaunchConfig) -> Result<Arc<dyn BrowserHandle>, PoolError> {
            self.launch_count.fetch_add(1, Ordering::SeqCst);
            if self.launch_delay > Duration::ZERO {
                tokio::time::sleep(self.launch_delay).await;
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
            }))
        }
    }

    struct FakeHandle {
        capture_count: Arc<AtomicU32>,
        closed: Arc<AtomicU32>,
    }

    #[async_trait]
    impl BrowserHandle for FakeHandle {
        async fn capture(&self, req: CaptureRequest) -> Result<(Vec<u8>, PageMeta), PoolError> {
            self.capture_count.fetch_add(1, Ordering::SeqCst);
            // 1×1 PNG signature bytes are fine for tests.
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
        let spawner = Arc::new(FakeSpawner::new().with_launch_delay(Duration::from_millis(50)));
        let pool = Arc::new(Pool::new(
            Arc::clone(&spawner) as _,
            default_config(),
            DEFAULT_TTL,
        ));

        let n = 16;
        let mut handles = Vec::with_capacity(n);
        for _ in 0..n {
            let pool = Arc::clone(&pool);
            handles.push(tokio::spawn(async move {
                pool.capture(default_request()).await
            }));
        }
        for h in handles {
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
        let spawner = Arc::new(FakeSpawner::new());
        let pool = Pool::new(
            Arc::clone(&spawner) as _,
            default_config(),
            Duration::from_millis(20),
        );

        pool.capture(default_request()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(40)).await;
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
        let spawner = Arc::new(FakeSpawner::new().with_launch_delay(Duration::from_millis(30)));
        let pool = Arc::new(Pool::new(
            Arc::clone(&spawner) as _,
            default_config(),
            DEFAULT_TTL,
        ));

        let capture_pool = Arc::clone(&pool);
        let capture_task =
            tokio::spawn(async move { capture_pool.capture(default_request()).await });

        // Give the launch a chance to start.
        tokio::time::sleep(Duration::from_millis(5)).await;
        pool.shutdown().await;

        let res = capture_task.await.unwrap();
        assert!(matches!(res, Err(PoolError::ShuttingDown)));
        assert_eq!(pool.status().await, PoolStatus::ShuttingDown);
    }

    #[tokio::test]
    async fn pool_status_reports_lifecycle() {
        let spawner = Arc::new(FakeSpawner::new().with_launch_delay(Duration::from_millis(30)));
        let pool = Arc::new(Pool::new(
            Arc::clone(&spawner) as _,
            default_config(),
            DEFAULT_TTL,
        ));
        assert_eq!(pool.status().await, PoolStatus::Idle);

        let pool_clone = Arc::clone(&pool);
        let join = tokio::spawn(async move { pool_clone.capture(default_request()).await });
        tokio::time::sleep(Duration::from_millis(5)).await;
        assert_eq!(pool.status().await, PoolStatus::Launching);

        join.await.unwrap().unwrap();
        assert_eq!(pool.status().await, PoolStatus::Warm);
    }
}
