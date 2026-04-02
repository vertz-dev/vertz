pub mod react;
pub mod vertz;

use crate::compiler::pipeline::CompileError;
use crate::watcher::InvalidationResult;
use std::path::{Path, PathBuf};

/// A framework plugin for the vtz dev server.
///
/// Implementations provide framework-specific compilation, HMR behavior,
/// and client-side scripts. The runtime handles everything else: file watching,
/// module graph, caching, HTTP serving, WebSocket transport.
pub trait FrameworkPlugin: Send + Sync {
    /// Human-readable name (e.g., "vertz", "react").
    fn name(&self) -> &str;

    // ── Compilation ─────────────────────────────────────────

    /// Compile a source file for browser consumption.
    ///
    /// Called on cache miss. The runtime handles caching, file reading,
    /// and import rewriting. The plugin only transforms the source.
    fn compile(&self, source: &str, ctx: &CompileContext) -> CompileOutput;

    /// Post-process compiled code before import rewriting.
    ///
    /// Default: no-op. Override for framework-specific fixups
    /// (e.g., Vertz's effect → domEffect rename).
    fn post_process(&self, code: &str, _ctx: &CompileContext) -> String {
        code.to_string()
    }

    // ── Import Rewriting ────────────────────────────────────

    /// Resolve a bare import specifier to a path.
    ///
    /// Called for each bare specifier (e.g., "@vertz/ui", "react").
    /// Return None to use the default /@deps/ resolution.
    fn resolve_import(&self, _specifier: &str) -> Option<String> {
        None
    }

    // ── HMR ─────────────────────────────────────────────────

    /// Client-side scripts injected into the HTML shell before the entry module.
    ///
    /// The runtime injects these as inline `<script>` tags. Typically includes:
    /// - Fast Refresh runtime (framework-specific)
    ///
    /// The HMR client and error overlay are runtime-provided (generic).
    fn hmr_client_scripts(&self) -> Vec<ClientScript>;

    /// Decide what HMR action to take for a file change.
    ///
    /// Default: entry file → full reload, CSS → CSS update, else → module update.
    /// Override for framework-specific logic (e.g., React can do component-level refresh).
    fn hmr_strategy(&self, result: &InvalidationResult) -> HmrAction {
        if result.is_entry_file {
            HmrAction::FullReload("entry file changed".into())
        } else if result.is_css_only {
            HmrAction::CssUpdate(result.changed_file.clone())
        } else {
            HmrAction::ModuleUpdate(result.invalidated_files.clone())
        }
    }

    // ── HTML Shell ──────────────────────────────────────────

    /// The ID of the root DOM element (default: "app").
    fn root_element_id(&self) -> &str {
        "app"
    }

    /// Additional `<head>` content for the HTML shell.
    fn head_html(&self) -> Option<String> {
        None
    }

    // ── File Watching ───────────────────────────────────────

    /// File extensions this plugin cares about (default: ts, tsx, css).
    fn watch_extensions(&self) -> Vec<String> {
        vec!["ts".into(), "tsx".into(), "css".into()]
    }

    /// Files that trigger a full server restart when changed.
    fn restart_triggers(&self) -> Vec<String> {
        vec![
            "package.json".into(),
            "tsconfig.json".into(),
            ".env".into(),
            "postcss.config.js".into(),
            "postcss.config.cjs".into(),
            "postcss.config.mjs".into(),
            "postcss.config.ts".into(),
            "tailwind.config.js".into(),
            "tailwind.config.cjs".into(),
            "tailwind.config.mjs".into(),
            "tailwind.config.ts".into(),
        ]
    }

    /// Public env var prefixes exposed to client code via `import.meta.env`.
    ///
    /// Only env vars starting with one of these prefixes are available in
    /// browser code. This prevents leaking secrets to the client bundle.
    ///
    /// Default: `["VITE_"]` for Vite compatibility.
    fn env_public_prefixes(&self) -> Vec<String> {
        vec!["VITE_".into()]
    }

    // ── Compilation Metadata ────────────────────────────────

    /// Whether this plugin wraps modules for Fast Refresh / HMR accept.
    fn supports_fast_refresh(&self) -> bool {
        false
    }

    /// Generate a module ID for Fast Refresh registry matching.
    /// Default: URL-relative path.
    fn module_id(&self, file_path: &Path, root_dir: &Path) -> String {
        file_path
            .strip_prefix(root_dir)
            .map(|p| format!("/{}", p.display()))
            .unwrap_or_else(|_| file_path.display().to_string())
    }

    // ── MCP / AI Extensibility ──────────────────────────────

    /// Additional MCP tool definitions contributed by this plugin.
    ///
    /// Tool names are automatically prefixed with the plugin name to avoid
    /// collisions: a tool named "component_tree" from the "react" plugin
    /// becomes "react_component_tree" in the MCP tool list.
    fn mcp_tool_definitions(&self) -> Vec<PluginMcpTool> {
        vec![]
    }

    /// Execute a plugin-contributed MCP tool by name.
    ///
    /// Called when `tools/call` receives a tool name matching one from
    /// `mcp_tool_definitions()`. The `name` is the unprefixed tool name.
    fn execute_mcp_tool(
        &self,
        name: &str,
        _args: &serde_json::Value,
        _ctx: &PluginContext,
    ) -> Result<serde_json::Value, String> {
        Err(format!("Unknown plugin tool: {}", name))
    }
}

/// Context passed to compile() — everything the plugin needs to know about the file.
pub struct CompileContext<'a> {
    pub file_path: &'a Path,
    pub root_dir: &'a Path,
    pub src_dir: &'a Path,
    /// "dom" for browser, "ssr" for server rendering.
    pub target: &'a str,
}

/// Result of plugin compilation.
pub struct CompileOutput {
    /// Compiled JavaScript code.
    pub code: String,
    /// Extracted CSS, if any.
    pub css: Option<String>,
    /// Source map JSON, if available.
    pub source_map: Option<String>,
    /// Compilation diagnostics (errors and warnings).
    pub diagnostics: Vec<CompileDiagnostic>,
}

/// A diagnostic produced during compilation.
#[derive(Debug, Clone)]
pub struct CompileDiagnostic {
    pub message: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
    /// Whether this is a warning (true) or error (false).
    pub is_warning: bool,
}

/// What the HMR system should do in response to a file change.
#[derive(Debug, Clone)]
pub enum HmrAction {
    /// Full page reload.
    FullReload(String),
    /// Hot-update specific modules.
    ModuleUpdate(Vec<PathBuf>),
    /// Update CSS without reload.
    CssUpdate(PathBuf),
    /// Plugin handled it — runtime should do nothing.
    Handled,
}

/// A client-side script to inject into the HTML shell.
pub struct ClientScript {
    /// Script content (inline).
    pub content: String,
    /// Whether this is a module script (type="module").
    pub is_module: bool,
}

/// An MCP tool contributed by a plugin.
pub struct PluginMcpTool {
    /// Tool name (will be prefixed with plugin name).
    pub name: String,
    /// Human-readable description for LLM tool discovery.
    pub description: String,
    /// JSON Schema for the tool's input parameters.
    pub input_schema: serde_json::Value,
}

/// Context passed to plugin MCP tool execution.
///
/// Gives the plugin read access to runtime state without exposing internals.
pub struct PluginContext<'a> {
    pub root_dir: &'a Path,
    pub src_dir: &'a Path,
    pub port: u16,
}

/// Convert an [`HmrAction`] into an [`HmrMessage`](crate::hmr::protocol::HmrMessage).
pub fn hmr_action_to_message(
    action: &HmrAction,
    root_dir: &Path,
) -> crate::hmr::protocol::HmrMessage {
    use crate::hmr::protocol::HmrMessage;
    use std::time::{SystemTime, UNIX_EPOCH};

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    match action {
        HmrAction::FullReload(reason) => HmrMessage::FullReload {
            reason: reason.clone(),
        },
        HmrAction::ModuleUpdate(files) => {
            let modules = files.iter().map(|p| path_to_url(p, root_dir)).collect();
            HmrMessage::Update { modules, timestamp }
        }
        HmrAction::CssUpdate(file) => HmrMessage::CssUpdate {
            file: path_to_url(file, root_dir),
            timestamp,
        },
        HmrAction::Handled => HmrMessage::Connected, // no-op — won't be broadcast
    }
}

fn path_to_url(path: &Path, root_dir: &Path) -> String {
    if let Ok(rel) = path.strip_prefix(root_dir) {
        format!("/{}", rel.to_string_lossy().replace('\\', "/"))
    } else {
        format!("/{}", path.to_string_lossy().replace('\\', "/"))
    }
}

/// Convert compile diagnostics to the pipeline's `CompileError` type,
/// filtering out warnings.
pub fn diagnostics_to_errors(diagnostics: &[CompileDiagnostic]) -> Vec<CompileError> {
    diagnostics
        .iter()
        .filter(|d| !d.is_warning)
        .map(|d| CompileError {
            message: d.message.clone(),
            line: d.line,
            column: d.column,
        })
        .collect()
}

/// Extract warnings from compile diagnostics as `CompileError` values.
pub fn diagnostics_to_warnings(diagnostics: &[CompileDiagnostic]) -> Vec<CompileError> {
    diagnostics
        .iter()
        .filter(|d| d.is_warning)
        .map(|d| CompileError {
            message: d.message.clone(),
            line: d.line,
            column: d.column,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // A minimal plugin for testing the trait and default impls.
    struct TestPlugin;

    impl FrameworkPlugin for TestPlugin {
        fn name(&self) -> &str {
            "test"
        }

        fn compile(&self, source: &str, _ctx: &CompileContext) -> CompileOutput {
            CompileOutput {
                code: source.to_string(),
                css: None,
                source_map: None,
                diagnostics: vec![],
            }
        }

        fn hmr_client_scripts(&self) -> Vec<ClientScript> {
            vec![]
        }
    }

    #[test]
    fn test_plugin_name() {
        let plugin = TestPlugin;
        assert_eq!(plugin.name(), "test");
    }

    #[test]
    fn test_default_root_element_id() {
        let plugin = TestPlugin;
        assert_eq!(plugin.root_element_id(), "app");
    }

    #[test]
    fn test_default_watch_extensions() {
        let plugin = TestPlugin;
        let exts = plugin.watch_extensions();
        assert!(exts.contains(&"ts".to_string()));
        assert!(exts.contains(&"tsx".to_string()));
        assert!(exts.contains(&"css".to_string()));
    }

    #[test]
    fn test_default_restart_triggers() {
        let plugin = TestPlugin;
        let triggers = plugin.restart_triggers();
        assert!(triggers.contains(&"package.json".to_string()));
        assert!(triggers.contains(&".env".to_string()));
        assert!(triggers.contains(&"postcss.config.js".to_string()));
        assert!(triggers.contains(&"tailwind.config.ts".to_string()));
    }

    #[test]
    fn test_default_env_public_prefixes() {
        let plugin = TestPlugin;
        let prefixes = plugin.env_public_prefixes();
        assert_eq!(prefixes, vec!["VITE_".to_string()]);
    }

    #[test]
    fn test_default_supports_fast_refresh() {
        let plugin = TestPlugin;
        assert!(!plugin.supports_fast_refresh());
    }

    #[test]
    fn test_default_module_id() {
        let plugin = TestPlugin;
        let id = plugin.module_id(Path::new("/project/src/app.tsx"), Path::new("/project"));
        assert_eq!(id, "/src/app.tsx");
    }

    #[test]
    fn test_default_resolve_import() {
        let plugin = TestPlugin;
        assert!(plugin.resolve_import("react").is_none());
    }

    #[test]
    fn test_default_hmr_strategy_entry_file() {
        let plugin = TestPlugin;
        let result = InvalidationResult {
            changed_file: PathBuf::from("/project/src/app.tsx"),
            change_kind: crate::watcher::file_watcher::FileChangeKind::Modify,
            invalidated_files: vec![],
            is_entry_file: true,
            is_css_only: false,
        };
        match plugin.hmr_strategy(&result) {
            HmrAction::FullReload(reason) => {
                assert_eq!(reason, "entry file changed");
            }
            _ => panic!("Expected FullReload"),
        }
    }

    #[test]
    fn test_default_hmr_strategy_css() {
        let plugin = TestPlugin;
        let result = InvalidationResult {
            changed_file: PathBuf::from("/project/src/styles.css"),
            change_kind: crate::watcher::file_watcher::FileChangeKind::Modify,
            invalidated_files: vec![],
            is_entry_file: false,
            is_css_only: true,
        };
        match plugin.hmr_strategy(&result) {
            HmrAction::CssUpdate(path) => {
                assert_eq!(path, PathBuf::from("/project/src/styles.css"));
            }
            _ => panic!("Expected CssUpdate"),
        }
    }

    #[test]
    fn test_default_hmr_strategy_module_update() {
        let plugin = TestPlugin;
        let result = InvalidationResult {
            changed_file: PathBuf::from("/project/src/Button.tsx"),
            change_kind: crate::watcher::file_watcher::FileChangeKind::Modify,
            invalidated_files: vec![
                PathBuf::from("/project/src/Button.tsx"),
                PathBuf::from("/project/src/app.tsx"),
            ],
            is_entry_file: false,
            is_css_only: false,
        };
        match plugin.hmr_strategy(&result) {
            HmrAction::ModuleUpdate(files) => {
                assert_eq!(files.len(), 2);
            }
            _ => panic!("Expected ModuleUpdate"),
        }
    }

    #[test]
    fn test_default_post_process_is_identity() {
        let plugin = TestPlugin;
        let ctx = CompileContext {
            file_path: Path::new("/project/src/app.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        assert_eq!(plugin.post_process("unchanged", &ctx), "unchanged");
    }

    #[test]
    fn test_default_mcp_tools_empty() {
        let plugin = TestPlugin;
        assert!(plugin.mcp_tool_definitions().is_empty());
    }

    #[test]
    fn test_default_execute_mcp_tool_returns_error() {
        let plugin = TestPlugin;
        let ctx = PluginContext {
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            port: 3000,
        };
        let result = plugin.execute_mcp_tool("unknown", &serde_json::json!({}), &ctx);
        assert!(result.is_err());
    }

    #[test]
    fn test_compile_passthrough() {
        let plugin = TestPlugin;
        let ctx = CompileContext {
            file_path: Path::new("/project/src/app.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let output = plugin.compile("const x = 1;", &ctx);
        assert_eq!(output.code, "const x = 1;");
        assert!(output.css.is_none());
        assert!(output.diagnostics.is_empty());
    }

    #[test]
    fn test_hmr_action_to_message_full_reload() {
        let action = HmrAction::FullReload("test reason".into());
        let msg = hmr_action_to_message(&action, Path::new("/project"));
        match msg {
            crate::hmr::protocol::HmrMessage::FullReload { reason } => {
                assert_eq!(reason, "test reason");
            }
            _ => panic!("Expected FullReload"),
        }
    }

    #[test]
    fn test_hmr_action_to_message_module_update() {
        let action = HmrAction::ModuleUpdate(vec![
            PathBuf::from("/project/src/Button.tsx"),
            PathBuf::from("/project/src/app.tsx"),
        ]);
        let msg = hmr_action_to_message(&action, Path::new("/project"));
        match msg {
            crate::hmr::protocol::HmrMessage::Update { modules, timestamp } => {
                assert_eq!(modules.len(), 2);
                assert!(modules.contains(&"/src/Button.tsx".to_string()));
                assert!(modules.contains(&"/src/app.tsx".to_string()));
                assert!(timestamp > 0);
            }
            _ => panic!("Expected Update"),
        }
    }

    #[test]
    fn test_hmr_action_to_message_css_update() {
        let action = HmrAction::CssUpdate(PathBuf::from("/project/src/styles.css"));
        let msg = hmr_action_to_message(&action, Path::new("/project"));
        match msg {
            crate::hmr::protocol::HmrMessage::CssUpdate { file, timestamp } => {
                assert_eq!(file, "/src/styles.css");
                assert!(timestamp > 0);
            }
            _ => panic!("Expected CssUpdate"),
        }
    }

    #[test]
    fn test_hmr_action_to_message_handled_returns_connected_noop() {
        let action = HmrAction::Handled;
        let msg = hmr_action_to_message(&action, Path::new("/project"));
        // Handled maps to Connected as a no-op sentinel — caller should skip broadcast
        assert!(matches!(msg, crate::hmr::protocol::HmrMessage::Connected));
    }

    #[test]
    fn test_diagnostics_to_errors_filters_warnings() {
        let diagnostics = vec![
            CompileDiagnostic {
                message: "error msg".into(),
                line: Some(1),
                column: Some(5),
                is_warning: false,
            },
            CompileDiagnostic {
                message: "warning msg".into(),
                line: Some(2),
                column: Some(10),
                is_warning: true,
            },
        ];
        let errors = diagnostics_to_errors(&diagnostics);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].message, "error msg");
    }

    #[test]
    fn test_diagnostics_to_warnings_extracts_warnings_only() {
        let diagnostics = vec![
            CompileDiagnostic {
                message: "error msg".into(),
                line: Some(1),
                column: Some(5),
                is_warning: false,
            },
            CompileDiagnostic {
                message: "[css-unknown-color-token] Unknown color token 'sm'".into(),
                line: Some(23),
                column: Some(5),
                is_warning: true,
            },
        ];
        let warnings = diagnostics_to_warnings(&diagnostics);
        assert_eq!(warnings.len(), 1);
        assert_eq!(
            warnings[0].message,
            "[css-unknown-color-token] Unknown color token 'sm'"
        );
        assert_eq!(warnings[0].line, Some(23));
        assert_eq!(warnings[0].column, Some(5));
    }

    #[test]
    fn test_path_to_url_relative() {
        assert_eq!(
            path_to_url(Path::new("/project/src/Button.tsx"), Path::new("/project")),
            "/src/Button.tsx"
        );
    }

    #[test]
    fn test_path_to_url_outside_root() {
        assert_eq!(
            path_to_url(Path::new("/other/file.tsx"), Path::new("/project")),
            "//other/file.tsx"
        );
    }
}
