use std::path::{Path, PathBuf};

/// Which framework plugin to use for the dev server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PluginChoice {
    /// The Vertz framework plugin (default).
    #[default]
    Vertz,
    /// The React framework plugin.
    React,
}

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub host: String,
    pub public_dir: PathBuf,
    /// Root directory of the project (where package.json lives).
    pub root_dir: PathBuf,
    /// Source directory for application code (e.g., "src").
    pub src_dir: PathBuf,
    /// Entry file for the application (e.g., "src/entry-client.ts").
    /// This is the client-side hydration entry used in the HTML `<script>` tag.
    pub entry_file: PathBuf,
    /// SSR entry file (e.g., "src/app.tsx").
    /// This is the server-side module loaded by the persistent V8 isolate for SSR.
    pub ssr_entry: PathBuf,
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
    /// Whether to auto-install missing packages during dev.
    pub auto_install: bool,
    /// Whether to watch upstream deps for changes (default: true).
    pub watch_deps: bool,
    /// Additional directories to watch for dependency changes.
    /// Relative to root_dir. From .vertzrc "extraWatchPaths" field.
    pub extra_watch_paths: Vec<String>,
    /// Which framework plugin to use.
    pub plugin: PluginChoice,
    /// Custom proxy subdomain name override (from `--name` flag).
    pub proxy_name: Option<String>,
}

/// Resolve the `auto_install` setting from multiple sources.
///
/// Precedence: CLI flag > `.vertzrc` explicit > CI guard > default (`true`).
///
/// Reads `.vertzrc` at most once. Logs a warning on parse failure instead of
/// silently defaulting.
pub fn resolve_auto_install(
    cli_no_auto_install: bool,
    cli_auto_install: bool,
    root_dir: &Path,
) -> bool {
    // CLI flags take highest priority
    if cli_no_auto_install {
        return false;
    }
    if cli_auto_install {
        return true;
    }

    // Single read of .vertzrc — extract both parsed value and explicit-key check
    let raw_json = std::fs::read_to_string(root_dir.join(".vertzrc"))
        .ok()
        .and_then(|s| match serde_json::from_str::<serde_json::Value>(&s) {
            Ok(v) => Some(v),
            Err(e) => {
                eprintln!("[config] Warning: failed to parse .vertzrc: {}", e);
                None
            }
        });

    if let Some(ref json) = raw_json {
        if let Some(val) = json.get("autoInstall") {
            // .vertzrc explicitly sets autoInstall — use that value
            return val.as_bool().unwrap_or(true);
        }
    }

    // CI guard: default to false in CI environments (non-empty CI env var)
    if std::env::var("CI").map(|v| !v.is_empty()).unwrap_or(false) {
        return false;
    }

    // Default
    true
}

impl PluginChoice {
    /// Parse a plugin name string into a `PluginChoice`.
    ///
    /// Accepted values: "vertz", "react" (case-insensitive).
    /// Returns `None` for unrecognized strings.
    pub fn parse_name(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "vertz" => Some(Self::Vertz),
            "react" => Some(Self::React),
            _ => None,
        }
    }
}

/// Resolve the plugin choice from multiple sources.
///
/// Precedence: CLI flag > `.vertzrc` "plugin" field > auto-detect from `package.json` > default (Vertz).
///
/// The `vertzrc_plugin` parameter should come from a pre-loaded `VertzConfig.plugin` field
/// to avoid redundant `.vertzrc` reads (the caller already loads it for other fields).
pub fn resolve_plugin_choice(
    cli_plugin: Option<&str>,
    vertzrc_plugin: Option<&str>,
    root_dir: &Path,
) -> PluginChoice {
    // 1. CLI flag takes highest priority
    if let Some(name) = cli_plugin {
        return PluginChoice::parse_name(name).unwrap_or_else(|| {
            eprintln!(
                "[config] Warning: unknown plugin '{}', falling back to vertz",
                name
            );
            PluginChoice::Vertz
        });
    }

    // 2. .vertzrc "plugin" field (already loaded by caller)
    if let Some(val) = vertzrc_plugin {
        if let Some(choice) = PluginChoice::parse_name(val) {
            return choice;
        }
        eprintln!(
            "[config] Warning: unknown plugin '{}' in .vertzrc, falling back to auto-detect",
            val
        );
    }

    // 3. Auto-detect from package.json dependencies/devDependencies
    // Note: peerDependencies are intentionally excluded — they indicate what the
    // consumer should provide, not what this project uses directly.
    if let Ok(pkg_json) = std::fs::read_to_string(root_dir.join("package.json")) {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&pkg_json) {
            let has_dep = |name: &str| {
                parsed
                    .get("dependencies")
                    .and_then(|d| d.get(name))
                    .is_some()
                    || parsed
                        .get("devDependencies")
                        .and_then(|d| d.get(name))
                        .is_some()
            };

            // React takes precedence over Vertz in auto-detect because a project
            // with both react and @vertz/* is likely a React project using Vertz's
            // runtime tooling.
            if has_dep("react") {
                return PluginChoice::React;
            }
        }
    }

    // 4. Default
    PluginChoice::Vertz
}

impl ServerConfig {
    pub fn new(port: u16, host: String, public_dir: PathBuf) -> Self {
        let root_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let src_dir = root_dir.join("src");
        let entry_file = detect_entry_file(&src_dir);
        let ssr_entry = detect_ssr_entry(&src_dir);
        let server_entry = detect_server_entry(&src_dir);
        Self {
            port,
            host,
            public_dir,
            root_dir,
            src_dir,
            entry_file,
            ssr_entry,
            enable_ssr: true,
            enable_typecheck: true,
            tsconfig_path: None,
            typecheck_binary: None,
            open_browser: false,
            server_entry,
            auto_install: true,
            watch_deps: true,
            extra_watch_paths: Vec::new(),
            plugin: PluginChoice::default(),
            proxy_name: None,
        }
    }

    /// Create a config with explicit root directory (for testing).
    pub fn with_root(port: u16, host: String, public_dir: PathBuf, root_dir: PathBuf) -> Self {
        let src_dir = root_dir.join("src");
        let entry_file = detect_entry_file(&src_dir);
        let ssr_entry = detect_ssr_entry(&src_dir);
        let server_entry = detect_server_entry(&src_dir);
        Self {
            port,
            host,
            public_dir,
            root_dir,
            src_dir,
            entry_file,
            ssr_entry,
            enable_ssr: true,
            enable_typecheck: true,
            tsconfig_path: None,
            typecheck_binary: None,
            open_browser: false,
            server_entry,
            auto_install: true,
            watch_deps: true,
            extra_watch_paths: Vec::new(),
            plugin: PluginChoice::default(),
            proxy_name: None,
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

/// Detect the SSR entry file (e.g., app.tsx) for server-side rendering.
///
/// This is the module loaded by the persistent V8 isolate. It exports
/// `App`, `theme`, `styles`, and `getInjectedCSS` matching the SSRModule
/// interface from `@vertz/ui-server`.
pub fn detect_ssr_entry(src_dir: &Path) -> PathBuf {
    let candidates = ["app.tsx", "app.ts", "app.jsx", "app.js"];
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

    // --- resolve_auto_install tests ---
    //
    // Tests that mutate the CI env var must be serialized to avoid races
    // when cargo runs tests in parallel threads.
    static CI_ENV_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn test_resolve_auto_install_cli_no_auto_install() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!resolve_auto_install(true, false, dir.path()));
    }

    #[test]
    fn test_resolve_auto_install_cli_auto_install() {
        let dir = tempfile::tempdir().unwrap();
        assert!(resolve_auto_install(false, true, dir.path()));
    }

    #[test]
    fn test_resolve_auto_install_vertzrc_explicit_false() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".vertzrc"), r#"{"autoInstall": false}"#).unwrap();
        assert!(!resolve_auto_install(false, false, dir.path()));
    }

    #[test]
    fn test_resolve_auto_install_ci_guard_non_empty() {
        let _lock = CI_ENV_MUTEX.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        // No .vertzrc file — CI guard should kick in
        std::env::set_var("CI", "true");
        let result = resolve_auto_install(false, false, dir.path());
        std::env::remove_var("CI");
        assert!(!result);
    }

    #[test]
    fn test_resolve_auto_install_ci_guard_empty_string() {
        let _lock = CI_ENV_MUTEX.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        // CI="" should NOT trigger the guard
        std::env::set_var("CI", "");
        let result = resolve_auto_install(false, false, dir.path());
        std::env::remove_var("CI");
        assert!(result);
    }

    #[test]
    fn test_resolve_auto_install_default_true() {
        let _lock = CI_ENV_MUTEX.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        // No CLI flags, no .vertzrc, no CI
        std::env::remove_var("CI");
        assert!(resolve_auto_install(false, false, dir.path()));
    }

    #[test]
    fn test_resolve_auto_install_vertzrc_parse_error_falls_through() {
        let _lock = CI_ENV_MUTEX.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".vertzrc"), "not valid json").unwrap();
        // Invalid JSON should warn and fall through to default
        std::env::remove_var("CI");
        assert!(resolve_auto_install(false, false, dir.path()));
    }

    // --- watch_deps and extra_watch_paths tests ---

    #[test]
    fn test_watch_deps_defaults_to_true() {
        let config = ServerConfig::new(3000, "localhost".to_string(), PathBuf::from("public"));
        assert!(config.watch_deps);
    }

    #[test]
    fn test_extra_watch_paths_defaults_to_empty() {
        let config = ServerConfig::new(3000, "localhost".to_string(), PathBuf::from("public"));
        assert!(config.extra_watch_paths.is_empty());
    }

    #[test]
    fn test_watch_deps_with_root() {
        let root = PathBuf::from("/tmp/test-project");
        let config =
            ServerConfig::with_root(3000, "localhost".to_string(), PathBuf::from("public"), root);
        assert!(config.watch_deps);
        assert!(config.extra_watch_paths.is_empty());
    }

    // --- PluginChoice tests ---

    #[test]
    fn test_plugin_choice_default_is_vertz() {
        assert_eq!(PluginChoice::default(), PluginChoice::Vertz);
    }

    #[test]
    fn test_plugin_choice_from_str_vertz() {
        assert_eq!(PluginChoice::parse_name("vertz"), Some(PluginChoice::Vertz));
    }

    #[test]
    fn test_plugin_choice_from_str_react() {
        assert_eq!(PluginChoice::parse_name("react"), Some(PluginChoice::React));
    }

    #[test]
    fn test_plugin_choice_from_str_case_insensitive() {
        assert_eq!(PluginChoice::parse_name("React"), Some(PluginChoice::React));
        assert_eq!(PluginChoice::parse_name("VERTZ"), Some(PluginChoice::Vertz));
    }

    #[test]
    fn test_plugin_choice_from_str_unknown() {
        assert_eq!(PluginChoice::parse_name("vue"), None);
    }

    #[test]
    fn test_server_config_default_plugin_is_vertz() {
        let config = ServerConfig::new(3000, "localhost".to_string(), PathBuf::from("public"));
        assert_eq!(config.plugin, PluginChoice::Vertz);
    }

    // --- resolve_plugin_choice tests ---

    #[test]
    fn test_resolve_plugin_cli_flag_react() {
        let dir = tempfile::tempdir().unwrap();
        let result = resolve_plugin_choice(Some("react"), None, dir.path());
        assert_eq!(result, PluginChoice::React);
    }

    #[test]
    fn test_resolve_plugin_cli_flag_vertz() {
        let dir = tempfile::tempdir().unwrap();
        let result = resolve_plugin_choice(Some("vertz"), None, dir.path());
        assert_eq!(result, PluginChoice::Vertz);
    }

    #[test]
    fn test_resolve_plugin_cli_flag_unknown_falls_back_to_vertz() {
        let dir = tempfile::tempdir().unwrap();
        let result = resolve_plugin_choice(Some("vue"), None, dir.path());
        assert_eq!(result, PluginChoice::Vertz);
    }

    #[test]
    fn test_resolve_plugin_vertzrc_react() {
        let dir = tempfile::tempdir().unwrap();
        let result = resolve_plugin_choice(None, Some("react"), dir.path());
        assert_eq!(result, PluginChoice::React);
    }

    #[test]
    fn test_resolve_plugin_cli_overrides_vertzrc() {
        let dir = tempfile::tempdir().unwrap();
        let result = resolve_plugin_choice(Some("vertz"), Some("react"), dir.path());
        assert_eq!(result, PluginChoice::Vertz);
    }

    #[test]
    fn test_resolve_plugin_auto_detect_react_from_package_json() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"dependencies": {"react": "^18.0.0", "react-dom": "^18.0.0"}}"#,
        )
        .unwrap();
        let result = resolve_plugin_choice(None, None, dir.path());
        assert_eq!(result, PluginChoice::React);
    }

    #[test]
    fn test_resolve_plugin_auto_detect_react_from_dev_deps() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"devDependencies": {"react": "^18.0.0"}}"#,
        )
        .unwrap();
        let result = resolve_plugin_choice(None, None, dir.path());
        assert_eq!(result, PluginChoice::React);
    }

    #[test]
    fn test_resolve_plugin_default_is_vertz() {
        let dir = tempfile::tempdir().unwrap();
        let result = resolve_plugin_choice(None, None, dir.path());
        assert_eq!(result, PluginChoice::Vertz);
    }

    #[test]
    fn test_resolve_plugin_vertzrc_overrides_auto_detect() {
        let dir = tempfile::tempdir().unwrap();
        // package.json has react, but .vertzrc says vertz
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"dependencies": {"react": "^18.0.0"}}"#,
        )
        .unwrap();
        let result = resolve_plugin_choice(None, Some("vertz"), dir.path());
        assert_eq!(result, PluginChoice::Vertz);
    }

    #[test]
    fn test_resolve_plugin_vertzrc_unknown_falls_through_to_auto_detect() {
        let dir = tempfile::tempdir().unwrap();
        // .vertzrc has unknown plugin, package.json has react
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"dependencies": {"react": "^18.0.0"}}"#,
        )
        .unwrap();
        let result = resolve_plugin_choice(None, Some("vue"), dir.path());
        assert_eq!(result, PluginChoice::React);
    }

    // --- detect_ssr_entry tests ---

    #[test]
    fn detect_ssr_entry_finds_app_tsx() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("app.tsx"), "").unwrap();
        let result = detect_ssr_entry(dir.path());
        assert_eq!(result, dir.path().join("app.tsx"));
    }

    #[test]
    fn detect_ssr_entry_finds_app_ts_when_no_tsx() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("app.ts"), "").unwrap();
        let result = detect_ssr_entry(dir.path());
        assert_eq!(result, dir.path().join("app.ts"));
    }

    #[test]
    fn detect_ssr_entry_prefers_tsx_over_ts() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("app.tsx"), "").unwrap();
        std::fs::write(dir.path().join("app.ts"), "").unwrap();
        let result = detect_ssr_entry(dir.path());
        assert_eq!(result, dir.path().join("app.tsx"));
    }

    #[test]
    fn detect_ssr_entry_falls_back_to_app_tsx() {
        let dir = tempfile::tempdir().unwrap();
        // No app.* files at all
        let result = detect_ssr_entry(dir.path());
        assert_eq!(result, dir.path().join("app.tsx"));
    }

    #[test]
    fn config_has_separate_ssr_and_client_entries() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("app.tsx"), "").unwrap();
        std::fs::write(src.join("entry-client.ts"), "").unwrap();
        let config = ServerConfig::with_root(
            3000,
            "localhost".to_string(),
            dir.path().join("public"),
            dir.path().to_path_buf(),
        );
        assert_eq!(config.ssr_entry, src.join("app.tsx"));
        assert_eq!(config.entry_file, src.join("entry-client.ts"));
    }

    #[test]
    fn test_resolve_plugin_auto_detect_ignores_peer_deps() {
        let dir = tempfile::tempdir().unwrap();
        // react only in peerDependencies — should NOT auto-detect as React
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"peerDependencies": {"react": "^18.0.0"}}"#,
        )
        .unwrap();
        let result = resolve_plugin_choice(None, None, dir.path());
        assert_eq!(result, PluginChoice::Vertz);
    }
}
