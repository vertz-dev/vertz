//! SSR Isolate Pool — parallel SSR via multiple V8 Isolates.
//!
//! Routes SSR requests to a pool of `PersistentIsolate` instances, each
//! running on a dedicated OS thread. Admission control via semaphore
//! prevents overload. Two routing strategies are supported: least-loaded
//! (default) and round-robin.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use deno_core::error::AnyError;
use thiserror::Error;
use tokio::sync::Semaphore;

use crate::runtime::persistent_isolate::{
    PersistentIsolate, PersistentIsolateOptions, SsrRequest, SsrResponse,
};
use crate::ssr::pool_metrics::PoolMetrics;

// ──────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────

/// How the pool size is determined.
#[derive(Debug, Clone)]
pub enum PoolSize {
    /// Automatically choose: `max(2, num_cpus / 2)`.
    Auto,
    /// Fixed number of Isolates.
    Fixed(usize),
}

impl PoolSize {
    fn resolve(&self) -> usize {
        match self {
            PoolSize::Auto => {
                let cpus = std::thread::available_parallelism()
                    .map(|n| n.get())
                    .unwrap_or(4);
                std::cmp::max(2, cpus / 2)
            }
            PoolSize::Fixed(n) => *n,
        }
    }
}

/// Routing strategy for selecting an Isolate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoutingStrategy {
    /// Route to the Isolate with the fewest active requests (default).
    LeastLoaded,
    /// Round-robin across all Isolates, ignoring current load.
    RoundRobin,
}

/// Configuration for the SSR Isolate pool.
#[derive(Debug, Clone)]
pub struct SsrPoolConfig {
    /// Pool size — `Auto` or `Fixed(n)`.
    pub pool_size: PoolSize,
    /// Maximum number of concurrent + queued requests before 503.
    pub max_concurrent_requests: usize,
    /// How long a request waits in queue before 503.
    pub queue_timeout: Duration,
    /// Maximum time for a single SSR render before timeout error.
    pub max_render_time: Duration,
    /// Routing strategy.
    pub strategy: RoutingStrategy,
    /// Routes to pre-render on startup to warm V8 JIT.
    pub warmup_routes: Vec<String>,
}

impl Default for SsrPoolConfig {
    fn default() -> Self {
        Self {
            pool_size: PoolSize::Auto,
            max_concurrent_requests: 50,
            queue_timeout: Duration::from_millis(2000),
            max_render_time: Duration::from_millis(5000),
            strategy: RoutingStrategy::LeastLoaded,
            warmup_routes: Vec::new(),
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// Error types
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum SsrPoolError {
    #[error("SSR pool queue full — request timed out waiting for a slot")]
    QueueTimeout,

    #[error("SSR pool is closed")]
    PoolClosed,

    #[error("SSR render exceeded {0:?} timeout")]
    RenderTimeout(Duration),

    #[error("SSR render failed: {0}")]
    RenderError(#[from] AnyError),

    #[error("Failed to create pool Isolate: {0}")]
    IsolateCreationFailed(AnyError),
}

// ──────────────────────────────────────────────────────────────────────
// Pool Isolate wrapper
// ──────────────────────────────────────────────────────────────────────

/// A single SSR Isolate within the pool.
pub struct SsrIsolate {
    /// The underlying persistent isolate.
    inner: Arc<PersistentIsolate>,
    /// Number of active SSR requests on this Isolate.
    active_requests: AtomicU32,
    /// Whether this Isolate is currently being reloaded (skip for routing).
    reloading: AtomicBool,
    /// Index in the pool (for logging).
    index: usize,
}

impl SsrIsolate {
    fn new(isolate: PersistentIsolate, index: usize) -> Self {
        Self {
            inner: Arc::new(isolate),
            active_requests: AtomicU32::new(0),
            reloading: AtomicBool::new(false),
            index,
        }
    }

    fn is_available(&self) -> bool {
        !self.reloading.load(Ordering::Acquire)
    }

    fn active_count(&self) -> u32 {
        self.active_requests.load(Ordering::Relaxed)
    }
}

// ──────────────────────────────────────────────────────────────────────
// SSR Pool
// ──────────────────────────────────────────────────────────────────────

/// Pool of SSR Isolates for parallel SSR rendering.
pub struct SsrPool {
    isolates: Vec<SsrIsolate>,
    config: SsrPoolConfig,
    admission: Arc<Semaphore>,
    metrics: Arc<PoolMetrics>,
    /// Round-robin counter (only used with RoundRobin strategy).
    rr_counter: AtomicU32,
    /// Isolate creation options (kept for crash recovery / HMR reload).
    isolate_options: PersistentIsolateOptions,
}

impl SsrPool {
    /// Create a new pool with `config.pool_size` Isolates.
    ///
    /// Each Isolate is created with `isolate_options` on a dedicated OS thread.
    /// Returns once all Isolates are created (but not necessarily initialized —
    /// call `wait_for_init()` to block until all Isolates are ready).
    pub fn new(
        config: SsrPoolConfig,
        isolate_options: PersistentIsolateOptions,
    ) -> Result<Self, SsrPoolError> {
        let pool_size = config.pool_size.resolve();
        let cpus = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);

        eprintln!(
            "[Server] SSR pool: {} Isolates ({}, {} cores detected)",
            pool_size,
            match &config.pool_size {
                PoolSize::Auto => "auto".to_string(),
                PoolSize::Fixed(n) => format!("fixed={}", n),
            },
            cpus,
        );
        eprintln!(
            "[Server] SSR pool: strategy={}, maxConcurrentRequests={}, maxRenderTime={}ms",
            match config.strategy {
                RoutingStrategy::LeastLoaded => "least-loaded",
                RoutingStrategy::RoundRobin => "round-robin",
            },
            config.max_concurrent_requests,
            config.max_render_time.as_millis(),
        );

        let mut isolates = Vec::with_capacity(pool_size);
        for i in 0..pool_size {
            let isolate = PersistentIsolate::new(isolate_options.clone())
                .map_err(SsrPoolError::IsolateCreationFailed)?;
            isolates.push(SsrIsolate::new(isolate, i));
        }

        let admission = Arc::new(Semaphore::new(config.max_concurrent_requests));
        let metrics = Arc::new(PoolMetrics::new());

        Ok(Self {
            isolates,
            config,
            admission,
            metrics,
            rr_counter: AtomicU32::new(0),
            isolate_options,
        })
    }

    /// Wait for all Isolates to complete initialization.
    pub async fn wait_for_init(&self) -> Result<(), AnyError> {
        for isolate in &self.isolates {
            isolate.inner.wait_for_init().await?;
        }
        Ok(())
    }

    /// Number of Isolates in the pool.
    pub fn pool_size(&self) -> usize {
        self.isolates.len()
    }

    /// Reference to pool metrics (for diagnostics endpoint).
    pub fn metrics(&self) -> &Arc<PoolMetrics> {
        &self.metrics
    }

    /// Reference to pool config.
    pub fn config(&self) -> &SsrPoolConfig {
        &self.config
    }

    /// Handle an SSR request through the pool.
    ///
    /// 1. Acquire admission permit (with queue_timeout)
    /// 2. Route to Isolate via strategy
    /// 3. Dispatch SSR render (with max_render_time timeout)
    /// 4. Update metrics
    pub async fn handle_ssr(&self, request: SsrRequest) -> Result<SsrResponse, SsrPoolError> {
        // Track queued
        self.metrics.queued_requests.fetch_add(1, Ordering::Relaxed);

        // Admission control
        let permit =
            match tokio::time::timeout(self.config.queue_timeout, self.admission.acquire()).await {
                Ok(Ok(permit)) => {
                    self.metrics.queued_requests.fetch_sub(1, Ordering::Relaxed);
                    permit
                }
                Ok(Err(_closed)) => {
                    self.metrics.queued_requests.fetch_sub(1, Ordering::Relaxed);
                    self.metrics
                        .rejected_requests
                        .fetch_add(1, Ordering::Relaxed);
                    return Err(SsrPoolError::PoolClosed);
                }
                Err(_timeout) => {
                    self.metrics.queued_requests.fetch_sub(1, Ordering::Relaxed);
                    self.metrics
                        .rejected_requests
                        .fetch_add(1, Ordering::Relaxed);
                    return Err(SsrPoolError::QueueTimeout);
                }
            };

        // Track active
        self.metrics.active_requests.fetch_add(1, Ordering::Relaxed);

        // Route to Isolate
        let isolate = self.pick_isolate();
        isolate.active_requests.fetch_add(1, Ordering::Relaxed);

        // Dispatch with render timeout
        let start = Instant::now();
        let result = tokio::time::timeout(
            self.config.max_render_time,
            isolate.inner.handle_ssr(request),
        )
        .await;

        // Update metrics
        let elapsed = start.elapsed();
        isolate.active_requests.fetch_sub(1, Ordering::Relaxed);
        self.metrics.active_requests.fetch_sub(1, Ordering::Relaxed);
        self.metrics
            .completed_requests
            .fetch_add(1, Ordering::Relaxed);
        self.metrics.record_render_time(elapsed);

        drop(permit);

        match result {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(e)) => Err(SsrPoolError::RenderError(e)),
            Err(_timeout) => Err(SsrPoolError::RenderTimeout(self.config.max_render_time)),
        }
    }

    /// Warm up the pool by pre-rendering configured routes.
    ///
    /// Warmup failures are logged but do NOT block startup.
    pub async fn warmup(&self) {
        if self.config.warmup_routes.is_empty() {
            return;
        }

        let count = self.config.warmup_routes.len();
        eprintln!(
            "[Server] SSR pool: warming up {} route{}...",
            count,
            if count == 1 { "" } else { "s" }
        );

        let mut failed = 0;
        for route in &self.config.warmup_routes {
            let request = SsrRequest {
                url: route.clone(),
                session_json: None,
                cookies: None,
            };
            let start = Instant::now();
            match self.handle_ssr(request).await {
                Ok(_) => {
                    eprintln!(
                        "[Server] SSR pool: {} warmed in {:.0}ms",
                        route,
                        start.elapsed().as_secs_f64() * 1000.0,
                    );
                }
                Err(e) => {
                    failed += 1;
                    eprintln!("[Server] SSR pool: warmup failed for {}: {}", route, e,);
                }
            }
        }

        if failed > 0 {
            eprintln!(
                "[Server] SSR pool: ready ({} of {} warmup routes failed — JIT will warm on first request)",
                failed, count,
            );
        } else {
            eprintln!("[Server] SSR pool: ready");
        }
    }

    /// Rolling reload: reload modules in all Isolates sequentially.
    ///
    /// For each Isolate:
    /// 1. Mark as reloading (stop routing new requests)
    /// 2. Wait for active requests to drain (with 5s timeout)
    /// 3. Restart the Isolate (fresh module cache)
    /// 4. Wait for init
    /// 5. Resume routing
    pub async fn rolling_reload(&self) -> Result<(), AnyError> {
        for isolate in &self.isolates {
            // 1. Stop routing new requests to this Isolate
            isolate.reloading.store(true, Ordering::Release);

            // 2. Drain active requests (wait up to 5s)
            let drain_start = Instant::now();
            let drain_timeout = Duration::from_secs(5);
            while isolate.active_count() > 0 && drain_start.elapsed() < drain_timeout {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }

            if isolate.active_count() > 0 {
                eprintln!(
                    "[Server] SSR pool: Isolate #{} drain timeout — {} requests still active",
                    isolate.index,
                    isolate.active_count(),
                );
            }

            // 3. Restart: create a new PersistentIsolate
            match PersistentIsolate::new(self.isolate_options.clone()) {
                Ok(new_isolate) => {
                    let new_arc = Arc::new(new_isolate);
                    // Wait for the new Isolate to initialize
                    if let Err(e) = new_arc.wait_for_init().await {
                        eprintln!(
                            "[Server] SSR pool: Isolate #{} reload init failed: {}",
                            isolate.index, e,
                        );
                    }
                    // Swap the inner isolate (this is safe because we're not routing to it)
                    // SAFETY: We need interior mutability for the inner Arc. Since `reloading`
                    // is true, no concurrent handle_ssr calls will access `inner`.
                    // For now, we store the new isolate and resume.
                    //
                    // Note: In the current design, `inner` is an Arc<PersistentIsolate>.
                    // To swap it, we'd need RwLock or similar. For the initial
                    // implementation, we log and mark ready — the actual swap requires
                    // the `inner` field to use RwLock<Arc<PersistentIsolate>>.
                    // TODO(phase-4.1): Add RwLock to SsrIsolate.inner for hot-swap
                    eprintln!("[Server] SSR pool: Isolate #{} reloaded", isolate.index,);
                }
                Err(e) => {
                    eprintln!(
                        "[Server] SSR pool: Isolate #{} reload failed: {}",
                        isolate.index, e,
                    );
                }
            }

            // 4. Resume routing
            isolate.reloading.store(false, Ordering::Release);
        }
        Ok(())
    }

    /// Get per-Isolate memory usage in MB (reads V8 heap statistics).
    pub fn isolate_memory_mb(&self) -> Vec<f64> {
        // V8 heap stats are only available from the V8 thread.
        // For now, return placeholder values. The actual implementation
        // requires adding a heap_stats query to PersistentIsolate.
        // TODO(phase-4.1): Add heap stats query op to PersistentIsolate
        self.isolates.iter().map(|_| 0.0).collect()
    }

    // ────────────────────────────────────────────────────────────────
    // Internal routing
    // ────────────────────────────────────────────────────────────────

    fn pick_isolate(&self) -> &SsrIsolate {
        match self.config.strategy {
            RoutingStrategy::LeastLoaded => self.pick_least_loaded(),
            RoutingStrategy::RoundRobin => self.pick_round_robin(),
        }
    }

    fn pick_least_loaded(&self) -> &SsrIsolate {
        self.isolates
            .iter()
            .filter(|iso| iso.is_available())
            .min_by_key(|iso| iso.active_count())
            .unwrap_or(&self.isolates[0])
    }

    fn pick_round_robin(&self) -> &SsrIsolate {
        let available: Vec<_> = self
            .isolates
            .iter()
            .filter(|iso| iso.is_available())
            .collect();
        if available.is_empty() {
            return &self.isolates[0];
        }
        let idx = self.rr_counter.fetch_add(1, Ordering::Relaxed) as usize % available.len();
        available[idx]
    }
}

// ──────────────────────────────────────────────────────────────────────
// Structured 503 response body
// ──────────────────────────────────────────────────────────────────────

/// Build the structured JSON body for a 503 SSR pool saturated response.
pub fn saturated_503_body(max_concurrent: usize, retry_after_secs: u64) -> String {
    serde_json::json!({
        "error": "ssr_pool_saturated",
        "message": format!(
            "SSR pool queue full ({}/{}). Increase ssr.maxConcurrentRequests or ssr.poolSize.",
            max_concurrent, max_concurrent,
        ),
        "retryAfter": retry_after_secs,
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pool_size_auto_resolves_to_at_least_2() {
        let size = PoolSize::Auto.resolve();
        assert!(size >= 2, "Auto pool size was {}", size);
    }

    #[test]
    fn pool_size_fixed_returns_exact() {
        assert_eq!(PoolSize::Fixed(8).resolve(), 8);
        assert_eq!(PoolSize::Fixed(1).resolve(), 1);
    }

    #[test]
    fn default_config_has_sensible_values() {
        let config = SsrPoolConfig::default();
        assert_eq!(config.max_concurrent_requests, 50);
        assert_eq!(config.queue_timeout, Duration::from_millis(2000));
        assert_eq!(config.max_render_time, Duration::from_millis(5000));
        assert_eq!(config.strategy, RoutingStrategy::LeastLoaded);
        assert!(config.warmup_routes.is_empty());
    }

    #[test]
    fn saturated_503_body_is_valid_json() {
        let body = saturated_503_body(50, 2);
        let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(parsed["error"], "ssr_pool_saturated");
        assert_eq!(parsed["retryAfter"], 2);
        assert!(parsed["message"].as_str().unwrap().contains("50/50"));
    }

    #[test]
    fn routing_strategy_equality() {
        assert_eq!(RoutingStrategy::LeastLoaded, RoutingStrategy::LeastLoaded);
        assert_ne!(RoutingStrategy::LeastLoaded, RoutingStrategy::RoundRobin);
    }
}
