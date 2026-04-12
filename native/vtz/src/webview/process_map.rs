//! Process map for tracking spawned child processes.
//!
//! Stores PID (not `Child`) to avoid Mutex-across-await anti-patterns.
//! Kill is implemented via `libc::kill()` using the stored PID.
//! All operations are idempotent — kill/remove on non-existent entries succeed.

use std::collections::HashMap;
use std::sync::Mutex;

/// Tracks spawned processes by subscription ID → PID.
///
/// Thread-safe via `Mutex`. All operations are idempotent.
pub struct ProcessMap {
    inner: Mutex<HashMap<u64, u32>>,
}

impl Default for ProcessMap {
    fn default() -> Self {
        Self::new()
    }
}

impl ProcessMap {
    /// Create an empty process map.
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    /// Register a spawned process.
    pub fn insert(&self, sub_id: u64, pid: u32) {
        self.inner.lock().unwrap().insert(sub_id, pid);
    }

    /// Remove a process entry. Idempotent — returns `None` if not found.
    pub fn remove(&self, sub_id: u64) -> Option<u32> {
        self.inner.lock().unwrap().remove(&sub_id)
    }

    /// Kill a process group by subscription ID using SIGKILL.
    ///
    /// Processes are spawned with `process_group(0)`, so their PID is also
    /// their PGID. Negating the PID targets the entire process group,
    /// ensuring subprocesses are killed too.
    ///
    /// Idempotent: returns `Ok(true)` if signal was sent,
    /// `Ok(false)` if the process was already removed.
    /// Returns `Err` only on actual kill failure (not ESRCH).
    pub fn kill(&self, sub_id: u64) -> Result<bool, std::io::Error> {
        let pid = match self.inner.lock().unwrap().remove(&sub_id) {
            Some(pid) => pid,
            None => return Ok(false),
        };

        #[cfg(unix)]
        {
            // SAFETY: We are sending SIGKILL to a process group we spawned.
            // The pid is a valid u32 from Child::id(). With process_group(0),
            // PID == PGID. Negating targets the entire group. If the process
            // group already exited, kill returns ESRCH which we treat as success.
            let ret = unsafe { libc::kill(-(pid as libc::pid_t), libc::SIGKILL) };

            if ret == 0 {
                Ok(true)
            } else {
                let err = std::io::Error::last_os_error();
                if err.raw_os_error() == Some(libc::ESRCH) {
                    // Process already exited — treat as success
                    Ok(false)
                } else {
                    Err(err)
                }
            }
        }

        #[cfg(not(unix))]
        {
            let _ = pid;
            Ok(false)
        }
    }

    /// Kill all tracked process groups. Used on webview close for cleanup.
    ///
    /// Returns the number of process groups that were signaled.
    pub fn kill_all(&self) -> usize {
        let entries: Vec<(u64, u32)> = {
            let mut map = self.inner.lock().unwrap();
            let entries: Vec<_> = map.drain().collect();
            entries
        };

        let mut killed = 0;
        for (_sub_id, pid) in entries {
            #[cfg(unix)]
            {
                // SAFETY: Same as kill() above — sending SIGKILL to process groups we spawned.
                let ret = unsafe { libc::kill(-(pid as libc::pid_t), libc::SIGKILL) };
                if ret == 0 {
                    killed += 1;
                }
            }
            #[cfg(not(unix))]
            let _ = pid;
        }
        killed
    }

    /// Number of tracked processes. Useful for testing.
    pub fn len(&self) -> usize {
        self.inner.lock().unwrap().len()
    }

    /// Whether the map is empty.
    pub fn is_empty(&self) -> bool {
        self.inner.lock().unwrap().is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_remove() {
        let map = ProcessMap::new();
        map.insert(1, 12345);
        assert_eq!(map.len(), 1);
        assert_eq!(map.remove(1), Some(12345));
        assert_eq!(map.len(), 0);
    }

    #[test]
    fn remove_nonexistent_returns_none() {
        let map = ProcessMap::new();
        assert_eq!(map.remove(999), None);
    }

    #[test]
    fn kill_nonexistent_returns_ok_false() {
        let map = ProcessMap::new();
        assert!(!map.kill(999).unwrap());
    }

    #[test]
    fn kill_removes_entry() {
        let map = ProcessMap::new();
        // Use PID 0 which is special (signals process group) but won't error on kill
        // Actually, use a PID that won't exist — ESRCH is treated as success
        map.insert(1, 999_999_999);
        let result = map.kill(1).unwrap();
        // Process doesn't exist, so ESRCH → Ok(false)
        assert!(!result);
        assert!(map.is_empty());
    }

    #[test]
    fn kill_idempotent() {
        let map = ProcessMap::new();
        map.insert(1, 999_999_999);
        let _ = map.kill(1);
        // Second kill on same sub_id should succeed (already removed)
        assert!(!map.kill(1).unwrap());
    }

    #[test]
    fn kill_all_empties_map() {
        let map = ProcessMap::new();
        map.insert(1, 999_999_999);
        map.insert(2, 999_999_998);
        map.insert(3, 999_999_997);
        let _ = map.kill_all();
        assert!(map.is_empty());
    }

    #[test]
    fn is_empty_on_new() {
        let map = ProcessMap::new();
        assert!(map.is_empty());
        assert_eq!(map.len(), 0);
    }

    #[test]
    fn multiple_inserts_tracked() {
        let map = ProcessMap::new();
        map.insert(1, 100);
        map.insert(2, 200);
        map.insert(3, 300);
        assert_eq!(map.len(), 3);
    }

    // ── #2515: Process group kill for spawned processes ──

    #[tokio::test]
    async fn kill_terminates_entire_process_group() {
        use std::time::Duration;
        use tokio::process::Command;

        let marker =
            std::env::temp_dir().join(format!("vtz_test_spawn_pgkill_{}", std::process::id()));
        // Clean up from any previous failed run
        let _ = std::fs::remove_file(&marker);

        let marker_path = marker.display().to_string();

        // Spawn a process in its own process group (simulates what spawn() does).
        // The process starts a background subprocess that writes a marker file after 2s.
        let mut cmd = Command::new("sh");
        cmd.args([
            "-c",
            &format!("(sleep 2 && echo alive > {}) & wait", marker_path),
        ]);
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        #[cfg(unix)]
        cmd.process_group(0);

        let child = cmd.spawn().expect("failed to spawn test process");
        let pid = child.id().expect("failed to get PID");

        let map = ProcessMap::new();
        map.insert(1, pid);

        // Give the subprocess time to start
        tokio::time::sleep(Duration::from_millis(200)).await;

        // Kill via ProcessMap — should kill the entire process group
        let result = map.kill(1).unwrap();
        assert!(result, "expected kill to signal the process");

        // Wait long enough for the subprocess to write the marker (if it survived)
        tokio::time::sleep(Duration::from_secs(4)).await;

        assert!(
            !marker.exists(),
            "marker file exists — subprocess was NOT killed (process group kill failed)"
        );

        // Cleanup
        let _ = std::fs::remove_file(&marker);
    }
}
