use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Arc, RwLock};

/// Maximum number of log entries to retain.
const MAX_ENTRIES: usize = 100;

/// Log level for console entries.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Log,
    Warn,
    Error,
    Info,
}

/// A captured console log entry.
#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    /// Log level (log, warn, error, info).
    pub level: LogLevel,
    /// The log message.
    pub message: String,
    /// Source of the log (e.g., "ssr", "compiler", "watcher").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// Unix timestamp in seconds.
    pub timestamp: u64,
}

/// Thread-safe ring buffer of console log entries.
///
/// Captures diagnostic output from SSR renders, compilation, and
/// file watcher events for LLM consumption via `GET /__vertz_ai/console`.
#[derive(Clone)]
pub struct ConsoleLog {
    entries: Arc<RwLock<VecDeque<LogEntry>>>,
}

impl ConsoleLog {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(RwLock::new(VecDeque::with_capacity(MAX_ENTRIES))),
        }
    }

    /// Add a log entry. Oldest entries are evicted when at capacity.
    pub fn push(&self, level: LogLevel, message: impl Into<String>, source: Option<&str>) {
        let entry = LogEntry {
            level,
            message: message.into(),
            source: source.map(|s| s.to_string()),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        };

        if let Ok(mut entries) = self.entries.write() {
            if entries.len() >= MAX_ENTRIES {
                entries.pop_front();
            }
            entries.push_back(entry);
        }
    }

    /// Get the last N entries (or all if N > stored count).
    pub fn last_n(&self, n: usize) -> Vec<LogEntry> {
        if let Ok(entries) = self.entries.read() {
            let skip = entries.len().saturating_sub(n);
            entries.iter().skip(skip).cloned().collect()
        } else {
            vec![]
        }
    }

    /// Get all entries.
    pub fn all(&self) -> Vec<LogEntry> {
        if let Ok(entries) = self.entries.read() {
            entries.iter().cloned().collect()
        } else {
            vec![]
        }
    }

    /// Get the total number of entries.
    pub fn len(&self) -> usize {
        self.entries.read().map(|e| e.len()).unwrap_or(0)
    }

    /// Check if empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl Default for ConsoleLog {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_console_log_is_empty() {
        let log = ConsoleLog::new();
        assert!(log.is_empty());
        assert_eq!(log.len(), 0);
    }

    #[test]
    fn test_push_and_retrieve() {
        let log = ConsoleLog::new();
        log.push(LogLevel::Log, "hello", Some("test"));

        assert_eq!(log.len(), 1);
        let entries = log.all();
        assert_eq!(entries[0].message, "hello");
        assert_eq!(entries[0].level, LogLevel::Log);
        assert_eq!(entries[0].source.as_deref(), Some("test"));
    }

    #[test]
    fn test_last_n() {
        let log = ConsoleLog::new();
        log.push(LogLevel::Log, "a", None);
        log.push(LogLevel::Log, "b", None);
        log.push(LogLevel::Log, "c", None);

        let last2 = log.last_n(2);
        assert_eq!(last2.len(), 2);
        assert_eq!(last2[0].message, "b");
        assert_eq!(last2[1].message, "c");
    }

    #[test]
    fn test_last_n_more_than_available() {
        let log = ConsoleLog::new();
        log.push(LogLevel::Log, "only one", None);

        let last5 = log.last_n(5);
        assert_eq!(last5.len(), 1);
    }

    #[test]
    fn test_eviction_at_capacity() {
        let log = ConsoleLog::new();
        for i in 0..MAX_ENTRIES + 10 {
            log.push(LogLevel::Log, format!("msg-{}", i), None);
        }

        assert_eq!(log.len(), MAX_ENTRIES);
        let entries = log.all();
        // First entry should be msg-10 (first 10 were evicted)
        assert_eq!(entries[0].message, "msg-10");
    }

    #[test]
    fn test_log_levels() {
        let log = ConsoleLog::new();
        log.push(LogLevel::Error, "err", Some("ssr"));
        log.push(LogLevel::Warn, "warn", Some("compiler"));
        log.push(LogLevel::Info, "info", None);

        let entries = log.all();
        assert_eq!(entries[0].level, LogLevel::Error);
        assert_eq!(entries[1].level, LogLevel::Warn);
        assert_eq!(entries[2].level, LogLevel::Info);
    }

    #[test]
    fn test_serialization() {
        let entry = LogEntry {
            level: LogLevel::Error,
            message: "something broke".to_string(),
            source: Some("ssr".to_string()),
            timestamp: 1234567890,
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"level\":\"error\""));
        assert!(json.contains("\"message\":\"something broke\""));
        assert!(json.contains("\"source\":\"ssr\""));
    }

    #[test]
    fn test_default() {
        let log = ConsoleLog::default();
        assert!(log.is_empty());
    }
}
