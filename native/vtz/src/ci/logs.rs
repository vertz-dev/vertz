use crate::ci::config;
use crate::ci::types::TaskStatus;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// A structured log entry for NDJSON execution logs.
#[derive(Debug, Serialize)]
#[serde(tag = "event")]
pub enum LogEntry {
    #[serde(rename = "run_start")]
    RunStart {
        run_id: String,
        timestamp: String,
        config_file: String,
        packages: usize,
        native_crates: usize,
    },
    #[serde(rename = "task_start")]
    TaskStart {
        run_id: String,
        timestamp: String,
        task: String,
        package: Option<String>,
        command: String,
    },
    #[serde(rename = "task_end")]
    TaskEnd {
        run_id: String,
        timestamp: String,
        task: String,
        package: Option<String>,
        status: TaskStatus,
        exit_code: Option<i32>,
        duration_ms: u64,
        cached: bool,
    },
    #[serde(rename = "run_end")]
    RunEnd {
        run_id: String,
        timestamp: String,
        total_duration_ms: u64,
        executed: usize,
        cached: usize,
        skipped: usize,
        failed: usize,
    },
}

/// NDJSON log writer. Appends structured entries to `.pipe/logs/<run-id>.jsonl`.
pub struct LogWriter {
    run_id: String,
    file: Option<std::fs::File>,
    secret_values: Vec<String>,
}

impl LogWriter {
    /// Create a new log writer. Creates the log directory and file.
    pub fn new(root_dir: &Path, secret_values: Vec<String>) -> Self {
        let run_id = uuid::Uuid::new_v4().to_string();
        let log_dir = root_dir.join(".pipe").join("logs");
        let file = std::fs::create_dir_all(&log_dir).ok().and_then(|_| {
            let path = log_dir.join(format!("{run_id}.jsonl"));
            std::fs::File::create(path).ok()
        });

        Self {
            run_id,
            file,
            secret_values,
        }
    }

    pub fn run_id(&self) -> &str {
        &self.run_id
    }

    /// Write a log entry to the NDJSON file.
    pub fn write(&mut self, entry: &LogEntry) {
        if let Some(file) = &mut self.file {
            if let Ok(json) = serde_json::to_string(entry) {
                let redacted = config::redact(&json, &self.secret_values);
                use std::io::Write;
                let _ = writeln!(file, "{redacted}");
            }
        }
    }

    pub fn log_dir(root_dir: &Path) -> PathBuf {
        root_dir.join(".pipe").join("logs")
    }
}

fn iso_now() -> String {
    humantime::format_rfc3339_millis(SystemTime::now()).to_string()
}

impl LogEntry {
    pub fn run_start(
        run_id: &str,
        config_file: &str,
        packages: usize,
        native_crates: usize,
    ) -> Self {
        LogEntry::RunStart {
            run_id: run_id.to_string(),
            timestamp: iso_now(),
            config_file: config_file.to_string(),
            packages,
            native_crates,
        }
    }

    pub fn task_start(run_id: &str, task: &str, package: Option<&str>, command: &str) -> Self {
        LogEntry::TaskStart {
            run_id: run_id.to_string(),
            timestamp: iso_now(),
            task: task.to_string(),
            package: package.map(String::from),
            command: command.to_string(),
        }
    }

    pub fn task_end(
        run_id: &str,
        task: &str,
        package: Option<&str>,
        status: TaskStatus,
        exit_code: Option<i32>,
        duration_ms: u64,
        cached: bool,
    ) -> Self {
        LogEntry::TaskEnd {
            run_id: run_id.to_string(),
            timestamp: iso_now(),
            task: task.to_string(),
            package: package.map(String::from),
            status,
            exit_code,
            duration_ms,
            cached,
        }
    }

    pub fn run_end(
        run_id: &str,
        total_duration_ms: u64,
        executed: usize,
        cached: usize,
        skipped: usize,
        failed: usize,
    ) -> Self {
        LogEntry::RunEnd {
            run_id: run_id.to_string(),
            timestamp: iso_now(),
            total_duration_ms,
            executed,
            cached,
            skipped,
            failed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_entry_run_start_serializes() {
        let entry = LogEntry::run_start("abc", "ci.config.ts", 28, 3);
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains(r#""event":"run_start""#));
        assert!(json.contains(r#""run_id":"abc""#));
        assert!(json.contains(r#""packages":28"#));
        assert!(json.contains(r#""native_crates":3"#));
    }

    #[test]
    fn log_entry_task_start_serializes() {
        let entry = LogEntry::task_start("abc", "build", Some("@vertz/ui"), "bun run build");
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains(r#""event":"task_start""#));
        assert!(json.contains(r#""task":"build""#));
        assert!(json.contains(r#""package":"@vertz/ui""#));
    }

    #[test]
    fn log_entry_task_end_serializes() {
        let entry = LogEntry::task_end(
            "abc",
            "build",
            Some("@vertz/ui"),
            TaskStatus::Success,
            Some(0),
            1234,
            false,
        );
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains(r#""event":"task_end""#));
        assert!(json.contains(r#""status":"success""#));
        assert!(json.contains(r#""duration_ms":1234"#));
    }

    #[test]
    fn log_entry_run_end_serializes() {
        let entry = LogEntry::run_end("abc", 12000, 8, 3, 2, 1);
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains(r#""event":"run_end""#));
        assert!(json.contains(r#""executed":8"#));
        assert!(json.contains(r#""failed":1"#));
    }

    #[test]
    fn log_writer_creates_file() {
        let dir = tempfile::tempdir().unwrap();
        let writer = LogWriter::new(dir.path(), vec![]);
        assert!(!writer.run_id().is_empty());
        let log_path = dir
            .path()
            .join(".pipe")
            .join("logs")
            .join(format!("{}.jsonl", writer.run_id()));
        assert!(log_path.exists());
    }

    #[test]
    fn log_writer_writes_entries() {
        let dir = tempfile::tempdir().unwrap();
        let mut writer = LogWriter::new(dir.path(), vec![]);
        let run_id = writer.run_id().to_string();

        writer.write(&LogEntry::run_start(&run_id, "ci.config.ts", 5, 0));
        writer.write(&LogEntry::task_start(
            &run_id,
            "build",
            None,
            "bun run build",
        ));

        // Read the file and check contents
        let log_path = dir
            .path()
            .join(".pipe")
            .join("logs")
            .join(format!("{run_id}.jsonl"));
        let content = std::fs::read_to_string(log_path).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains("run_start"));
        assert!(lines[1].contains("task_start"));
    }

    #[test]
    fn log_writer_redacts_secrets() {
        let dir = tempfile::tempdir().unwrap();
        let mut writer = LogWriter::new(dir.path(), vec!["s3cr3t".to_string()]);
        let run_id = writer.run_id().to_string();

        writer.write(&LogEntry::task_start(
            &run_id,
            "deploy",
            None,
            "deploy --token s3cr3t",
        ));

        let log_path = dir
            .path()
            .join(".pipe")
            .join("logs")
            .join(format!("{run_id}.jsonl"));
        let content = std::fs::read_to_string(log_path).unwrap();
        assert!(!content.contains("s3cr3t"));
        assert!(content.contains("[REDACTED]"));
    }
}
