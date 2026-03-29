use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub host: String,
    pub public_dir: PathBuf,
    /// Root directory of the project (where package.json lives).
    pub root_dir: PathBuf,
    /// Source directory for application code (e.g., "src").
    pub src_dir: PathBuf,
    /// Entry file for the application (e.g., "src/app.tsx").
    pub entry_file: PathBuf,
    /// Whether SSR is enabled for page routes (default: true).
    pub enable_ssr: bool,
    /// Whether to run type checking (tsc/tsgo) (default: true).
    pub enable_typecheck: bool,
    /// Custom tsconfig path (default: None — let checker auto-detect).
    pub tsconfig_path: Option<PathBuf>,
    /// Explicit type checker binary path (default: None — auto-detect tsgo/tsc).
    pub typecheck_binary: Option<PathBuf>,
    /// Whether to open the browser after the server starts.
    pub open_browser: bool,
    /// Optional server entry file (e.g., "src/server.ts") for API route delegation.
    /// When present, a persistent V8 isolate is created to handle /api/* requests.
    pub server_entry: Option<PathBuf>,
}

impl ServerConfig {
    pub fn new(port: u16, host: String, public_dir: PathBuf) -> Self {
        let root_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let src_dir = root_dir.join("src");
        let entry_file = detect_entry_file(&src_dir);
        let server_entry = detect_server_entry(&src_dir);
        Self {
            port,
            host,
            public_dir,
            root_dir,
            src_dir,
            entry_file,
            enable_ssr: true,
            enable_typecheck: true,
            tsconfig_path: None,
            typecheck_binary: None,
            open_browser: false,
            server_entry,
        }
    }

    /// Create a config with explicit root directory (for testing).
    pub fn with_root(port: u16, host: String, public_dir: PathBuf, root_dir: PathBuf) -> Self {
        let src_dir = root_dir.join("src");
        let entry_file = detect_entry_file(&src_dir);
        let server_entry = detect_server_entry(&src_dir);
        Self {
            port,
            host,
            public_dir,
            root_dir,
            src_dir,
            entry_file,
            enable_ssr: true,
            enable_typecheck: true,
            tsconfig_path: None,
            typecheck_binary: None,
            open_browser: false,
            server_entry,
        }
    }

    /// Directory for cached/generated files (.vertz/).
    pub fn dot_vertz_dir(&self) -> PathBuf {
        self.root_dir.join(".vertz")
    }

    /// Directory for pre-bundled dependency files (.vertz/deps/).
    pub fn deps_dir(&self) -> PathBuf {
        self.dot_vertz_dir().join("deps")
    }

    /// Directory for extracted CSS files (.vertz/css/).
    pub fn css_dir(&self) -> PathBuf {
        self.dot_vertz_dir().join("css")
    }
}

/// Detect the client entry file by checking common names in order of priority.
fn detect_entry_file(src_dir: &Path) -> PathBuf {
    let candidates = [
        "entry-client.ts",
        "entry-client.tsx",
        "main.ts",
        "main.tsx",
        "index.ts",
        "index.tsx",
        "app.tsx",
        "app.ts",
    ];

    for candidate in &candidates {
        let path = src_dir.join(candidate);
        if path.exists() {
            return path;
        }
    }

    // Default fallback
    src_dir.join("app.tsx")
}

/// Detect the server entry file (e.g., server.ts) for API route delegation.
fn detect_server_entry(src_dir: &Path) -> Option<PathBuf> {
    let candidates = ["server.ts", "server.tsx"];
    for candidate in &candidates {
        let path = src_dir.join(candidate);
        if path.exists() {
            return Some(path);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_config_new() {
        let config = ServerConfig::new(3000, "localhost".to_string(), PathBuf::from("public"));
        assert_eq!(config.port, 3000);
        assert_eq!(config.host, "localhost");
        assert_eq!(config.public_dir, PathBuf::from("public"));
    }

    #[test]
    fn test_server_config_clone() {
        let config = ServerConfig::new(4000, "0.0.0.0".to_string(), PathBuf::from("dist"));
        let cloned = config.clone();
        assert_eq!(cloned.port, config.port);
        assert_eq!(cloned.host, config.host);
        assert_eq!(cloned.public_dir, config.public_dir);
    }

    #[test]
    fn test_server_config_with_root() {
        let root = PathBuf::from("/tmp/test-project");
        let config =
            ServerConfig::with_root(3000, "localhost".to_string(), PathBuf::from("public"), root);
        assert_eq!(config.root_dir, PathBuf::from("/tmp/test-project"));
        assert_eq!(config.src_dir, PathBuf::from("/tmp/test-project/src"));
        assert_eq!(
            config.entry_file,
            PathBuf::from("/tmp/test-project/src/app.tsx")
        );
    }

    #[test]
    fn test_dot_vertz_dir() {
        let root = PathBuf::from("/tmp/test-project");
        let config =
            ServerConfig::with_root(3000, "localhost".to_string(), PathBuf::from("public"), root);
        assert_eq!(
            config.dot_vertz_dir(),
            PathBuf::from("/tmp/test-project/.vertz")
        );
    }

    #[test]
    fn test_deps_dir() {
        let root = PathBuf::from("/tmp/test-project");
        let config =
            ServerConfig::with_root(3000, "localhost".to_string(), PathBuf::from("public"), root);
        assert_eq!(
            config.deps_dir(),
            PathBuf::from("/tmp/test-project/.vertz/deps")
        );
    }

    #[test]
    fn test_typecheck_defaults() {
        let config = ServerConfig::new(3000, "localhost".to_string(), PathBuf::from("public"));
        assert!(config.enable_typecheck);
        assert!(config.tsconfig_path.is_none());
        assert!(config.typecheck_binary.is_none());
    }

    #[test]
    fn test_css_dir() {
        let root = PathBuf::from("/tmp/test-project");
        let config =
            ServerConfig::with_root(3000, "localhost".to_string(), PathBuf::from("public"), root);
        assert_eq!(
            config.css_dir(),
            PathBuf::from("/tmp/test-project/.vertz/css")
        );
    }

    #[test]
    fn test_detect_server_entry_ts() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("server.ts"), "").unwrap();
        let result = detect_server_entry(dir.path());
        assert_eq!(result, Some(dir.path().join("server.ts")));
    }

    #[test]
    fn test_detect_server_entry_tsx() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("server.tsx"), "").unwrap();
        let result = detect_server_entry(dir.path());
        assert_eq!(result, Some(dir.path().join("server.tsx")));
    }

    #[test]
    fn test_detect_server_entry_ts_preferred_over_tsx() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("server.ts"), "").unwrap();
        std::fs::write(dir.path().join("server.tsx"), "").unwrap();
        let result = detect_server_entry(dir.path());
        assert_eq!(result, Some(dir.path().join("server.ts")));
    }

    #[test]
    fn test_detect_server_entry_none() {
        let dir = tempfile::tempdir().unwrap();
        let result = detect_server_entry(dir.path());
        assert_eq!(result, None);
    }
}
