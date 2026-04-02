use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

/// V8 Isolate health state.
///
/// Tracks whether the V8 runtime is healthy and manages restart logic.
/// This is a best-effort mechanism: OOM conditions may abort the process
/// before the recovery logic can act (V8 behavior).
#[derive(Clone)]
pub struct IsolateHealth {
    inner: Arc<IsolateHealthInner>,
}

struct IsolateHealthInner {
    /// Whether the isolate is currently healthy.
    healthy: AtomicBool,
    /// Number of restarts since server start.
    restart_count: AtomicU32,
    /// Maximum allowed restarts before giving up.
    max_restarts: u32,
}

/// Result of an isolate health check.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HealthStatus {
    /// Isolate is healthy and operational.
    Healthy,
    /// Isolate needs restart (unrecoverable error detected).
    NeedsRestart,
    /// Max restarts exceeded — manual intervention needed.
    Exhausted,
}

impl IsolateHealth {
    /// Create a new isolate health tracker.
    pub fn new(max_restarts: u32) -> Self {
        Self {
            inner: Arc::new(IsolateHealthInner {
                healthy: AtomicBool::new(true),
                restart_count: AtomicU32::new(0),
                max_restarts,
            }),
        }
    }

    /// Mark the isolate as unhealthy.
    pub fn mark_unhealthy(&self) {
        self.inner.healthy.store(false, Ordering::SeqCst);
    }

    /// Mark the isolate as healthy (after successful restart).
    pub fn mark_healthy(&self) {
        self.inner.healthy.store(true, Ordering::SeqCst);
    }

    /// Check the current health status.
    pub fn status(&self) -> HealthStatus {
        if self.inner.healthy.load(Ordering::SeqCst) {
            return HealthStatus::Healthy;
        }

        if self.inner.restart_count.load(Ordering::SeqCst) >= self.inner.max_restarts {
            return HealthStatus::Exhausted;
        }

        HealthStatus::NeedsRestart
    }

    /// Record a restart attempt. Returns the new restart count.
    pub fn record_restart(&self) -> u32 {
        let count = self.inner.restart_count.fetch_add(1, Ordering::SeqCst) + 1;
        self.inner.healthy.store(true, Ordering::SeqCst);
        count
    }

    /// Get the total number of restarts.
    pub fn restart_count(&self) -> u32 {
        self.inner.restart_count.load(Ordering::SeqCst)
    }

    /// Check if the isolate is healthy.
    pub fn is_healthy(&self) -> bool {
        self.inner.healthy.load(Ordering::SeqCst)
    }
}

impl Default for IsolateHealth {
    fn default() -> Self {
        Self::new(5) // Default: max 5 restarts
    }
}

/// Configuration for config/dependency file watching.
///
/// These files trigger a full server restart when changed, not just HMR.
#[derive(Debug, Clone)]
pub struct RestartTriggers {
    /// File names that trigger a restart when changed.
    pub config_files: Vec<String>,
}

impl Default for RestartTriggers {
    fn default() -> Self {
        Self {
            config_files: vec![
                "vertz.config.ts".to_string(),
                "vertz.config.js".to_string(),
                "package.json".to_string(),
                "bun.lock".to_string(),
                "bun.lockb".to_string(),
                ".env".to_string(),
                ".env.local".to_string(),
                ".env.development".to_string(),
                "tsconfig.json".to_string(),
                "tsconfig.app.json".to_string(),
                "postcss.config.js".to_string(),
                "postcss.config.cjs".to_string(),
                "postcss.config.mjs".to_string(),
                "postcss.config.ts".to_string(),
                "tailwind.config.js".to_string(),
                "tailwind.config.cjs".to_string(),
                "tailwind.config.mjs".to_string(),
                "tailwind.config.ts".to_string(),
            ],
        }
    }
}

impl RestartTriggers {
    /// Check if a file path matches a restart trigger.
    pub fn is_restart_trigger(&self, path: &std::path::Path) -> bool {
        if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
            self.config_files.iter().any(|trigger| trigger == filename)
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    // ── IsolateHealth tests ──

    #[test]
    fn test_new_isolate_is_healthy() {
        let health = IsolateHealth::new(3);
        assert!(health.is_healthy());
        assert_eq!(health.status(), HealthStatus::Healthy);
        assert_eq!(health.restart_count(), 0);
    }

    #[test]
    fn test_mark_unhealthy() {
        let health = IsolateHealth::new(3);
        health.mark_unhealthy();
        assert!(!health.is_healthy());
        assert_eq!(health.status(), HealthStatus::NeedsRestart);
    }

    #[test]
    fn test_record_restart_marks_healthy() {
        let health = IsolateHealth::new(3);
        health.mark_unhealthy();
        let count = health.record_restart();
        assert_eq!(count, 1);
        assert!(health.is_healthy());
        assert_eq!(health.status(), HealthStatus::Healthy);
    }

    #[test]
    fn test_exhausted_after_max_restarts() {
        let health = IsolateHealth::new(2);

        // First restart
        health.mark_unhealthy();
        health.record_restart();

        // Second restart
        health.mark_unhealthy();
        health.record_restart();

        // Third failure: exhausted
        health.mark_unhealthy();
        assert_eq!(health.status(), HealthStatus::Exhausted);
    }

    #[test]
    fn test_default_max_restarts() {
        let health = IsolateHealth::default();
        for _ in 0..5 {
            health.mark_unhealthy();
            health.record_restart();
        }
        health.mark_unhealthy();
        assert_eq!(health.status(), HealthStatus::Exhausted);
    }

    #[test]
    fn test_clone_shares_state() {
        let health = IsolateHealth::new(3);
        let clone = health.clone();

        health.mark_unhealthy();
        assert!(!clone.is_healthy());
    }

    // ── RestartTriggers tests ──

    #[test]
    fn test_default_restart_triggers() {
        let triggers = RestartTriggers::default();

        assert!(triggers.is_restart_trigger(Path::new("/project/vertz.config.ts")));
        assert!(triggers.is_restart_trigger(Path::new("/project/package.json")));
        assert!(triggers.is_restart_trigger(Path::new("/project/.env")));
        assert!(triggers.is_restart_trigger(Path::new("/project/.env.local")));
        assert!(triggers.is_restart_trigger(Path::new("/project/bun.lock")));
        assert!(triggers.is_restart_trigger(Path::new("/project/postcss.config.js")));
        assert!(triggers.is_restart_trigger(Path::new("/project/tailwind.config.ts")));
    }

    #[test]
    fn test_non_trigger_files() {
        let triggers = RestartTriggers::default();

        assert!(!triggers.is_restart_trigger(Path::new("/project/src/app.tsx")));
        assert!(!triggers.is_restart_trigger(Path::new("/project/src/utils.ts")));
    }

    #[test]
    fn test_tsconfig_triggers_restart() {
        let triggers = RestartTriggers::default();

        assert!(triggers.is_restart_trigger(Path::new("/project/tsconfig.json")));
        assert!(triggers.is_restart_trigger(Path::new("/project/tsconfig.app.json")));
    }

    #[test]
    fn test_nested_path_trigger() {
        let triggers = RestartTriggers::default();
        // File name matching works regardless of directory depth
        assert!(triggers.is_restart_trigger(Path::new("/deep/nested/package.json")));
    }
}
