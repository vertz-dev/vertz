use serde::{Deserialize, Serialize, Serializer};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

/// Default ring buffer capacity.
pub const DEFAULT_CAPACITY: usize = 1000;

/// Audit event types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AuditEventType {
    ApiRequest,
    SsrRender,
    Compilation,
    FileChange,
    Error,
}

impl AuditEventType {
    /// All valid type names, for error messages.
    pub const ALL_NAMES: &[&str] = &[
        "api_request",
        "ssr_render",
        "compilation",
        "file_change",
        "error",
    ];

    /// Parse from a string, returning `None` for unknown types.
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "api_request" => Some(Self::ApiRequest),
            "ssr_render" => Some(Self::SsrRender),
            "compilation" => Some(Self::Compilation),
            "file_change" => Some(Self::FileChange),
            "error" => Some(Self::Error),
            _ => None,
        }
    }
}

/// Format a `SystemTime` as ISO 8601 with nanosecond precision.
fn format_timestamp(t: &SystemTime) -> String {
    let duration = t.duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    let nanos = duration.subsec_nanos();

    // Convert seconds to date-time components.
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;

    // Convert days since epoch to year-month-day (simplified calendar arithmetic).
    let (year, month, day) = days_to_ymd(days);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:09}Z",
        year, month, day, hours, minutes, seconds, nanos
    )
}

/// Convert days since Unix epoch to (year, month, day).
fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    // Civil calendar from days algorithm (Howard Hinnant).
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64; // day of era [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // year of era [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // day of year [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    (y as u64, m, d)
}

/// Parse an ISO 8601 timestamp to `SystemTime`.
pub fn parse_timestamp(s: &str) -> Option<SystemTime> {
    // Parse "YYYY-MM-DDTHH:MM:SS.NNNNNNNNNZ" format.
    if s.len() < 20 {
        return None;
    }
    let year: u64 = s.get(0..4)?.parse().ok()?;
    let month: u64 = s.get(5..7)?.parse().ok()?;
    let day: u64 = s.get(8..10)?.parse().ok()?;
    let hour: u64 = s.get(11..13)?.parse().ok()?;
    let min: u64 = s.get(14..16)?.parse().ok()?;
    let sec: u64 = s.get(17..19)?.parse().ok()?;

    // Parse optional fractional seconds.
    let nanos: u32 = if s.len() > 20 && s.as_bytes()[19] == b'.' {
        let end = s.len() - if s.ends_with('Z') { 1 } else { 0 };
        let frac = s.get(20..end)?;
        // Pad or truncate to 9 digits.
        let padded = format!("{:0<9}", frac);
        padded[..9].parse().ok()?
    } else {
        0
    };

    // Convert to days since epoch.
    let days = ymd_to_days(year, month, day)?;
    let total_secs = days * 86400 + hour * 3600 + min * 60 + sec;

    Some(UNIX_EPOCH + std::time::Duration::new(total_secs, nanos))
}

/// Convert (year, month, day) to days since Unix epoch.
fn ymd_to_days(year: u64, month: u64, day: u64) -> Option<u64> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    // Inverse of days_to_ymd (Howard Hinnant).
    let y = if month <= 2 {
        year as i64 - 1
    } else {
        year as i64
    };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64; // [0, 399]
    let m = if month > 2 { month - 3 } else { month + 9 }; // [0, 11]
    let doy = (153 * m + 2) / 5 + day - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    let days = era * 146097 + doe as i64 - 719468;
    Some(days as u64)
}

/// A single audit log event.
#[derive(Debug, Clone)]
pub struct AuditEvent {
    /// Wall-clock time when the event was recorded.
    pub timestamp: SystemTime,
    /// Event type discriminant.
    pub event_type: AuditEventType,
    /// Duration in milliseconds (where applicable).
    pub duration_ms: Option<f64>,
    /// Type-specific payload.
    pub data: serde_json::Value,
}

impl Serialize for AuditEvent {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("timestamp", &format_timestamp(&self.timestamp))?;
        map.serialize_entry("type", &self.event_type)?;
        if let Some(ms) = self.duration_ms {
            map.serialize_entry("duration_ms", &ms)?;
        }
        map.serialize_entry("data", &self.data)?;
        map.end()
    }
}

impl AuditEvent {
    /// Record an API request event.
    pub fn api_request(method: &str, path: &str, status: u16, duration_ms: f64) -> Self {
        Self {
            timestamp: SystemTime::now(),
            event_type: AuditEventType::ApiRequest,
            duration_ms: Some(duration_ms),
            data: serde_json::json!({
                "method": method,
                "path": path,
                "status": status,
            }),
        }
    }

    /// Record an SSR render event.
    pub fn ssr_render(
        url: &str,
        status: u16,
        query_count: usize,
        is_ssr: bool,
        duration_ms: f64,
    ) -> Self {
        Self {
            timestamp: SystemTime::now(),
            event_type: AuditEventType::SsrRender,
            duration_ms: Some(duration_ms),
            data: serde_json::json!({
                "url": url,
                "status": status,
                "query_count": query_count,
                "is_ssr": is_ssr,
            }),
        }
    }

    /// Record a compilation event.
    pub fn compilation(file: &str, cached: bool, css_extracted: bool, duration_ms: f64) -> Self {
        Self {
            timestamp: SystemTime::now(),
            event_type: AuditEventType::Compilation,
            duration_ms: Some(duration_ms),
            data: serde_json::json!({
                "file": file,
                "cached": cached,
                "css_extracted": css_extracted,
            }),
        }
    }

    /// Record a file change event.
    pub fn file_change(path: &str, kind: &str) -> Self {
        Self {
            timestamp: SystemTime::now(),
            event_type: AuditEventType::FileChange,
            duration_ms: None,
            data: serde_json::json!({
                "path": path,
                "kind": kind,
            }),
        }
    }

    /// Record an error event.
    pub fn error(
        category: &str,
        severity: &str,
        message: &str,
        file: Option<&str>,
        line: Option<u32>,
        column: Option<u32>,
    ) -> Self {
        let mut data = serde_json::json!({
            "category": category,
            "severity": severity,
            "message": message,
        });
        if let Some(f) = file {
            data["file"] = serde_json::json!(f);
        }
        if let Some(l) = line {
            data["line"] = serde_json::json!(l);
        }
        if let Some(c) = column {
            data["column"] = serde_json::json!(c);
        }
        Self {
            timestamp: SystemTime::now(),
            event_type: AuditEventType::Error,
            duration_ms: None,
            data,
        }
    }
}

/// Filter parameters for audit log queries.
pub struct AuditFilter {
    /// Max events to return (after filtering).
    pub last: usize,
    /// Optional type filter (multiple allowed).
    pub event_types: Option<Vec<AuditEventType>>,
    /// Optional time lower bound.
    pub since: Option<SystemTime>,
}

impl Default for AuditFilter {
    fn default() -> Self {
        Self {
            last: 100,
            event_types: None,
            since: None,
        }
    }
}

/// Query result.
#[derive(Debug, Serialize)]
pub struct AuditQueryResult {
    pub events: Vec<AuditEvent>,
    pub count: usize,
    pub total: usize,
    pub truncated: bool,
}

/// Summary stats for the diagnostics endpoint.
#[derive(Debug)]
pub struct AuditSummary {
    pub total_events: usize,
    pub capacity: usize,
    pub oldest_timestamp: Option<SystemTime>,
    pub newest_timestamp: Option<SystemTime>,
    pub events_by_type: HashMap<AuditEventType, usize>,
}

impl Serialize for AuditSummary {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("total_events", &self.total_events)?;
        map.serialize_entry("capacity", &self.capacity)?;
        map.serialize_entry(
            "oldest_timestamp",
            &self.oldest_timestamp.as_ref().map(format_timestamp),
        )?;
        map.serialize_entry(
            "newest_timestamp",
            &self.newest_timestamp.as_ref().map(format_timestamp),
        )?;
        // Serialize event type counts with snake_case keys.
        let type_counts: HashMap<String, usize> = self
            .events_by_type
            .iter()
            .map(|(k, v)| {
                let key = serde_json::to_value(k)
                    .ok()
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                    .unwrap_or_default();
                (key, *v)
            })
            .collect();
        map.serialize_entry("events_by_type", &type_counts)?;
        map.end()
    }
}

/// Thread-safe ring buffer of audit events.
#[derive(Clone)]
pub struct AuditLog {
    entries: Arc<RwLock<VecDeque<AuditEvent>>>,
    capacity: usize,
}

impl AuditLog {
    /// Create a new audit log with the given capacity.
    pub fn new(capacity: usize) -> Self {
        Self {
            entries: Arc::new(RwLock::new(VecDeque::with_capacity(capacity))),
            capacity,
        }
    }

    /// Record an event. Evicts oldest if at capacity.
    pub fn record(&self, event: AuditEvent) {
        if let Ok(mut entries) = self.entries.write() {
            if entries.len() >= self.capacity {
                entries.pop_front();
            }
            entries.push_back(event);
        }
    }

    /// Query events with optional filters.
    ///
    /// Semantics: filter by event_types → filter by since → take last N.
    /// Filtering always precedes truncation.
    pub fn query(&self, filter: AuditFilter) -> AuditQueryResult {
        let entries = match self.entries.read() {
            Ok(e) => e,
            Err(_) => {
                return AuditQueryResult {
                    events: vec![],
                    count: 0,
                    total: 0,
                    truncated: false,
                };
            }
        };

        let total = entries.len();

        // Apply filters.
        let filtered: Vec<AuditEvent> = entries
            .iter()
            .filter(|e| {
                if let Some(ref types) = filter.event_types {
                    if !types.contains(&e.event_type) {
                        return false;
                    }
                }
                if let Some(since) = filter.since {
                    if e.timestamp < since {
                        return false;
                    }
                }
                true
            })
            .cloned()
            .collect();

        let filtered_count = filtered.len();
        let truncated = filtered_count > filter.last;

        // Take last N from filtered results.
        let skip = filtered_count.saturating_sub(filter.last);
        let events: Vec<AuditEvent> = filtered.into_iter().skip(skip).collect();
        let count = events.len();

        AuditQueryResult {
            events,
            count,
            total,
            truncated,
        }
    }

    /// Summary stats (for diagnostics endpoint).
    pub fn summary(&self) -> AuditSummary {
        let entries = match self.entries.read() {
            Ok(e) => e,
            Err(_) => {
                return AuditSummary {
                    total_events: 0,
                    capacity: self.capacity,
                    oldest_timestamp: None,
                    newest_timestamp: None,
                    events_by_type: HashMap::new(),
                };
            }
        };

        let mut events_by_type = HashMap::new();
        for entry in entries.iter() {
            *events_by_type.entry(entry.event_type.clone()).or_insert(0) += 1;
        }

        AuditSummary {
            total_events: entries.len(),
            capacity: self.capacity,
            oldest_timestamp: entries.front().map(|e| e.timestamp),
            newest_timestamp: entries.back().map(|e| e.timestamp),
            events_by_type,
        }
    }

    /// Convert audit events to legacy LogEntry-like format for backward compatibility.
    pub fn to_legacy_log_entries(&self, last: usize) -> Vec<serde_json::Value> {
        let entries = match self.entries.read() {
            Ok(e) => e,
            Err(_) => return vec![],
        };

        let skip = entries.len().saturating_sub(last);
        entries
            .iter()
            .skip(skip)
            .map(|event| {
                let (level, source, message) = match event.event_type {
                    AuditEventType::Compilation => {
                        let file = event.data["file"].as_str().unwrap_or("unknown");
                        let duration = event.duration_ms.unwrap_or(0.0);
                        let cached = if event.data["cached"].as_bool().unwrap_or(false) {
                            "cached"
                        } else {
                            "fresh"
                        };
                        (
                            "info",
                            "compiler",
                            format!("Compiled {} ({:.1}ms, {})", file, duration, cached),
                        )
                    }
                    AuditEventType::SsrRender => {
                        let url = event.data["url"].as_str().unwrap_or("/");
                        let duration = event.duration_ms.unwrap_or(0.0);
                        let mode = if event.data["is_ssr"].as_bool().unwrap_or(false) {
                            "ssr"
                        } else {
                            "client-only"
                        };
                        (
                            "info",
                            "ssr",
                            format!("SSR: {} ({:.1}ms, {})", url, duration, mode),
                        )
                    }
                    AuditEventType::FileChange => {
                        let path = event.data["path"].as_str().unwrap_or("unknown");
                        ("info", "watcher", format!("File changed: {}", path))
                    }
                    AuditEventType::Error => {
                        let category = event.data["category"].as_str().unwrap_or("unknown");
                        let message = event.data["message"].as_str().unwrap_or("unknown error");
                        ("error", category, message.to_string())
                    }
                    AuditEventType::ApiRequest => {
                        let method = event.data["method"].as_str().unwrap_or("?");
                        let path = event.data["path"].as_str().unwrap_or("?");
                        let status = event.data["status"].as_u64().unwrap_or(0);
                        let duration = event.duration_ms.unwrap_or(0.0);
                        (
                            "info",
                            "api",
                            format!("API {} {} → {} ({:.1}ms)", method, path, status, duration),
                        )
                    }
                };

                let timestamp_secs = event
                    .timestamp
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                serde_json::json!({
                    "level": level,
                    "message": message,
                    "source": source,
                    "timestamp": timestamp_secs,
                })
            })
            .collect()
    }
}

impl Default for AuditLog {
    fn default() -> Self {
        Self::new(DEFAULT_CAPACITY)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    fn make_event(event_type: AuditEventType) -> AuditEvent {
        AuditEvent {
            timestamp: SystemTime::now(),
            event_type,
            duration_ms: None,
            data: serde_json::json!({}),
        }
    }

    // ── Ring buffer basics ──

    #[test]
    fn test_new_audit_log_is_empty() {
        let log = AuditLog::new(5);
        let result = log.query(AuditFilter::default());
        assert_eq!(result.count, 0);
        assert_eq!(result.total, 0);
        assert!(!result.truncated);
    }

    #[test]
    fn test_record_and_query() {
        let log = AuditLog::new(10);
        log.record(AuditEvent::file_change("src/App.tsx", "modify"));
        log.record(AuditEvent::api_request("GET", "/api/tasks", 200, 5.0));

        let result = log.query(AuditFilter::default());
        assert_eq!(result.count, 2);
        assert_eq!(result.total, 2);
        assert!(!result.truncated);
        assert_eq!(result.events[0].event_type, AuditEventType::FileChange);
        assert_eq!(result.events[1].event_type, AuditEventType::ApiRequest);
    }

    #[test]
    fn test_eviction_at_capacity() {
        let log = AuditLog::new(3);
        log.record(AuditEvent::file_change("a.tsx", "create"));
        log.record(AuditEvent::file_change("b.tsx", "modify"));
        log.record(AuditEvent::file_change("c.tsx", "modify"));
        log.record(AuditEvent::file_change("d.tsx", "remove"));

        let result = log.query(AuditFilter {
            last: 100,
            ..Default::default()
        });
        assert_eq!(result.count, 3);
        assert_eq!(result.total, 3);
        // First event (a.tsx) should be evicted.
        assert_eq!(result.events[0].data["path"], "b.tsx");
        assert_eq!(result.events[2].data["path"], "d.tsx");
    }

    // ── Type filtering ──

    #[test]
    fn test_filter_by_single_type() {
        let log = AuditLog::new(10);
        log.record(AuditEvent::file_change("a.tsx", "modify"));
        log.record(AuditEvent::api_request("GET", "/api/tasks", 200, 5.0));
        log.record(AuditEvent::file_change("b.tsx", "modify"));

        let result = log.query(AuditFilter {
            last: 100,
            event_types: Some(vec![AuditEventType::FileChange]),
            since: None,
        });
        assert_eq!(result.count, 2);
        assert!(result
            .events
            .iter()
            .all(|e| e.event_type == AuditEventType::FileChange));
    }

    #[test]
    fn test_filter_by_multiple_types() {
        let log = AuditLog::new(10);
        log.record(AuditEvent::file_change("a.tsx", "modify"));
        log.record(AuditEvent::api_request("GET", "/api/tasks", 200, 5.0));
        log.record(AuditEvent::compilation("a.tsx", false, true, 12.0));

        let result = log.query(AuditFilter {
            last: 100,
            event_types: Some(vec![AuditEventType::FileChange, AuditEventType::ApiRequest]),
            since: None,
        });
        assert_eq!(result.count, 2);
    }

    #[test]
    fn test_filter_by_nonexistent_type_returns_empty() {
        let log = AuditLog::new(10);
        log.record(AuditEvent::file_change("a.tsx", "modify"));

        let result = log.query(AuditFilter {
            last: 100,
            event_types: Some(vec![AuditEventType::Error]),
            since: None,
        });
        assert_eq!(result.count, 0);
    }

    // ── Time filtering ──

    #[test]
    fn test_filter_by_since() {
        let log = AuditLog::new(10);
        log.record(make_event(AuditEventType::FileChange));
        thread::sleep(Duration::from_millis(10));
        let midpoint = SystemTime::now();
        thread::sleep(Duration::from_millis(10));
        log.record(make_event(AuditEventType::ApiRequest));

        let result = log.query(AuditFilter {
            last: 100,
            event_types: None,
            since: Some(midpoint),
        });
        assert_eq!(result.count, 1);
        assert_eq!(result.events[0].event_type, AuditEventType::ApiRequest);
    }

    // ── Last truncation ──

    #[test]
    fn test_last_truncates_after_filtering() {
        let log = AuditLog::new(10);
        for i in 0..5 {
            log.record(AuditEvent::file_change(&format!("{}.tsx", i), "modify"));
        }

        let result = log.query(AuditFilter {
            last: 2,
            event_types: None,
            since: None,
        });
        assert_eq!(result.count, 2);
        assert!(result.truncated);
        // Should return the last 2.
        assert_eq!(result.events[0].data["path"], "3.tsx");
        assert_eq!(result.events[1].data["path"], "4.tsx");
    }

    #[test]
    fn test_filters_applied_before_truncation() {
        let log = AuditLog::new(10);
        // 3 file_change, 2 api_request
        log.record(AuditEvent::file_change("a.tsx", "modify"));
        log.record(AuditEvent::api_request("GET", "/1", 200, 1.0));
        log.record(AuditEvent::file_change("b.tsx", "modify"));
        log.record(AuditEvent::api_request("GET", "/2", 200, 2.0));
        log.record(AuditEvent::file_change("c.tsx", "modify"));

        let result = log.query(AuditFilter {
            last: 2,
            event_types: Some(vec![AuditEventType::FileChange]),
            since: None,
        });
        // 3 file changes, last 2 = b.tsx and c.tsx
        assert_eq!(result.count, 2);
        assert!(result.truncated);
        assert_eq!(result.events[0].data["path"], "b.tsx");
        assert_eq!(result.events[1].data["path"], "c.tsx");
    }

    // ── Summary ──

    #[test]
    fn test_summary_empty() {
        let log = AuditLog::new(10);
        let summary = log.summary();
        assert_eq!(summary.total_events, 0);
        assert_eq!(summary.capacity, 10);
        assert!(summary.oldest_timestamp.is_none());
        assert!(summary.newest_timestamp.is_none());
        assert!(summary.events_by_type.is_empty());
    }

    #[test]
    fn test_summary_with_events() {
        let log = AuditLog::new(10);
        log.record(AuditEvent::file_change("a.tsx", "modify"));
        log.record(AuditEvent::file_change("b.tsx", "modify"));
        log.record(AuditEvent::api_request("GET", "/api/tasks", 200, 5.0));

        let summary = log.summary();
        assert_eq!(summary.total_events, 3);
        assert_eq!(
            summary.events_by_type.get(&AuditEventType::FileChange),
            Some(&2)
        );
        assert_eq!(
            summary.events_by_type.get(&AuditEventType::ApiRequest),
            Some(&1)
        );
        assert!(summary.oldest_timestamp.is_some());
        assert!(summary.newest_timestamp.is_some());
    }

    // ── Typed constructors ──

    #[test]
    fn test_api_request_constructor() {
        let event = AuditEvent::api_request("POST", "/api/users", 201, 12.5);
        assert_eq!(event.event_type, AuditEventType::ApiRequest);
        assert_eq!(event.duration_ms, Some(12.5));
        assert_eq!(event.data["method"], "POST");
        assert_eq!(event.data["path"], "/api/users");
        assert_eq!(event.data["status"], 201);
    }

    #[test]
    fn test_ssr_render_constructor() {
        let event = AuditEvent::ssr_render("/tasks", 200, 3, true, 45.7);
        assert_eq!(event.event_type, AuditEventType::SsrRender);
        assert_eq!(event.duration_ms, Some(45.7));
        assert_eq!(event.data["url"], "/tasks");
        assert_eq!(event.data["status"], 200);
        assert_eq!(event.data["query_count"], 3);
        assert_eq!(event.data["is_ssr"], true);
    }

    #[test]
    fn test_compilation_constructor() {
        let event = AuditEvent::compilation("src/App.tsx", false, true, 12.3);
        assert_eq!(event.event_type, AuditEventType::Compilation);
        assert_eq!(event.duration_ms, Some(12.3));
        assert_eq!(event.data["file"], "src/App.tsx");
        assert_eq!(event.data["cached"], false);
        assert_eq!(event.data["css_extracted"], true);
    }

    #[test]
    fn test_file_change_constructor() {
        let event = AuditEvent::file_change("src/App.tsx", "modify");
        assert_eq!(event.event_type, AuditEventType::FileChange);
        assert!(event.duration_ms.is_none());
        assert_eq!(event.data["path"], "src/App.tsx");
        assert_eq!(event.data["kind"], "modify");
    }

    #[test]
    fn test_error_constructor_full() {
        let event = AuditEvent::error(
            "build",
            "error",
            "Expected ';'",
            Some("src/App.tsx"),
            Some(42),
            Some(10),
        );
        assert_eq!(event.event_type, AuditEventType::Error);
        assert!(event.duration_ms.is_none());
        assert_eq!(event.data["category"], "build");
        assert_eq!(event.data["severity"], "error");
        assert_eq!(event.data["message"], "Expected ';'");
        assert_eq!(event.data["file"], "src/App.tsx");
        assert_eq!(event.data["line"], 42);
        assert_eq!(event.data["column"], 10);
    }

    #[test]
    fn test_error_constructor_minimal() {
        let event = AuditEvent::error("runtime", "error", "Something broke", None, None, None);
        assert!(event.data.get("file").is_none());
        assert!(event.data.get("line").is_none());
        assert!(event.data.get("column").is_none());
    }

    // ── Serialization ──

    #[test]
    fn test_audit_event_serialization() {
        let event = AuditEvent::api_request("GET", "/api/tasks", 200, 5.0);
        let json = serde_json::to_value(&event).unwrap();

        // Has "type" not "event_type".
        assert!(json.get("type").is_some());
        assert!(json.get("event_type").is_none());
        assert_eq!(json["type"], "api_request");

        // Has ISO 8601 timestamp.
        let ts = json["timestamp"].as_str().unwrap();
        assert!(ts.ends_with('Z'));
        assert!(ts.contains('T'));

        // Has duration_ms.
        assert!(json["duration_ms"].as_f64().is_some());

        // Has data.
        assert_eq!(json["data"]["method"], "GET");
    }

    #[test]
    fn test_audit_event_duration_ms_omitted_when_none() {
        let event = AuditEvent::file_change("a.tsx", "modify");
        let json = serde_json::to_value(&event).unwrap();
        assert!(json.get("duration_ms").is_none());
    }

    #[test]
    fn test_query_result_serialization() {
        let log = AuditLog::new(10);
        log.record(AuditEvent::file_change("a.tsx", "modify"));

        let result = log.query(AuditFilter::default());
        let json = serde_json::to_value(&result).unwrap();

        assert_eq!(json["count"], 1);
        assert_eq!(json["total"], 1);
        assert_eq!(json["truncated"], false);
        assert!(json["events"].is_array());
    }

    #[test]
    fn test_summary_serialization() {
        let log = AuditLog::new(10);
        log.record(AuditEvent::file_change("a.tsx", "modify"));
        log.record(AuditEvent::api_request("GET", "/", 200, 1.0));

        let summary = log.summary();
        let json = serde_json::to_value(&summary).unwrap();

        assert_eq!(json["total_events"], 2);
        assert_eq!(json["capacity"], 10);
        assert!(json["oldest_timestamp"].is_string());
        assert!(json["newest_timestamp"].is_string());
        assert_eq!(json["events_by_type"]["file_change"], 1);
        assert_eq!(json["events_by_type"]["api_request"], 1);
    }

    // ── AuditEventType parsing ──

    #[test]
    fn test_event_type_from_str() {
        assert_eq!(
            AuditEventType::parse("api_request"),
            Some(AuditEventType::ApiRequest)
        );
        assert_eq!(
            AuditEventType::parse("ssr_render"),
            Some(AuditEventType::SsrRender)
        );
        assert_eq!(
            AuditEventType::parse("compilation"),
            Some(AuditEventType::Compilation)
        );
        assert_eq!(
            AuditEventType::parse("file_change"),
            Some(AuditEventType::FileChange)
        );
        assert_eq!(AuditEventType::parse("error"), Some(AuditEventType::Error));
        assert_eq!(AuditEventType::parse("nonexistent"), None);
    }

    // ── Timestamp formatting ──

    #[test]
    fn test_format_timestamp() {
        let t = UNIX_EPOCH + Duration::new(1712327521, 123456789);
        let s = format_timestamp(&t);
        assert!(s.starts_with("2024-04-05T"));
        assert!(s.ends_with("123456789Z"));
        assert!(s.contains('T'));
    }

    #[test]
    fn test_parse_timestamp_roundtrip() {
        let original = UNIX_EPOCH + Duration::new(1712327521, 123456789);
        let formatted = format_timestamp(&original);
        let parsed = parse_timestamp(&formatted).unwrap();
        let diff = if original > parsed {
            original.duration_since(parsed).unwrap()
        } else {
            parsed.duration_since(original).unwrap()
        };
        assert!(diff < Duration::from_nanos(1));
    }

    #[test]
    fn test_parse_timestamp_invalid() {
        assert!(parse_timestamp("not a timestamp").is_none());
        assert!(parse_timestamp("").is_none());
    }

    // ── Default ──

    #[test]
    fn test_default() {
        let log = AuditLog::default();
        assert_eq!(log.capacity, DEFAULT_CAPACITY);
        assert_eq!(log.query(AuditFilter::default()).count, 0);
    }

    // ── Legacy log entries ──

    #[test]
    fn test_to_legacy_log_entries() {
        let log = AuditLog::new(10);
        log.record(AuditEvent::file_change("a.tsx", "modify"));
        log.record(AuditEvent::api_request("GET", "/api/tasks", 200, 5.0));
        log.record(AuditEvent::error(
            "build",
            "error",
            "syntax error",
            None,
            None,
            None,
        ));

        let entries = log.to_legacy_log_entries(10);
        assert_eq!(entries.len(), 3);

        assert_eq!(entries[0]["level"], "info");
        assert_eq!(entries[0]["source"], "watcher");

        assert_eq!(entries[1]["level"], "info");
        assert_eq!(entries[1]["source"], "api");

        assert_eq!(entries[2]["level"], "error");
        assert_eq!(entries[2]["source"], "build");
        assert!(entries[2]["timestamp"].is_number());
    }

    #[test]
    fn test_to_legacy_log_entries_respects_last() {
        let log = AuditLog::new(10);
        for i in 0..5 {
            log.record(AuditEvent::file_change(&format!("{}.tsx", i), "modify"));
        }

        let entries = log.to_legacy_log_entries(2);
        assert_eq!(entries.len(), 2);
    }
}
