use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// A registered dev server route.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RouteEntry {
    /// The subdomain this route responds to (e.g., "feat-auth.my-app").
    pub subdomain: String,
    /// The port the dev server is listening on.
    pub port: u16,
    /// The git branch name.
    pub branch: String,
    /// The project name (from package.json or directory name).
    pub project: String,
    /// The PID of the dev server process.
    pub pid: u32,
    /// The root directory of the project/worktree.
    pub root_dir: PathBuf,
}

/// Default directory for proxy data: `~/.vtz/proxy/`.
pub fn proxy_dir() -> PathBuf {
    home_dir().join(".vtz").join("proxy")
}

/// Directory for route registration files: `~/.vtz/proxy/routes/`.
pub fn routes_dir() -> PathBuf {
    proxy_dir().join("routes")
}

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
}

/// Register a dev server by writing a route file to the given directory.
pub fn register_in(dir: &Path, entry: &RouteEntry) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join(format!("{}.json", entry.subdomain));
    let json = serde_json::to_string_pretty(entry).map_err(std::io::Error::other)?;
    std::fs::write(path, json)
}

/// Register a dev server using the default routes directory.
pub fn register(entry: &RouteEntry) -> std::io::Result<()> {
    register_in(&routes_dir(), entry)
}

/// Deregister a dev server by removing its route file from the given directory.
pub fn deregister_in(dir: &Path, subdomain: &str) -> std::io::Result<()> {
    let path = dir.join(format!("{subdomain}.json"));
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

/// Deregister a dev server using the default routes directory.
pub fn deregister(subdomain: &str) -> std::io::Result<()> {
    deregister_in(&routes_dir(), subdomain)
}

/// Load a single route entry from a file.
pub fn load_route(path: &Path) -> Result<RouteEntry, String> {
    let contents = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

/// Load all route entries from a directory. Skips files that can't be parsed.
pub fn load_all_routes_in(dir: &Path) -> Vec<RouteEntry> {
    if !dir.exists() {
        return Vec::new();
    }
    let mut entries = Vec::new();
    if let Ok(read_dir) = std::fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "json") {
                if let Ok(route) = load_route(&path) {
                    entries.push(route);
                }
            }
        }
    }
    entries
}

/// Load all route entries from the default routes directory.
pub fn load_all_routes() -> Vec<RouteEntry> {
    load_all_routes_in(&routes_dir())
}

/// Check if a process with the given PID is still alive.
pub fn is_pid_alive(pid: u32) -> bool {
    // SAFETY: kill(pid, 0) checks if process exists without sending a signal.
    // This is a standard POSIX idiom. pid is a u32 from our own route files.
    unsafe { libc::kill(pid as libc::pid_t, 0) == 0 }
}

/// Remove route files for processes that are no longer alive.
pub fn clean_stale_routes_in(dir: &Path) -> Vec<String> {
    let mut removed = Vec::new();
    if !dir.exists() {
        return removed;
    }
    if let Ok(read_dir) = std::fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "json") {
                if let Ok(route) = load_route(&path) {
                    if !is_pid_alive(route.pid) && std::fs::remove_file(&path).is_ok() {
                        removed.push(route.subdomain);
                    }
                }
            }
        }
    }
    removed
}

/// Remove stale routes from the default routes directory.
pub fn clean_stale_routes() -> Vec<String> {
    clean_stale_routes_in(&routes_dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_entry() -> RouteEntry {
        RouteEntry {
            subdomain: "feat-auth.my-app".to_string(),
            port: 3000,
            branch: "feat/auth".to_string(),
            project: "my-app".to_string(),
            pid: std::process::id(),
            root_dir: PathBuf::from("/tmp/my-app"),
        }
    }

    #[test]
    fn route_entry_serializes_to_json() {
        let entry = test_entry();
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("feat-auth.my-app"));
        assert!(json.contains("3000"));
    }

    #[test]
    fn route_entry_round_trips() {
        let entry = test_entry();
        let json = serde_json::to_string(&entry).unwrap();
        let deserialized: RouteEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(entry, deserialized);
    }

    #[test]
    fn register_writes_file() {
        let dir = tempfile::tempdir().unwrap();
        let routes = dir.path().join("routes");
        let entry = test_entry();
        register_in(&routes, &entry).unwrap();
        let route_file = routes.join("feat-auth.my-app.json");
        assert!(route_file.exists());
        let contents = std::fs::read_to_string(&route_file).unwrap();
        let loaded: RouteEntry = serde_json::from_str(&contents).unwrap();
        assert_eq!(loaded, entry);
    }

    #[test]
    fn deregister_removes_file() {
        let dir = tempfile::tempdir().unwrap();
        let routes = dir.path().join("routes");
        let entry = test_entry();
        register_in(&routes, &entry).unwrap();
        deregister_in(&routes, "feat-auth.my-app").unwrap();
        let route_file = routes.join("feat-auth.my-app.json");
        assert!(!route_file.exists());
    }

    #[test]
    fn deregister_nonexistent_is_ok() {
        let dir = tempfile::tempdir().unwrap();
        assert!(deregister_in(dir.path(), "nonexistent").is_ok());
    }

    #[test]
    fn load_all_routes_returns_empty_when_no_dir() {
        let dir = tempfile::tempdir().unwrap();
        let routes = dir.path().join("nonexistent");
        assert!(load_all_routes_in(&routes).is_empty());
    }

    #[test]
    fn load_all_routes_finds_registered_entries() {
        let dir = tempfile::tempdir().unwrap();
        let routes = dir.path().join("routes");
        let entry1 = test_entry();
        let mut entry2 = test_entry();
        entry2.subdomain = "main.my-app".to_string();
        entry2.port = 3001;
        register_in(&routes, &entry1).unwrap();
        register_in(&routes, &entry2).unwrap();
        let loaded = load_all_routes_in(&routes);
        assert_eq!(loaded.len(), 2);
    }

    #[test]
    fn load_all_routes_skips_non_json_files() {
        let dir = tempfile::tempdir().unwrap();
        let routes = dir.path().join("routes");
        std::fs::create_dir_all(&routes).unwrap();
        std::fs::write(routes.join("readme.txt"), "not a route").unwrap();
        let entry = test_entry();
        register_in(&routes, &entry).unwrap();
        let loaded = load_all_routes_in(&routes);
        assert_eq!(loaded.len(), 1);
    }

    #[test]
    fn load_all_routes_skips_invalid_json() {
        let dir = tempfile::tempdir().unwrap();
        let routes = dir.path().join("routes");
        std::fs::create_dir_all(&routes).unwrap();
        std::fs::write(routes.join("bad.json"), "not valid json").unwrap();
        let entry = test_entry();
        register_in(&routes, &entry).unwrap();
        let loaded = load_all_routes_in(&routes);
        assert_eq!(loaded.len(), 1);
    }

    #[test]
    fn is_pid_alive_returns_true_for_current_process() {
        assert!(is_pid_alive(std::process::id()));
    }

    #[test]
    fn is_pid_alive_returns_false_for_nonexistent_pid() {
        // PID 4_000_000 is unlikely to exist
        assert!(!is_pid_alive(4_000_000));
    }

    #[test]
    fn clean_stale_routes_removes_dead_entries() {
        let dir = tempfile::tempdir().unwrap();
        let routes = dir.path().join("routes");
        let mut entry = test_entry();
        // Use a PID that doesn't exist
        entry.pid = 4_000_000;
        register_in(&routes, &entry).unwrap();
        let removed = clean_stale_routes_in(&routes);
        assert_eq!(removed, vec!["feat-auth.my-app"]);
        assert!(load_all_routes_in(&routes).is_empty());
    }

    #[test]
    fn clean_stale_routes_keeps_live_entries() {
        let dir = tempfile::tempdir().unwrap();
        let routes = dir.path().join("routes");
        let entry = test_entry(); // uses current process PID (alive)
        register_in(&routes, &entry).unwrap();
        let removed = clean_stale_routes_in(&routes);
        assert!(removed.is_empty());
        assert_eq!(load_all_routes_in(&routes).len(), 1);
    }
}
