use std::path::PathBuf;

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
}

impl ServerConfig {
    pub fn new(port: u16, host: String, public_dir: PathBuf) -> Self {
        let root_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let src_dir = root_dir.join("src");
        let entry_file = src_dir.join("app.tsx");
        Self {
            port,
            host,
            public_dir,
            root_dir,
            src_dir,
            entry_file,
        }
    }

    /// Create a config with explicit root directory (for testing).
    pub fn with_root(port: u16, host: String, public_dir: PathBuf, root_dir: PathBuf) -> Self {
        let src_dir = root_dir.join("src");
        let entry_file = src_dir.join("app.tsx");
        Self {
            port,
            host,
            public_dir,
            root_dir,
            src_dir,
            entry_file,
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
    fn test_css_dir() {
        let root = PathBuf::from("/tmp/test-project");
        let config =
            ServerConfig::with_root(3000, "localhost".to_string(), PathBuf::from("public"), root);
        assert_eq!(
            config.css_dir(),
            PathBuf::from("/tmp/test-project/.vertz/css")
        );
    }
}
