use crate::ci::types::{PipeConfig, TaskResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};

/// The NDJSON bridge to the Bun/Node process that loaded ci.config.ts.
/// Stays alive during execution to evaluate JS callback dep conditions.
pub struct ConfigBridge {
    child: Child,
    stdin: tokio::process::ChildStdin,
    reader: BufReader<tokio::process::ChildStdout>,
    line_buf: String,
}

// Messages sent TO the Bun process (over stdin)
#[derive(Serialize)]
struct EvalRequest {
    eval: u64,
    result: TaskResult,
}

#[derive(Serialize)]
struct ShutdownRequest {
    shutdown: bool,
}

// Messages received FROM the Bun process (over stdout)
#[derive(Deserialize)]
struct ConfigMessage {
    #[serde(rename = "type")]
    msg_type: String,
    data: serde_json::Value,
}

#[derive(Deserialize)]
struct EvalResponse {
    #[allow(dead_code)]
    eval: u64,
    value: Option<bool>,
    error: Option<String>,
}

impl ConfigBridge {
    /// Evaluate a JS callback by ID, passing the upstream TaskResult.
    /// Returns the boolean result from the callback.
    pub async fn eval_callback(&mut self, id: u64, result: &TaskResult) -> Result<bool, String> {
        let request = EvalRequest {
            eval: id,
            result: result.clone(),
        };
        let mut line =
            serde_json::to_string(&request).map_err(|e| format!("serialize eval request: {e}"))?;
        line.push('\n');
        self.stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("write to config bridge: {e}"))?;

        self.line_buf.clear();
        let read_timeout = std::time::Duration::from_secs(30);
        match tokio::time::timeout(read_timeout, self.reader.read_line(&mut self.line_buf)).await {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => return Err(format!("read from config bridge: {e}")),
            Err(_) => {
                let _ = self.child.kill().await;
                return Err(format!("callback {id} timed out after 30s"));
            }
        }

        if self.line_buf.is_empty() {
            return Err("config bridge process exited unexpectedly".to_string());
        }

        let resp: EvalResponse = serde_json::from_str(&self.line_buf)
            .map_err(|e| format!("parse eval response: {e}"))?;

        if let Some(err) = resp.error {
            return Err(format!("callback {id} threw: {err}"));
        }

        Ok(resp.value.unwrap_or(false))
    }

    /// Gracefully shut down the Bun process.
    pub async fn shutdown(mut self) -> Result<(), String> {
        let msg = serde_json::to_string(&ShutdownRequest { shutdown: true })
            .map_err(|e| format!("serialize shutdown: {e}"))?;
        let _ = self.stdin.write_all(format!("{msg}\n").as_bytes()).await;
        // Close stdin so the child process receives EOF and can exit cleanly.
        drop(self.stdin);
        // Give the process a few seconds to exit gracefully, then force kill.
        // Bun's readline may not terminate the event loop on break/EOF alone.
        let wait_timeout = std::time::Duration::from_secs(5);
        if tokio::time::timeout(wait_timeout, self.child.wait())
            .await
            .is_err()
        {
            let _ = self.child.kill().await;
            let _ = self.child.wait().await;
        }
        Ok(())
    }

    /// Create a dummy ConfigBridge for testing. Spawns `cat` as a no-op process.
    #[cfg(test)]
    pub fn dummy() -> Self {
        let mut child = Command::new("cat")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .spawn()
            .expect("failed to spawn dummy bridge process");
        let stdin = child.stdin.take().expect("dummy bridge: no stdin");
        let stdout = child.stdout.take().expect("dummy bridge: no stdout");
        Self {
            child,
            stdin,
            reader: BufReader::new(stdout),
            line_buf: String::new(),
        }
    }
}

/// The embedded loader script that Bun/Node will execute.
/// It loads the user's ci.config.ts, serializes the config, then stays alive
/// for callback evaluation.
const LOADER_SCRIPT: &str = r#"
import { createInterface } from 'node:readline';

const callbacks = new Map();
let nextId = 0;

// The pipe() SDK function uses this to register callbacks
globalThis.__pipeRegisterCallback = (fn) => {
  const id = nextId++;
  callbacks.set(id, fn);
  return id;
};

const configPath = process.argv[2];
if (!configPath) {
  process.stderr.write('error: no config path provided\n');
  process.exit(1);
}

let mod;
try {
  mod = await import(configPath);
} catch (err) {
  process.stderr.write(`error: failed to load ${configPath}: ${err.message}\n`);
  process.exit(1);
}

const config = mod.default;
if (!config || typeof config !== 'object') {
  process.stderr.write('error: ci.config.ts must export default a pipe({...}) config\n');
  process.exit(1);
}

// Phase 1: send config
process.stdout.write(JSON.stringify({ type: 'config', data: config }) + '\n');

// Phase 2: listen for callback evaluations
const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  let msg;
  try { msg = JSON.parse(line); } catch { continue; }
  if (msg.shutdown) break;
  if (msg.eval != null) {
    const fn = callbacks.get(msg.eval);
    try {
      const value = fn ? await fn(msg.result) : false;
      process.stdout.write(JSON.stringify({ eval: msg.eval, value: !!value }) + '\n');
    } catch (err) {
      process.stdout.write(JSON.stringify({ eval: msg.eval, error: String(err) }) + '\n');
    }
  }
}
rl.close();
process.exit(0);
"#;

/// Find the config file in the project root.
pub fn find_config(root_dir: &Path) -> Result<PathBuf, String> {
    let config_path = root_dir.join("ci.config.ts");
    if config_path.exists() {
        return Ok(config_path);
    }
    // Also check ci.config.js for plain JS projects
    let js_path = root_dir.join("ci.config.js");
    if js_path.exists() {
        return Ok(js_path);
    }
    Err(format!(
        "no ci.config.ts or ci.config.js found in {}",
        root_dir.display()
    ))
}

/// Find a JS runtime to execute the config file.
/// Tries: bun → node (with tsx)
fn find_runtime() -> Result<(String, Vec<String>), String> {
    // Try bun first
    if which::which("bun").is_ok() {
        return Ok(("bun".to_string(), vec!["run".to_string()]));
    }
    // Fallback: node + tsx
    if which::which("node").is_ok() {
        return Ok((
            "node".to_string(),
            vec!["--import".to_string(), "tsx".to_string()],
        ));
    }
    Err("no JavaScript runtime found. Install bun (recommended) or node + tsx.".to_string())
}

/// Load the config from ci.config.ts and return (PipeConfig, ConfigBridge).
/// The bridge stays alive for callback evaluation during task execution.
pub async fn load_config(root_dir: &Path) -> Result<(PipeConfig, ConfigBridge), String> {
    let config_path = find_config(root_dir)?;
    let (runtime, base_args) = find_runtime()?;

    // Write the loader script to a temp file
    let loader_dir = root_dir.join(".pipe");
    std::fs::create_dir_all(&loader_dir)
        .map_err(|e| format!("failed to create .pipe/ directory: {e}"))?;
    let loader_path = loader_dir.join("_loader.mjs");
    std::fs::write(&loader_path, LOADER_SCRIPT)
        .map_err(|e| format!("failed to write loader script: {e}"))?;

    // Spawn the runtime process
    let mut cmd = Command::new(&runtime);
    for arg in &base_args {
        cmd.arg(arg);
    }
    cmd.arg(loader_path.to_string_lossy().as_ref());
    cmd.arg(config_path.to_string_lossy().as_ref());
    cmd.current_dir(root_dir);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::inherit()); // user sees config errors directly

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn {runtime}: {e}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or("failed to capture stdin of config process")?;
    let stdout = child
        .stdout
        .take()
        .ok_or("failed to capture stdout of config process")?;

    let mut reader = BufReader::new(stdout);
    let mut line_buf = String::new();

    // Helper to kill the child on error paths to avoid zombie processes
    let kill_child = |mut c: Child| {
        tokio::spawn(async move {
            let _ = c.kill().await;
            let _ = c.wait().await;
        });
    };

    // Read the config message (Phase 1)
    if let Err(e) = reader.read_line(&mut line_buf).await {
        kill_child(child);
        return Err(format!("failed to read config from {runtime}: {e}"));
    }

    if line_buf.is_empty() {
        // Process exited without writing config — stderr already shown
        kill_child(child);
        return Err("config process exited without producing config".to_string());
    }

    let msg: ConfigMessage = match serde_json::from_str(&line_buf) {
        Ok(m) => m,
        Err(e) => {
            kill_child(child);
            return Err(format!("failed to parse config JSON: {e}"));
        }
    };

    if msg.msg_type != "config" {
        kill_child(child);
        return Err(format!(
            "unexpected message type from config loader: {}",
            msg.msg_type
        ));
    }

    let config: PipeConfig = match serde_json::from_value(msg.data) {
        Ok(c) => c,
        Err(e) => {
            kill_child(child);
            return Err(format!("invalid config: {e}"));
        }
    };

    let bridge = ConfigBridge {
        child,
        stdin,
        reader,
        line_buf: String::new(),
    };

    Ok((config, bridge))
}

/// Validate that all declared secrets exist as environment variables.
/// Returns Err with a message listing the missing secrets.
pub fn validate_secrets(secrets: &[String]) -> Result<(), String> {
    if secrets.is_empty() {
        return Ok(());
    }

    let missing: Vec<&str> = secrets
        .iter()
        .filter(|name| std::env::var(name).is_err())
        .map(|s| s.as_str())
        .collect();

    if missing.is_empty() {
        return Ok(());
    }

    let mut msg = String::from("missing required secrets:\n");
    for name in &missing {
        msg.push_str(&format!("  {name:<20} — not set\n"));
    }
    Err(msg)
}

/// Collect secret values for redaction purposes.
/// Returns the actual env var values for all declared secrets.
pub fn collect_secret_values(secrets: &[String]) -> Vec<String> {
    secrets
        .iter()
        .filter_map(|name| std::env::var(name).ok())
        .filter(|v| !v.is_empty())
        .collect()
}

/// Redact secret values from a string.
/// Replaces longest secrets first to avoid partial matches when one secret
/// is a substring of another.
pub fn redact(text: &str, secret_values: &[String]) -> String {
    let mut sorted: Vec<&str> = secret_values.iter().map(|s| s.as_str()).collect();
    sorted.sort_by_key(|b| std::cmp::Reverse(b.len()));

    let mut result = text.to_string();
    for secret in sorted {
        if !secret.is_empty() {
            result = result.replace(secret, "[REDACTED]");
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_config_ts() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("ci.config.ts"), "export default {}").unwrap();
        let result = find_config(dir.path());
        assert!(result.is_ok());
        assert!(result.unwrap().ends_with("ci.config.ts"));
    }

    #[test]
    fn find_config_js_fallback() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("ci.config.js"), "export default {}").unwrap();
        let result = find_config(dir.path());
        assert!(result.is_ok());
        assert!(result.unwrap().ends_with("ci.config.js"));
    }

    #[test]
    fn find_config_missing() {
        let dir = tempfile::tempdir().unwrap();
        let result = find_config(dir.path());
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("no ci.config.ts or ci.config.js found"));
    }

    #[test]
    fn validate_secrets_empty() {
        assert!(validate_secrets(&[]).is_ok());
    }

    #[test]
    fn validate_secrets_present() {
        // Use a var we know exists
        let result = validate_secrets(&["PATH".to_string()]);
        assert!(result.is_ok());
    }

    #[test]
    fn validate_secrets_missing() {
        let result = validate_secrets(&[
            "__VTZ_CI_TEST_MISSING_SECRET_1".to_string(),
            "__VTZ_CI_TEST_MISSING_SECRET_2".to_string(),
        ]);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("__VTZ_CI_TEST_MISSING_SECRET_1"));
        assert!(err.contains("__VTZ_CI_TEST_MISSING_SECRET_2"));
    }

    #[test]
    fn validate_secrets_partial_missing() {
        let result = validate_secrets(&[
            "PATH".to_string(),                      // exists
            "__VTZ_CI_TEST_NONEXISTENT".to_string(), // missing
        ]);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(!err.contains("PATH"));
        assert!(err.contains("__VTZ_CI_TEST_NONEXISTENT"));
    }

    #[test]
    fn redact_replaces_secrets() {
        let text = "deploying with token abc123 to server";
        let result = redact(text, &["abc123".to_string()]);
        assert_eq!(result, "deploying with token [REDACTED] to server");
    }

    #[test]
    fn redact_multiple_secrets() {
        let text = "user=admin pass=s3cret host=db.internal";
        let result = redact(text, &["s3cret".to_string(), "db.internal".to_string()]);
        assert_eq!(result, "user=admin pass=[REDACTED] host=[REDACTED]");
    }

    #[test]
    fn redact_no_secrets() {
        let text = "safe output";
        let result = redact(text, &[]);
        assert_eq!(result, "safe output");
    }

    #[test]
    fn redact_empty_secret_skipped() {
        let text = "some text";
        let result = redact(text, &["".to_string()]);
        assert_eq!(result, "some text");
    }

    #[test]
    fn collect_secret_values_present() {
        // PATH should always be set
        let values = collect_secret_values(&["PATH".to_string()]);
        assert_eq!(values.len(), 1);
        assert!(!values[0].is_empty());
    }

    #[test]
    fn collect_secret_values_missing() {
        let values = collect_secret_values(&["__VTZ_CI_TEST_NONEXISTENT_VAR".to_string()]);
        assert!(values.is_empty());
    }

    #[test]
    fn redact_longest_first_avoids_partial_match() {
        // "abc" is a substring of "xabcy". Without longest-first ordering,
        // replacing "abc" first would break "xabcy" into fragments.
        let text = "value is xabcy";
        let result = redact(text, &["abc".to_string(), "xabcy".to_string()]);
        assert_eq!(result, "value is [REDACTED]");

        // Reversed order should also work
        let result2 = redact(text, &["xabcy".to_string(), "abc".to_string()]);
        assert_eq!(result2, "value is [REDACTED]");
    }
}
