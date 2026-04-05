//! SSR pool metrics — atomic counters and latency tracking.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

/// Rolling window size for latency percentile calculation.
const LATENCY_WINDOW_SIZE: usize = 1000;

/// Metrics for the SSR Isolate pool.
///
/// All counters are atomic and can be read from any thread (e.g., the
/// diagnostics endpoint) without blocking the SSR hot path.
pub struct PoolMetrics {
    /// Number of SSR requests currently being rendered.
    pub active_requests: AtomicU64,
    /// Number of SSR requests waiting for a pool Isolate.
    pub queued_requests: AtomicU64,
    /// Total SSR requests completed (success + error).
    pub completed_requests: AtomicU64,
    /// Total SSR requests rejected with 503 (queue timeout or pool saturated).
    pub rejected_requests: AtomicU64,
    /// Sum of all render times in microseconds (for avg calculation).
    total_render_time_us: AtomicU64,
    /// Rolling window of recent render times in milliseconds (for percentile calculation).
    render_times: Mutex<RingBuffer>,
}

/// Fixed-capacity ring buffer for latency samples.
struct RingBuffer {
    data: Vec<f64>,
    pos: usize,
    full: bool,
}

impl RingBuffer {
    fn new(capacity: usize) -> Self {
        Self {
            data: vec![0.0; capacity],
            pos: 0,
            full: false,
        }
    }

    fn push(&mut self, value: f64) {
        self.data[self.pos] = value;
        self.pos += 1;
        if self.pos >= self.data.len() {
            self.pos = 0;
            self.full = true;
        }
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        if self.full {
            self.data.len()
        } else {
            self.pos
        }
    }

    fn is_empty(&self) -> bool {
        !self.full && self.pos == 0
    }

    /// Return a sorted copy of all active samples.
    fn sorted_samples(&self) -> Vec<f64> {
        let mut samples = if self.full {
            self.data.clone()
        } else {
            self.data[..self.pos].to_vec()
        };
        samples.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        samples
    }
}

impl PoolMetrics {
    pub fn new() -> Self {
        Self {
            active_requests: AtomicU64::new(0),
            queued_requests: AtomicU64::new(0),
            completed_requests: AtomicU64::new(0),
            rejected_requests: AtomicU64::new(0),
            total_render_time_us: AtomicU64::new(0),
            render_times: Mutex::new(RingBuffer::new(LATENCY_WINDOW_SIZE)),
        }
    }

    /// Record a completed render's duration.
    pub fn record_render_time(&self, duration: Duration) {
        let us = duration.as_micros() as u64;
        self.total_render_time_us.fetch_add(us, Ordering::Relaxed);

        let ms = duration.as_secs_f64() * 1000.0;
        if let Ok(mut ring) = self.render_times.lock() {
            ring.push(ms);
        }
    }

    /// Average render time in milliseconds across all completed requests.
    pub fn avg_render_time_ms(&self) -> f64 {
        let completed = self.completed_requests.load(Ordering::Relaxed);
        if completed == 0 {
            return 0.0;
        }
        let total_us = self.total_render_time_us.load(Ordering::Relaxed);
        (total_us as f64 / 1000.0) / completed as f64
    }

    /// p99 render time in milliseconds from the rolling window.
    pub fn p99_render_time_ms(&self) -> f64 {
        let ring = match self.render_times.lock() {
            Ok(r) => r,
            Err(_) => return 0.0,
        };
        if ring.is_empty() {
            return 0.0;
        }
        let sorted = ring.sorted_samples();
        let idx = ((sorted.len() as f64) * 0.99).ceil() as usize;
        let idx = idx.min(sorted.len()) - 1;
        sorted[idx]
    }

    /// Pool health status based on queue depth.
    pub fn status(&self, max_concurrent: u64) -> PoolStatus {
        let queued = self.queued_requests.load(Ordering::Relaxed);
        if queued >= max_concurrent {
            PoolStatus::Saturated
        } else if queued > 0 {
            PoolStatus::Degraded
        } else {
            PoolStatus::Healthy
        }
    }
}

impl Default for PoolMetrics {
    fn default() -> Self {
        Self::new()
    }
}

/// Pool health status for diagnostics.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PoolStatus {
    Healthy,
    Degraded,
    Saturated,
}

impl PoolStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            PoolStatus::Healthy => "healthy",
            PoolStatus::Degraded => "degraded",
            PoolStatus::Saturated => "saturated",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_metrics_start_at_zero() {
        let m = PoolMetrics::new();
        assert_eq!(m.active_requests.load(Ordering::Relaxed), 0);
        assert_eq!(m.queued_requests.load(Ordering::Relaxed), 0);
        assert_eq!(m.completed_requests.load(Ordering::Relaxed), 0);
        assert_eq!(m.rejected_requests.load(Ordering::Relaxed), 0);
        assert_eq!(m.avg_render_time_ms(), 0.0);
        assert_eq!(m.p99_render_time_ms(), 0.0);
    }

    #[test]
    fn record_render_time_updates_avg() {
        let m = PoolMetrics::new();
        m.completed_requests.fetch_add(2, Ordering::Relaxed);
        m.record_render_time(Duration::from_millis(10));
        m.record_render_time(Duration::from_millis(30));

        let avg = m.avg_render_time_ms();
        // (10_000 + 30_000) us / 1000 / 2 = 20.0ms
        assert!((avg - 20.0).abs() < 0.5, "avg was {}", avg);
    }

    #[test]
    fn p99_with_single_sample() {
        let m = PoolMetrics::new();
        m.record_render_time(Duration::from_millis(42));
        let p99 = m.p99_render_time_ms();
        assert!((p99 - 42.0).abs() < 0.5, "p99 was {}", p99);
    }

    #[test]
    fn p99_with_100_samples() {
        let m = PoolMetrics::new();
        for i in 1..=100 {
            m.record_render_time(Duration::from_millis(i));
        }
        let p99 = m.p99_render_time_ms();
        // p99 of [1..100] should be 99 or 100
        assert!((99.0..=100.5).contains(&p99), "p99 was {}", p99);
    }

    #[test]
    fn ring_buffer_wraps_around() {
        let mut ring = RingBuffer::new(3);
        ring.push(1.0);
        ring.push(2.0);
        ring.push(3.0);
        assert!(ring.full);
        assert_eq!(ring.len(), 3);

        // Overwrite oldest
        ring.push(4.0);
        assert_eq!(ring.len(), 3);
        let sorted = ring.sorted_samples();
        assert_eq!(sorted, vec![2.0, 3.0, 4.0]);
    }

    #[test]
    fn status_healthy_when_no_queue() {
        let m = PoolMetrics::new();
        assert_eq!(m.status(50), PoolStatus::Healthy);
    }

    #[test]
    fn status_degraded_when_queued() {
        let m = PoolMetrics::new();
        m.queued_requests.store(1, Ordering::Relaxed);
        assert_eq!(m.status(50), PoolStatus::Degraded);
    }

    #[test]
    fn status_saturated_when_at_max() {
        let m = PoolMetrics::new();
        m.queued_requests.store(50, Ordering::Relaxed);
        assert_eq!(m.status(50), PoolStatus::Saturated);
    }

    #[test]
    fn pool_status_as_str() {
        assert_eq!(PoolStatus::Healthy.as_str(), "healthy");
        assert_eq!(PoolStatus::Degraded.as_str(), "degraded");
        assert_eq!(PoolStatus::Saturated.as_str(), "saturated");
    }
}
