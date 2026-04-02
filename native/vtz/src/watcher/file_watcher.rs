use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::sync::mpsc;

/// A file change event emitted by the watcher.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileChange {
    /// The type of change that occurred.
    pub kind: FileChangeKind,
    /// The absolute path of the changed file.
    pub path: PathBuf,
}

/// The type of file change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileChangeKind {
    /// File was created.
    Create,
    /// File was modified.
    Modify,
    /// File was deleted.
    Remove,
}

/// Configuration for the file watcher.
#[derive(Debug, Clone)]
pub struct FileWatcherConfig {
    /// Debounce duration in milliseconds. Default: 20ms.
    pub debounce_ms: u64,
    /// File extensions to watch. Default: [".ts", ".tsx", ".css"].
    pub extensions: Vec<String>,
    /// Directory names to ignore. Default: ["node_modules", ".vertz"].
    pub ignore_dirs: Vec<String>,
}

impl Default for FileWatcherConfig {
    fn default() -> Self {
        Self {
            debounce_ms: 20,
            extensions: vec![".ts".to_string(), ".tsx".to_string(), ".css".to_string()],
            ignore_dirs: vec!["node_modules".to_string(), ".vertz".to_string()],
        }
    }
}

/// A file watcher that watches a directory recursively for changes to
/// specific file types, with debouncing and filtering.
pub struct FileWatcher {
    _watcher: RecommendedWatcher,
}

impl FileWatcher {
    /// Start watching a directory. File change events are sent to the returned receiver.
    ///
    /// The watcher:
    /// - Watches `watch_dir` recursively
    /// - Filters by configured file extensions
    /// - Ignores configured directories (node_modules, .vertz, hidden files)
    /// - Debounces events by configured duration
    pub fn start(
        watch_dir: &Path,
        config: FileWatcherConfig,
    ) -> Result<(Self, mpsc::Receiver<FileChange>), notify::Error> {
        let (tx, rx) = mpsc::channel(256);
        let extensions = config.extensions.clone();
        let ignore_dirs = config.ignore_dirs.clone();

        // Use notify's built-in debouncing configuration
        let notify_config =
            Config::default().with_poll_interval(Duration::from_millis(config.debounce_ms));

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let kind = match event.kind {
                        EventKind::Create(_) => Some(FileChangeKind::Create),
                        EventKind::Modify(_) => Some(FileChangeKind::Modify),
                        EventKind::Remove(_) => Some(FileChangeKind::Remove),
                        _ => None,
                    };

                    if let Some(kind) = kind {
                        for path in &event.paths {
                            if should_process_file(path, &extensions, &ignore_dirs) {
                                let change = FileChange {
                                    kind,
                                    path: path.clone(),
                                };
                                let _ = tx.try_send(change);
                            }
                        }
                    }
                }
            },
            notify_config,
        )?;

        watcher.watch(watch_dir, RecursiveMode::Recursive)?;

        Ok((Self { _watcher: watcher }, rx))
    }
}

/// Check if a file path should be processed based on extension and directory filters.
pub fn should_process_file(path: &Path, extensions: &[String], ignore_dirs: &[String]) -> bool {
    // Must be a file (not a directory)
    let path_str = path.to_string_lossy();

    // Ignore hidden files (starting with .)
    if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
        if filename.starts_with('.') {
            return false;
        }
    }

    // Ignore specified directories
    for dir in ignore_dirs {
        if path_str.contains(&format!("/{}/", dir)) || path_str.contains(&format!("\\{}\\", dir)) {
            return false;
        }
    }

    // Check extension
    let has_ext = extensions
        .iter()
        .any(|ext| path_str.ends_with(ext.as_str()));

    has_ext
}

/// Debounce a stream of file changes, collapsing rapid changes to the same file
/// into a single event after the debounce duration.
pub struct Debouncer {
    pending: std::collections::HashMap<PathBuf, FileChange>,
    debounce_duration: Duration,
    last_event_time: Option<std::time::Instant>,
}

impl Debouncer {
    pub fn new(debounce_ms: u64) -> Self {
        Self {
            pending: std::collections::HashMap::new(),
            debounce_duration: Duration::from_millis(debounce_ms),
            last_event_time: None,
        }
    }

    /// Add a file change event. Returns None — use `drain` to get debounced events.
    pub fn add(&mut self, change: FileChange) {
        self.pending.insert(change.path.clone(), change);
        self.last_event_time = Some(std::time::Instant::now());
    }

    /// Check if the debounce period has elapsed since the last event.
    pub fn is_ready(&self) -> bool {
        match self.last_event_time {
            Some(t) => t.elapsed() >= self.debounce_duration,
            None => false,
        }
    }

    /// Drain all pending changes. Only call when `is_ready()` returns true.
    pub fn drain(&mut self) -> Vec<FileChange> {
        self.last_event_time = None;
        self.pending.drain().map(|(_, v)| v).collect()
    }

    /// Returns true if there are pending changes.
    pub fn has_pending(&self) -> bool {
        !self.pending.is_empty()
    }

    /// Cancel any pending debounce operation, discarding all pending changes.
    ///
    /// This is also called automatically on drop to ensure no stale pending
    /// state survives the debouncer's lifetime.
    pub fn cancel(&mut self) {
        self.pending.clear();
        self.last_event_time = None;
    }
}

impl Drop for Debouncer {
    fn drop(&mut self) {
        self.cancel();
    }
}

/// Smart debouncer for HMR: immediate dispatch for single-file changes,
/// batched dispatch for multi-file bursts (e.g., git checkout).
///
/// Two modes:
/// - **Immediate** (< `batch_window`): A single unique file path arrives and
///   no new changes follow within the batch window → dispatch immediately.
/// - **Batched** (> `batch_window`): Multiple files arrive within the batch
///   window → wait for the batch debounce duration before dispatching all.
///
/// Atomic saves (tmp + rename) produce multiple events for the same file path;
/// these are deduplicated and treated as a single-file change.
pub struct SmartDebouncer {
    pending: std::collections::HashMap<PathBuf, FileChange>,
    first_event_time: Option<std::time::Instant>,
    last_event_time: Option<std::time::Instant>,
    /// Window to distinguish single-file from multi-file changes (default: 5ms).
    batch_window: Duration,
    /// Debounce duration for multi-file batches (default: 20ms).
    batch_debounce: Duration,
    /// Maximum time to wait before forcing a batch dispatch (default: 100ms).
    /// Prevents indefinite delay when events arrive continuously.
    max_wait: Duration,
}

impl Default for SmartDebouncer {
    fn default() -> Self {
        Self::new()
    }
}

impl SmartDebouncer {
    /// Create a smart debouncer with default timings (5ms window, 20ms batch, 100ms max-wait).
    pub fn new() -> Self {
        Self {
            pending: std::collections::HashMap::new(),
            first_event_time: None,
            last_event_time: None,
            batch_window: Duration::from_millis(5),
            batch_debounce: Duration::from_millis(20),
            max_wait: Duration::from_millis(100),
        }
    }

    /// Create with custom timings.
    pub fn with_timings(batch_window_ms: u64, batch_debounce_ms: u64) -> Self {
        Self {
            pending: std::collections::HashMap::new(),
            first_event_time: None,
            last_event_time: None,
            batch_window: Duration::from_millis(batch_window_ms),
            batch_debounce: Duration::from_millis(batch_debounce_ms),
            max_wait: Duration::from_millis(100),
        }
    }

    /// Set the max-wait cap (builder pattern).
    pub fn with_max_wait(mut self, max_wait_ms: u64) -> Self {
        self.max_wait = Duration::from_millis(max_wait_ms);
        self
    }

    /// Add a file change event.
    pub fn add(&mut self, change: FileChange) {
        if self.first_event_time.is_none() {
            self.first_event_time = Some(std::time::Instant::now());
        }
        self.pending.insert(change.path.clone(), change);
        self.last_event_time = Some(std::time::Instant::now());
    }

    /// Check if changes are ready to dispatch.
    ///
    /// - Single unique file path + batch window elapsed → ready (immediate mode)
    /// - Multiple unique paths + batch debounce elapsed → ready (batch mode)
    pub fn is_ready(&self) -> bool {
        let first = match self.first_event_time {
            Some(t) => t,
            None => return false,
        };

        if self.pending.len() <= 1 {
            // Single file (or deduplicated atomic save): dispatch after batch window
            first.elapsed() >= self.batch_window
        } else {
            // Multiple files: wait for batch debounce after last event,
            // but always fire once the max-wait cap is reached.
            if first.elapsed() >= self.max_wait {
                return true;
            }
            match self.last_event_time {
                Some(t) => t.elapsed() >= self.batch_debounce,
                None => false,
            }
        }
    }

    /// Drain all pending changes. Only call when `is_ready()` returns true.
    pub fn drain(&mut self) -> Vec<FileChange> {
        self.first_event_time = None;
        self.last_event_time = None;
        self.pending.drain().map(|(_, v)| v).collect()
    }

    /// Returns true if there are pending changes.
    pub fn has_pending(&self) -> bool {
        !self.pending.is_empty()
    }

    /// Number of unique files pending.
    pub fn pending_count(&self) -> usize {
        self.pending.len()
    }

    /// Cancel any pending debounce operation, discarding all pending changes.
    ///
    /// This is also called automatically on drop to ensure no stale pending
    /// state survives the debouncer's lifetime.
    pub fn cancel(&mut self) {
        self.pending.clear();
        self.first_event_time = None;
        self.last_event_time = None;
    }
}

impl Drop for SmartDebouncer {
    fn drop(&mut self) {
        self.cancel();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_process_tsx_file() {
        let config = FileWatcherConfig::default();
        assert!(should_process_file(
            Path::new("/project/src/Button.tsx"),
            &config.extensions,
            &config.ignore_dirs,
        ));
    }

    #[test]
    fn test_should_process_ts_file() {
        let config = FileWatcherConfig::default();
        assert!(should_process_file(
            Path::new("/project/src/utils.ts"),
            &config.extensions,
            &config.ignore_dirs,
        ));
    }

    #[test]
    fn test_should_process_css_file() {
        let config = FileWatcherConfig::default();
        assert!(should_process_file(
            Path::new("/project/src/styles.css"),
            &config.extensions,
            &config.ignore_dirs,
        ));
    }

    #[test]
    fn test_should_not_process_json_file() {
        let config = FileWatcherConfig::default();
        assert!(!should_process_file(
            Path::new("/project/src/config.json"),
            &config.extensions,
            &config.ignore_dirs,
        ));
    }

    #[test]
    fn test_should_not_process_js_file() {
        let config = FileWatcherConfig::default();
        assert!(!should_process_file(
            Path::new("/project/src/bundle.js"),
            &config.extensions,
            &config.ignore_dirs,
        ));
    }

    #[test]
    fn test_should_ignore_node_modules() {
        let config = FileWatcherConfig::default();
        assert!(!should_process_file(
            Path::new("/project/node_modules/@vertz/ui/index.tsx"),
            &config.extensions,
            &config.ignore_dirs,
        ));
    }

    #[test]
    fn test_should_ignore_dot_vertz() {
        let config = FileWatcherConfig::default();
        assert!(!should_process_file(
            Path::new("/project/.vertz/deps/module.ts"),
            &config.extensions,
            &config.ignore_dirs,
        ));
    }

    #[test]
    fn test_should_ignore_hidden_files() {
        let config = FileWatcherConfig::default();
        assert!(!should_process_file(
            Path::new("/project/src/.hidden.ts"),
            &config.extensions,
            &config.ignore_dirs,
        ));
    }

    #[test]
    fn test_default_config() {
        let config = FileWatcherConfig::default();
        assert_eq!(config.debounce_ms, 20);
        assert_eq!(config.extensions.len(), 3);
        assert!(config.extensions.contains(&".ts".to_string()));
        assert!(config.extensions.contains(&".tsx".to_string()));
        assert!(config.extensions.contains(&".css".to_string()));
        assert!(config.ignore_dirs.contains(&"node_modules".to_string()));
        assert!(config.ignore_dirs.contains(&".vertz".to_string()));
    }

    #[test]
    fn test_custom_extensions() {
        let config = FileWatcherConfig {
            extensions: vec![".rs".to_string()],
            ..Default::default()
        };
        assert!(should_process_file(
            Path::new("/project/src/main.rs"),
            &config.extensions,
            &config.ignore_dirs,
        ));
        assert!(!should_process_file(
            Path::new("/project/src/app.tsx"),
            &config.extensions,
            &config.ignore_dirs,
        ));
    }

    #[tokio::test]
    async fn test_file_watcher_start_and_detect_change() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("app.tsx"), "const x = 1;").unwrap();

        let config = FileWatcherConfig::default();
        let (watcher, mut rx) = FileWatcher::start(&src_dir, config).unwrap();

        // Give the watcher time to initialize
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Modify the file
        std::fs::write(src_dir.join("app.tsx"), "const x = 2;").unwrap();

        // Wait for the change event with a timeout
        let result = tokio::time::timeout(Duration::from_secs(2), rx.recv()).await;

        assert!(result.is_ok(), "Should receive a change event");
        let change = result.unwrap().unwrap();
        assert!(change.path.ends_with("app.tsx"));

        drop(watcher); // Ensure watcher is cleaned up
    }

    #[tokio::test]
    async fn test_file_watcher_ignores_json_files() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let config = FileWatcherConfig::default();
        let (watcher, mut rx) = FileWatcher::start(&src_dir, config).unwrap();

        // Give the watcher time to initialize
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Create a json file (should be ignored)
        std::fs::write(src_dir.join("config.json"), "{}").unwrap();

        // Wait briefly — should NOT receive event
        let result = tokio::time::timeout(Duration::from_millis(200), rx.recv()).await;
        assert!(result.is_err(), "Should NOT receive event for .json files");

        drop(watcher);
    }

    #[tokio::test]
    async fn test_file_watcher_detects_new_file_creation() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let config = FileWatcherConfig::default();
        let (watcher, mut rx) = FileWatcher::start(&src_dir, config).unwrap();

        tokio::time::sleep(Duration::from_millis(50)).await;

        // Create a new tsx file
        std::fs::write(src_dir.join("NewComponent.tsx"), "export function New() {}").unwrap();

        let result = tokio::time::timeout(Duration::from_secs(2), rx.recv()).await;
        assert!(result.is_ok(), "Should receive event for new .tsx file");
        let change = result.unwrap().unwrap();
        assert!(change.path.ends_with("NewComponent.tsx"));

        drop(watcher);
    }

    #[test]
    fn test_debouncer_new() {
        let debouncer = Debouncer::new(20);
        assert!(!debouncer.has_pending());
        assert!(!debouncer.is_ready());
    }

    #[test]
    fn test_debouncer_add_and_drain() {
        let mut debouncer = Debouncer::new(0); // 0ms for testing
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        assert!(debouncer.has_pending());

        // With 0ms debounce, it should be immediately ready
        assert!(debouncer.is_ready());

        let changes = debouncer.drain();
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].path, PathBuf::from("/src/app.tsx"));
        assert!(!debouncer.has_pending());
    }

    #[test]
    fn test_debouncer_deduplicates_same_file() {
        let mut debouncer = Debouncer::new(0);
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });

        let changes = debouncer.drain();
        assert_eq!(changes.len(), 1, "Duplicate changes should be deduplicated");
    }

    #[test]
    fn test_debouncer_keeps_different_files() {
        let mut debouncer = Debouncer::new(0);
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/Button.tsx"),
        });

        let changes = debouncer.drain();
        assert_eq!(changes.len(), 2);
    }

    #[test]
    fn test_file_watcher_cleanup_on_drop() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let config = FileWatcherConfig::default();
        let (watcher, _rx) = FileWatcher::start(&src_dir, config).unwrap();

        // Drop should clean up without panicking
        drop(watcher);
    }

    // ── Debouncer cancel/drop tests ────────────────────────────────────

    #[test]
    fn test_debouncer_cancel_clears_pending() {
        let mut debouncer = Debouncer::new(100);
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/Button.tsx"),
        });
        assert!(debouncer.has_pending());

        debouncer.cancel();

        assert!(!debouncer.has_pending());
        assert!(!debouncer.is_ready());

        // Verify reuse after cancel works
        debouncer.add(FileChange {
            kind: FileChangeKind::Create,
            path: PathBuf::from("/src/NewFile.tsx"),
        });
        assert!(debouncer.has_pending());
    }

    #[test]
    fn test_debouncer_drop_with_pending_does_not_panic() {
        let mut debouncer = Debouncer::new(100);
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        assert!(debouncer.has_pending());
        drop(debouncer);
        // Reaching here means Drop ran successfully without panic
    }

    // ── SmartDebouncer tests ──────────────────────────────────────────

    #[test]
    fn test_smart_debouncer_new() {
        let debouncer = SmartDebouncer::new();
        assert!(!debouncer.has_pending());
        assert!(!debouncer.is_ready());
        assert_eq!(debouncer.pending_count(), 0);
    }

    #[test]
    fn test_smart_debouncer_single_file_immediate() {
        let mut debouncer = SmartDebouncer::with_timings(0, 20);
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        assert!(debouncer.has_pending());
        assert_eq!(debouncer.pending_count(), 1);

        // With 0ms batch window, single file should be immediately ready
        assert!(debouncer.is_ready());

        let changes = debouncer.drain();
        assert_eq!(changes.len(), 1);
        assert!(!debouncer.has_pending());
    }

    #[test]
    fn test_smart_debouncer_deduplicates_atomic_save() {
        let mut debouncer = SmartDebouncer::with_timings(0, 20);

        // Simulate atomic save: write + modify for same file path
        debouncer.add(FileChange {
            kind: FileChangeKind::Create,
            path: PathBuf::from("/src/app.tsx"),
        });
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });

        // Still just 1 unique file — should use immediate mode
        assert_eq!(debouncer.pending_count(), 1);
        assert!(debouncer.is_ready());

        let changes = debouncer.drain();
        assert_eq!(changes.len(), 1);
    }

    #[test]
    fn test_smart_debouncer_multi_file_batches() {
        let mut debouncer = SmartDebouncer::with_timings(0, 0);
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/Button.tsx"),
        });

        assert_eq!(debouncer.pending_count(), 2);
        // With 0ms batch debounce, multi-file batch is immediately ready
        assert!(debouncer.is_ready());

        let changes = debouncer.drain();
        assert_eq!(changes.len(), 2);
    }

    #[test]
    fn test_smart_debouncer_multi_file_waits_for_batch() {
        // Use a long batch debounce and long max_wait so it's definitely not ready
        let mut debouncer = SmartDebouncer::with_timings(0, 1000).with_max_wait(2000);
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/Button.tsx"),
        });

        // Multi-file with 1s debounce — not ready yet
        assert!(!debouncer.is_ready());
        assert!(debouncer.has_pending());
    }

    #[test]
    fn test_smart_debouncer_cancel_clears_pending() {
        let mut debouncer = SmartDebouncer::with_timings(100, 200);
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/Button.tsx"),
        });
        assert!(debouncer.has_pending());
        assert_eq!(debouncer.pending_count(), 2);

        debouncer.cancel();

        assert!(!debouncer.has_pending());
        assert!(!debouncer.is_ready());
        assert_eq!(debouncer.pending_count(), 0);

        // Verify reuse after cancel works
        debouncer.add(FileChange {
            kind: FileChangeKind::Create,
            path: PathBuf::from("/src/NewFile.tsx"),
        });
        assert!(debouncer.has_pending());
        assert_eq!(debouncer.pending_count(), 1);
    }

    #[test]
    fn test_smart_debouncer_drop_with_pending_does_not_panic() {
        let mut debouncer = SmartDebouncer::with_timings(100, 200);
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        assert!(debouncer.has_pending());
        drop(debouncer);
        // Reaching here means Drop ran successfully without panic
    }

    #[test]
    fn test_smart_debouncer_max_wait_fires_despite_long_batch_debounce() {
        // batch_debounce=1000ms (long), but max_wait=10ms (short)
        let mut debouncer = SmartDebouncer::with_timings(0, 1000).with_max_wait(10);
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/Button.tsx"),
        });

        // Without max_wait, this would require 1s batch_debounce.
        // With max_wait=10ms, it should be ready after ~10ms.
        std::thread::sleep(Duration::from_millis(15));
        assert!(
            debouncer.is_ready(),
            "Max-wait cap should force batch to fire even though batch_debounce hasn't elapsed"
        );
    }

    #[test]
    fn test_smart_debouncer_rapid_continuous_events_fire_within_max_wait() {
        // batch_debounce=50ms, max_wait=30ms — events every 5ms keep resetting the
        // batch timer, but max_wait should force dispatch within 30ms.
        let mut debouncer = SmartDebouncer::with_timings(0, 50).with_max_wait(30);

        // Simulate rapid continuous events that would reset batch_debounce indefinitely
        for i in 0..6 {
            debouncer.add(FileChange {
                kind: FileChangeKind::Modify,
                path: PathBuf::from(format!("/src/file{}.tsx", i)),
            });
            std::thread::sleep(Duration::from_millis(5));
        }
        // ~30ms have elapsed since first_event_time, exceeding max_wait
        // but last_event_time was just reset, so batch_debounce is not met
        assert!(
            debouncer.is_ready(),
            "Rapid continuous events should still fire within max_wait"
        );
    }

    #[test]
    fn test_smart_debouncer_max_wait_zero_fires_immediately() {
        let mut debouncer = SmartDebouncer::with_timings(0, 1000).with_max_wait(0);
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/Button.tsx"),
        });

        // max_wait=0 means multi-file batch fires immediately
        assert!(
            debouncer.is_ready(),
            "max_wait=0 should make multi-file batch immediately ready"
        );
    }

    #[test]
    fn test_smart_debouncer_default_max_wait_is_100ms() {
        let debouncer = SmartDebouncer::new();
        // Verify the default max_wait is 100ms by checking behavior
        assert_eq!(debouncer.max_wait, Duration::from_millis(100));
    }

    #[test]
    fn test_smart_debouncer_drain_resets_state() {
        let mut debouncer = SmartDebouncer::with_timings(0, 0);
        debouncer.add(FileChange {
            kind: FileChangeKind::Modify,
            path: PathBuf::from("/src/app.tsx"),
        });
        debouncer.drain();

        assert!(!debouncer.has_pending());
        assert!(!debouncer.is_ready());
        assert_eq!(debouncer.pending_count(), 0);
    }
}
