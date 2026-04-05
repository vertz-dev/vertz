# Sub-Phase 4.1: SSR Isolate Pool

## Context

This is the first sub-phase of Phase 4 (Native Signal Runtime + Parallel SSR) in the Vertz Runtime. It replaces the single `PersistentIsolate` used for SSR with a pool of V8 Isolates that handle requests in parallel.

**This is the highest-ROI sub-phase** — SSR throughput scales linearly with pool size. No signal or compiler changes needed.

Design doc: `plans/native-signal-runtime-parallel-ssr.md`

**Current state:** A single `PersistentIsolate` runs on a dedicated OS thread (`native/vtz/src/runtime/persistent_isolate.rs`). All SSR requests flow through a single `mpsc::Sender<IsolateMessage>` channel. HTTP dispatch happens in `native/vtz/src/server/http.rs` via `isolate.handle_ssr(ssr_req).await`.

## Tasks

### Task 1: SsrPool core struct + Isolate creation

**Files:**
- `native/vtz/src/ssr/pool.rs` (new)
- `native/vtz/src/ssr/pool_metrics.rs` (new)
- `native/vtz/src/ssr/mod.rs` (modified — add `pub mod pool; pub mod pool_metrics;`)

**What to implement:**

Create the `SsrPool` struct that manages multiple SSR Isolates. Each Isolate runs on a dedicated OS thread (V8 requires single-threaded access) and communicates via a bounded `mpsc` channel, matching the existing `PersistentIsolate` pattern.

```rust
pub struct SsrPool {
    isolates: Vec<SsrIsolate>,
    admission: Arc<tokio::sync::Semaphore>,
    queue_timeout: Duration,
    max_render_time: Duration,
    strategy: RoutingStrategy,
    metrics: Arc<PoolMetrics>,
}

pub struct SsrIsolate {
    inner: Arc<PersistentIsolate>,  // Reuse existing PersistentIsolate
    active: Arc<AtomicBool>,
    index: usize,
}

pub enum RoutingStrategy {
    LeastLoaded,
    RoundRobin,
}

pub struct SsrPoolConfig {
    pub pool_size: usize,             // default: max(2, num_cpus / 2)
    pub max_concurrent_requests: usize, // default: 50
    pub queue_timeout_ms: u64,        // default: 2000
    pub max_render_time_ms: u64,      // default: 5000
    pub strategy: RoutingStrategy,    // default: LeastLoaded
    pub warmup_routes: Vec<String>,   // default: empty
}
```

`SsrPool::new(config, isolate_options)` creates N `PersistentIsolate` instances, each with its own thread and channel. The `admission` semaphore has `max_concurrent_requests` permits.

In `pool_metrics.rs`:
```rust
pub struct PoolMetrics {
    pub active_requests: AtomicU64,
    pub queued_requests: AtomicU64,
    pub completed_requests: AtomicU64,
    pub total_render_time_ns: AtomicU64,
    pub render_times: Mutex<Vec<f64>>,  // for percentile calculation
}
```

**Acceptance criteria:**
- [ ] `SsrPool::new()` creates N `PersistentIsolate` instances, each initialized and ready
- [ ] `SsrPoolConfig` has sensible defaults (pool_size auto-detected from CPU cores)
- [ ] `PoolMetrics` tracks active, queued, completed counts atomically
- [ ] Pool logs resolved configuration at creation time
- [ ] Unit test: pool of 2 creates 2 initialized isolates

---

### Task 2: Request routing + admission control

**Files:**
- `native/vtz/src/ssr/pool.rs` (modified)
- `native/vtz/src/ssr/pool_test.rs` (new)

**What to implement:**

Add `SsrPool::handle_ssr(request: SsrRequest)` method with:

1. **Admission control:** Acquire semaphore permit with `queue_timeout`. If timeout, return 503 error.
2. **Routing:** Pick an Isolate based on `RoutingStrategy`:
   - `LeastLoaded`: find Isolate where `active == false`, or first available
   - `RoundRobin`: increment atomic counter, modulo pool size
3. **Dispatch:** Forward `SsrRequest` to chosen Isolate's `handle_ssr()` with `max_render_time` timeout.
4. **Metrics:** Update active/queued/completed/render_time counters.

```rust
impl SsrPool {
    pub async fn handle_ssr(&self, request: SsrRequest) -> Result<SsrResponse, SsrPoolError> {
        self.metrics.queued_requests.fetch_add(1, Ordering::Relaxed);

        // Admission: acquire semaphore permit with timeout
        let permit = tokio::time::timeout(
            self.queue_timeout,
            self.admission.acquire(),
        ).await
        .map_err(|_| SsrPoolError::QueueTimeout)?
        .map_err(|_| SsrPoolError::PoolClosed)?;

        self.metrics.queued_requests.fetch_sub(1, Ordering::Relaxed);
        self.metrics.active_requests.fetch_add(1, Ordering::Relaxed);

        // Route to isolate
        let isolate = self.pick_isolate();
        isolate.active.store(true, Ordering::Release);

        // Dispatch with render timeout
        let start = Instant::now();
        let result = tokio::time::timeout(
            self.max_render_time,
            isolate.inner.handle_ssr(request),
        ).await;

        isolate.active.store(false, Ordering::Release);
        self.metrics.active_requests.fetch_sub(1, Ordering::Relaxed);
        self.metrics.completed_requests.fetch_add(1, Ordering::Relaxed);
        self.metrics.record_render_time(start.elapsed());

        drop(permit);

        match result {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(e)) => Err(SsrPoolError::RenderError(e)),
            Err(_) => Err(SsrPoolError::RenderTimeout),
        }
    }
}

pub enum SsrPoolError {
    QueueTimeout,
    PoolClosed,
    RenderTimeout,
    RenderError(anyhow::Error),
}
```

**Acceptance criteria:**
- [ ] `handle_ssr()` routes to an Isolate and returns `SsrResponse`
- [ ] LeastLoaded strategy picks inactive Isolate when available
- [ ] RoundRobin strategy distributes evenly across Isolates
- [ ] Queue timeout returns `SsrPoolError::QueueTimeout` after configured duration
- [ ] Render timeout returns `SsrPoolError::RenderTimeout` after configured duration
- [ ] Metrics correctly track active/queued/completed counts
- [ ] Test: concurrent requests distribute across pool Isolates
- [ ] Test: requests beyond capacity queue and eventually complete
- [ ] Test: queue timeout fires correctly

---

### Task 3: Integrate pool into HTTP server

**Files:**
- `native/vtz/src/server/http.rs` (modified)
- `native/vtz/src/config.rs` (modified)
- `native/vtz/src/server/diagnostics.rs` (modified)

**What to implement:**

Replace the single `Arc<RwLock<Option<Arc<PersistentIsolate>>>>` for SSR with `Arc<RwLock<Option<Arc<SsrPool>>>>` in `DevServerState`. The API isolate (for `/api/*` requests) stays as a single `PersistentIsolate`.

In `config.rs`, add SSR pool fields to `ServerConfig`:
```rust
pub ssr_pool_size: Option<usize>,          // None = auto
pub ssr_max_concurrent_requests: usize,    // default: 50
pub ssr_queue_timeout_ms: u64,             // default: 2000
pub ssr_max_render_time_ms: u64,           // default: 5000
pub ssr_strategy: String,                  // "least-loaded" or "round-robin"
pub ssr_warmup_routes: Vec<String>,        // default: empty
```

In `http.rs`, update `build_router()` (line ~180) to create `SsrPool` instead of single `PersistentIsolate` for SSR. Update `dev_server_handler()` (line ~784) to call `pool.handle_ssr()` instead of `isolate.handle_ssr()`.

In `diagnostics.rs`, extend `DiagnosticsSnapshot` with `SsrPoolDiagnostics`:
```rust
pub struct SsrPoolDiagnostics {
    pub status: String,           // "healthy" | "degraded" | "saturated"
    pub pool_size: usize,
    pub native_signals: bool,
    pub active_requests: u64,
    pub queued_requests: u64,
    pub completed_requests: u64,
    pub avg_render_time_ms: f64,
    pub p99_render_time_ms: f64,
    pub isolate_memory_mb: Vec<f64>,
}
```

Handle `SsrPoolError` in the HTTP handler:
- `QueueTimeout` → 503 with structured JSON body and `Retry-After` header
- `RenderTimeout` → 504 with error message
- `RenderError` → 500 with error details

**Acceptance criteria:**
- [ ] `build_router()` creates `SsrPool` when SSR is enabled
- [ ] SSR requests go through pool, API requests stay on single isolate
- [ ] `/__vertz_diagnostics` includes pool metrics
- [ ] 503 response has structured JSON body with `ssr_pool_saturated` error
- [ ] Config fields parsed from `vertz.config.ts` (or defaults applied)
- [ ] Startup logs show pool size and configuration

---

### Task 4: Rolling HMR propagation

**Files:**
- `native/vtz/src/ssr/pool.rs` (modified)
- `native/vtz/src/hmr/mod.rs` (modified)
- `native/vtz/src/ssr/pool_test.rs` (modified)

**What to implement:**

Add `SsrPool::rolling_reload()` method:

```rust
impl SsrPool {
    /// Reload modules in all Isolates using a rolling strategy.
    /// Drains each Isolate one at a time, reloads modules, then resumes routing.
    pub async fn rolling_reload(&self) -> Result<(), anyhow::Error> {
        for isolate in &self.isolates {
            // 1. Mark isolate as "reloading" — stop routing new requests to it
            isolate.reloading.store(true, Ordering::Release);

            // 2. Wait for current request to complete (with timeout)
            let drain_timeout = Duration::from_secs(5);
            let start = Instant::now();
            while isolate.active.load(Ordering::Acquire) && start.elapsed() < drain_timeout {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }

            // 3. Restart the isolate (new PersistentIsolate, fresh module cache)
            let new_isolate = PersistentIsolate::new(self.isolate_options.clone())?;
            // Wait for initialization
            while !new_isolate.is_initialized() {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            // Swap inner
            *isolate.inner.write().await = Arc::new(new_isolate);

            // 4. Resume routing
            isolate.reloading.store(false, Ordering::Release);
        }
        Ok(())
    }
}
```

Update `pick_isolate()` to skip Isolates where `reloading == true`.

In `hmr/mod.rs`, add pool awareness: when file changes trigger HMR, if the pool exists, call `pool.rolling_reload()` in addition to client-side HMR broadcast.

Add `reloading: Arc<AtomicBool>` field to `SsrIsolate`.

**Acceptance criteria:**
- [ ] `rolling_reload()` reloads all Isolates one at a time
- [ ] During reload, at least N-1 Isolates are serving (no total downtime)
- [ ] In-flight requests complete on old code before Isolate reloads
- [ ] `pick_isolate()` skips reloading Isolates
- [ ] Test: request during rolling reload is served by non-reloading Isolate
- [ ] Test: all Isolates have new code after reload completes
- [ ] Edge case: if new HMR arrives during rolling reload, queue it

---

### Task 5: Crash recovery + warmup routes

**Files:**
- `native/vtz/src/ssr/pool.rs` (modified)
- `native/vtz/src/ssr/pool_test.rs` (modified)

**What to implement:**

**Crash recovery:** When `handle_ssr()` returns an error that indicates the Isolate has crashed (e.g., channel closed, V8 fatal error), automatically replace the crashed Isolate:

```rust
async fn replace_crashed_isolate(&self, index: usize) -> Result<(), anyhow::Error> {
    let isolate = &self.isolates[index];
    isolate.reloading.store(true, Ordering::Release);

    let new_inner = PersistentIsolate::new(self.isolate_options.clone())?;
    while !new_inner.is_initialized() {
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    *isolate.inner.write().await = Arc::new(new_inner);

    isolate.reloading.store(false, Ordering::Release);
    eprintln!("[Server] SSR pool: Isolate #{} replaced after crash", index);
    Ok(())
}
```

Detect crash: if `isolate.inner.handle_ssr()` returns `Err` and the error indicates a closed channel or fatal V8 error, call `replace_crashed_isolate()`.

**Warmup routes:** Add `SsrPool::warmup()` method called after pool creation:

```rust
pub async fn warmup(&self) {
    for route in &self.config.warmup_routes {
        let request = SsrRequest {
            url: route.clone(),
            session_json: None,
            cookies: None,
        };
        match self.handle_ssr(request).await {
            Ok(_) => eprintln!("[Server] SSR pool: {} warmed in {}ms", route, elapsed),
            Err(e) => eprintln!(
                "[Server] SSR pool: warmup failed for {}: {} (JIT will warm on first request)",
                route, e
            ),
        }
    }
}
```

Warmup failures log warnings but do NOT block startup.

**Acceptance criteria:**
- [ ] Crashed Isolate is replaced automatically within 1 second
- [ ] Subsequent requests to the replaced Isolate succeed
- [ ] Pool remains operational during Isolate replacement (N-1 serving)
- [ ] Warmup routes are rendered on startup (warming V8 JIT)
- [ ] Warmup failures log warning, do not block startup
- [ ] Test: force Isolate crash, verify replacement, verify next request succeeds
- [ ] Test: warmup with valid route succeeds, warmup with invalid route logs warning

---

### Task 6: Throughput benchmark + E2E validation

**Files:**
- `native/vtz/benches/ssr_pool.rs` (new)
- `native/vtz/src/ssr/pool_test.rs` (modified)

**What to implement:**

Create a benchmark that validates the core acceptance criterion: **pool of 4 handles >= 3x throughput of single Isolate**.

```rust
// benches/ssr_pool.rs
#[bench]
fn bench_ssr_pool_throughput(b: &mut Bencher) {
    // Setup: create pool with configurable size, load linear-clone app
    // Measure: N concurrent SSR requests, time to complete all
    // Compare: pool_size=1 vs pool_size=4
}
```

Also add integration test in `pool_test.rs`:
- Start pool with real app entry (use a minimal test fixture)
- Send concurrent SSR requests
- Verify all responses are valid HTML
- Verify p99 latency under 50ms for warm pool

**Acceptance criteria:**
- [ ] Benchmark shows >= 3x throughput for pool of 4 vs pool of 1
- [ ] p99 latency < 50ms for warm pool rendering a typical page
- [ ] All SSR responses contain valid HTML with expected content
- [ ] Pool metrics match actual request counts
